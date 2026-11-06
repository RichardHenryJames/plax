import { hexHash, isBlank, javaHash, strip } from '../java-text'
import { Lru } from '../lru'
import { SerialQueue } from '../serial-queue'

describe('the text rules of Java', () => {
  it('strip the white space Java strips, and no other', () => {
    expect(strip('  a b \t\r\n')).toBe('a b')
    expect(strip('\u001c\u001d\u001e\u001fa')).toBe('a')
    expect(strip('\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2008\u2009\u200aa\u2028\u2029\u205f\u3000\u1680')).toBe('a')
    expect(strip('\u00a0a\u00a0')).toBe('\u00a0a\u00a0')
    expect(strip('\u2007a\u202f')).toBe('\u2007a\u202f')
    expect(strip('\ufeffa')).toBe('\ufeffa')
    expect(strip('\u200ba\u200b')).toBe('\u200ba\u200b')
    expect(strip('\u0085a')).toBe('\u0085a')
    expect(strip('')).toBe('')
    expect(strip('   ')).toBe('')
    expect(strip('a')).toBe('a')
    expect(strip(' a  b ')).toBe('a  b')
  })

  it('know a blank text', () => {
    expect(isBlank('')).toBe(true)
    expect(isBlank(' \t\n\u2003\u3000')).toBe(true)
    expect(isBlank('\u00a0')).toBe(false)
    expect(isBlank(' a ')).toBe(false)
  })

  it('hash a string as String.hashCode does', () => {
    expect(javaHash('')).toBe(0)
    expect(javaHash('a')).toBe(97)
    expect(javaHash('hello')).toBe(99162322)
    expect(javaHash('The quick brown fox jumps over the lazy dog')).toBe(-609428141)
    expect(javaHash('\u0939\u093f\u0928\u094d\u0926\u0940')).toBe(1132116197)
    expect(javaHash('history,science,space,technology,philosophy,psychology')).toBe(javaHash('history,science,space,technology,philosophy,psychology'))
  })

  it('write the hash in hexadecimal with no sign, as Integer.toHexString does', () => {
    expect(hexHash('')).toBe('0')
    expect(hexHash('a')).toBe('61')
    expect(hexHash('The quick brown fox jumps over the lazy dog')).toBe('dbacdd53')
    expect(hexHash('science,space')).toBe('a3456bbe')
  })
})

describe('a map that keeps the most recently used', () => {
  it('holds at most as many as it is given and lets go of the one used longest ago', () => {
    const lru = new Lru<string, number>(3)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.set('c', 3)
    lru.set('d', 4)
    expect(lru.keys()).toEqual(['b', 'c', 'd'])
    expect(lru.get('a')).toBeUndefined()
    expect(lru.size).toBe(3)
  })

  it('counts reading as using', () => {
    const lru = new Lru<string, number>(3)
    for (const [key, value] of [['a', 1], ['b', 2], ['c', 3]] as const) lru.set(key, value)
    expect(lru.get('a')).toBe(1)
    lru.set('d', 4)
    expect(lru.keys()).toEqual(['c', 'a', 'd'])
    expect(lru.has('b')).toBe(false)
  })

  it('moves an entry to the newest when it is set again', () => {
    const lru = new Lru<string, number>(2)
    lru.set('a', 1)
    lru.set('b', 2)
    lru.set('a', 10)
    lru.set('c', 3)
    expect(lru.keys()).toEqual(['a', 'c'])
    expect(lru.get('a')).toBe(10)
  })

  it('makes an entry when there is none, once', () => {
    const lru = new Lru<string, { n: number }>(2)
    const create = jest.fn(() => ({ n: 1 }))
    const first = lru.getOrCreate('a', create)
    expect(lru.getOrCreate('a', create)).toBe(first)
    expect(create).toHaveBeenCalledTimes(1)
    lru.getOrCreate('b', create)
    lru.getOrCreate('c', create)
    expect(lru.has('a')).toBe(false)
  })

  it('can be emptied, and have an entry removed', () => {
    const lru = new Lru<string, number>(3)
    lru.set('a', 1)
    lru.set('b', 2)
    expect(lru.delete('a')).toBe(true)
    expect(lru.delete('a')).toBe(false)
    lru.clear()
    expect(lru.size).toBe(0)
    expect(lru.keys()).toEqual([])
  })

  it('holds a value that is falsy', () => {
    const lru = new Lru<string, number>(2)
    lru.set('zero', 0)
    expect(lru.get('zero')).toBe(0)
    expect(lru.getOrCreate('zero', () => 5)).toBe(0)
  })
})

describe('the queue that does one thing after another', () => {
  it('runs the tasks in the order they were given, each after the one before has finished', async () => {
    const queue = new SerialQueue()
    const log: string[] = []
    queue.run(async () => {
      log.push('a start')
      await new Promise((resolve) => setTimeout(resolve, 20))
      log.push('a end')
    })
    queue.run(() => {
      log.push('b')
    })
    queue.run(async () => {
      log.push('c')
    })
    await queue.drained()
    expect(log).toEqual(['a start', 'a end', 'b', 'c'])
  })

  it('goes on after a task that fails, and says what failed', async () => {
    const failures: unknown[] = []
    const queue = new SerialQueue((error) => failures.push(error))
    const log: string[] = []
    queue.run(() => {
      throw new Error('sync')
    })
    queue.run(async () => {
      throw new Error('async')
    })
    queue.run(() => {
      log.push('after')
    })
    await queue.drained()
    expect(log).toEqual(['after'])
    expect(failures.map((failure) => (failure as Error).message)).toEqual(['sync', 'async'])
  })

  it('goes on after a failure nobody asked about', async () => {
    const queue = new SerialQueue()
    queue.run(() => {
      throw new Error('quiet')
    })
    const log: string[] = []
    queue.run(() => {
      log.push('ran')
    })
    await queue.drained()
    expect(log).toEqual(['ran'])
  })

  it('takes no more tasks once closed, and finishes the ones it has', async () => {
    const queue = new SerialQueue()
    const log: string[] = []
    queue.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      log.push('before')
    })
    const closed = queue.close()
    queue.run(() => {
      log.push('after')
    })
    await closed
    await queue.drained()
    expect(log).toEqual(['before'])
  })

  it('lets a task queue another, which runs after it', async () => {
    const queue = new SerialQueue()
    const log: string[] = []
    queue.run(() => {
      log.push('outer')
      queue.run(() => {
        log.push('inner')
      })
      log.push('outer end')
    })
    await queue.drained()
    await new Promise((resolve) => setImmediate(resolve))
    await queue.drained()
    expect(log).toEqual(['outer', 'outer end', 'inner'])
  })
})
