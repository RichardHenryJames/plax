import { NextRequest, NextResponse } from 'next/server'
import { fetchAllContent } from '@/lib/sources'
import { getCached, setCache } from '@/lib/cache'
import { ProcessedCard, EMOJI_MAP, RawContent } from '@/lib/types'

// Use Node.js runtime for reliable external API fetches
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const categories = searchParams.get('categories')?.split(',') || []
  const refresh = searchParams.get('refresh') === 'true'
  const limit = parseInt(searchParams.get('limit') || '30')
  const lang = searchParams.get('lang') === 'hi' ? 'hi' : 'en'
  // Client sends IDs it already has — we skip those
  const excludeIds = new Set((searchParams.get('exclude') || '').split(',').filter(Boolean))

  try {
    // Check cache first (only for non-refresh requests)
    const cacheKey = `feed-${lang}-${categories.sort().join(',')}`
    if (!refresh) {
      const cached = getCached(cacheKey)
      if (cached && cached.length > 0) {
        const filtered = cached.filter((c) => !excludeIds.has(c.id))
        if (filtered.length > 0) {
          return NextResponse.json({
            cards: filterAndLimit(filtered, categories, limit),
            cached: true,
            count: filtered.length,
          })
        }
        // All cached cards already seen — fall through to fresh fetch
      }
    }

    // Fetch from all sources in parallel (always fresh on refresh).
    // Pass the user's categories so Reddit pulls topic-relevant subreddits.
    const rawContents = await fetchAllContent(categories, lang)
    console.log(`[Plax API] Fetched ${rawContents.length} raw items`)

    if (rawContents.length === 0) {
      return NextResponse.json({
        cards: [],
        cached: false,
        error: 'All content sources returned empty',
      })
    }

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
    const uniqueRaw = dedupeStories(exactUnique)
    console.log(`[Plax API] After dedup: ${uniqueRaw.length} unique items (removed ${rawContents.length - uniqueRaw.length} duplicates)`)

    // Quick processing — stable IDs based on content so same article always = same ID
    const cards: ProcessedCard[] = uniqueRaw.map((raw) => {
      const src = raw.source.toLowerCase().replace(/[^a-z0-9]/g, '-')
      const contentKey = `${src}-${(raw.title || '').slice(0, 60)}-${raw.content.slice(0, 120)}`
      return {
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
      }
    })

    // Cache the full set (before excluding client's read cards)
    setCache(cacheKey, cards, 5 * 60 * 1000)

    // Remove cards the client already has
    const freshCards = excludeIds.size > 0 ? cards.filter((c) => !excludeIds.has(c.id)) : cards

    return NextResponse.json({
      cards: filterAndLimit(freshCards, categories, limit),
      cached: false,
      count: freshCards.length,
      sources: {
        wikipedia: rawContents.filter(r => r.source.includes('Wikipedia')).length,
        hackernews: rawContents.filter(r => r.source === 'Hacker News').length,
        reddit: rawContents.filter(r => r.source.includes('Reddit')).length,
        quotes: rawContents.filter(r => r.source === 'ZenQuotes').length,
      }
    })
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
      if (tokenOverlap(tokens, keptTokens[i]) >= 0.5) {
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
  if (source === 'ZenQuotes' || content.startsWith('"')) return 'quote'
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
  // (recency beats source-variety here). Cards without a publish time sink last.
  // A per-source cap keeps one outlet from dominating the stream.
  if (categories.length === 1 && categories[0] === 'news') {
    const sorted = [...cards]
      .filter((c) => c.category === 'news')
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    return capPerSource(sorted, 3).slice(0, limit)
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
  const exact = shuffle(cards.filter((c) => exactSet.has(c.category)))
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

// Cap how many cards any single source contributes (preserving the incoming
// order among the kept ones) so no one publisher dominates the News stream.
function capPerSource(cards: ProcessedCard[], maxPerSource: number): ProcessedCard[] {
  const counts = new Map<string, number>()
  const out: ProcessedCard[] = []
  for (const c of cards) {
    const key = c.source || 'other'
    const n = counts.get(key) || 0
    if (n >= maxPerSource) continue
    counts.set(key, n + 1)
    out.push(c)
  }
  return out
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
