import { NextRequest, NextResponse } from 'next/server'
import { fetchAllContent } from '@/lib/sources'
import { getCached, setCache } from '@/lib/cache'
import { ProcessedCard, EMOJI_MAP } from '@/lib/types'
import { enhanceBatch, isAIAvailable } from '@/lib/ai'

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

  try {
    // Check cache first
    const cacheKey = `feed-${categories.sort().join(',')}`
    if (!refresh) {
      const cached = getCached(cacheKey)
      if (cached && cached.length > 0) {
        return NextResponse.json({
          cards: filterAndLimit(cached, categories, limit),
          cached: true,
          count: cached.length,
        })
      }
    }

    // Fetch from all sources in parallel
    const rawContents = await fetchAllContent()
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

    // ── AI Enhancement: rewrite content to be engaging ──
    // Pass all unique items through AI in parallel; failures fall back to raw
    const aiEnhancements = await enhanceBatch(
      uniqueRaw.map((raw) => ({
        title: raw.title || '',
        content: raw.content,
        source: raw.source,
      }))
    )
    console.log(`[Plax API] AI enhanced ${aiEnhancements.size}/${uniqueRaw.length} cards`)

    // Build cards — use AI-enhanced version when available, raw otherwise
    const cards: ProcessedCard[] = uniqueRaw.map((raw, idx) => {
      const src = raw.source.toLowerCase().replace(/[^a-z0-9]/g, '-')
      const contentKey = `${src}-${(raw.title || '').slice(0, 60)}-${raw.content.slice(0, 120)}`
      const enhanced = aiEnhancements.get(idx)

      const finalTitle = enhanced?.title || raw.title || undefined
      const finalContent = enhanced?.content || raw.content.slice(0, 800)

      return {
        id: `${src}-${stableHash(contentKey)}`,
        type: determineType(raw.content, raw.source),
        title: finalTitle,
        content: finalContent,
        author: raw.author,
        source: raw.source,
        sourceUrl: raw.url,
        category: raw.category,
        readTime: estimateReadTime(finalContent),
        emoji: EMOJI_MAP[raw.category] || '📖',
        fetchedAt: Date.now(),
        aiEnhanced: !!enhanced,
      }
    })

    // Cache the result (longer TTL since AI processing is expensive)
    setCache(cacheKey, cards, 15 * 60 * 1000) // 15 minutes

    return NextResponse.json({
      cards: filterAndLimit(cards, categories, limit),
      cached: false,
      count: cards.length,
      sources: {
        wikipedia: rawContents.filter(r => r.source.includes('Wikipedia')).length,
        hackernews: rawContents.filter(r => r.source === 'Hacker News').length,
        reddit: rawContents.filter(r => r.source.includes('Reddit')).length,
        quotes: rawContents.filter(r => r.source === 'ZenQuotes').length,
      },
      aiEnhanced: aiEnhancements.size,
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

function filterAndLimit(
  cards: ProcessedCard[],
  categories: string[],
  limit: number
): ProcessedCard[] {
  let filtered = cards
  
  if (categories.length > 0) {
    filtered = cards.filter(c => categories.includes(c.category))
  }
  
  // Shuffle for variety
  filtered = filtered.sort(() => Math.random() - 0.5)
  
  return filtered.slice(0, limit)
}
