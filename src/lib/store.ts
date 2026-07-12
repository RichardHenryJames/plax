import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─── Topic Categories ───
export const TOPICS = [
  { id: 'news', label: 'News', emoji: '📰', color: 'from-red-500 to-orange-500' },
  { id: 'science', label: 'Science', emoji: '🔬', color: 'from-cyan-500 to-blue-500' },
  { id: 'technology', label: 'Technology', emoji: '💻', color: 'from-blue-500 to-indigo-500' },
  { id: 'philosophy', label: 'Philosophy', emoji: '🤔', color: 'from-violet-500 to-purple-500' },
  { id: 'psychology', label: 'Psychology', emoji: '🧠', color: 'from-fuchsia-500 to-pink-500' },
  { id: 'history', label: 'History', emoji: '📜', color: 'from-amber-500 to-orange-500' },
  { id: 'finance', label: 'Finance', emoji: '💰', color: 'from-emerald-500 to-green-500' },
  { id: 'space', label: 'Space', emoji: '🚀', color: 'from-indigo-500 to-blue-500' },
  { id: 'programming', label: 'Programming', emoji: '⚡', color: 'from-sky-500 to-cyan-500' },
  { id: 'books', label: 'Books', emoji: '📚', color: 'from-rose-500 to-pink-500' },
  { id: 'health', label: 'Health', emoji: '🏥', color: 'from-green-500 to-emerald-500' },
  { id: 'math', label: 'Mathematics', emoji: '📐', color: 'from-orange-500 to-red-500' },
  { id: 'nature', label: 'Nature', emoji: '🌿', color: 'from-lime-500 to-green-500' },
  { id: 'art', label: 'Art & Design', emoji: '🎨', color: 'from-pink-500 to-rose-500' },
  { id: 'physics', label: 'Physics', emoji: '⚛️', color: 'from-teal-500 to-cyan-500' },
  { id: 'business', label: 'Business', emoji: '📈', color: 'from-yellow-500 to-amber-500' },
  { id: 'language', label: 'Language', emoji: '🗣️', color: 'from-purple-500 to-violet-500' },
] as const

export type TopicId = (typeof TOPICS)[number]['id']

// A bookmarked card stored locally (subset of CardData needed to render it).
export interface BookmarkedCard {
  id: string
  title?: string
  content: string
  category: string
  source?: string
  sourceUrl?: string
  emoji?: string
  savedAt: number
}

// ─── Engagement Tracking ───
interface Engagement {
  cardId: string
  category: string
  timeSpent: number
  bookmarked: boolean
  shared: boolean
  completed: boolean
}

// ─── Store ───
interface PlaxState {
  // Onboarding
  hasOnboarded: boolean
  selectedTopics: string[]
  setOnboarded: () => void
  setSelectedTopics: (topics: string[]) => void
  toggleTopic: (topic: string) => void

  // Content language (feed content + AI summaries). 'en' | 'hi'
  language: string
  setLanguage: (lang: string) => void

  // UI theme. 'dark' (default) | 'light'
  theme: string
  setTheme: (theme: string) => void
  toggleTheme: () => void

  // Bookmarks
  bookmarkedIds: string[]
  // Full card data for bookmarks, stored locally so signed-out users can revisit
  // rich saved cards (not just an ID). Keyed by card id.
  bookmarkedCards: Record<string, BookmarkedCard>
  toggleBookmark: (id: string, card?: BookmarkedCard) => void

  // Engagement / Personalization
  engagements: Engagement[]
  addEngagement: (engagement: Engagement) => void
  getTopCategories: () => string[]
  getCategoryScore: (category: string) => number

  // Feed state
  currentCardIndex: number
  setCurrentCardIndex: (index: number) => void
  cardsRead: number
  incrementCardsRead: () => void
  readCardIds: string[]
  markCardRead: (id: string) => void
  // Persistent story fingerprints the user has already been shown (news dedup).
  // Lets us drop near-duplicate stories across scroll batches AND sessions, so the
  // same event from a different outlet never reappears (the Inshorts model).
  seenStoryKeys: string[]
  markStoriesSeen: (keys: string[]) => void

  // Quiz / active-recall stats
  quizAttempted: number
  quizCorrect: number
  // Daily active-recall streak (based on days the user answered ≥1 quiz).
  quizStreak: number
  quizBestStreak: number
  lastQuizDay: string | null // YYYY-MM-DD (local)
  recordQuizAnswer: (correct: boolean) => void

  // Cloud sync
  syncedUserId: string | null
  setSyncedUserId: (id: string | null) => void
  hydrateFromCloud: (data: {
    selectedTopics: string[]
    hasOnboarded: boolean
    cardsRead: number
    bookmarkedIds: string[]
  }) => void
}

const safeStorage = createJSONStorage(() => {
  if (typeof window === 'undefined') {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  }
  return localStorage
})

export const usePlaxStore = create<PlaxState>()(
  persist(
    (set, get) => ({
      // Onboarding
      hasOnboarded: false,
      selectedTopics: [],
      setOnboarded: () => set({ hasOnboarded: true }),
      setSelectedTopics: (topics) => set({ selectedTopics: topics }),
      toggleTopic: (topic) => {
        const current = get().selectedTopics
        if (current.includes(topic)) {
          set({ selectedTopics: current.filter((t) => t !== topic) })
        } else {
          set({ selectedTopics: [...current, topic] })
        }
      },

      // Content language
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),

      // Bookmarks
      bookmarkedIds: [],
      bookmarkedCards: {},
      toggleBookmark: (id, card) => {
        const current = get().bookmarkedIds
        if (current.includes(id)) {
          // Un-bookmark: drop the id + its stored card data.
          const { [id]: _removed, ...rest } = get().bookmarkedCards
          set({ bookmarkedIds: current.filter((i) => i !== id), bookmarkedCards: rest })
        } else {
          set({
            bookmarkedIds: [...current, id],
            bookmarkedCards: card ? { ...get().bookmarkedCards, [id]: card } : get().bookmarkedCards,
          })
        }
      },

      // Engagement
      engagements: [],
      addEngagement: (engagement) => {
        set((state) => ({
          engagements: [...state.engagements.slice(-500), engagement],
        }))
      },
      getTopCategories: () => {
        const engagements = get().engagements
        const scores: Record<string, number> = {}
        engagements.forEach((e) => {
          const recency = 1 // could weight by time
          const score =
            ((e.timeSpent / 1000) * 1 +
              (e.bookmarked ? 15 : 0) +
              (e.shared ? 8 : 0) +
              (e.completed ? 5 : 0)) *
            recency
          scores[e.category] = (scores[e.category] || 0) + score
        })
        return Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .map(([cat]) => cat)
      },
      getCategoryScore: (category) => {
        const engagements = get().engagements.filter((e) => e.category === category)
        return engagements.reduce((sum, e) => {
          return sum + e.timeSpent / 1000 + (e.bookmarked ? 15 : 0) + (e.completed ? 5 : 0)
        }, 0)
      },

      // Feed
      currentCardIndex: 0,
      setCurrentCardIndex: (index) => set({ currentCardIndex: index }),
      cardsRead: 0,
      incrementCardsRead: () => set((s) => ({ cardsRead: s.cardsRead + 1 })),
      readCardIds: [],
      markCardRead: (id) =>
        set((s) => ({
          readCardIds: s.readCardIds.includes(id)
            ? s.readCardIds
            : [...s.readCardIds.slice(-500), id], // keep last 500
        })),
      seenStoryKeys: [],
      markStoriesSeen: (keys) =>
        set((s) => {
          if (!keys.length) return {}
          const merged = new Set(s.seenStoryKeys)
          keys.forEach((k) => k && merged.add(k))
          // keep the most recent ~600 (news churns; old keys can expire)
          return { seenStoryKeys: [...merged].slice(-600) }
        }),

      // Quiz / active-recall stats
      quizAttempted: 0,
      quizCorrect: 0,
      quizStreak: 0,
      quizBestStreak: 0,
      lastQuizDay: null,
      recordQuizAnswer: (correct) =>
        set((s) => {
          // Compute today + yesterday as local YYYY-MM-DD.
          const d = new Date()
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const y = new Date(d.getTime() - 86400000)
          const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
          let streak = s.quizStreak
          if (s.lastQuizDay === today) {
            // already counted today — streak unchanged
          } else if (s.lastQuizDay === yesterday) {
            streak = s.quizStreak + 1 // consecutive day
          } else {
            streak = 1 // streak broken or first ever
          }
          return {
            quizAttempted: s.quizAttempted + 1,
            quizCorrect: s.quizCorrect + (correct ? 1 : 0),
            quizStreak: streak,
            quizBestStreak: Math.max(s.quizBestStreak, streak),
            lastQuizDay: today,
          }
        }),

      // Cloud sync
      syncedUserId: null,
      setSyncedUserId: (id) => set({ syncedUserId: id }),
      hydrateFromCloud: (data) =>
        set({
          selectedTopics: data.selectedTopics,
          hasOnboarded: data.hasOnboarded,
          cardsRead: data.cardsRead,
          bookmarkedIds: data.bookmarkedIds,
        }),
    }),
    {
      name: 'plax-store-v2',
      storage: safeStorage,
    }
  )
)
