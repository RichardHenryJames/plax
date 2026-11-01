import { create } from 'zustand'
import type { CardData } from './sample-data'

// Lightweight, searchable projection of a loaded card (published by the Feed)
export interface SearchItem {
  id: string
  title?: string
  category: string
  content: string
}

// ─── Ephemeral UI state (NOT persisted) ───
// Shared between the desktop rails, command palette, and the feed.
export type Screen = 'feed' | 'topics' | 'saved'

interface UIState {
  // What the main area shows. The feed is the default and is public: no account or topics are needed.
  screen: Screen
  setScreen: (screen: Screen) => void

  // The topic read in the Feed tab ('news' = the public headlines everyone starts on), or null for the
  // For you tab, a mix of the reader's own topics. Choosing a topic starts a feed of just that topic.
  feedFilter: string | null
  setFeedFilter: (category: string | null) => void
  // The topic last read in the Feed tab, so returning from For you resumes it.
  feedTopic: string

  // Optional account sheet (sign in, topics and saved stories sync, sign out)
  accountOpen: boolean
  setAccountOpen: (open: boolean) => void

  // A saved story opened from the Saved tab; the feed shows it first.
  pinnedCardId: string | null
  pinCard: (id: string | null) => void

  // News sub-section filter (india/world/tech/business/science; null = All)
  newsSection: string | null
  setNewsSection: (section: string | null) => void

  // ⌘K command palette
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  toggleCommand: () => void

  // Topic / interests editor sheet (reachable from the menu + desktop rail)
  topicsOpen: boolean
  setTopicsOpen: (open: boolean) => void

  // The menu of a phone or tablet: everything the header and the bottom bar used to hold, so a story can have the whole screen.
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void

  // The card currently in view — lets the right rail show "Now reading"
  currentCard: CardData | null
  setCurrentCard: (card: CardData | null) => void

  // Search index of loaded cards + a "jump to this card" signal
  searchItems: SearchItem[]
  setSearchItems: (items: SearchItem[]) => void
  pendingJumpId: string | null
  setPendingJumpId: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  screen: 'feed',
  setScreen: (screen) => set({ screen }),

  feedFilter: 'news',
  feedTopic: 'news',
  setFeedFilter: (category) => set((s) => ({ feedFilter: category, feedTopic: category ?? s.feedTopic, screen: 'feed' })),

  accountOpen: false,
  setAccountOpen: (open) => set({ accountOpen: open }),

  pinnedCardId: null,
  pinCard: (id) => set(id ? { pinnedCardId: id, screen: 'feed' } : { pinnedCardId: null }),

  newsSection: null,
  setNewsSection: (section) => set({ newsSection: section }),

  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),

  topicsOpen: false,
  setTopicsOpen: (open) => set({ topicsOpen: open }),

  menuOpen: false,
  setMenuOpen: (open) => set({ menuOpen: open }),

  currentCard: null,
  setCurrentCard: (card) => set({ currentCard: card }),

  searchItems: [],
  setSearchItems: (items) => set({ searchItems: items }),
  pendingJumpId: null,
  setPendingJumpId: (id) => set({ pendingJumpId: id }),
}))
