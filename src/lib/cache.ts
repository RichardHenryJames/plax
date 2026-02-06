import { ProcessedCard } from './types'
import { allCards as staticCards } from './sample-data'

// ─── In-Memory Cache ───
// On Vercel Edge, this persists across warm invocations
// On cold starts, we fall back to static content

interface CacheEntry {
  cards: ProcessedCard[]
  timestamp: number
  ttl: number
}

const CACHE: Map<string, CacheEntry> = new Map()
const DEFAULT_TTL = 15 * 60 * 1000 // 15 minutes

export function getCached(key: string): ProcessedCard[] | null {
  const entry = CACHE.get(key)
  if (!entry) return null
  
  if (Date.now() - entry.timestamp > entry.ttl) {
    CACHE.delete(key)
    return null
  }
  
  return entry.cards
}

export function setCache(key: string, cards: ProcessedCard[], ttl: number = DEFAULT_TTL): void {
  CACHE.set(key, {
    cards,
    timestamp: Date.now(),
    ttl,
  })
}

export function clearCache(): void {
  CACHE.clear()
}

// ─── Get Feed with Fallback ───
export function getStaticFallback(): ProcessedCard[] {
  // Convert static cards to ProcessedCard format
  return staticCards.map((card) => ({
    ...card,
    fetchedAt: Date.now(),
  })) as ProcessedCard[]
}

// ─── Merge Static + Dynamic Content ───
export function mergeFeed(
  dynamicCards: ProcessedCard[],
  staticCards: ProcessedCard[],
  ratio: number = 0.7 // 70% dynamic, 30% static
): ProcessedCard[] {
  const dynamicCount = Math.floor(dynamicCards.length * ratio)
  const staticCount = Math.ceil(staticCards.length * (1 - ratio))
  
  const dynamic = shuffleArray(dynamicCards).slice(0, dynamicCount)
  const static_ = shuffleArray(staticCards).slice(0, staticCount)
  
  // Interleave
  const result: ProcessedCard[] = []
  const maxLen = Math.max(dynamic.length, static_.length)
  
  for (let i = 0; i < maxLen; i++) {
    if (dynamic[i]) result.push(dynamic[i])
    if (i % 3 === 2 && static_[Math.floor(i / 3)]) {
      result.push(static_[Math.floor(i / 3)])
    }
  }
  
  return result
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
