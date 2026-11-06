import type { KeyValueStore } from '../platform/storage'
import { strip } from './java-text'
import type { Topic } from './topic'

/** The topics the reader picked to personalise For you. They stay on the phone whether or not there is an account. */
export const INTERESTS_KEY = 'plax.interests'

/**
 * Known topics only, in a fixed order, so that one choice always makes the same request and the same cache key. `offered` is what the
 * reader is offered now (the website's list, or the built-in one); whatever is not in it (a made-up id, a list in one string, a topic
 * the website has taken away) is left out, and so are blanks and repeats.
 */
export function sanitize(candidates: Iterable<string | null | undefined>, offered: readonly Topic[]): ReadonlySet<string> {
  const known = new Set(offered.map((topic) => topic.id))
  const clean = new Set<string>()
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const id = strip(candidate)
    if (known.has(id)) clean.add(id)
  }
  return new Set([...clean].sort())
}

/** The topics as the feed is asked for them: "history,science,space". */
export const categories = (topics: Iterable<string>): string => [...topics].join(',')

/** Whether two choices of topics are the same. */
export function sameInterests(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

/** What the phone holds, or no topics when it holds nothing or cannot be read. */
export async function readInterests(store: KeyValueStore, offered: readonly Topic[]): Promise<ReadonlySet<string>> {
  try {
    return sanitize((await store.getItem(INTERESTS_KEY) ?? '').split(','), offered)
  } catch {
    return new Set()
  }
}

/** Keeps the topics (only the known ones, in the fixed order). */
export async function writeInterests(store: KeyValueStore, topics: Iterable<string>, offered: readonly Topic[]): Promise<void> {
  await store.setItem(INTERESTS_KEY, categories(sanitize(topics, offered)))
}
