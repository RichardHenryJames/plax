import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { fetchAllContent, fetchStocksPool } from '@/lib/sources'
import { getCached, setCache } from '@/lib/cache'
import { ProcessedCard, EMOJI_MAP, RawContent } from '@/lib/types'
import { signCard, signingKey } from '@/lib/share-sign'
import { newsOrder, richestFirst } from '@/lib/story-order'
import { enrichNews } from '@/lib/news-enrich'
import { STOCKS_SECTION } from '@/lib/news-chips'
import { STOCK_AGE_STEPS_MS, STOCK_PER_PAGE_OUTLET } from '@/lib/stocks'

// Use Node.js runtime for reliable external API fetches
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A cold pool takes up to its sources' deadline, and the pages not yet kept (lib/news-enrich.ts) a few seconds more.
export const maxDuration = 30

// Every card is signed so that, when a reader shares it, the server can tell a card it served from one somebody made
// up (see lib/share.ts). Without a key the cards simply carry no signature and sharing falls back to the source link.
const SHARE_KEY = signingKey()

// Persistent (cross-instance) cache of the raw content pool, keyed by topics+lang.
// Unlike the in-memory Map (lost on every cold serverless start), this is backed
// by Next's data cache so a cold instance still answers a non-refresh request
// instantly from the last-computed pool — the key to Inshorts-like first-load
// speed. Personalization (exclude/dedup/rank) still happens per-request downstream.
// The pool leaves out the opening of each article and the page's picture (`leads: false`): they are added after it, by
// enrichNews, because a cache that is read inside this one would not be read at all.
const getPooledContent = unstable_cache(
  async (categories: string[], lang: string) => fetchAllContent(categories, lang, { leads: false }),
  ['feed-pool'],
  { revalidate: 180, tags: ['feed'] }
)

// The Stocks topic has a pool of its own (around a thousand stories from sixty feeds), cached once for every combination of topics a
// reader may have: inside the pool above it would be kept again for each of them, and would come near what the cache can hold.
// An empty answer is not kept (a throw is not cached): the feeds had a bad minute, and the next request asks them again.
const getStocksPool = unstable_cache(
  async () => {
    const stories = await fetchStocksPool()
    if (stories.length === 0) throw new Error('No stocks stories')
    return stories
  },
  ['stocks-pool'],
  { revalidate: 180, tags: ['feed'] }
)

// Edge-cacheable for a minute, then served stale while it refreshes in the background.
function sharedCacheHeaders(shareable: boolean): HeadersInit | undefined {
  return shareable ? { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } : undefined
}

// Simple deterministic hash for stable card IDs
function stableHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

interface FeedRequest {
  categories: string[]
  refresh: boolean
  limit: number
  lang: 'en' | 'hi'
  /** IDs the client already has — we skip those. */
  exclude: string[]
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  return serve({
    categories: searchParams.get('categories')?.split(',') || [],
    refresh: searchParams.get('refresh') === 'true',
    limit: parseInt(searchParams.get('limit') || '30'),
    lang: searchParams.get('lang') === 'hi' ? 'hi' : 'en',
    exclude: (searchParams.get('exclude') || '').split(',').filter(Boolean),
  })
}

// The same request with its parameters in the body. A reader who has gone far down a long feed (the Stocks topic is a thousand
// stories) has a list of stories to leave out that does not fit in an address, which a server accepts to about 14 KB. Never shared
// by a CDN: what it answers is for that reader.
const MAX_BODY_CHARS = 200_000
const MAX_EXCLUDED = 3000

function listOf(value: unknown, most: number, longest: number, pattern?: RegExp): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > most) return null
  return value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= longest && (!pattern || pattern.test(item))) ? (value as string[]) : null
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_CHARS) return NextResponse.json({ cards: [], error: 'Request too large' }, { status: 413 })
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ cards: [], error: 'Invalid request' }, { status: 400 })
  }
  const categories = listOf(body.categories, 40, 40, /^[a-z0-9_-]+$/)
  const exclude = listOf(body.exclude, MAX_EXCLUDED, 200)
  if (!categories || !exclude) return NextResponse.json({ cards: [], error: 'Invalid request' }, { status: 400 })
  const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.min(60, Math.max(1, Math.floor(body.limit))) : 30
  return serve({ categories, refresh: body.refresh === true, limit, lang: body.lang === 'hi' ? 'hi' : 'en', exclude }, false)
}

async function serve(input: FeedRequest, mayBeShared = true) {
  const { categories, refresh, limit, lang } = input
  const excludeIds = new Set(input.exclude)
  // Without a per-reader exclude list or a forced refresh the answer is identical
  // for everyone, so the CDN may serve it and refresh it in the background.
  const shareable = mayBeShared && !refresh && excludeIds.size === 0

  try {
    // Check cache first (only for non-refresh requests)
    const cacheKey = `feed-${lang}-${categories.sort().join(',')}`
    if (!refresh) {
      const cached = getCached(cacheKey)
      if (cached && cached.length > 0) {
        const filtered = cached.filter((c) => !excludeIds.has(c.id))
        if (filtered.length > 0) {
          const cards = filterAndLimit(filtered, categories, limit)
          return NextResponse.json(
            { cards, cached: true, count: filtered.length },
            { headers: sharedCacheHeaders(shareable && cards.length > 0) }
          )
        }
        // All cached cards already seen — fall through to fresh fetch
      }
    }

    // Fetch from all sources in parallel (always fresh on refresh).
    // Pass the user's categories so Reddit pulls topic-relevant subreddits.
    // Non-refresh → persistent pooled cache (fast, cross-instance). refresh=true
    // (pull-to-refresh / news auto-refresh) → always a live fetch.
    // The Stocks topic is not one of the topics of that pool: it has its own (above), and a feed of nothing else asks no other source.
    const wantsStocks = categories.includes('stocks')
    const topics = categories.filter((topic) => topic !== 'stocks')
    const [others, stocks] = await Promise.all([
      wantsStocks && topics.length === 0
        ? Promise.resolve<RawContent[]>([])
        : refresh
          ? fetchAllContent(topics, lang, { leads: false })
          : getPooledContent([...topics].sort(), lang),
      wantsStocks ? (refresh ? fetchStocksPool() : getStocksPool().catch((): RawContent[] => [])) : Promise.resolve<RawContent[]>([]),
    ])
    const rawContents = [...stocks, ...others]
    console.log(`[Plax API] Fetched ${rawContents.length} raw items`)

    if (rawContents.length === 0) {
      return NextResponse.json({
        cards: [],
        cached: false,
        error: 'All content sources returned empty',
      })
    }

    // The opening of each short story's article and the picture of each story with none, from the pages' own markup; what a
    // page gave is kept across requests, so only the pages not yet read cost time here.
    await enrichNews(rawContents)

    // Deduplicate raw content by title (same HN story, same Wikipedia event, etc.)
    const seenTitles = new Set<string>()
    const exactUnique = rawContents.filter((raw) => {
      const key = (raw.title || raw.content.slice(0, 80)).toLowerCase().trim()
      if (seenTitles.has(key)) return false
      seenTitles.add(key)
      return true
    })

    // Story clustering (the Inshorts model) — the SAME breaking story appears on
    // many outlets (BBC + NDTV + The Hindu). Collapse near-duplicate headlines into
    // one card by fingerprinting their significant title words, so the news feed
    // shows one card per event, not five. Only applies to time-sensitive news.
    // The telling kept is the one with the most to show (its text, its picture), not the first told; the order of the rest is as it was.
    const kept = new Set(dedupeStories(richestFirst(exactUnique)))
    const uniqueRaw = exactUnique.filter((raw) => kept.has(raw))
    console.log(`[Plax API] After dedup: ${uniqueRaw.length} unique items (removed ${rawContents.length - uniqueRaw.length} duplicates)`)

    // Quick processing — stable IDs based on content so same article always = same ID
    const cards: ProcessedCard[] = uniqueRaw.map((raw) => {
      const src = raw.source.toLowerCase().replace(/[^a-z0-9]/g, '-')
      // The id is made from what the feed said, not from the longer text the article's own page may have given since (lib/lead.ts),
      // so that a story keeps its id whether or not that text has been found yet.
      const contentKey = `${src}-${(raw.title || '').slice(0, 60)}-${(raw.idText ?? raw.content).slice(0, 120)}`
      const card: ProcessedCard = {
        id: `${src}-${stableHash(contentKey)}`,
        type: determineType(raw.content, raw.source),
        title: raw.title || undefined,
        content: raw.content.slice(0, 800),
        author: raw.author,
        source: raw.source,
        sourceUrl: raw.url,
        category: raw.category,
        readTime: estimateReadTime(raw.content),
        emoji: EMOJI_MAP[raw.category] || '📖',
        fetchedAt: Date.now(),
        publishedAt: raw.publishedAt,
        image: raw.image,
        section: raw.section,
        lead: raw.lead ? true : undefined,
      }
      const sig = signCard(card, SHARE_KEY)
      return sig ? { ...card, sig } : card
    })

    // Cache the full set (before excluding client's read cards)
    setCache(cacheKey, cards, 5 * 60 * 1000)

    // Remove cards the client already has
    const freshCards = excludeIds.size > 0 ? cards.filter((c) => !excludeIds.has(c.id)) : cards
    const limited = filterAndLimit(freshCards, categories, limit)

    return NextResponse.json(
      {
        cards: limited,
        cached: false,
        count: freshCards.length,
        sources: {
          wikipedia: rawContents.filter(r => r.source.includes('Wikipedia')).length,
          hackernews: rawContents.filter(r => r.source === 'Hacker News').length,
          reddit: rawContents.filter(r => r.source.includes('Reddit')).length,
          quotes: rawContents.filter(r => r.source === 'ZenQuotes').length,
        },
      },
      { headers: sharedCacheHeaders(shareable && limited.length > 0) }
    )
  } catch (error) {
    console.error('Feed API error:', error instanceof Error ? error.message : error)
    
    return NextResponse.json({
      cards: [],
      cached: false,
      error: error instanceof Error ? error.message : 'Failed to fetch live content',
    }, { status: 503 })
  }
}

// Common stop-words to ignore when fingerprinting a headline for clustering.
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'it', 'its',
  'his', 'her', 'their', 'our', 'your', 'has', 'have', 'had', 'will', 'would', 'can', 'could',
  'about', 'after', 'over', 'into', 'new', 'says', 'say', 'said', 'not', 'how',
  'why', 'what', 'who', 'when', 'where', 'amid', 'more', 'than', 'other', 'you', 'may', 'gets', 'get',
])

// Extract the significant, lowercased word set from a headline (drops stop-words,
// short tokens, punctuation) — used as a fuzzy fingerprint for story clustering.
function titleTokens(title: string): Set<string> {
  return new Set(
    (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
  )
}

// Jaccard overlap of two token sets (|A∩B| / |A∪B|).
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

// Cluster near-duplicate stories: if a later item's title shares enough
// significant words with an already-kept item, treat it as the same story and
// drop it. Applies only to time-sensitive news; evergreen sources (Wikipedia,
// books…) pass through untouched so we never over-collapse educational cards.
function dedupeStories(items: RawContent[]): RawContent[] {
  const kept: RawContent[] = []
  const keptTokens: Set<string>[] = []
  for (const item of items) {
    const isNewsy = !!item.publishedAt || item.category === 'news'
    if (!isNewsy) {
      kept.push(item)
      keptTokens.push(new Set())
      continue
    }
    const tokens = titleTokens(item.title)
    let dupe = false
    for (let i = 0; i < kept.length; i++) {
      if (!kept[i].publishedAt && kept[i].category !== 'news') continue
      if (tokenOverlap(tokens, keptTokens[i]) >= 0.6) {
        dupe = true
        break
      }
    }
    if (!dupe) {
      kept.push(item)
      keptTokens.push(tokens)
    }
  }
  return kept
}

function determineType(content: string, source: string): ProcessedCard['type'] {
  // A card is a QUOTE only if it's genuinely a short, quoted line — ZenQuotes, or
  // a short passage wrapped in quotes. A LONG article that merely *begins* with a
  // quotation mark must NOT become a quote (that rendered it in the giant serif
  // blockquote style — the oversized-font bug).
  const trimmed = content.trim()
  const isShortQuote =
    trimmed.length < 240 && /^["“]/.test(trimmed) && /["”]\s*$/.test(trimmed)
  if (source === 'ZenQuotes' || isShortQuote) return 'quote'
  if (source.includes('On This Day')) return 'fact'
  if (content.length < 200) return 'did-you-know'
  return 'microessay'
}

function estimateReadTime(content: string): string {
  const words = content.split(/\s+/).length
  const minutes = words / 200
  if (minutes < 1) return `${Math.ceil(minutes * 60)}s`
  return `${Math.ceil(minutes)}m`
}

// Related categories — if someone picks "programming", also show "technology", etc.
const RELATED_CATEGORIES: Record<string, string[]> = {
  programming: ['technology', 'science', 'math'],
  technology: ['programming', 'science', 'business'],
  science: ['nature', 'physics', 'space', 'health', 'math'],
  physics: ['science', 'math', 'space'],
  math: ['science', 'physics', 'programming'],
  space: ['science', 'physics', 'technology'],
  finance: ['business', 'technology'],
  business: ['finance', 'technology'],
  philosophy: ['psychology', 'history'],
  psychology: ['philosophy', 'health'],
  history: ['philosophy', 'art'],
  health: ['science', 'psychology', 'nature'],
  nature: ['science', 'health', 'space'],
  art: ['history', 'philosophy'],
  books: ['philosophy', 'history', 'psychology'],
  language: ['philosophy', 'psychology'],
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function filterAndLimit(
  cards: ProcessedCard[],
  categories: string[],
  limit: number
): ProcessedCard[] {
  // Dedicated News feed → sort strictly newest-first so it reads as LATEST news
  // (recency beats source-variety here), the stories that fill a card before those
  // that leave room on it. Cards without a publish time sink last. A per-source cap
  // keeps one outlet from dominating the stream.
  if (categories.length === 1 && categories[0] === 'news') {
    return newsOrder(cards, 6, limit)
  }

  // The Stocks topic alone reads the same way: its stories are news cards (filed under its own section), newest first, by age group.
  if (categories.length === 1 && categories[0] === 'stocks') {
    return newsOrder(cards.filter((c) => c.section === STOCKS_SECTION), STOCK_PER_PAGE_OUTLET, limit, STOCK_AGE_STEPS_MS)
  }

  if (categories.length === 0) {
    return shuffle(cards).slice(0, limit)
  }

  const exactSet = new Set(categories)
  const relatedSet = new Set<string>()
  categories.forEach((cat) => {
    ;(RELATED_CATEGORIES[cat] || []).forEach((r) => {
      if (!exactSet.has(r)) relatedSet.add(r)
    })
  })

  // Tiered ordering so the user's SELECTED topics always lead the feed:
  //   1. exact matches (shuffled within the tier for variety)
  //   2. related-topic matches (only to fill toward the limit)
  //   3. everything else — ONLY as a last resort if the first two tiers are
  //      empty (prevents an empty feed for very niche topic picks, but never
  //      lets unrelated content jump ahead of what the user asked for).
  // A story of the Stocks topic is a news card, so it is matched by its section as well as by its category.
  const exact = shuffle(cards.filter((c) => exactSet.has(c.category) || (c.section === STOCKS_SECTION && exactSet.has(STOCKS_SECTION))))
  const related = shuffle(cards.filter((c) => relatedSet.has(c.category)))

  // If we already have enough EXACT matches, show ONLY those — never dilute a
  // focused feed with related/off-topic cards (the "why is Technology showing
  // when I picked Science/Space/Books/Health" bug). Related only fills the gap
  // toward the limit; unrelated (tier 3) only if there's nothing relevant at all.
  const primary = exact.length >= limit ? exact : [...exact, ...related]

  const ordered =
    primary.length > 0
      ? primary
      : shuffle(cards) // nothing relevant in this batch → don't return an empty feed

  return interleaveBySource(ordered).slice(0, limit)
}

// Round-robin the cards by source so the feed doesn't show long runs of the same
// source (e.g. 16 Wikipedia in a row). Preserves the tiered ordering within each
// source bucket while spreading sources across the sequence — the feed feels far
// more varied and premium. Buckets are consumed in descending size order so the
// dominant source is spaced out rather than clumped.
function interleaveBySource(cards: ProcessedCard[]): ProcessedCard[] {
  if (cards.length < 3) return cards
  const buckets = new Map<string, ProcessedCard[]>()
  for (const c of cards) {
    const key = c.source || 'other'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c)
  }
  if (buckets.size < 2) return cards
  // Order buckets by size (largest first) so the round-robin spaces the dominant
  // source evenly instead of leaving a tail of it at the end.
  const queues = [...buckets.values()].sort((a, b) => b.length - a.length)
  const out: ProcessedCard[] = []
  let remaining = cards.length
  while (remaining > 0) {
    for (const q of queues) {
      const next = q.shift()
      if (next) { out.push(next); remaining-- }
    }
  }
  return out
}
