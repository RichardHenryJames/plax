import { NextRequest, NextResponse } from 'next/server'
import { fetchAllContent, fetchWikipediaContent, fetchHackerNews, fetchQuotes, fetchReddit } from '@/lib/sources'
import { getCached, setCache } from '@/lib/cache'
import { ProcessedCard, EMOJI_MAP } from '@/lib/types'

// Force edge runtime for minimal latency
export const runtime = 'edge'

// Revalidate every 5 minutes
export const revalidate = 300

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
    
    // Quick processing (no AI for initial response - faster)
    const cards: ProcessedCard[] = rawContents.map((raw, i) => ({
      id: `${raw.source.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${i}-${Date.now().toString(36)}`,
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
    }))

    // Cache the result
    setCache(cacheKey, cards, 5 * 60 * 1000) // 5 minutes

    return NextResponse.json({
      cards: filterAndLimit(cards, categories, limit),
      cached: false,
      count: cards.length,
      sources: {
        wikipedia: rawContents.filter(r => r.source.includes('Wikipedia')).length,
        hackernews: rawContents.filter(r => r.source === 'Hacker News').length,
        reddit: rawContents.filter(r => r.source.includes('Reddit')).length,
        quotes: rawContents.filter(r => r.source === 'Quotable').length,
      }
    })
  } catch (error) {
    console.error('Feed API error:', error)
    
    // No static fallback — return empty with error info
    return NextResponse.json({
      cards: [],
      cached: false,
      error: 'Failed to fetch live content',
    }, { status: 503 })
  }
}

function determineType(content: string, source: string): ProcessedCard['type'] {
  if (source === 'Quotable' || content.startsWith('"')) return 'quote'
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
