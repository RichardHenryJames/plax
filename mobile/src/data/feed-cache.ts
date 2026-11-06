import type { Clock } from '../platform/clock'
import type { KeyValueStore } from '../platform/storage'
import { CACHE_LIMIT, MAX_BYTES, encodeCache, parseCacheEntry } from './feed-parser'
import { hexHash } from './java-text'
import type { Story } from './story'
import type { Topic } from './topic'

/**
 * The last page of stories per topic and language (and per choice of topics for For you), so that the app can draw instantly and
 * refresh in the background. It holds only public stories, a damaged entry is simply dropped, and (unlike the native app's cache
 * files, which the system clears when it needs room) it is bounded by the number of pages it keeps, so that it can never crowd out
 * the saved stories that live in the same store. A port of FeedCache.java of the native app (1.7.1).
 */
export interface CacheEntry {
  readonly stories: readonly Story[]
  /** When the page was cached (milliseconds since 1970). */
  readonly savedAt: number
}

/** How old the page is at this moment. */
export const entryAge = (entry: CacheEntry, now: number): number => Math.max(0, now - entry.savedAt)

/** The most pages kept: the one written longest ago goes when another is added. */
export const CACHE_ENTRIES = 40

const ENTRY_PREFIX = 'plax.feed.entry.'
const INDEX_KEY = 'plax.feed.index'
const KEY_PATTERN = /^[a-z0-9-]{1,60}$/

/** One page per topic and language. */
export const topicCacheKey = (topic: Pick<Topic, 'id'>, lang: string): string => `${topic.id}-${lang}`

/** One page per language and set of interests ("science,space"). The same choice always has the same key. */
export const categoriesCacheKey = (categories: string, lang: string): string => `foryou-${lang}-${hexHash(categories)}`

function checked(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid cache key')
  return key
}

export class FeedCache {
  /** Writes go one after the other, so that the list of the pages kept is never made from a stale read. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: KeyValueStore,
    private readonly clock: Clock,
  ) {}

  /** Null when nothing usable is cached. A damaged page is removed. Throws only for a key that is not a valid key. */
  async read(key: string): Promise<CacheEntry | null> {
    const name = ENTRY_PREFIX + checked(key)
    let text: string | null
    try {
      text = await this.store.getItem(name)
    } catch {
      return null
    }
    if (text === null) return null
    try {
      if (text.length > MAX_BYTES) throw new Error('too large')
      const { stories, savedAt } = parseCacheEntry(text)
      if (savedAt <= 0) throw new Error('no time')
      return stories.length === 0 ? null : { stories, savedAt }
    } catch {
      await this.store.removeItem(name).catch(() => undefined)
      return null
    }
  }

  /** Caches the first CACHE_LIMIT stories of the page. An empty page, and a page too large to keep, are not cached. */
  async write(key: string, stories: readonly Story[]): Promise<void> {
    const name = ENTRY_PREFIX + checked(key)
    if (stories.length === 0) return
    const page = stories.length > CACHE_LIMIT ? stories.slice(0, CACHE_LIMIT) : stories
    const text = encodeCache(page, this.clock())
    if (text.length > MAX_BYTES) return
    await this.serial(async () => {
      await this.store.setItem(name, text)
      await this.touch(key)
    })
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Puts the key last in the list of the pages kept, and lets go of the oldest when there are more than CACHE_ENTRIES. */
  private async touch(key: string): Promise<void> {
    let keys: string[] = []
    try {
      const text = await this.store.getItem(INDEX_KEY)
      const parsed: unknown = text === null ? [] : JSON.parse(text)
      if (Array.isArray(parsed)) keys = parsed.filter((item): item is string => typeof item === 'string' && KEY_PATTERN.test(item))
    } catch {
      keys = []
    }
    keys = keys.filter((known) => known !== key)
    keys.push(key)
    const dropped = keys.splice(0, Math.max(0, keys.length - CACHE_ENTRIES))
    await this.store.setItem(INDEX_KEY, JSON.stringify(keys))
    for (const old of dropped) await this.store.removeItem(ENTRY_PREFIX + old).catch(() => undefined)
  }
}
