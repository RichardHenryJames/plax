import { isSignature, makeStory, type Story } from './story'
import { strip } from './java-text'

/**
 * Reads and writes stories: what the feed serves, what the phone saves and what it caches. A port of FeedParser.java of the native app
 * (1.7.1) with the same strict rules: anything that is not exactly the expected shape is refused whole, never half read.
 */

/** The most characters of a feed, a saved file or a cache file that are read (the native app counted bytes). */
export const MAX_BYTES = 1024 * 1024
/** The most stories a feed page may hold, and a saved file and a cache page may keep. */
export const FEED_LIMIT = 60
export const CACHE_LIMIT = 100
export const SAVED_LIMIT = 200

const SCHEMA = 1

/** The server answered, but reported that it could not build the feed. */
export class FeedServiceError extends Error {
  constructor() {
    super('Feed reported an error')
    this.name = 'FeedServiceError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** The text is not a feed, a saved file or a cache file the app accepts. The message never holds any of the text. */
export class FeedParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedParseError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A page of the feed. A feed that reports an error is a FeedServiceError; anything else unreadable is a FeedParseError. */
export function parseFeed(text: string): Story[] {
  const root = object(text)
  if (root.error !== undefined && root.error !== null) throw new FeedServiceError()
  return stories(root.cards, FEED_LIMIT)
}

/** The saved stories of the phone. */
export function parseSaved(text: string): Story[] {
  const root = object(text)
  if (number(root, 'schema') !== SCHEMA) throw new FeedParseError('Unsupported saved-story format')
  return stories(root.stories, SAVED_LIMIT)
}

/** The on-device feed cache shares the saved-story format; only the size bound differs. */
export function parseCached(text: string): Story[] {
  return parseCacheEntry(text).stories
}

/** A cached page with the time it was cached at (0 when the file has none, as a file of the native app has not). */
export function parseCacheEntry(text: string): { stories: Story[]; savedAt: number } {
  const root = object(text)
  if (number(root, 'schema') !== SCHEMA) throw new FeedParseError('Unsupported cache format')
  return { stories: stories(root.stories, CACHE_LIMIT), savedAt: number(root, 'savedAt') }
}

export function encodeCache(stories: readonly Story[], savedAt?: number): string {
  return JSON.stringify({ schema: SCHEMA, ...(savedAt === undefined ? {} : { savedAt }), stories: stories.map(encodeStory) })
}

export function encodeSaved(stories: readonly Story[]): string {
  return JSON.stringify({ schema: SCHEMA, stories: stories.map(encodeStory) })
}

/** Feeds sometimes carry HTML-escaped ampersands inside URLs. */
export function fixUrl(value: string): string {
  return value.split('&#038;').join('&').split('&#38;').join('&').split('&amp;').join('&')
}

/** Whether a story would be read back after it is saved: the same rules the parser applies, so one that would not is never written. */
export function isStorable(story: Story): boolean {
  try {
    return parseSaved(encodeSaved([story])).length === 1
  } catch {
    return false
  }
}

function encodeStory(story: Story): Record<string, unknown> {
  return {
    id: story.id,
    title: story.title,
    content: story.content,
    category: story.category,
    section: story.section,
    source: story.source,
    sourceUrl: story.sourceUrl,
    image: story.image,
    readTime: story.readTime,
    publishedAt: story.publishedAt,
    // Only stories the server signed carry it, so what an older version wrote and read stays the same.
    ...(story.sig === '' ? {} : { sig: story.sig }),
  }
}

function object(text: string): Record<string, unknown> {
  if (text.length > MAX_BYTES) throw new FeedParseError('Response is too large')
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw new FeedParseError('Invalid JSON response')
  }
  if (!isRecord(root)) throw new FeedParseError('Invalid JSON response')
  return root
}

function stories(input: unknown, limit: number): Story[] {
  if (!Array.isArray(input) || input.length > limit) throw new FeedParseError('Invalid story list')
  const result: Story[] = []
  const ids = new Set<string>()
  for (const element of input as unknown[]) {
    if (!isRecord(element)) throw new FeedParseError('Invalid story')
    const story = readStory(element)
    if (ids.has(story.id)) throw new FeedParseError('Duplicate story identifier')
    ids.add(story.id)
    result.push(story)
  }
  return result
}

function readStory(value: Record<string, unknown>): Story {
  return makeStory({
    id: text(value, 'id', 180, true),
    title: text(value, 'title', 2000, false),
    content: text(value, 'content', 8000, true),
    category: text(value, 'category', 80, true),
    section: text(value, 'section', 40, false),
    source: text(value, 'source', 200, false),
    sourceUrl: fixUrl(text(value, 'sourceUrl', 4096, false)),
    image: fixUrl(text(value, 'image', 4096, false)),
    readTime: text(value, 'readTime', 60, false),
    publishedAt: number(value, 'publishedAt'),
    sig: signature(value),
  })
}

/** The signature is optional and only ever used to share; a missing or damaged one never fails the feed. */
function signature(value: Record<string, unknown>): string {
  const item = value.sig
  if (typeof item !== 'string') return ''
  const candidate = strip(item)
  return isSignature(candidate) ? candidate : ''
}

function text(value: Record<string, unknown>, key: string, maximum: number, required: boolean): string {
  const item = value[key]
  if (item === undefined || item === null) {
    if (required) throw new FeedParseError('Missing story field')
    return ''
  }
  if (typeof item !== 'string') throw new FeedParseError('Invalid story field')
  const result = strip(item)
  if (result.length > maximum || (required && result === '')) throw new FeedParseError('Invalid story field length')
  return result
}

/** A whole number of at least 0, or 0 when the field is missing. A fraction, a negative number or a text is refused. */
function number(value: Record<string, unknown>, key: string): number {
  const item = value[key]
  if (item === undefined || item === null) return 0
  if (typeof item !== 'number' || !Number.isSafeInteger(item) || item < 0) throw new FeedParseError('Invalid timestamp')
  return item === 0 ? 0 : item
}
