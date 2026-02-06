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
}

// ─── Category mapping for sources ───
export const CATEGORY_MAP: Record<string, string> = {
  // Reddit subreddits
  'todayilearned': 'science',
  'explainlikeimfive': 'science',
  'science': 'science',
  'space': 'space',
  'askscience': 'science',
  'philosophy': 'philosophy',
  'psychology': 'psychology',
  'history': 'history',
  'programming': 'programming',
  'technology': 'technology',
  'books': 'books',
  'personalfinance': 'finance',
  'futurology': 'technology',
  // Wikipedia categories
  'Physics': 'physics',
  'Biology': 'science',
  'History': 'history',
  'Philosophy': 'philosophy',
  'Mathematics': 'math',
  'Technology': 'technology',
  'Psychology': 'psychology',
  'Economics': 'finance',
  'Art': 'art',
  'Nature': 'nature',
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
}
