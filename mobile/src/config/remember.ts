import type { KeyValueStore } from '@/platform/storage'

type Memory = Record<string, string | number>

/**
 * What a part of the app remembers between starts (when it last asked the website, which notice the reader has seen ...). The values
 * are held in memory, so that the rules can read them at once, and written through to the phone's storage under `<prefix>.<name>`.
 * A number is kept as its decimal text; text that is not a number where a number is expected is the same as nothing kept.
 */
export interface Remembered<T extends Memory> {
  /** The values now: what was kept (once `load` has finished) with what has been set since. */
  readonly value: Readonly<T>
  /** Reads what the phone kept, once. A value set before it finishes is not overwritten by an older one that was kept. */
  load(): Promise<void>
  /** Changes values at once and writes them. Never rejects: a value that cannot be kept is forgotten at the next start. */
  set(patch: Partial<T>): Promise<void>
}

export function remembered<T extends Memory>(storage: KeyValueStore, prefix: string, initial: T): Remembered<T> {
  let current: T = initial
  const touched = new Set<string>()
  let loading: Promise<void> | null = null
  const keyOf = (name: string) => `${prefix}.${name}`

  async function readOne(name: string): Promise<void> {
    try {
      const text = await storage.getItem(keyOf(name))
      if (text === null || touched.has(name)) return
      const wanted = initial[name]
      const value = typeof wanted === 'number' ? Number(text) : text
      if (typeof value === 'number' && !Number.isFinite(value)) return
      current = { ...current, [name]: value }
    } catch {
      // A value that cannot be read is a value that was never kept.
    }
  }

  async function writeOne(name: string, value: string | number): Promise<void> {
    try {
      await storage.setItem(keyOf(name), String(value))
    } catch {
      // Remembered for this run, forgotten at the next start.
    }
  }

  return {
    get value() {
      return current
    },
    load() {
      if (loading === null) loading = Promise.all(Object.keys(initial).map(readOne)).then(() => undefined)
      return loading
    },
    set(patch) {
      const changes: [string, string | number][] = []
      for (const name of Object.keys(patch)) {
        const value = patch[name]
        if (value !== undefined) changes.push([name, value])
      }
      const next: Memory = { ...current }
      for (const [name, value] of changes) {
        next[name] = value
        touched.add(name)
      }
      current = next as T
      return Promise.all(changes.map(([name, value]) => writeOne(name, value))).then(() => undefined)
    },
  }
}
