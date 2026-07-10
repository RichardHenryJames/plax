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
interface UIState {
  // Active single-topic filter applied over the loaded feed (null = show all)
  feedFilter: string | null
  setFeedFilter: (category: string | null) => void

  // ⌘K command palette
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  toggleCommand: () => void

  // Topic / interests editor sheet (reachable from mobile header + desktop rail)
  topicsOpen: boolean
  setTopicsOpen: (open: boolean) => void

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
  feedFilter: null,
  setFeedFilter: (category) => set({ feedFilter: category }),

  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),

  topicsOpen: false,
  setTopicsOpen: (open) => set({ topicsOpen: open }),

  currentCard: null,
  setCurrentCard: (card) => set({ currentCard: card }),

  searchItems: [],
  setSearchItems: (items) => set({ searchItems: items }),
  pendingJumpId: null,
  setPendingJumpId: (id) => set({ pendingJumpId: id }),
}))
