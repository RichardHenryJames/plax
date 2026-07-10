// ─── Content Source Types ───

export interface RawContent {
  title: string
  content: string
  url?: string
  author?: string
  source: string
  category: string
}

export interface ProcessedCard {
  id: string
  type: 'microessay' | 'quote' | 'explainer' | 'fact' | 'did-you-know'
  title?: string
  content: string
  author?: string
  source?: string
  sourceUrl?: string
  category: string
  readTime: string
  emoji?: string
  fetchedAt: number
  aiEnhanced?: boolean
}

// ─── Category mapping for sources ───
export const CATEGORY_MAP: Record<string, string> = {
  // Reddit subreddits
  'todayilearned': 'science',
  'explainlikeimfive': 'science',
  'science': 'science',
  'space': 'space',
  'askscience': 'science',
  'AskScience': 'science',
  'philosophy': 'philosophy',
  'psychology': 'psychology',
  'history': 'history',
  'programming': 'programming',
  'technology': 'technology',
  'books': 'books',
  'personalfinance': 'finance',
  'futurology': 'technology',
  'Futurology': 'technology',
  'Showerthoughts': 'philosophy',
  'LifeProTips': 'psychology',
  'YouShouldKnow': 'science',
  // Topic-specific subreddits (added for better niche coverage)
  'Health': 'health',
  'nutrition': 'health',
  'Fitness': 'health',
  'suggestmeabook': 'books',
  'literature': 'books',
  'Economics': 'finance',
  'investing': 'finance',
  'finance': 'finance',
  'Entrepreneur': 'business',
  'business': 'business',
  'startups': 'business',
  'math': 'math',
  'learnmath': 'math',
  'Physics': 'physics',
  'Art': 'art',
  'design': 'art',
  'nature': 'nature',
  'EarthPorn': 'nature',
  'languagelearning': 'language',
  'etymology': 'language',
  'artificial': 'technology',
  'MachineLearning': 'technology',
  'coding': 'programming',
  // Wikipedia categories
  'Biology': 'science',
  'Mathematics': 'math',
  'Technology': 'technology',
  'Psychology': 'psychology',
  'Nature': 'nature',
}

// Topic → extra subreddits to fetch when the user selects that topic. Lets the
// feed pull genuinely on-topic content for niche picks (health, books, finance,
// business, art, language, math) instead of leaning on random Wikipedia/quotes.
export const TOPIC_SUBREDDITS: Record<string, string[]> = {
  science: ['science', 'AskScience', 'todayilearned'],
  technology: ['technology', 'Futurology', 'artificial', 'MachineLearning'],
  philosophy: ['philosophy', 'Showerthoughts'],
  psychology: ['psychology', 'LifeProTips'],
  history: ['history', 'todayilearned'],
  finance: ['personalfinance', 'investing', 'finance'],
  space: ['space', 'AskScience'],
  programming: ['programming', 'coding'],
  books: ['books', 'suggestmeabook', 'literature'],
  health: ['Health', 'nutrition', 'Fitness'],
  math: ['math', 'learnmath'],
  nature: ['nature', 'EarthPorn', 'science'],
  art: ['Art', 'design'],
  physics: ['Physics', 'AskScience'],
  business: ['Entrepreneur', 'business', 'startups'],
  language: ['languagelearning', 'etymology'],
}

// Wikipedia search seed terms per topic. Used by fetchWikipediaByTopics to pull
// genuinely on-topic articles (Wikipedia is never IP-blocked, unlike Reddit), so
// niche picks like health / finance / books get real relevant content.
export const TOPIC_WIKI_QUERIES: Record<string, string[]> = {
  science: ['scientific discovery', 'biology', 'chemistry', 'evolution', 'genetics', 'neuroscience'],
  technology: ['artificial intelligence', 'emerging technology', 'robotics', 'semiconductor', 'renewable energy'],
  philosophy: ['philosophy', 'ethics', 'existentialism', 'ancient philosophy', 'philosophy of mind'],
  psychology: ['cognitive psychology', 'human behavior', 'cognitive bias', 'human memory', 'emotion'],
  history: ['ancient civilization', 'world history', 'medieval history', 'ancient history', 'historical empire'],
  finance: ['personal finance', 'investing', 'stock market', 'economics', 'compound interest'],
  space: ['solar system', 'black hole', 'space exploration', 'Milky Way galaxy', 'exoplanet'],
  programming: ['programming language', 'computer science', 'algorithm', 'software engineering', 'data structure'],
  books: ['classic literature', 'famous novel', 'literary award', 'poetry', 'notable author'],
  health: ['human nutrition', 'public health', 'mental health', 'disease prevention', 'physical fitness'],
  math: ['mathematics', 'famous theorem', 'number theory', 'geometry', 'notable mathematician'],
  nature: ['ecology', 'wildlife', 'natural phenomenon', 'biodiversity', 'ecosystem'],
  art: ['art movement', 'famous painting', 'renaissance art', 'modern art', 'sculpture'],
  physics: ['quantum mechanics', 'theory of relativity', 'particle physics', 'thermodynamics', 'astrophysics'],
  business: ['entrepreneurship', 'startup company', 'business strategy', 'marketing', 'management'],
  language: ['linguistics', 'etymology', 'language family', 'writing system', 'grammar'],
}

export const EMOJI_MAP: Record<string, string> = {
  science: '🔬',
  technology: '💻',
  philosophy: '🤔',
  psychology: '🧠',
  history: '📜',
  finance: '💰',
  space: '🚀',
  programming: '⚡',
  books: '📚',
  health: '🏥',
  math: '📐',
  nature: '🌿',
  art: '🎨',
  physics: '⚛️',
  business: '📈',
  language: '🗣️',
  general: '💡',
}
