import { readJson, secrets, storage, writeJson, type KeyValueStore } from '../storage'

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: async (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
  }
}

describe('plain storage', () => {
  it('keeps what is written and reads it back', async () => {
    const store = memory()
    await writeJson('k', { a: [1, 2], b: 'ü' }, store)
    expect(await readJson('k', store)).toEqual({ a: [1, 2], b: 'ü' })
  })

  it('reads a missing key as null', async () => {
    expect(await readJson('nothing', memory())).toBeNull()
  })

  it('reads text that is not JSON as null, never throwing', async () => {
    expect(await readJson('k', memory({ k: '{broken' }))).toBeNull()
  })

  it('reads a store that fails as null, never throwing', async () => {
    const failing: KeyValueStore = { getItem: async () => { throw new Error('disk') }, setItem: async () => undefined, removeItem: async () => undefined }
    expect(await readJson('k', failing)).toBeNull()
  })

  it('lets a write that fails be seen by the caller', async () => {
    const failing: KeyValueStore = { getItem: async () => null, setItem: async () => { throw new Error('full') }, removeItem: async () => undefined }
    await expect(writeJson('k', {}, failing)).rejects.toThrow('full')
  })

  it('is the phone store by default', async () => {
    await writeJson('plain', { ok: true })
    expect(await readJson('plain')).toEqual({ ok: true })
    await storage.removeItem('plain')
    expect(await readJson('plain')).toBeNull()
  })
})

describe('secret storage', () => {
  it('keeps, returns and removes a value', async () => {
    await secrets.set('token', 'abc')
    expect(await secrets.get('token')).toBe('abc')
    await secrets.remove('token')
    expect(await secrets.get('token')).toBeNull()
  })

  it('does not share a key with the plain store', async () => {
    await secrets.set('shared', 'secret')
    expect(await storage.getItem('shared')).toBeNull()
  })
})
