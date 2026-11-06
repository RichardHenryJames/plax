import type { HttpResult } from '@/platform/http'
import type { KeyValueStore } from '@/platform/storage'

/** The phone's storage, in memory, with a way to make it fail the way a full or broken phone does. */
export interface MemoryStorage extends KeyValueStore {
  data: Map<string, string>
  failReads: boolean
  failWrites: boolean
  failRemoves: boolean
  /** The keys written, in order. */
  writes: string[]
  /** The keys removed, in order. */
  removed: string[]
}

export function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const storage: MemoryStorage = {
    data: new Map(Object.entries(initial)),
    failReads: false,
    failWrites: false,
    failRemoves: false,
    writes: [],
    removed: [],
    async getItem(key) {
      if (storage.failReads) throw new Error('storage unreadable')
      return storage.data.get(key) ?? null
    },
    async setItem(key, value) {
      if (storage.failWrites) throw new Error('storage full')
      storage.writes.push(key)
      storage.data.set(key, value)
    },
    async removeItem(key) {
      if (storage.failRemoves) throw new Error('storage broken')
      storage.removed.push(key)
      storage.data.delete(key)
    },
  }
  return storage
}

export const SITE = 'https://plax-rouge.vercel.app/news'
export const site = () => SITE
export const NOW = 1_800_000_000_000

/** An answer of the website as the request function returns it. A string body is the text; the type is JSON unless another is given. */
export function answer(text: string, init: { status?: number; type?: string | null } = {}): HttpResult {
  const status = init.status ?? 200
  const type = init.type === undefined ? 'application/json' : init.type
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null) },
    text,
  }
}

export interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

/** A configuration file of schema 1 with these parts: configText('"features":{"ads":false}'). */
export const configText = (parts = '') => `{"schemaVersion":1${parts === '' ? '' : `,${parts}`}}`

export const noticePart = (id: string, level: string, extra = '') =>
  `"notice":{"id":"${id}","level":"${level}","title":{"en":"T"},"body":{"en":"B"}${extra}}`

export const updatePart = (latest: number, least: number) =>
  `"update":{"latestVersionCode":${latest},"latestVersionName":"1.7.0","minSupportedVersionCode":${least}}`
