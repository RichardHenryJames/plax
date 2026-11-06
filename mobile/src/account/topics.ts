/** Anything with an id: a topic the reader can choose (data/topic.ts), or what the website lists (src/config). */
export interface TopicId {
  readonly id: string
}

/**
 * Known topics only, in a fixed order (so one choice always makes the same request), each as it is written without the space around it.
 * Anything that is not a string, or names a topic that is not on offer now, is dropped. A port of Interests.sanitize.
 */
export function cleanTopics(candidates: Iterable<unknown>, known: readonly TopicId[]): Set<string> {
  const offered = new Set(known.map((topic) => topic.id))
  const clean = new Set<string>()
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const id = candidate.trim()
    if (offered.has(id)) clean.add(id)
  }
  // The code units are compared, as the native app's sorted set did.
  return new Set([...clean].sort())
}

export function sameTopics(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const topic of a) if (!b.has(topic)) return false
  return true
}
