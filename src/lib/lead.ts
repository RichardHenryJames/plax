// More of the story for a card whose feed gave only a line or two, and a picture for a card whose feed gave none.
//
// A feed hands over one sentence, often a standfirst that does not say what happened, and some give no picture at all. On a tall
// screen that left a picture (or a sign standing in for one), a headline and two lines of text over a large empty space. The
// article's own page begins with what the story is about, so its first paragraphs are the text the card shows, as far as there
// is room: the card cuts it at a whole line, with an ellipsis, where its room ends. The same page names the picture it gives to
// link previews. A page is read from its start, for a few seconds at most, what was found is kept for hours, and it is used only
// when it gives clearly more than the feed did. Everything here fails quietly: a story without more is shown as it was.
import { bodyWithoutHeadline } from './story-body.ts'
import { decodeEntities, endsSentence, isPublicWebUrl, pageImage, shortSummary, stems } from './blurb.ts'

/** The most text kept for a card: about a hundred words, more than a screen holds. The card cuts it where its room ends. */
export const LEAD_MAX_CHARS = 600
/** A text shorter than this is extended: from about this much a card is full. */
export const LEAD_BELOW_CHARS = 400
/** A page that does not give at least this much, and this much more than the feed did, is not worth the swap. */
const MIN_LEAD_CHARS = 140
const MIN_GAIN_CHARS = 80
const MIN_PARAGRAPH_CHARS = 50
const MAX_PARAGRAPHS = 8
/** A little more than the limit is joined, so that taking out a dateline or a stray line still leaves the limit. */
const JOIN_CHARS = LEAD_MAX_CHARS + 300
/** How much of a page is read (some are well over half a megabyte before the story begins), how often what has come so far is
 * looked at, and how much text is enough to stop reading. */
const MAX_PAGE_CHARS = 786_432
const LOOK_EVERY_CHARS = 65_536
const ENOUGH_CHARS = 480
/** As many stories of one outlet as the feed shows on a page. */
const PER_SOURCE = 6
/** A picture shared by more stories than this is the site's own (a banner), not theirs. */
const SHARED_PICTURE = 2

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

function joined(paragraphs: string[]): string {
  let text = ''
  for (const paragraph of paragraphs) {
    text = text ? `${text} ${paragraph}` : paragraph
    if ([...text].length >= JOIN_CHARS) break
  }
  return text
}

// What a page's structured body carries that is not the story's own words: the address of another story linked inside it, a
// counter a widget of the page leaves behind ("opinion 1", "storyline 2"), and a sentence given twice. The text is read from the
// page's markup instead, or is cut where the first of them begins.
const EMBEDDED = /\bhttps?:\/\/\S+|\bwww\.\S+|\b(?:opinion|storyline|explainer|premium)\s+\d{1,2}\b/i
const REPEAT_WORDS = 14

/** Where a run of words that was said before begins again, or -1. */
function repeatedAt(text: string): number {
  const words = [...text.matchAll(/\S+/g)].map((word) => ({ word: word[0].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''), at: word.index ?? 0 }))
  const seen = new Set<string>()
  for (let index = 0; index + REPEAT_WORDS <= words.length; index++) {
    const run = words.slice(index, index + REPEAT_WORDS).map((word) => word.word).join(' ')
    if (seen.has(run)) return words[index].at
    seen.add(run)
  }
  return -1
}

/** Where the text first holds something that is not the story's own words, or -1. */
function junkAt(text: string): number {
  const found = [text.search(EMBEDDED), repeatedAt(text)].filter((at) => at >= 0)
  return found.length === 0 ? -1 : Math.min(...found)
}

/** The text up to its last whole sentence when that is most of it, else cut at a word with an ellipsis. */
function endAtSentence(text: string): string {
  const trimmed = text.trim()
  if (/[.!?\u0964]["\u201d\u2019')\]]?$/.test(trimmed)) return trimmed
  const ends = [...trimmed.matchAll(/[.!?\u0964](?=["\u201d\u2019')\]]?\s)/g)].filter((end) => endsSentence(trimmed, end.index ?? 0))
  const last = ends.length > 0 ? (ends[ends.length - 1].index ?? -1) + 1 : -1
  if (last > trimmed.length * 0.5) return trimmed.slice(0, last)
  return trimmed.replace(/[\s,;:\u2013\u2014-]+$/, '') + '\u2026'
}

// The line a newspaper puts before a story to say where it was written, which a card does not need: "KOCHI", "New Delhi, Nov 2
// (PTI)", "Mumbai:", "( for web) Our Bureau Mumbai:". A place with no mark after it is taken off only when it is a known one.
const PLACE = "[A-Z][A-Za-z.'\u2019-]*(?: [A-Z][A-Za-z.'\u2019-]*){0,2}"
const DATE_LINE = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{1,2}'
const AGENCY = '\\((?:PTI|IANS|ANI|AFP|AP|UNI|Reuters|Bloomberg)\\)'
// Group 1 is what follows the place: a date, an agency or a mark. A place with none of them is just words.
const MARKED_DATELINE = new RegExp(`^${PLACE}((?:,\\s*${DATE_LINE})?(?:\\s*${AGENCY})?\\s*[:\\u2013\\u2014-]?\\s+)`)
const CREDIT_LINE = /^(?:Our|Special|Staff|Senior)\s+(?:Bureau|Correspondent|Reporter|Representative)\b(?:\s+[A-Z][a-z]+(?: [A-Z][a-z]+)?)?\s*[:\u2013\u2014-]\s*/
// A place in capitals that is not on the list, and a word in capitals that is an organisation's name.
const CAPITALS_PLACE = /^[A-Z]{5,}(?: [A-Z]{3,})?(?=\s+[A-Z][a-z])/
const ORGANISATIONS = new Set(['UNICEF', 'UNESCO', 'ASEAN', 'BRICS', 'NABARD', 'NASSCOM', 'CRISIL', 'UNHCR', 'INTERPOL', 'MERCOSUR', 'EUROPOL', 'AUKUS', 'SAARC', 'OPEC'])
const PLACES = new Set(
  (
    'new delhi,delhi,mumbai,chennai,kolkata,bengaluru,bangalore,hyderabad,pune,ahmedabad,jaipur,lucknow,bhopal,chandigarh,patna,ranchi,' +
    'bhubaneswar,thiruvananthapuram,kochi,kozhikode,kannur,kollam,thrissur,malappuram,palakkad,madurai,coimbatore,tiruchi,salem,' +
    'tirunelveli,vellore,thanjavur,puducherry,pudukottai,visakhapatnam,vijayawada,guwahati,shillong,imphal,agartala,aizawl,kohima,' +
    'itanagar,gangtok,srinagar,jammu,dehradun,shimla,raipur,nagpur,indore,surat,vadodara,rajkot,mangaluru,mangalore,mysuru,mysore,' +
    'hubballi,belagavi,panaji,noida,gurugram,gurgaon,ghaziabad,faridabad,kanpur,varanasi,prayagraj,agra,meerut,amritsar,ludhiana,' +
    'jalandhar,patiala,london,new york,washington,beijing,shanghai,tokyo,seoul,moscow,kyiv,kiev,paris,berlin,brussels,rome,madrid,' +
    'lisbon,vienna,geneva,dubai,abu dhabi,doha,riyadh,tehran,baghdad,damascus,beirut,jerusalem,tel aviv,gaza,cairo,islamabad,karachi,' +
    'lahore,kabul,dhaka,colombo,kathmandu,thimphu,canberra,sydney,melbourne,toronto,ottawa,singapore,jakarta,manila,bangkok,hanoi,' +
    'nairobi,lagos,johannesburg,khartoum,addis ababa'
  ).split(','),
)

/** How much of the start of the text is a place written as a dateline (in capitals, or in capitalised words when it is a known one), or 0. */
function knownPlaceLength(text: string): number {
  const words = text.split(' ')
  for (let count = Math.min(3, words.length); count >= 1; count--) {
    const written = words.slice(0, count).join(' ')
    const capitalised = written === written.toUpperCase() || words.slice(0, count).every((word) => /^\p{Lu}/u.test(word))
    if (capitalised && PLACES.has(written.toLowerCase())) return written.length
  }
  const capitals = CAPITALS_PLACE.exec(text)?.[0] ?? ''
  return capitals !== '' && !ORGANISATIONS.has(capitals.split(' ')[0]) ? capitals.length : 0
}

const startsLikeSentence = (text: string) => text.length >= 40 && /^[A-Z\u201c"\u2018']/.test(text)

/** The text without the line that says where it was written, when it begins with one. */
export function stripDateline(text: string): string {
  const credit = text.trim().replace(/^\(\s*for web\s*\)\s*/i, '').replace(CREDIT_LINE, '')
  const marked = MARKED_DATELINE.exec(credit)
  if (marked && /\S/.test(marked[1])) {
    const rest = credit.slice(marked[0].length)
    if (startsLikeSentence(rest)) return rest
  }
  const place = knownPlaceLength(credit)
  if (place > 0) {
    const rest = credit.slice(place).replace(/^\s+/, '')
    if (rest.length < credit.length - place && startsLikeSentence(rest)) return rest
  }
  return credit
}

/** The opening of the article on this page, as plain text of up to about LEAD_MAX_CHARS; empty when the page gives none. */
export function articleLead(html: string): string {
  const own = joined(structuredBody(html))
  let text = ''
  if (own !== '' && [...own].length >= ENOUGH_CHARS && junkAt(own) < 0) text = own
  else {
    // The page's structured body has the story's own words most of the time, and sometimes the page's furniture as well: then the
    // markup is read too, and what says more of the story, cut where any furniture begins, is taken.
    const options = [own, joined(markupParagraphs(html))]
      .filter((candidate) => candidate !== '')
      .map((candidate) => {
        const at = junkAt(candidate)
        return at < 0 ? candidate : endAtSentence(candidate.slice(0, at))
      })
    text = options.sort((a, b) => [...b].length - [...a].length)[0] ?? ''
  }
  return shortSummary(stripDateline(text).trim(), LEAD_MAX_CHARS)
}

/** A page of the day's running updates, or of a list of names: not a story that a card can sum up. */
function isNotAStory(text: string): boolean {
  if (/\blive (?:updates?|blog|coverage)\b/i.test(text.slice(0, 120))) return true
  const commas = (text.match(/,/g) ?? []).length
  const sentences = (text.match(/[.!?\u0964]["\u201d\u2019)]?\s+[A-Z\u201c"]/g) ?? []).length
  return commas >= 8 && sentences <= 1
}

/**
 * The text to show for a story from the opening of its page: the opening without the headline, or '' when it is not clearly more
 * than `current` already is, or is not about this story (a notice, an error page) because it shares no word with the headline.
 */
export function leadFrom(title: string, current: string, lead: string): string {
  const text = bodyWithoutHeadline(title, lead)
  const length = [...text].length
  const already = [...bodyWithoutHeadline(title, current)].length
  if (length < MIN_LEAD_CHARS || length < already + MIN_GAIN_CHARS) return ''
  if (isNotAStory(text)) return ''
  const wanted = stems(title)
  if (wanted.size > 0) {
    const found = stems(text)
    if (![...wanted].some((stem) => found.has(stem))) return ''
  }
  return text
}

/** The text to show for a story from its page: see leadFrom. */
export function leadFor(title: string, current: string, html: string): string {
  return leadFrom(title, current, articleLead(html))
}

/** What a page gives: the opening of its article, and the picture it names for link previews. Either may be empty. */
export interface PageInfo {
  lead: string
  image: string
}

export function pageInfo(html: string, link: string): PageInfo {
  return { lead: articleLead(html), image: pageImage(html, link) }
}

/** Thrown by a reader that remembers what it finds (see lead-cache.ts) for a page that gave nothing, so that nothing is remembered. */
export class NoPage extends Error {}

// What was found for a page, kept for a while: an answer is good for hours, "nothing there" for less, so that a page that
// gave nothing is looked at again later but not on every refresh. An outlet that refused or did not answer is left alone for a
// few minutes, so that a host that hangs does not cost its timeout on every refresh.
const FOUND_MS = 12 * 60 * 60 * 1000
const NOTHING_MS = 30 * 60 * 1000
const FAILED_MS = 5 * 60 * 1000
const CACHE_KEYS = 600
interface Found {
  at: number
  text: string
  image: string
}
const remembered = new Map<string, Found>()
const failedHosts = new Map<string, number>()

const hostOf = (link: string) => {
  try {
    return new URL(link).hostname
  } catch {
    return ''
  }
}

function remember(link: string, text: string, image: string, now: number) {
  remembered.delete(link) // re-inserting keeps the map ordered oldest first
  remembered.set(link, { at: now, text, image })
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

/**
 * A page, read from its start until it has said enough (and its head, which names the picture, is over) or MAX_PAGE_CHARS have
 * come. A refusal or an overloaded site throws.
 */
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
        if (/<\/head>/i.test(html) && [...articleLead(html)].length >= ENOUGH_CHARS) break
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return html
}

/** Reads a page on the network and says what it gives, in at most `pageMs`. A refusal, or a page that cannot be reached, throws. */
export async function fetchPageInfo(link: string, userAgent: string, pageMs: number): Promise<PageInfo> {
  const one = new AbortController()
  const timer = setTimeout(() => one.abort(), pageMs)
  try {
    return pageInfo(await readArticle(link, one.signal, userAgent), link)
  } finally {
    clearTimeout(timer)
  }
}

export interface LeadStory {
  title: string
  content: string
  url?: string
  source?: string
  category?: string
  publishedAt?: number
  image?: string
  /** The text the story had from its feed, which its id is made from: finding more of it must not make it a new story. */
  idText?: string
  /** The text is the opening of the article itself, so it is shown as it is. */
  lead?: boolean
}

export interface LeadReport {
  /** Pages read on the network or by the reader that was given. */
  read: number
  /** Stories given the opening of their article, and stories given a picture. */
  texts: number
  pictures: number
  /** The hosts that refused or did not answer. */
  failed: string[]
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
  /** Says what a page gives; `readPage` and the page's own reading by default. A reader that remembers across requests stands here. */
  readInfo?: (link: string, signal: AbortSignal) => Promise<PageInfo>
  now?: () => number
  report?: (report: LeadReport) => void
}

/** The promise, or a refusal as soon as the signal says stop (what the promise is doing is not stopped). */
function unlessStopped<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('stopped'))
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error('stopped'))
    signal.addEventListener('abort', stop, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', stop)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', stop)
        reject(error)
      },
    )
  })
}

/** The stories one outlet at a time in turn, so that the pages being read together are of different sites. */
function takeTurns(stories: LeadStory[]): LeadStory[] {
  const queues = new Map<string, LeadStory[]>()
  for (const story of stories) {
    const host = hostOf(story.url as string)
    queues.set(host, [...(queues.get(host) ?? []), story])
  }
  const lines = [...queues.values()]
  const out: LeadStory[] = []
  for (let round = 0; out.length < stories.length; round++) for (const line of lines) if (round < line.length) out.push(line[round])
  return out
}

/**
 * Gives each news story whose feed text is short the opening of its own article, and each that has no picture the one its page
 * names, for the newest stories first and no more than a page's worth of one outlet (the stories the feed shows). Changes the
 * stories in place and says how many it gave an opening. Time-boxed (`budgetMs`): pages not read in time are left for the next
 * refresh, and a failure of any kind leaves the story as it was. `PLAX_ARTICLE_LEADS=off` turns it off.
 */
export async function extendSummaries(stories: LeadStory[], options: LeadOptions = {}): Promise<number> {
  const { budgetMs = 3000, maxPages = 30, concurrency = 8, pageMs = 2500, userAgent = 'Mozilla/5.0 (compatible; PlaxReader/1.0)' } = options
  const now = options.now ?? Date.now
  const readPage = options.readPage ?? ((link: string, signal: AbortSignal) => readArticle(link, signal, userAgent))
  const readInfo = options.readInfo ?? (async (link: string, signal: AbortSignal) => pageInfo(await readPage(link, signal), link))
  if (budgetMs < 800 || process.env.PLAX_ARTICLE_LEADS === 'off') return 0

  const textLength = (story: LeadStory) => [...bodyWithoutHeadline(story.title, story.content)].length
  const wantsText = (story: LeadStory) => !story.lead && textLength(story) < LEAD_BELOW_CHARS
  const perSource = new Map<string, number>()
  const wanting = stories
    .filter((story) => story.category === 'news')
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    // The stories the feed shows: the newest of each outlet, whether or not they want anything.
    .filter((story) => {
      const key = story.source ?? ''
      const seen = perSource.get(key) ?? 0
      perSource.set(key, seen + 1)
      return seen < PER_SOURCE
    })
    .filter((story) => story.url && isPublicWebUrl(story.url) && (wantsText(story) || !story.image))
    .filter((story) => {
      const failedAt = failedHosts.get(hostOf(story.url as string))
      return failedAt === undefined || now() - failedAt >= FAILED_MS
    })

  const report: LeadReport = { read: 0, texts: 0, pictures: 0, failed: [] }
  const apply = (story: LeadStory, text: string, image: string) => {
    if (text && wantsText(story)) {
      story.idText ??= story.content
      story.content = text
      story.lead = true
      report.texts++
    }
    if (image && !story.image) {
      story.image = image
      report.pictures++
    }
  }
  const toRead: LeadStory[] = []
  for (const story of wanting) {
    const hit = remembered.get(story.url as string)
    if (hit && now() - hit.at < (hit.text || hit.image ? FOUND_MS : NOTHING_MS)) apply(story, hit.text, hit.image)
    else if (toRead.length < maxPages) toRead.push(story)
  }
  if (toRead.length === 0) {
    options.report?.(report)
    return report.texts
  }

  const found = new Map<LeadStory, { text: string; image: string }>()
  const everything = new AbortController()
  const timer = setTimeout(() => everything.abort(), budgetMs)
  const queue = takeTurns(toRead)
  let next = 0
  const worker = async () => {
    while (next < queue.length && !everything.signal.aborted) {
      const story = queue[next++]
      const one = new AbortController()
      const stop = () => one.abort()
      everything.signal.addEventListener('abort', stop)
      const pageTimer = setTimeout(stop, pageMs)
      try {
        const info = await unlessStopped(readInfo(story.url as string, one.signal), one.signal)
        report.read++
        found.set(story, { text: leadFrom(story.title, story.content, info.lead), image: story.image ? '' : info.image })
      } catch (error) {
        if (error instanceof NoPage) found.set(story, { text: '', image: '' })
        // Not read: refused, slow or broken. The outlet is left alone for a few minutes; a page that only ran out of the shared
        // budget is not the outlet's fault, and is left for the next refresh.
        else if (!everything.signal.aborted) {
          const host = hostOf(story.url as string)
          failedHosts.set(host, now())
          if (!report.failed.includes(host)) report.failed.push(host)
        }
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

  // The same opening under different headlines is the site's own text (a notice, a standing paragraph), and the same picture under
  // several is its banner: neither is these stories'.
  const texts = new Map<string, number>()
  const pictures = new Map<string, number>()
  for (const { text, image } of found.values()) {
    if (text) texts.set(text.slice(0, 80), (texts.get(text.slice(0, 80)) ?? 0) + 1)
    if (image) pictures.set(image, (pictures.get(image) ?? 0) + 1)
  }
  for (const [story, { text, image }] of found) {
    const ownText = text !== '' && (texts.get(text.slice(0, 80)) ?? 0) === 1
    const ownImage = image !== '' && (pictures.get(image) ?? 0) <= SHARED_PICTURE
    remember(story.url as string, ownText ? text : '', ownImage ? image : '', now())
    apply(story, ownText ? text : '', ownImage ? image : '')
  }
  options.report?.(report)
  return report.texts
}
