import { NextRequest, NextResponse } from 'next/server'
import { fetchAllContent } from '@/lib/sources'
import { getCached, setCache } from '@/lib/cache'
import { ProcessedCard, EMOJI_MAP } from '@/lib/types'

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
  // Client sends IDs it already has — we skip those
  const excludeIds = new Set((searchParams.get('exclude') || '').split(',').filter(Boolean))

  try {
    // Check cache first (only for non-refresh requests)
    const cacheKey = `feed-${categories.sort().join(',')}`
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
    const rawContents = await fetchAllContent(categories)
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
    const uniqueRaw = rawContents.filter((raw) => {
      const key = (raw.title || raw.content.slice(0, 80)).toLowerCase().trim()
      if (seenTitles.has(key)) return false
      seenTitles.add(key)
      return true
    })
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

  return ordered.slice(0, limit)
}
