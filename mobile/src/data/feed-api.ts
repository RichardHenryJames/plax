import { site } from '../build'
import type { Lang, StringKey } from '../i18n'
import { HttpError, request as httpRequest, type HttpResult, type RequestOptions } from '../platform/http'
import { FeedServiceError, MAX_BYTES, parseFeed } from './feed-parser'
import type { Story } from './story'

/** What one request to the website is made with: the phone's own http.ts, or a fake in a test. */
export type RequestFn = (url: string, options?: RequestOptions) => Promise<HttpResult>

/** What a page of the feed is asked for. */
export interface FeedRequest {
  /** One topic, or several topics separated by commas (a personalised feed). */
  readonly categories: string
  readonly lang: Lang
  /** Ids of the stories the server should leave out. */
  readonly excluded: readonly string[]
  /** Asks the server to look for newer stories at the publishers now, which it does for a single topic only. */
  readonly refresh: boolean
}

/** Where the feed engine gets its pages from. */
export interface FeedSource {
  /** A page of stories, or a FeedLoadError. Aborting the signal abandons the request. */
  load(request: FeedRequest, signal?: AbortSignal): Promise<Story[]>
}

/**
 * A page that could not be had, with the string that tells the reader why: network_error (no answer), rate_error (HTTP 429),
 * service_error (the website failed or said it could not build the feed) or invalid_feed (an answer that cannot be read).
 */
export class FeedLoadError extends Error {
  constructor(
    readonly key: Extract<StringKey, 'network_error' | 'rate_error' | 'service_error' | 'invalid_feed'>,
    /** True when the caller abandoned the request, so that nobody should tell the reader anything. */
    readonly aborted = false,
  ) {
    super(key)
    this.name = 'FeedLoadError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Stories a request asks for (the website's own limit is higher). */
export const PAGE_SIZE = 30
/** As long as the native app's whole call was allowed (25 s). */
export const FEED_TIMEOUT_MS = 25_000

/**
 * The address of a page of the feed. The same request always makes the same address, and a plain one (no exclusions, no refresh) has
 * no more than the three basic parameters, so that the website's cache can answer it.
 */
export function feedUrl(categories: string, lang: string, excluded: readonly string[], refresh: boolean): string {
  const query: [string, string][] = [
    ['categories', categories],
    ['limit', String(PAGE_SIZE)],
    ['lang', lang],
  ]
  if (excluded.length > 0) query.push(['exclude', excluded.join(',')])
  if (refresh) query.push(['refresh', 'true'])
  return `${site()}/api/feed?${query.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')}`
}

function failure(error: unknown): FeedLoadError {
  if (error instanceof HttpError) {
    if (error.kind === 'aborted') return new FeedLoadError('network_error', true)
    if (error.kind === 'too-large') return new FeedLoadError('invalid_feed')
  }
  return new FeedLoadError('network_error')
}

/** The feed of the website. Every way it can fail ends as a FeedLoadError. */
export function createFeedApi(options: { request?: RequestFn } = {}): FeedSource {
  const send = options.request ?? httpRequest
  return {
    async load(feed, signal) {
      let response: HttpResult
      try {
        response = await send(feedUrl(feed.categories, feed.lang, feed.excluded, feed.refresh), {
          headers: { Accept: 'application/json' },
          timeoutMs: FEED_TIMEOUT_MS,
          maxChars: MAX_BYTES,
          signal,
        })
      } catch (error) {
        throw failure(error)
      }
      if (!response.ok) throw new FeedLoadError(response.status === 429 ? 'rate_error' : 'service_error')
      try {
        return parseFeed(response.text)
      } catch (error) {
        throw new FeedLoadError(error instanceof FeedServiceError ? 'service_error' : 'invalid_feed')
      }
    },
  }
}
