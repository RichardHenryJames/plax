import { useSyncExternalStore } from 'react'

/**
 * A tiny observable store, so that the engines (which hold the app's rules) have no dependency on React and can be tested without it,
 * and the screens read them with useStore().
 */
export interface Store<T extends object> {
  getState(): T
  /** Merges a patch (or the patch a function returns for the current state) into the state and tells the listeners. */
  setState(patch: Partial<T> | ((state: T) => Partial<T>)): void
  /** Replaces the whole state. */
  replaceState(next: T): void
  subscribe(listener: () => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      notify()
    },
    replaceState(next) {
      state = next
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Reads a part of a store and renders again when that part changes. The selector must return a primitive or a reference that stays the
 * same while the state does not change (never a new object or array built on each call), or the screen renders forever.
 */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  )
}
