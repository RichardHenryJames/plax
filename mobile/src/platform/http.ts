import { variant } from '../build'

export class HttpError extends Error {
  constructor(
    readonly kind: 'network' | 'timeout' | 'status' | 'too-large' | 'insecure' | 'aborted',
    readonly status = 0,
    message?: string,
  ) {
    super(message ?? kind)
    this.name = 'HttpError'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
  body?: string
  /** Gives up after this long (default 20 s). */
  timeoutMs?: number
  /** The most characters of the answer that are read (default 1 MiB); a longer one is an error. */
  maxChars?: number
  signal?: AbortSignal
}

export interface HttpResult {
  status: number
  ok: boolean
  headers: { get(name: string): string | null }
  text: string
}

const DEFAULT_TIMEOUT_MS = 20_000
export const DEFAULT_MAX_CHARS = 1024 * 1024

/** Only https, and (for the e2e build alone) plain http to the emulator's host machine. */
export function allowedUrl(url: string): boolean {
  if (/^https:\/\//i.test(url)) return true
  return variant() === 'e2e' && /^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)
}

/**
 * One request with a time limit and a size limit. It never follows the data into logs: errors carry a kind and a status, not the
 * address, the headers or the body.
 */
export async function request(url: string, options: RequestOptions = {}): Promise<HttpResult> {
  if (!allowedUrl(url)) throw new HttpError('insecure')
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const outside = options.signal
  const abortFromOutside = () => controller.abort()
  if (outside) {
    if (outside.aborted) controller.abort()
    else outside.addEventListener('abort', abortFromOutside)
  }
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
      redirect: 'follow',
    })
    const text = await response.text()
    if (text.length > (options.maxChars ?? DEFAULT_MAX_CHARS)) throw new HttpError('too-large', response.status)
    return { status: response.status, ok: response.ok, headers: response.headers, text }
  } catch (failure) {
    if (failure instanceof HttpError) throw failure
    if (timedOut) throw new HttpError('timeout')
    if (outside?.aborted) throw new HttpError('aborted')
    throw new HttpError('network')
  } finally {
    clearTimeout(timer)
    outside?.removeEventListener('abort', abortFromOutside)
  }
}

/** A request whose answer is JSON. A status outside 200..299 is an error of kind "status" carrying the code. */
export async function requestJson<T = unknown>(url: string, options: RequestOptions = {}): Promise<{ status: number; data: T }> {
  const result = await request(url, { ...options, headers: { Accept: 'application/json', ...(options.headers ?? {}) } })
  if (!result.ok) throw new HttpError('status', result.status)
  try {
    return { status: result.status, data: JSON.parse(result.text) as T }
  } catch {
    throw new HttpError('status', result.status, 'invalid-json')
  }
}
