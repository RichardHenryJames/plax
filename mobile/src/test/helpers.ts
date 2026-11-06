import type { Variant } from '../build'
import { APPLICATION_IDS } from '../build'

/** Runs the code under test as this build (the application id decides, see src/build.ts). */
export function setVariant(variant: Variant): void {
  const application = require('expo-application') as { mock: { applicationId: string | null } }
  application.mock.applicationId = APPLICATION_IDS[variant]
}

/** Lets every promise that is already resolved run its continuation. */
export const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve))

export interface FakeResponse {
  status?: number
  body?: unknown
  /** A string is sent as it is; anything else as JSON. */
  headers?: Record<string, string>
  /** Makes fetch itself fail, as a phone with no connection does. */
  networkError?: boolean
  /** Never answers until the request is aborted. */
  hang?: boolean
}

export type Route = FakeResponse | ((request: { url: string; method: string; headers: Record<string, string>; body: string | undefined }) => FakeResponse)

/**
 * Replaces global fetch. `routes` maps a URL prefix (or exact URL) to the answer; the first prefix that matches wins. Returns the list of
 * requests made, so that a test can look at what was asked.
 */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: string | undefined }[] = []
  const impl = jest.fn(async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => {
    const url = String(input)
    // A real fetch rejects at once when it is given a signal that has already been aborted.
    if (init?.signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    const call = { url, method: init?.method ?? 'GET', headers: { ...(init?.headers ?? {}) }, body: init?.body }
    calls.push(call)
    const key = Object.keys(routes).find((prefix) => url === prefix || url.startsWith(prefix))
    if (!key) throw new TypeError(`no fake route for ${url}`)
    const route = routes[key]
    const answer = typeof route === 'function' ? route(call) : route
    if (answer.networkError) throw new TypeError('Network request failed')
    if (answer.hang) {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })))
      })
    }
    const status = answer.status ?? 200
    const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? {})
    const headers = new Map(Object.entries(answer.headers ?? { 'content-type': 'application/json' }).map(([k, v]) => [k.toLowerCase(), v]))
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      text: async () => text,
      json: async () => JSON.parse(text),
    }
  })
  ;(globalThis as { fetch: unknown }).fetch = impl
  return { calls, fetch: impl }
}
