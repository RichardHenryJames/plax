import type { HttpResult, RequestOptions } from '@/platform/http'
import { AccountError, Rejected, Unauthorized } from './errors'

/** The one function that reaches the network: platform/http's request, or a fake of it in a test. */
export type RequestFn = (url: string, options?: RequestOptions) => Promise<HttpResult>

/** The longest answer that is read (the account service's answers are small; a longer one is a fault). */
export const MAX_CHARS = 512 * 1024

/** The whole of a call, from the first byte sent to the last received. */
export const CALL_TIMEOUT_MS = 25_000

export interface Call {
  readonly method?: 'GET' | 'POST' | 'DELETE'
  readonly headers: Record<string, string>
  readonly body?: string
}

/**
 * One call, answered with its text. What the service said decides what is thrown: 401 is Unauthorized (a new token may help), 408 and 429
 * are a busy service (try later), any other 4xx is a refusal for good, and anything else that is not a success is an unavailable
 * service. A failure of the connection is an unavailable service too. The message of every error is fixed text; neither the address, the
 * headers nor the answer ever reaches it.
 */
export async function send(request: RequestFn, url: string, call: Call): Promise<string> {
  let result: HttpResult
  try {
    result = await request(url, { method: call.method ?? 'GET', headers: call.headers, body: call.body, timeoutMs: CALL_TIMEOUT_MS, maxChars: MAX_CHARS })
  } catch {
    throw new AccountError('Service unavailable')
  }
  const code = result.status
  if (code === 401) throw new Unauthorized()
  if (code === 408 || code === 429) throw new AccountError('Try again later')
  if (code >= 400 && code < 500) throw new Rejected(code)
  if (code < 200 || code >= 300) throw new AccountError('Service unavailable')
  return result.text
}

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Text as JSON, or an error carrying only the given fixed message. */
export function parseJson(text: string, failure: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new AccountError(failure)
  }
}
