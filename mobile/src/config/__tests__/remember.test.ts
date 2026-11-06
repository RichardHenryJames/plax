import { remembered } from '../remember'
import { deferred, memoryStorage } from './helpers'

const initial = { count: 0, name: '' }

describe('remembered', () => {
  it('holds the initial values until what was kept has been read', async () => {
    const storage = memoryStorage({ 'p.count': '7', 'p.name': 'kept' })
    const memory = remembered(storage, 'p', initial)
    expect(memory.value).toEqual({ count: 0, name: '' })
    await memory.load()
    expect(memory.value).toEqual({ count: 7, name: 'kept' })
  })

  it('reads a number from its decimal text and a text as it is', async () => {
    const memory = remembered(memoryStorage({ 'p.count': '1800000000000', 'p.name': ' spaced  text ' }), 'p', initial)
    await memory.load()
    expect(memory.value).toEqual({ count: 1_800_000_000_000, name: ' spaced  text ' })
  })

  it('ignores what was kept for a number that is not one', async () => {
    const memory = remembered(memoryStorage({ 'p.count': 'many', 'p.name': 'n' }), 'p', { count: 3, name: '' })
    await memory.load()
    expect(memory.value).toEqual({ count: 3, name: 'n' })
    const infinite = remembered(memoryStorage({ 'p.count': 'Infinity' }), 'p', { count: 3 })
    await infinite.load()
    expect(infinite.value.count).toBe(3)
  })

  it('reads each value once, however often it is asked to load', async () => {
    const storage = memoryStorage({ 'p.count': '7' })
    const reads = jest.spyOn(storage, 'getItem')
    const memory = remembered(storage, 'p', initial)
    await Promise.all([memory.load(), memory.load()])
    await memory.load()
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it('writes a change at once into what it holds and through to the storage under prefix.name', async () => {
    const storage = memoryStorage()
    const memory = remembered(storage, 'plax.test', initial)
    const written = memory.set({ count: 5 })
    expect(memory.value.count).toBe(5)
    await written
    expect([...storage.data.entries()]).toEqual([['plax.test.count', '5']])
    await memory.set({ count: 6, name: 'x' })
    expect(Object.fromEntries(storage.data)).toEqual({ 'plax.test.count': '6', 'plax.test.name': 'x' })
  })

  it('does not change a value it was handed before: a read is a snapshot', async () => {
    const memory = remembered(memoryStorage(), 'p', initial)
    const before = memory.value
    await memory.set({ count: 9 })
    expect(before.count).toBe(0)
    expect(memory.value.count).toBe(9)
  })

  it('does not let an older value that was kept overwrite one set while it was being read', async () => {
    const slow = deferred<string | null>()
    const storage = memoryStorage({ 'p.name': 'old' })
    storage.getItem = (key) => (key === 'p.name' ? slow.promise : Promise.resolve(null))
    const memory = remembered(storage, 'p', initial)
    const loading = memory.load()
    await memory.set({ name: 'new' })
    slow.resolve('old')
    await loading
    expect(memory.value.name).toBe('new')
  })

  it('ignores a value that is left out of a patch', async () => {
    const storage = memoryStorage()
    const memory = remembered(storage, 'p', initial)
    await memory.set({ count: undefined, name: 'only' })
    expect(memory.value).toEqual({ count: 0, name: 'only' })
    expect([...storage.data.keys()]).toEqual(['p.name'])
  })

  it('keeps the initial values when the storage cannot be read', async () => {
    const storage = memoryStorage({ 'p.count': '7' })
    storage.failReads = true
    const memory = remembered(storage, 'p', initial)
    await expect(memory.load()).resolves.toBeUndefined()
    expect(memory.value).toEqual(initial)
  })

  it('does not reject when the storage cannot be written, and still holds the value for this run', async () => {
    const storage = memoryStorage()
    storage.failWrites = true
    const memory = remembered(storage, 'p', initial)
    await expect(memory.set({ count: 2 })).resolves.toBeUndefined()
    expect(memory.value.count).toBe(2)
    expect(storage.data.size).toBe(0)
  })

  it('does not reject when the storage throws at once instead of failing later', async () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error('thrown')
    }
    storage.getItem = () => {
      throw new Error('thrown')
    }
    const memory = remembered(storage, 'p', initial)
    await expect(memory.load()).resolves.toBeUndefined()
    await expect(memory.set({ count: 2 })).resolves.toBeUndefined()
    expect(memory.value.count).toBe(2)
  })

  it('keeps two prefixes apart', async () => {
    const storage = memoryStorage()
    const one = remembered(storage, 'one', { n: 0 })
    const two = remembered(storage, 'two', { n: 0 })
    await one.set({ n: 1 })
    await two.load()
    expect(two.value.n).toBe(0)
    await two.set({ n: 2 })
    expect(Object.fromEntries(storage.data)).toEqual({ 'one.n': '1', 'two.n': '2' })
  })
})
