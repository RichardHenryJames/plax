import { SeenStore } from './story-engine'

export const SEEN_STORAGE_KEY = 'plax-seen-v1'

/** The saved history, or an empty one when nothing usable is stored (a damaged entry is removed). */
export function loadSeen(now = Date.now()): SeenStore {
  if (typeof window === 'undefined') return new SeenStore()
  try {
    const text = window.localStorage.getItem(SEEN_STORAGE_KEY)
    if (text === null) return new SeenStore()
    try {
      return SeenStore.fromJson(text, now)
    } catch {
      // Never trust a damaged history; start over rather than fail on it every visit.
      window.localStorage.removeItem(SEEN_STORAGE_KEY)
    }
  } catch {
    // Storage is blocked or unavailable.
  }
  return new SeenStore()
}

export function saveSeen(store: SeenStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, store.toJson())
  } catch {
    // Quota exceeded or storage blocked: the history is an optimisation, not worth failing for.
  }
}
