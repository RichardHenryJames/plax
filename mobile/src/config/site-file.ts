import { request, type HttpResult, type RequestOptions } from '@/platform/http'
import { utf8Length } from './limits'

/** One request to the website: the real one (platform/http.ts) or, in a test, a stand-in. */
export type RequestFn = (url: string, options?: RequestOptions) => Promise<HttpResult>

export const defaultRequest: RequestFn = request

/** Whether a Content-Type header says JSON: application/json, with or without parameters such as the charset. */
export function isJsonType(contentType: string | null): boolean {
  return (contentType ?? '').split(';')[0].trim().toLowerCase() === 'application/json'
}

export interface FileLimits {
  /** The most bytes the file may have. */
  maxBytes: number
  /** The whole request, from the first byte sent to the last one read. */
  timeoutMs: number
}

/**
 * The text of a small JSON file of the website (the settings, the update feed), or null when it cannot be had: the request failed
 * or was too slow, the answer is not status 200, not JSON, or longer than its limit. The request carries nothing about the reader:
 * no cookie, no account, no identifier, and it asks that nothing between be kept.
 */
export async function fetchSiteFile(send: RequestFn, url: string, limits: FileLimits): Promise<string | null> {
  try {
    const answer = await send(url, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
      timeoutMs: limits.timeoutMs,
      maxChars: limits.maxBytes,
    })
    if (answer.status !== 200 || !isJsonType(answer.headers.get('content-type'))) return null
    return utf8Length(answer.text) > limits.maxBytes ? null : answer.text
  } catch {
    return null
  }
}
