// The "no repeated stories" engine: what counts as the same news event, and what the reader has
// already seen. Pure logic (no DOM, no Node APIs, no dependencies), so it runs in the browser, in
// route handlers and under Node's type stripping.
//
// A port of Similarity.java, SeenStore.java and FeedMerge.java in
// android/app/src/main/java/com/plaxlabs/news, so the website and the Android app make the same
// decisions. Change a constant, word list or rule there and here together.

export interface EngineStory {
  id: string
  title?: string
  /** The headline as the source wrote it. The website translates cards in place, and a story must keep one identity. */
  originalTitle?: string
  content: string
  category: string
  publishedAt?: number // epoch ms; missing or 0 when the feed gave none
  image?: string
}

/** A headline reduced to what identifies its event. */
export interface Print {
  tokens: string[] // sorted, unique, distinctive words
  key: string // every word, lower case, single spaces, at most KEY_LIMIT characters
  published: number // 0 when the feed gave no publish time
  timely: boolean // news-like: only these are matched fuzzily
}

export interface MergeResult<T> {
  visible: T[] // stories to show, new ones first
  earlier: T[] // stories already seen, withheld until the reader asks for them
  fresh: T[] // stories that were not on screen before this merge, to offer as "new stories"
}

export const MIN_SHARED = 3
/** Longest headline key kept, so a stored history stays small. */
export const KEY_LIMIT = 160
export const WINDOW_MS = 16 * 3600000
export const CLOSE_MS = 3 * 3600000
export const EARLIER_LIMIT = 200
export const SEEN_LIMIT = 1500
export const SEEN_MAX_AGE_MS = 30 * 24 * 3600000
export const SEEN_EVERGREEN_AGE_MS = 7 * 24 * 3600000

const SPLIT = /[^\p{L}\p{M}\p{N}]+/u
const YEAR = /^(19|20)\d\d$/
const DIGIT = /^\p{Nd}$/u

const STOP = new Set(
  (
    'the and but for with from this that these those its his her their our your has have had will would can could ' +
    'about after over into says say said not how why what who whom when where which while amid more than other you ' +
    'may gets get also just still only very much many most some any all both each few such own same too then there ' +
    'here out off again once been being are was were new live updates update latest news today breaking first big ' +
    'top key major video watch photos explained explainer analysis opinion report reports reportedly reported claims ' +
    'claim plans plan set killed injured dead dies die death deaths hurt wounded arrested held detained wins win won ' +
    'beats beat leads lead led gains gain falls fall rises rise india indian world minister government govt police ' +
    'court high supreme biggest moves stocks making premarket midday morning evening tonight ' +
    // Hindi function words
    'का की के में से को है हैं ने पर और यह था थे एक कि भी इस ये वह जो तो हो या कर रहा रही रहे गया गई गए दिया ' +
    'लिए साथ बाद अब नए नई नया करने किया जा सकता कहा बोले बताया पहले क्या कैसे क्यों कब तक नहीं लेकिन अपने उन उस इन ' +
    'सभी कुछ वाले वाली वाला द्वारा'
  ).split(/\s+/)
)

// Java's Character.isWhitespace, which String.strip() and isBlank() use. Unlike trim() it keeps
// no-break spaces and the BOM and also strips U+001C..U+001F.
function isSpace(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    (code >= 0x1c && code <= 0x20) ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x2006) ||
    (code >= 0x2008 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x205f ||
    code === 0x3000
  )
}

function strip(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && isSpace(text.charCodeAt(start))) start++
  while (end > start && isSpace(text.charCodeAt(end - 1))) end--
  return text.slice(start, end)
}

// Publish times are whole milliseconds, 0 when unknown. NaN, negative or fractional values
// would not survive a JSON round trip of the seen history.
function wholeTime(value: number | undefined): number {
  return value !== undefined && value > 0 && value <= Number.MAX_SAFE_INTEGER ? Math.floor(value) : 0
}

/** The first sentence of the body, for quotes and other stories that carry no headline. */
function lead(content: string): string {
  const text = strip(content)
  const end = text.indexOf('.')
  return text.length > 140 ? text.slice(0, 140) : end > 20 ? text.slice(0, end) : text
}

// Java's Character.isDigit(char) sees UTF-16 units, so a digit outside the BMP does not count.
function allDigits(token: string): boolean {
  for (let index = 0; index < token.length; index++) if (!DIGIT.test(token[index])) return false
  return true
}

function stem(word: string): string {
  const length = word.length
  return length > 4 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')
    ? word.slice(0, length - 1)
    : word
}

/** Reduces a headline to its distinctive words; `published` is 0 when the feed gave no time. */
export function printOfHeadline(headline: string, published: number, timely: boolean): Print {
  const words: string[] = []
  const tokens: string[] = []
  for (const word of headline.normalize('NFKC').toLowerCase().split(SPLIT)) {
    if (word === '') continue
    words.push(word)
    // Stemming comes first, so a plural stop word only matches when its singular is listed too.
    const token = stem(word)
    if (token.length < 3 || STOP.has(token) || YEAR.test(token) || allDigits(token)) continue
    tokens.push(token)
  }
  tokens.sort()
  const key = words.join(' ')
  return {
    tokens: tokens.filter((token, index) => index === 0 || token !== tokens[index - 1]),
    key: key.length > KEY_LIMIT ? key.slice(0, KEY_LIMIT) : key,
    published: wholeTime(published),
    timely,
  }
}

/** A story's fingerprint: its headline (the lead of the body when it has none) and publish time. */
export function printOf(story: EngineStory): Print {
  const published = wholeTime(story.publishedAt)
  const title = story.originalTitle || story.title
  const headline = title && strip(title) !== '' ? title : lead(story.content ?? '')
  return printOfHeadline(headline, published, published > 0 || story.category === 'news')
}

function shared(a: string[], b: string[]): number {
  let i = 0
  let j = 0
  let common = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      common++
      i++
      j++
    } else if (a[i] < b[j]) i++
    else j++
  }
  return common
}

/**
 * Are A and B one event? `whenA`/`whenB` are when each happened: its publish time, or when it
 * was first seen if the feed gave none.
 */
export function sameEventAt(a: Print, whenA: number, b: Print, whenB: number): boolean {
  if (a.key !== '' && a.key === b.key) return true
  if (!a.timely || !b.timely) return false
  const common = shared(a.tokens, b.tokens)
  if (common < MIN_SHARED) return false
  const apart = Math.abs(whenA - whenB)
  if (apart > WINDOW_MS) return false
  const jaccard = common / (a.tokens.length + b.tokens.length - common)
  const containment = common / Math.min(a.tokens.length, b.tokens.length)
  // Stories published together that share their subject are one event even when worded loosely.
  return jaccard >= 0.22 || containment >= 0.5 || (apart <= CLOSE_MS && jaccard >= 0.15)
}

export function sameEvent(a: Print, b: Print): boolean {
  // Without both publish times there is nothing to compare, so only wording decides.
  const known = a.published > 0 && b.published > 0
  return sameEventAt(a, known ? a.published : 0, b, known ? b.published : 0)
}

interface Entry {
  id: string
  print: Print
  seenAt: number
}

/** Entries are oldest first: drop the expired ones, then keep only the newest SEEN_LIMIT. */
function prune(list: Entry[], now: number): Entry[] {
  const kept = list.filter(
    (entry) => now - entry.seenAt <= (entry.print.timely ? SEEN_MAX_AGE_MS : SEEN_EVERGREEN_AGE_MS)
  )
  return kept.length > SEEN_LIMIT ? kept.slice(kept.length - SEEN_LIMIT) : kept
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}

/**
 * Everything the reader has already looked at, so a story never comes back: not the same story
 * on the next visit, and not the same event worded by another outlet. Only a small fingerprint
 * per story is kept (id, normalised headline, times), never the story text.
 */
export class SeenStore {
  private entries: Entry[] = []

  get size(): number {
    return this.entries.length
  }

  /** True when this exact story, or another outlet's version of the same event, was already seen. */
  contains(story: EngineStory, now: number): boolean {
    return this.holds(story.id, printOf(story), now)
  }

  /** Records a story as seen. Returns false when it already was, or when its id could not be stored and read back. */
  mark(story: EngineStory, now: number): boolean {
    if (story.id === '' || story.id.length > 200) return false
    const print = printOf(story)
    if (this.holds(story.id, print, now)) return false
    this.entries = prune([...this.entries, { id: story.id, print, seenAt: now }], now)
    return true
  }

  /** Ids of the most recently seen stories, newest first, to tell the server what not to send. */
  recentIds(max: number): string[] {
    const ids: string[] = []
    for (let index = this.entries.length - 1; index >= 0 && ids.length < max; index--) ids.push(this.entries[index].id)
    return ids
  }

  toJson(): string {
    return JSON.stringify({
      schema: 1,
      seen: this.entries.map(({ id, print, seenAt }) => ({
        id,
        k: print.key,
        p: print.published,
        t: seenAt,
        n: print.timely,
      })),
    })
  }

  /** Throws an Error for anything that is not a well-formed schema 1 history. */
  static fromJson(text: string, now: number): SeenStore {
    let root: unknown
    try {
      root = JSON.parse(text)
    } catch {
      throw new Error('Invalid seen history')
    }
    if (!isRecord(root)) throw new Error('Invalid seen history')
    if (root.schema !== 1) throw new Error('Unsupported seen format')
    if (!Array.isArray(root.seen)) throw new Error('Invalid seen history')
    const list: Entry[] = []
    for (const value of root.seen as unknown[]) {
      if (!isRecord(value)) throw new Error('Invalid seen entry')
      const { id, k, p, t, n } = value
      if (typeof id !== 'string' || typeof k !== 'string' || typeof n !== 'boolean') throw new Error('Invalid seen entry')
      if (id === '' || id.length > 200 || k.length > 600 || !isTime(p) || !isTime(t)) throw new Error('Invalid seen entry')
      // The key is re-read like a headline, so a key cut at KEY_LIMIT yields fewer words than the original.
      list.push({ id, print: printOfHeadline(k, p, n), seenAt: Math.floor(t) })
    }
    const store = new SeenStore()
    store.entries = prune(list, now)
    return store
  }

  private holds(id: string, print: Print, now: number): boolean {
    const when = print.published > 0 ? print.published : now
    return this.entries.some(
      (entry) =>
        entry.id === id ||
        sameEventAt(print, when, entry.print, entry.print.published > 0 ? entry.print.published : entry.seenAt)
    )
  }
}

// Story.isWebLink on Android: an https link with a host, no user info and no port. java.net.URI also
// refuses spaces, control characters, a few ASCII marks and stray % signs, so those links give no image,
// and so does a second # (a feed that leaves "&#038;" undecoded) or a bracket in the path.
// Host names are only roughly checked: URI also wants the last label of a dotted name to start with a letter.
const LABEL = '[a-z0-9]+(?:-+[a-z0-9]+)*'
const HOST = `(?:${LABEL}(?:\\.${LABEL})*\\.?|\\[[0-9a-f:.]+\\])` // a name, or an IPv6 literal
// An empty port ("host:") counts as no port.
const WEB_LINK = new RegExp(`^https://${HOST}:?(?:/[^?#\\[\\]]*)?(?:\\?[^#]*)?(?:#[^#]*)?$`, 'i')
const URI_ILLEGAL = /[\p{Z}\p{Cc}"<>\\^`{|}]|%(?![0-9a-f]{2})/iu

function hasImage(story: EngineStory): boolean {
  const link = story.image
  return typeof link === 'string' && WEB_LINK.test(link) && !URI_ILLEGAL.test(link)
}

function sameMoment(a: Print, b: Print): boolean {
  return a.published <= 0 || b.published <= 0 || Math.abs(a.published - b.published) <= CLOSE_MS
}

/** Collapses stories about one event within a batch, keeping the first (or a pictured one if equally old). */
export function cluster<T extends EngineStory>(stories: T[]): T[] {
  const kept: T[] = []
  const prints: Print[] = []
  for (const story of stories) {
    const print = printOf(story)
    const index = prints.findIndex((other) => sameEvent(print, other))
    if (index < 0) {
      kept.push(story)
      prints.push(print)
    } else if (!hasImage(kept[index]) && hasImage(story) && sameMoment(print, prints[index])) {
      kept[index] = story
      prints[index] = print
    }
  }
  return kept
}

/** True when the list already holds this story or another outlet's version of the same event. */
export function covers<T extends EngineStory>(list: T[], story: T): boolean {
  const print = printOf(story)
  return list.some((other) => other.id === story.id || sameEvent(print, printOf(other)))
}

function distinct<T extends EngineStory>(stories: T[]): T[] {
  const ids = new Set<string>()
  const unique: T[] = []
  for (const story of stories) {
    if (ids.has(story.id)) continue
    ids.add(story.id)
    unique.push(story)
  }
  return unique
}

function cap<T>(stories: T[]): T[] {
  return stories.slice(0, EARLIER_LIMIT)
}

/**
 * A new first page: unseen stories lead, followed by anything the reader still has on screen
 * but has not viewed. Viewed stories move to `earlier`.
 */
export function replace<T extends EngineStory>(
  visible: T[],
  earlier: T[],
  page: T[],
  seen: SeenStore,
  now: number
): MergeResult<T> {
  const unseen: T[] = []
  const seenPage: T[] = []
  for (const story of cluster(page)) {
    if (seen.contains(story, now)) seenPage.push(story)
    else unseen.push(story)
  }
  const leftover: T[] = []
  const viewed: T[] = []
  for (const story of visible) {
    if (seen.contains(story, now)) viewed.push(story)
    else leftover.push(story)
  }

  return {
    visible: [...unseen, ...leftover.filter((story) => !covers(unseen, story))],
    earlier: cap(distinct([...seenPage, ...viewed, ...earlier])),
    fresh: unseen.filter((story) => !covers(visible, story)),
  }
}

/** An older page: its unseen stories follow the current ones. */
export function append<T extends EngineStory>(
  visible: T[],
  earlier: T[],
  page: T[],
  seen: SeenStore,
  now: number
): MergeResult<T> {
  const fresh: T[] = []
  const seenPage: T[] = []
  for (const story of cluster(page)) {
    if (seen.contains(story, now) || covers(earlier, story)) seenPage.push(story)
    else if (!covers(visible, story)) fresh.push(story)
  }
  return {
    visible: [...visible, ...fresh],
    earlier: cap(distinct([...earlier, ...seenPage])),
    fresh,
  }
}
