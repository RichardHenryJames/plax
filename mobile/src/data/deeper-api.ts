import { site } from '../build'
import type { Lang } from '../i18n'
import { HttpError, request as httpRequest, type HttpResult } from '../platform/http'
import type { RequestFn } from './feed-api'
import { strip } from './java-text'
import { Lru } from './lru'
import type { Story } from './story'

/** A few short facts that build on one story, written by AI in English or Hindi. */
export interface Deeper {
  readonly insights: readonly string[]
}

/** Where Go deeper gets its facts from: the website's endpoint, the same one the website uses, or a fake in a test. */
export interface DeeperSource {
  /** The facts, or a DeeperError. Aborting the signal abandons the request. */
  deeper(story: Story, lang: Lang, signal?: AbortSignal): Promise<Deeper>
}

/** Go deeper failed, for any reason; the reader is told the same thing whatever it was. */
export class DeeperError extends Error {
  readonly key = 'deeper_error' as const

  constructor(
    message = 'Could not load more',
    /** True when the caller abandoned the request, so that nobody should tell the reader anything. */
    readonly aborted = false,
  ) {
    super(message)
    this.name = 'DeeperError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** The longest answer read. */
export const DEEPER_MAX_CHARS = 64 * 1024
/** What the endpoint reads of a story's text (it cuts at the same length). */
export const DEEPER_MAX_SOURCE = 1500
/** The endpoint writes three; a few more are shown if it ever sends them, and no more than a sheet can hold. */
export const DEEPER_MAX_INSIGHTS = 5
export const DEEPER_MAX_INSIGHT_CHARS = 1000
/** The server can take several seconds for an uncached answer. */
export const DEEPER_TIMEOUT_MS = 45_000
/** How many written insights are kept, so that reopening them is instant. */
export const DEEPER_CACHE_SIZE = 40

/** One entry of the cache of insights per story and language. */
export const deeperKey = (story: Story, lang: string): string => `${story.id}|${lang}`

/** Recently written insights. */
export const deeperCache = new Lru<string, Deeper>(DEEPER_CACHE_SIZE)

/** The story's headline and text are the only data sent, and the language. */
export function deeperRequestBody(story: Story, lang: string): string {
  const source = strip(story.content)
  return JSON.stringify({ title: story.title, content: source.length > DEEPER_MAX_SOURCE ? source.slice(0, DEEPER_MAX_SOURCE) : source, lang })
}

/** The insights in an answer: text only, blanks left out, and an answer with none is a failure, not an empty sheet. */
export function parseDeeper(text: string): Deeper {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw new DeeperError('Invalid response')
  }
  if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new DeeperError('Invalid response')
  const list = (root as Record<string, unknown>).insights
  if (!Array.isArray(list)) throw new DeeperError('Invalid insights')
  const insights: string[] = []
  for (const item of list as unknown[]) {
    if (typeof item !== 'string') throw new DeeperError('Invalid insight')
    const value = strip(item)
    if (value.length > DEEPER_MAX_INSIGHT_CHARS) throw new DeeperError('Insight too long')
    if (value !== '' && insights.length < DEEPER_MAX_INSIGHTS) insights.push(value)
  }
  if (insights.length === 0) throw new DeeperError('No insights')
  return { insights }
}

/** Calls the Plax "go deeper" endpoint. Every way it can fail ends as a DeeperError. */
export function createDeeperApi(options: { request?: RequestFn } = {}): DeeperSource {
  const send = options.request ?? httpRequest
  return {
    async deeper(story, lang, signal) {
      let response: HttpResult
      try {
        response = await send(`${site()}/api/deeper`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' },
          body: deeperRequestBody(story, lang),
          timeoutMs: DEEPER_TIMEOUT_MS,
          maxChars: DEEPER_MAX_CHARS,
          signal,
        })
      } catch (error) {
        throw new DeeperError('Request failed', error instanceof HttpError && error.kind === 'aborted')
      }
      if (!response.ok) throw new DeeperError('Request refused')
      return parseDeeper(response.text)
    },
  }
}

/**
 * The facts for a story in a language: the ones already written when there are some, otherwise asked for, and kept. Reopening a
 * story, or switching to the other language and back, needs no second request.
 */
export async function loadDeeper(source: DeeperSource, story: Story, lang: Lang, signal?: AbortSignal, cache: Lru<string, Deeper> = deeperCache): Promise<Deeper> {
  const key = deeperKey(story, lang)
  const known = cache.get(key)
  if (known !== undefined) return known
  const written = await source.deeper(story, lang, signal)
  cache.set(key, written)
  return written
}
