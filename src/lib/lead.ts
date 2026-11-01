// More of the story for a card whose feed gave only a line or two.
//
// A feed hands over one sentence, often a standfirst that does not say what happened. On a tall screen that left a picture, a
// headline and two lines of text over a large empty space. The article's own page begins with what the story is about, so its
// first paragraphs are the text the card shows, as far as there is room: the card cuts it at a whole line, with an ellipsis,
// where its room ends. A page is read from its start, for a few seconds at most, what was found is kept for hours, and it is used
// only when it gives clearly more than the feed did. Everything here fails quietly: a story without more text is shown as it was.
import { bodyWithoutHeadline } from './story-body.ts'
import { decodeEntities, isPublicWebUrl, shortSummary, stems } from './blurb.ts'

/** The most text kept for a card: about a hundred words, more than a screen holds. The card cuts it where its room ends. */
export const LEAD_MAX_CHARS = 600
/** A text shorter than this is extended: from about this much a card is full. */
export const LEAD_BELOW_CHARS = 300
/** A page that does not give at least this much, and this much more than the feed did, is not worth the swap. */
const MIN_LEAD_CHARS = 140
const MIN_GAIN_CHARS = 80
const MIN_PARAGRAPH_CHARS = 50
const MAX_PARAGRAPHS = 8
/** How much of a page is read (some are well over half a megabyte before the story begins), how often what has come so far is
 * looked at, and how much text is enough to stop reading. */
const MAX_PAGE_CHARS = 786_432
const LOOK_EVERY_CHARS = 65_536
const ENOUGH_CHARS = 480
/** As many stories of one outlet as the feed shows on a page. */
const PER_SOURCE = 6

// Inline tags leave no gap ("study <a>Nature</a>, researchers" reads as it was written); every other tag is a break.
const INLINE_TAG = /<\/?(?:a|b|i|u|em|strong|span|small|sup|sub|mark|abbr|cite|q|time|font)\b[^>]*>/gi

const textOf = (fragment: string) =>
  decodeEntities(fragment.replace(INLINE_TAG, '').replace(/<[^>]*>/g, ' '))
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?\u0964])/g, '$1')
    .trim()

/** A body given as one string often has its paragraphs run together ("mindset”.Arjuna"): a space where a sentence ends. */
const spaceSentences = (text: string) => text.replace(/([a-z\d\u201d\u2019"'][.!?]["\u201d\u2019]?)(?=[A-Z][a-z])/g, '$1 ')

// What a paragraph is not: the page's own furniture and the offers around the text. A word that can begin a sentence of the story
// ("Sources said", "Image recognition") counts only when a colon, a bar or a dash follows it.
const STARTS_LIKE_FURNITURE = new RegExp(
  '^(?:' +
    [
      'advertisement',
      'sponsored',
      'subscribe',
      'sign (?:up|in)',
      'log ?in',
      'follow (?:us|@)',
      'read (?:more|also)',
      'also read',
      'related(?: stories| articles| coverage)?\\s*[:|]',
      'click here',
      'copyright',
      '\\u00a9',
      '(?:photo|image|picture|video|credit|source|illustration)s?\\s*[:|\\u2013\\u2014(-]',
      'file photo',
      '(?:first )?published\\s*[:|\\u2013\\u2014-]',
      '(?:last )?updated\\s*[:|\\u2013\\u2014-]',
      'listen to',
      'watch (?:live|now)',
      'share this',
      'story continues',
      'continue reading',
      'this article (?:has been|was) (?:reviewed|fact)',
      "by\\s+[\\p{L} .'-]{2,40}$",
    ].join('|') +
    ')',
  'iu',
)
const PROMO =
  /\b(cookies?|newsletter|subscribe|subscription|sign up|(?:join|follow) (?:us|our)|whatsapp channel|telegram channel|download the|click here|all rights reserved|terms of (?:use|service)|privacy policy|photo credit|image credit|javascript|register (?:now|here)|get your pass|buy one|promo code|use code|founder summit)\b/i

/** A paragraph of the story rather than a byline, a caption or an offer: long enough, with a sentence in it. */
function isProse(text: string): boolean {
  if ([...text].length < MIN_PARAGRAPH_CHARS) return false
  if (STARTS_LIKE_FURNITURE.test(text) || PROMO.test(text)) return false
  return /[.!?\u0964]["\u201d\u2019')\]]?(\s|$)/.test(text)
}

/** The body the page states about itself for search engines, when it carries one (a JSON-LD block with an articleBody). */
function structuredBody(html: string): string[] {
  let tried = 0
  for (const block of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    // Pages carry a dozen of these (the site, its menu, the author); only the article's holds a body.
    if (!block[1].includes('"articleBody"')) continue
    if (++tried > 4) break
    let data: unknown
    try {
      data = JSON.parse(block[1])
    } catch {
      continue
    }
    const body = findBody(data, 0)
    if (body) return body.split(/\r?\n+/).map((part) => spaceSentences(textOf(part))).filter(isProse)
  }
  return []
}

function findBody(node: unknown, depth: number): string {
  if (!node || typeof node !== 'object' || depth > 3) return ''
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findBody(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  const record = node as Record<string, unknown>
  if (typeof record.articleBody === 'string' && record.articleBody.trim()) return record.articleBody
  for (const key of ['@graph', 'mainEntity']) {
    const found = findBody(record[key], depth + 1)
    if (found) return found
  }
  return ''
}

/** The paragraphs of the story as the page's markup has them: those of its article element, else of the page. */
function markupParagraphs(html: string): string[] {
  let page = html.replace(/<(script|style|noscript|template|svg|nav|header|footer|aside|form|figure|figcaption|button|select|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  const start = page.search(/<article\b/i)
  if (start >= 0) page = page.slice(start)
  const found: string[] = []
  for (const paragraph of page.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)) {
    const text = textOf(paragraph[1])
    if (isProse(text)) found.push(text)
    if (found.length >= MAX_PARAGRAPHS) break
  }
  return found
}

/** The opening of the article on this page, as plain text of up to about LEAD_MAX_CHARS; empty when the page gives none. */
export function articleLead(html: string): string {
  const structured = structuredBody(html)
  const paragraphs = structured.length > 0 ? structured : markupParagraphs(html)
  let text = ''
  for (const paragraph of paragraphs) {
    text = text ? `${text} ${paragraph}` : paragraph
    if ([...text].length >= LEAD_MAX_CHARS) break
  }
  return shortSummary(text, LEAD_MAX_CHARS)
}

/**
 * The text to show for a story from its page: the article's opening, without the headline, or '' when it is not clearly more
 * than `current` already is, or is not about this story (a notice, an error page) because it shares no word with the headline.
 */
export function leadFor(title: string, current: string, html: string): string {
  const text = bodyWithoutHeadline(title, articleLead(html))
  const length = [...text].length
  const already = [...bodyWithoutHeadline(title, current)].length
  if (length < MIN_LEAD_CHARS || length < already + MIN_GAIN_CHARS) return ''
  const wanted = stems(title)
  if (wanted.size > 0) {
    const found = stems(text)
    if (![...wanted].some((stem) => found.has(stem))) return ''
  }
  return text
}

// What was found for a page, kept for a while: an answer is good for hours, "nothing there" for less, so that a page that
// gave nothing is looked at again later but not on every refresh. An outlet that refused or did not answer is left alone for a
// few minutes, so that a host that hangs does not cost its timeout on every refresh.
const FOUND_MS = 12 * 60 * 60 * 1000
const NOTHING_MS = 30 * 60 * 1000
const FAILED_MS = 10 * 60 * 1000
const CACHE_KEYS = 600
const remembered = new Map<string, { at: number; text: string }>()
const failedHosts = new Map<string, number>()

const hostOf = (link: string) => {
  try {
    return new URL(link).hostname
  } catch {
    return ''
  }
}

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
export function forgetLeads() {
  remembered.clear()
  failedHosts.clear()
}

/** A page, read from its start until it has said enough or MAX_PAGE_CHARS have come. A refusal or an overloaded site throws. */
async function readArticle(link: string, signal: AbortSignal, userAgent: string): Promise<string> {
  const response = await fetch(link, {
    signal,
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
  })
  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`refused: ${response.status}`)
  }
  if (!response.ok || !response.body || !(response.headers.get('content-type') || '').toLowerCase().includes('html')) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  let looked = 0
  try {
    while (html.length < MAX_PAGE_CHARS) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.length - looked >= LOOK_EVERY_CHARS) {
        looked = html.length
        if ([...articleLead(html)].length >= ENOUGH_CHARS) break
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return html
}

export interface LeadStory {
  title: string
  content: string
  url?: string
  source?: string
  category?: string
  publishedAt?: number
  /** The text the story had from its feed, which its id is made from: finding more of it must not make it a new story. */
  idText?: string
  /** The text is the opening of the article itself, so it is shown as it is. */
  lead?: boolean
}

export interface LeadOptions {
  /** How long all the pages together may take. */
  budgetMs?: number
  /** The most pages read in one go; the rest wait for the next refresh. */
  maxPages?: number
  concurrency?: number
  /** How long one page may take. */
  pageMs?: number
  userAgent?: string
  /** Reads a page; the network by default. */
  readPage?: (link: string, signal: AbortSignal) => Promise<string>
  now?: () => number
}

/**
 * Gives each news story whose feed text is short the opening of its own article, newest stories first and no more than a page's
 * worth of one outlet. Changes the stories in place and says how many it extended. Time-boxed (`budgetMs`): pages not read in time
 * are left for the next refresh, and a failure of any kind leaves the story as it was. `PLAX_ARTICLE_LEADS=off` turns it off.
 */
export async function extendSummaries(stories: LeadStory[], options: LeadOptions = {}): Promise<number> {
  const { budgetMs = 3000, maxPages = 24, concurrency = 8, pageMs = 2500, userAgent = 'Mozilla/5.0 (compatible; PlaxReader/1.0)' } = options
  const now = options.now ?? Date.now
  const readPage = options.readPage ?? ((link: string, signal: AbortSignal) => readArticle(link, signal, userAgent))
  if (budgetMs < 800 || process.env.PLAX_ARTICLE_LEADS === 'off') return 0

  const perSource = new Map<string, number>()
  const wanting = stories
    .filter((story) => story.category === 'news' && !story.lead && story.url && isPublicWebUrl(story.url) && [...bodyWithoutHeadline(story.title, story.content)].length < LEAD_BELOW_CHARS)
    .filter((story) => {
      const failedAt = failedHosts.get(hostOf(story.url as string))
      return failedAt === undefined || now() - failedAt >= FAILED_MS
    })
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .filter((story) => {
      const key = story.source ?? ''
      const seen = perSource.get(key) ?? 0
      perSource.set(key, seen + 1)
      return seen < PER_SOURCE
    })

  const extend = (story: LeadStory, text: string) => {
    story.idText ??= story.content
    story.content = text
    story.lead = true
  }
  const toRead: LeadStory[] = []
  let extended = 0
  for (const story of wanting) {
    const hit = remembered.get(story.url as string)
    if (hit && now() - hit.at < (hit.text ? FOUND_MS : NOTHING_MS)) {
      if (hit.text) {
        extend(story, hit.text)
        extended++
      }
    } else if (toRead.length < maxPages) toRead.push(story)
  }
  if (toRead.length === 0) return extended

  const found = new Map<LeadStory, string>()
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
        found.set(story, leadFor(story.title, story.content, await readPage(story.url as string, one.signal)))
      } catch {
        // Not read: refused, slow or broken. The outlet is left alone for a few minutes; a page that only ran out of the shared
        // budget is not the outlet's fault, and is left for the next refresh.
        if (!everything.signal.aborted) failedHosts.set(hostOf(story.url as string), now())
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

  // The same opening under different headlines is the site's own text (a notice, a standing paragraph), not these stories'.
  const counts = new Map<string, number>()
  for (const text of found.values()) if (text) counts.set(text.slice(0, 80), (counts.get(text.slice(0, 80)) ?? 0) + 1)
  for (const [story, text] of found) {
    const own = text !== '' && (counts.get(text.slice(0, 80)) ?? 0) === 1
    remember(story.url as string, own ? text : '', now())
    if (own) {
      extend(story, text)
      extended++
    }
  }
  return extended
}
