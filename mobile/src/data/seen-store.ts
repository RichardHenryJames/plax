import type { Story } from './story'
import { MIN_SHARED, printOf, printOfHeadline, sameEventAt, type Print } from './similarity'

/**
 * Everything the reader has already looked at, so that a story never comes back: not the same story on the next launch, and not the
 * same event worded by another outlet. Only a small fingerprint per story is kept (its id, its normalised headline and two times),
 * never the story text, and it stays on the phone. The newest SEEN_LIMIT entries are kept: news for SEEN_MAX_AGE_MS, evergreen facts
 * for SEEN_EVERGREEN_AGE_MS so that a small topic recycles. A port of SeenStore.java of the native app (1.7.1), with the same file
 * format (schema 1: id, k, p, t, n), so that the history of the native app is read as it is.
 */
export const SEEN_LIMIT = 1500
export const SEEN_MAX_AGE_MS = 30 * 24 * 3_600_000
export const SEEN_EVERGREEN_AGE_MS = 7 * 24 * 3_600_000

const MAX_ID = 200
const MAX_KEY = 600

/** The history is not a well-formed schema 1 history. The message never holds any of it. */
export class SeenParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeenParseError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

interface Entry {
  readonly id: string
  readonly print: Print
  readonly seenAt: number
  /** When the event happened, as best as is known: its publish time, or when it was seen if the feed gave none. */
  readonly when: number
}

const entryOf = (id: string, print: Print, seenAt: number): Entry => ({ id, print, seenAt, when: print.published > 0 ? print.published : seenAt })

const alive = (entry: Entry, now: number): boolean => now - entry.seenAt <= (entry.print.timely ? SEEN_MAX_AGE_MS : SEEN_EVERGREEN_AGE_MS)

/** Entries are oldest first: the expired ones go, then only the newest SEEN_LIMIT stay. */
function prune(list: readonly Entry[], now: number): Entry[] {
  const kept = list.filter((entry) => alive(entry, now))
  return kept.length > SEEN_LIMIT ? kept.slice(kept.length - SEEN_LIMIT) : kept
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isTime = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= Number.MAX_SAFE_INTEGER

export class SeenStore {
  private entries: Entry[] = []
  private ids = new Set<string>()
  private keys = new Set<string>()
  /** The timely entries by each of their distinctive words, so that a story is only compared with entries it shares words with. */
  private words = new Map<string, Entry[]>()

  get size(): number {
    return this.entries.length
  }

  /** True when this exact story, or another outlet's version of the same event, was already seen. */
  contains(story: Story, now: number, print: Print = printOf(story)): boolean {
    if (this.ids.has(story.id)) return true
    // Identical wording is one event whatever the stories are.
    if (print.key !== '' && this.keys.has(print.key)) return true
    // Otherwise only timely stories are matched, and only when at least MIN_SHARED words agree: the entries that share that many are
    // found through the index, and the rules of sameEventAt decide on those alone.
    if (!print.timely || print.tokens.length < MIN_SHARED) return false
    const when = print.published > 0 ? print.published : now
    const shared = new Map<Entry, number>()
    for (const token of print.tokens) {
      for (const entry of this.words.get(token) ?? []) {
        const count = (shared.get(entry) ?? 0) + 1
        shared.set(entry, count)
        if (count === MIN_SHARED && sameEventAt(print, when, entry.print, entry.when)) return true
      }
    }
    return false
  }

  /** Records a story as seen. Returns false when it already was, or when its id could not be stored and read back. */
  mark(story: Story, now: number): boolean {
    if (story.id === '' || story.id.length > MAX_ID) return false
    const print = printOf(story)
    if (this.contains(story, now, print)) return false
    const entry = entryOf(story.id, print, now)
    const next = [...this.entries, entry]
    const kept = prune(next, now)
    if (kept.length === next.length) {
      this.entries = next
      this.add(entry)
    } else {
      this.replace(kept)
    }
    return true
  }

  /** Ids of the most recently seen stories, newest first, to tell the server what not to send. */
  recentIds(maximum: number): string[] {
    const ids: string[] = []
    for (let index = this.entries.length - 1; index >= 0 && ids.length < maximum; index--) ids.push(this.entries[index].id)
    return ids
  }

  toJson(): string {
    return JSON.stringify({
      schema: 1,
      seen: this.entries.map(({ id, print, seenAt }) => ({ id, k: print.key, p: print.published, t: seenAt, n: print.timely })),
    })
  }

  /** Throws a SeenParseError for anything that is not a well-formed schema 1 history. Entries that have expired are left out. */
  static fromJson(text: string, now: number): SeenStore {
    let root: unknown
    try {
      root = JSON.parse(text)
    } catch {
      throw new SeenParseError('Invalid seen history')
    }
    if (!isRecord(root)) throw new SeenParseError('Invalid seen history')
    if (root.schema !== 1) throw new SeenParseError('Unsupported seen format')
    if (!Array.isArray(root.seen)) throw new SeenParseError('Invalid seen history')
    const list: Entry[] = []
    for (const value of root.seen as unknown[]) {
      if (!isRecord(value)) throw new SeenParseError('Invalid seen entry')
      const { id, k, p, t, n } = value
      if (typeof id !== 'string' || typeof k !== 'string' || typeof n !== 'boolean') throw new SeenParseError('Invalid seen entry')
      if (id === '' || id.length > MAX_ID || k.length > MAX_KEY || !isTime(p) || !isTime(t)) throw new SeenParseError('Invalid seen entry')
      // The key is read again like a headline, so a key cut at KEY_LIMIT yields fewer words than the headline it came from.
      list.push(entryOf(id, printOfHeadline(k, p, n), Math.floor(t)))
    }
    const store = new SeenStore()
    store.replace(prune(list, now))
    return store
  }

  /** This history and the other one as one: an id seen in both counts as seen the later time. Never holds more than SEEN_LIMIT. */
  merge(other: SeenStore, now: number): SeenStore {
    const latest = new Map<string, Entry>()
    for (const entry of [...this.entries, ...other.entries]) {
      const known = latest.get(entry.id)
      if (known === undefined || entry.seenAt >= known.seenAt) latest.set(entry.id, entry)
    }
    const ordered = [...latest.values()].map((entry, index) => ({ entry, index })).sort((a, b) => a.entry.seenAt - b.entry.seenAt || a.index - b.index)
    const store = new SeenStore()
    store.replace(prune(ordered.map(({ entry }) => entry), now))
    return store
  }

  private replace(entries: Entry[]): void {
    this.entries = entries
    this.ids = new Set()
    this.keys = new Set()
    this.words = new Map()
    for (const entry of entries) this.add(entry)
  }

  private add(entry: Entry): void {
    this.ids.add(entry.id)
    if (entry.print.key !== '') this.keys.add(entry.print.key)
    if (!entry.print.timely) return
    for (const token of entry.print.tokens) {
      const bucket = this.words.get(token)
      if (bucket) bucket.push(entry)
      else this.words.set(token, [entry])
    }
  }
}
