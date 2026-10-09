/**
 * Content comes from many third-party sources fetched in parallel. One that is slow or stuck (a rate-limited
 * API, an unresponsive feed) used to hold the whole answer for a minute or more, because the pool waited for
 * every source. A source that has not answered within `ms` now simply counts as having returned nothing,
 * and the pool is built from the rest.
 */
export async function within<T>(name: string, work: Promise<T[]>, ms: number): Promise<T[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<T[]>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[Plax Sources] ${name} still running after ${ms} ms; continuing without it`)
      resolve([])
    }, ms)
  })
  try {
    // `work` stays subscribed, so a rejection that arrives after the deadline is handled, not unhandled.
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/** How long any one source may take before the pool goes ahead without it. */
export const SOURCE_DEADLINE_MS = 8000

/**
 * What each source returned last time. A source that is slow, or fails (a rate limit, a hiccup), would
 * otherwise leave a hole in the pool until the next refresh; its previous answer fills the gap for a while.
 * Bounded in size and age, and an empty answer is never remembered, so nothing outlives what was real.
 */
export class Remembered<T> {
  private readonly saved = new Map<string, { at: number; items: T[] }>()
  private readonly maxAgeMs: number
  private readonly maxKeys: number
  private readonly now: () => number

  constructor(maxAgeMs: number, maxKeys: number, now: () => number = Date.now) {
    this.maxAgeMs = maxAgeMs
    this.maxKeys = maxKeys
    this.now = now
  }

  /**
   * Passes `work` through, remembering a good answer under `key`, even one that arrives after the caller
   * stopped waiting (so the next pool is complete). A failure is passed on unchanged.
   */
  track(key: string, work: Promise<T[]>): Promise<T[]> {
    return work.then((items) => {
      if (items.length > 0) this.put(key, items)
      return items
    })
  }

  /** The remembered answer for `key`, or an empty list when there is none or it is too old. */
  recall(key: string): T[] {
    const hit = this.saved.get(key)
    if (!hit) return []
    if (this.now() - hit.at > this.maxAgeMs) {
      this.saved.delete(key)
      return []
    }
    return hit.items
  }

  private put(key: string, items: T[]): void {
    this.saved.delete(key) // re-inserting keeps the map ordered oldest first
    this.saved.set(key, { at: this.now(), items })
    while (this.saved.size > this.maxKeys) {
      const oldest = this.saved.keys().next().value
      if (oldest === undefined) break
      this.saved.delete(oldest)
    }
  }
}
