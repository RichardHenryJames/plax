// A summary for a story whose feed gave only its headline.
//
// Some publishers' feeds repeat the headline as the story's description, which left a card with a headline and nothing under
// it. The article's own page carries the line it hands to link previews (og:description): a sentence or two written to
// stand under that headline. It is read from the start of the page only, kept for a few hours, and used only when the feed had
// nothing better. Everything here fails quietly: a story without a summary is shown as it always was.
import { bodyWithoutHeadline } from './story-body.ts'

/** The most of a page's description that is kept: about three lines on a phone, and an end at a sentence. */
export const MAX_SUMMARY_CHARS = 320
/** Less than this is not a summary. */
const MINIMUM_CHARS = 40
/** How much of a page is read: its head ends well before this on any real page. */
const MAX_PAGE_CHARS = 196_608

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', hellip: '\u2026', ndash: '\u2013', mdash: '\u2014',
}

function codePoint(value: number): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ''
}

/** The text of a meta tag's attribute, with its entities (&#x27; and the like) turned into what they stand for. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
}

const tidy = (text: string) => decodeEntities(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return found
}

/** What the page says about itself: og:description, else twitter:description, else the plain description. Empty when none. */
export function pageDescription(html: string): string {
  const end = html.search(/<\/head>/i)
  const head = end >= 0 ? html.slice(0, end) : html
  const wanted = ['og:description', 'twitter:description', 'description']
  const found = new Map<string, string>()
  // A tag ends at the first ">" outside quotes: a description may hold one.
  for (const tag of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attribute = attributes(tag[0])
    const key = (attribute.property || attribute.name || '').toLowerCase()
    if (wanted.includes(key) && attribute.content && !found.has(key)) found.set(key, attribute.content)
  }
  for (const key of wanted) {
    const text = found.get(key)
    if (text) return tidy(text)
  }
  return ''
}

/** At most `max` characters, ending where a sentence ends when one does far enough in, else at a word, with an ellipsis. */
export function shortSummary(text: string, max: number = MAX_SUMMARY_CHARS): string {
  if (text.length <= max) return text
  const window = text.slice(0, max)
  const ends = [...window.matchAll(/[.!?\u0964](?=\s|$)/g)]
  const last = ends.length > 0 ? (ends[ends.length - 1].index ?? -1) + 1 : -1
  if (last >= Math.floor(max * 0.4)) return window.slice(0, last).trim()
  const space = window.lastIndexOf(' ')
  return (space > 0 ? window.slice(0, space) : window).replace(/[\s,;:\u2013\u2014-]+$/, '') + '\u2026'
}

// The first four letters of each word of four or more, so that "protest" and "protests" are one: what a headline and the
// description of the same article have in common, and what a site's own tagline does not share with a headline.
export const stems = (text: string) =>
  new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).map((word) => [...word]).filter((letters) => letters.length >= 4).map((letters) => letters.slice(0, 4).join('')))

/**
 * The summary to put under a headline from the article's page, or '' when the page gives nothing better than the headline:
 * a description that is the headline again, or too short to be one, or that has nothing in common with it (a site's own
 * tagline on a page that has no description of its own).
 */
export function summaryFromPage(title: string, html: string): string {
  const described = shortSummary(pageDescription(html))
  const summary = bodyWithoutHeadline(title, described)
  if ([...summary].length < MINIMUM_CHARS) return ''
  const wanted = stems(title)
  if (wanted.size > 0) {
    const have = stems(described)
    if (![...wanted].some((stem) => have.has(stem))) return ''
  }
  return summary
}

/** Http(s) pages of a named host: never an address, nor a machine of the server's own network. */
export function isPublicWebUrl(link: string): boolean {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return false
  return host.includes('.')
}

// What was found for a page, kept for a while: an answer is good for hours, "nothing there" for less, so that a page that
// had no description is looked at again later but not on every refresh.
const FOUND_MS = 12 * 60 * 60 * 1000
const NOTHING_MS = 30 * 60 * 1000
const CACHE_KEYS = 600
const remembered = new Map<string, { at: number; text: string }>()

function remember(link: string, text: string, now: number) {
  remembered.delete(link) // re-inserting keeps the map ordered oldest first
  remembered.set(link, { at: now, text })
  while (remembered.size > CACHE_KEYS) {
    const oldest = remembered.keys().next().value
    if (oldest === undefined) break
    remembered.delete(oldest)
  }
}

/** Forgets what was found, for tests. */
export function forgetSummaries() {
  remembered.clear()
}

/** The start of a page (up to the end of its head). */
async function readHead(link: string, signal: AbortSignal, userAgent: string): Promise<string> {
  const response = await fetch(link, {
    signal,
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
  })
  if (!response.ok || !response.body || !(response.headers.get('content-type') || '').toLowerCase().includes('html')) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  try {
    while (html.length < MAX_PAGE_CHARS) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (/<\/head>/i.test(html)) break
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return html
}

export interface SummaryOptions {
  /** How long all the pages together may take. */
  budgetMs?: number
  /** The most pages read in one go; the rest wait for the next refresh. */
  maxPages?: number
  concurrency?: number
  /** How long one page may take. */
  pageMs?: number
  userAgent?: string
  /** Reads the start of a page; the network by default. */
  readPage?: (link: string, signal: AbortSignal) => Promise<string>
  now?: () => number
}

interface Story {
  title: string
  content: string
  url?: string
}

/**
 * Gives each story whose text only repeats its headline the summary its own page carries, when it carries one. Changes the
 * stories in place and says how many it filled. Time-boxed (`budgetMs`): pages not read in time are left for the next refresh,
 * and a failure of any kind leaves the story as it was.
 */
export async function fillMissingSummaries(stories: Story[], options: SummaryOptions = {}): Promise<number> {
  const { budgetMs = 2500, maxPages = 14, concurrency = 6, pageMs = 3000, userAgent = 'Mozilla/5.0 (compatible; PlaxReader/1.0)' } = options
  const now = options.now ?? Date.now
  const readPage = options.readPage ?? ((link: string, signal: AbortSignal) => readHead(link, signal, userAgent))
  if (budgetMs < 400) return 0

  const missing = stories.filter((story) => story.url && isPublicWebUrl(story.url) && bodyWithoutHeadline(story.title, story.content) === '')
  const toRead: Story[] = []
  let filled = 0
  for (const story of missing) {
    const hit = remembered.get(story.url as string)
    if (hit && now() - hit.at < (hit.text ? FOUND_MS : NOTHING_MS)) {
      if (hit.text) {
        story.content = hit.text
        filled++
      }
    } else if (toRead.length < maxPages) toRead.push(story)
  }
  if (toRead.length === 0) return filled

  const found = new Map<Story, string>()
  const everything = new AbortController()
  const timer = setTimeout(() => everything.abort(), budgetMs)
  let next = 0
  const worker = async () => {
    while (next < toRead.length && !everything.signal.aborted) {
      const story = toRead[next++]
      const one = new AbortController()
      const stop = () => one.abort()
      everything.signal.addEventListener('abort', stop)
      const pageTimer = setTimeout(stop, pageMs)
      try {
        const html = await readPage(story.url as string, one.signal)
        found.set(story, summaryFromPage(story.title, html))
      } catch {
        // Not read (slow, refused, cut off by the budget): left for the next refresh.
      } finally {
        clearTimeout(pageTimer)
        everything.signal.removeEventListener('abort', stop)
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, toRead.length) }, worker))
  } finally {
    clearTimeout(timer)
  }

  // The same text under different headlines is a site's own description, not these stories'.
  const counts = new Map<string, number>()
  for (const text of found.values()) if (text) counts.set(text, (counts.get(text) ?? 0) + 1)
  for (const [story, text] of found) {
    const own = text !== '' && (counts.get(text) ?? 0) === 1
    remember(story.url as string, own ? text : '', now())
    if (own) {
      story.content = text
      filled++
    }
  }
  return filled
}
