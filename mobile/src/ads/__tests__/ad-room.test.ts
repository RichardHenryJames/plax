import { SERVED_MS, keepsRoom } from '../ad-room'
import { BANNER_SERVED_KEY, DEFAULT_BANNER_DP, NEVER_SERVED, isPlausibleHeight, parseServed, storedServedMemory } from '../served'
import type { KeyValueStore } from '../../platform/storage'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// A port of AdRoomTest.java.
describe('when the strip keeps its room from the start', () => {
  it('takes no room, for a strip that has never been served an ad, until one comes', () => {
    expect(keepsRoom(0, NOW)).toBe(false)
  })

  it('keeps its room from the start, for a strip served an ad within the last week', () => {
    expect(keepsRoom(NOW, NOW)).toBe(true)
    expect(keepsRoom(NOW - HOUR, NOW)).toBe(true)
    expect(keepsRoom(NOW - 6 * DAY, NOW)).toBe(true)
    expect(keepsRoom(NOW - SERVED_MS + 1, NOW)).toBe(true)
  })

  it('waits for its ad again, for a strip not served for a week or more', () => {
    expect(keepsRoom(NOW - SERVED_MS, NOW)).toBe(false)
    expect(keepsRoom(NOW - 30 * DAY, NOW)).toBe(false)
  })

  it('keeps nothing when the clock was set back', () => {
    expect(keepsRoom(NOW + HOUR, NOW)).toBe(false)
    expect(keepsRoom(-5, NOW)).toBe(false)
  })

  it('counts a week as a week', () => {
    expect(SERVED_MS).toBe(7 * DAY)
  })

  it('keeps nothing for a time that is not a number', () => {
    expect(keepsRoom(Number.NaN, NOW)).toBe(false)
    expect(keepsRoom(NOW, Number.NaN)).toBe(false)
  })
})

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: async (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
  }
}

describe('what the phone remembers of the strip', () => {
  it('reads a record that is well formed as it is', () => {
    expect(parseServed({ at: NOW, heightDp: 56 })).toEqual({ at: NOW, heightDp: 56 })
  })

  it('reads anything else as a strip never served, with the height of a standard banner', () => {
    for (const value of [null, undefined, 7, 'text', [], true]) expect(parseServed(value)).toEqual(NEVER_SERVED)
    expect(NEVER_SERVED).toEqual({ at: 0, heightDp: DEFAULT_BANNER_DP })
  })

  it('takes a time that is not a positive number as none', () => {
    for (const at of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5', null]) expect(parseServed({ at, heightDp: 56 }).at).toBe(0)
    expect(parseServed({ at: 1.9, heightDp: 56 }).at).toBe(1)
  })

  it('takes a height that is not plausible for a banner as the standard one, and rounds the others', () => {
    for (const heightDp of [0, 5, 29, 201, 5000, -50, Number.NaN, '56', null]) expect(parseServed({ at: NOW, heightDp }).heightDp).toBe(DEFAULT_BANNER_DP)
    expect(parseServed({ at: NOW, heightDp: 56.4 }).heightDp).toBe(56)
    expect(parseServed({ at: NOW, heightDp: 30 }).heightDp).toBe(30)
    expect(parseServed({ at: NOW, heightDp: 200 }).heightDp).toBe(200)
    expect(isPlausibleHeight(90)).toBe(true)
    expect(isPlausibleHeight(Number.NaN)).toBe(false)
  })

  it('keeps a record and reads it back', async () => {
    const store = memoryStore()
    const memory = storedServedMemory(store)
    await memory.write({ at: NOW, heightDp: 60 })
    expect(store.data.has(BANNER_SERVED_KEY)).toBe(true)
    expect(await memory.read()).toEqual({ at: NOW, heightDp: 60 })
  })

  it('reads a store with nothing in it as a strip never served', async () => {
    expect(await storedServedMemory(memoryStore()).read()).toEqual(NEVER_SERVED)
  })

  it('reads damaged text as a strip never served, never throwing', async () => {
    expect(await storedServedMemory(memoryStore({ [BANNER_SERVED_KEY]: '{broken' })).read()).toEqual(NEVER_SERVED)
    expect(await storedServedMemory(memoryStore({ [BANNER_SERVED_KEY]: '"text"' })).read()).toEqual(NEVER_SERVED)
  })

  it('reads a store that fails as a strip never served, but lets a write that fails be seen', async () => {
    const failing: KeyValueStore = {
      getItem: async () => {
        throw new Error('disk')
      },
      setItem: async () => {
        throw new Error('full')
      },
      removeItem: async () => undefined,
    }
    const memory = storedServedMemory(failing)
    expect(await memory.read()).toEqual(NEVER_SERVED)
    await expect(memory.write({ at: NOW, heightDp: 50 })).rejects.toThrow('full')
  })

  it("is the phone's own store by default", async () => {
    const memory = storedServedMemory()
    await memory.write({ at: NOW, heightDp: 52 })
    expect(await storedServedMemory().read()).toEqual({ at: NOW, heightDp: 52 })
  })

  it('keeps nothing about the reader: only a time and a height', async () => {
    const store = memoryStore()
    await storedServedMemory(store).write({ at: NOW, heightDp: 52 })
    expect(Object.keys(JSON.parse(store.data.get(BANNER_SERVED_KEY) as string) as object).sort()).toEqual(['at', 'heightDp'])
  })
})
