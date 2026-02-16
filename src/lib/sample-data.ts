export interface CardData {
  id: string
  type: 'microessay' | 'quote' | 'explainer' | 'book-summary' | 'fact' | 'code' | 'did-you-know'
  title?: string
  content: string
  author?: string
  source?: string
  sourceUrl?: string
  category: string
  readTime: string
  emoji?: string
}

// No hardcoded cards — all content comes from live API sources
// (Wikipedia, Hacker News, Reddit, Quotable)
export const allCards: CardData[] = []

// Deterministic shuffle using a seed — same seed = same order
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647 // Park-Miller PRNG
    const j = s % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Session seed — stable for the lifetime of the tab, so scroll-up shows same cards
const SESSION_SEED =
  typeof window !== 'undefined' ? Math.floor(Math.random() * 2147483647) : 42

// Get cards filtered and sorted by user preferences
export function getPersonalizedFeed(
  selectedTopics: string[],
  engagementScores: Record<string, number>,
  bookmarkedIds: string[] = []
): CardData[] {
  let cards = [...allCards]

  // Filter by selected topics if any
  if (selectedTopics.length > 0) {
    cards = cards.filter((c) => selectedTopics.includes(c.category))
  }

  // Score each card
  const scored = cards.map((card) => {
    const engScore = engagementScores[card.category] || 0
    const bookmarkPenalty = bookmarkedIds.includes(card.id) ? -10 : 0
    return { card, score: engScore + bookmarkPenalty }
  })

  // Sort by score (high engagement categories first)
  scored.sort((a, b) => b.score - a.score)

  // Within same-score tiers, apply deterministic shuffle for variety
  const result: CardData[] = []
  let tierStart = 0
  for (let i = 1; i <= scored.length; i++) {
    if (i === scored.length || Math.abs(scored[i].score - scored[tierStart].score) > 5) {
      const tier = scored.slice(tierStart, i).map((s) => s.card)
      const shuffledTier = seededShuffle(tier, SESSION_SEED + tierStart)
      result.push(...shuffledTier)
      tierStart = i
    }
  }

  return result
}
