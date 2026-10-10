import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { themeModeOf, type ThemeMode } from './theme'

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
  // What the server signed besides the above, so a saved story can still be shared as a Plax link.
  image?: string
  publishedAt?: number
  section?: string
  sig?: string
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

  // UI theme. `themeMode` is the reader's choice (System by default, like the Android app); `theme` is what that
  // resolves to right now, kept up to date by ThemeSync.
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  theme: string
  setTheme: (theme: string) => void
  setResolvedTheme: (theme: string) => void
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
  // The account whose data this browser last merged. It survives sign-out so a different account that
  // signs in later never inherits what the previous reader chose or saved here.
  lastUserId: string | null
  setLastUserId: (id: string | null) => void
  // Which feed the reader was last in, so the site opens there again (public news until they pick topics).
  startOnForYou: boolean
  setStartOnForYou: (value: boolean) => void
  hydrateFromCloud: (data: {
    selectedTopics: string[]
    hasOnboarded: boolean
    cardsRead: number
    bookmarks: BookmarkedCard[]
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

      themeMode: 'system',
      setThemeMode: (mode) => set({ themeMode: mode }),
      theme: 'dark',
      // Choosing a theme by name is an explicit choice of it.
      setTheme: (theme) => set({ themeMode: theme === 'light' ? 'light' : 'dark', theme }),
      setResolvedTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        set({ themeMode: next, theme: next })
      },

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
          // Cap stored bookmark CARD DATA to the most recent 150 to keep
          // localStorage well under quota (each card is ~1KB; unbounded growth
          // would eventually exceed the 5MB limit and silently wipe the store).
          // The full id LIST is kept (tiny) so nothing is "lost" — only the
          // heavy cached card body of the very oldest bookmarks is evicted.
          const nextIds = [...current, id]
          let nextCards = card ? { ...get().bookmarkedCards, [id]: card } : get().bookmarkedCards
          const keys = Object.keys(nextCards)
          if (keys.length > 150) {
            // Evict oldest by bookmark order (bookmarkedIds is chronological).
            const keep = new Set(nextIds.slice(-150))
            nextCards = Object.fromEntries(Object.entries(nextCards).filter(([k]) => keep.has(k)))
          }
          set({ bookmarkedIds: nextIds, bookmarkedCards: nextCards })
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
      lastUserId: null,
      setLastUserId: (id) => set({ lastUserId: id }),
      startOnForYou: false,
      setStartOnForYou: (value) => set({ startOnForYou: value }),
      // Signing in merges; it never replaces. The account's topics win when it has any, otherwise the
      // topics chosen here are kept (and sent up by the caller). Saved stories are a union.
      hydrateFromCloud: (data) =>
        set((s) => {
          const selectedTopics = data.selectedTopics.length > 0 ? data.selectedTopics : s.selectedTopics
          const bookmarkedIds = [...s.bookmarkedIds]
          let bookmarkedCards = { ...s.bookmarkedCards }
          // The account lists newest first; the local list is oldest first, so older rows go in at the front.
          for (const row of [...data.bookmarks].reverse()) {
            if (!bookmarkedIds.includes(row.id)) bookmarkedIds.unshift(row.id)
            if (!bookmarkedCards[row.id]) bookmarkedCards[row.id] = row
          }
          const keep = new Set(bookmarkedIds.slice(-150))
          if (Object.keys(bookmarkedCards).length > 150) {
            bookmarkedCards = Object.fromEntries(Object.entries(bookmarkedCards).filter(([id]) => keep.has(id)))
          }
          return {
            selectedTopics,
            hasOnboarded: s.hasOnboarded || data.hasOnboarded || selectedTopics.length > 0,
            cardsRead: Math.max(s.cardsRead, data.cardsRead),
            bookmarkedIds,
            bookmarkedCards,
          }
        }),
    }),
    {
      name: 'plax-store-v2',
      storage: safeStorage,
      // The story engine's own history (seen-storage.ts) replaced the old duplicate filter kept here.
      merge: (persisted, current) => {
        const kept = { ...(persisted as object) } as Record<string, unknown>
        delete kept.seenStoryKeys
        // Saved state from before the System option has only `theme`; see themeModeOf for what carries over.
        kept.themeMode = themeModeOf(kept)
        return { ...current, ...kept }
      },
    }
  )
)
