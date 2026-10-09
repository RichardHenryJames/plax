'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from './AuthProvider'
import { usePlaxStore } from '@/lib/store'
import {
  loadPreferencesFromCloud,
  loadBookmarksFromCloud,
  syncPreferencesToCloud,
  addBookmarkToCloud,
  toBookmarkedCard,
  saveEngagementToCloud,
  updateReadingStreak,
} from '@/lib/cloud-sync'

/**
 * CloudSync — bridges Supabase auth with Zustand store. Everything works without it: signing in only keeps a
 * copy of the reader's topics and saved stories in their account.
 * When a user signs in:
 *   1. Loads their profile + bookmarks from Supabase
 *   2. MERGES them into the local store (the account's topics win when it has any; saved stories are a union)
 *   3. Sends up what the account lacks (unless a different account used this browser before)
 *   4. Syncs later local changes back to cloud (debounced)
 */
export function CloudSync() {
  const { user } = useAuth()
  const syncedUserId = usePlaxStore((s) => s.syncedUserId)
  const setSyncedUserId = usePlaxStore((s) => s.setSyncedUserId)
  const setLastUserId = usePlaxStore((s) => s.setLastUserId)
  const hydrateFromCloud = usePlaxStore((s) => s.hydrateFromCloud)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Merge with the cloud on sign-in ──
  useEffect(() => {
    if (!user || user.id === syncedUserId) return

    const hydrate = async () => {
      try {
        const [profile, bookmarks] = await Promise.all([
          loadPreferencesFromCloud(user),
          loadBookmarksFromCloud(user),
        ])
        // The account service could not be reached: nothing was merged, so try again next time.
        if (!profile) return

        // A different account never inherits what the previous reader chose or saved in this browser.
        const lastUserId = usePlaxStore.getState().lastUserId
        const mayUpload = !lastUserId || lastUserId === user.id

        hydrateFromCloud({
          selectedTopics: profile.selected_topics || [],
          hasOnboarded: profile.has_onboarded,
          cardsRead: profile.cards_read,
          bookmarks: bookmarks.map(toBookmarkedCard),
        })

        if (mayUpload) {
          const local = usePlaxStore.getState()
          if ((profile.selected_topics?.length ?? 0) === 0 && local.selectedTopics.length > 0) {
            await syncPreferencesToCloud(user, {
              selectedTopics: local.selectedTopics,
              hasOnboarded: true,
              cardsRead: local.cardsRead,
            })
          }
          const held = new Set(bookmarks.map((b) => b.card_id))
          for (const id of local.bookmarkedIds) {
            const card = local.bookmarkedCards[id]
            if (card && !held.has(id)) {
              await addBookmarkToCloud(user, { id, title: card.title, category: card.category, content: card.content })
            }
          }
        }

        setSyncedUserId(user.id)
        setLastUserId(user.id)

        // Update reading streak on sign-in
        await updateReadingStreak(user)
      } catch (err) {
        console.error('[Plax] Cloud sync error:', err)
      }
    }

    hydrate()
  }, [user, syncedUserId, setSyncedUserId, setLastUserId, hydrateFromCloud])

  // ── Sync local changes to cloud (debounced) ──
  useEffect(() => {
    if (!user) return

    const unsub = usePlaxStore.subscribe((state, prevState) => {
      // Only sync when relevant fields change
      const changed =
        state.selectedTopics !== prevState.selectedTopics ||
        state.hasOnboarded !== prevState.hasOnboarded ||
        state.cardsRead !== prevState.cardsRead

      if (!changed) return

      // Debounce sync: 2 seconds after last change
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        syncPreferencesToCloud(user, {
          selectedTopics: state.selectedTopics,
          hasOnboarded: state.hasOnboarded,
          cardsRead: state.cardsRead,
        })
      }, 2000)
    })

    return () => {
      unsub()
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [user])

  // ── Sync engagements to cloud ──
  useEffect(() => {
    if (!user) return

    const unsub = usePlaxStore.subscribe((state, prevState) => {
      if (state.engagements.length > prevState.engagements.length) {
        // New engagement added — sync the last one
        const latest = state.engagements[state.engagements.length - 1]
        saveEngagementToCloud(user, latest)
      }
    })

    return () => unsub()
  }, [user])

  // Clear synced user on sign-out
  useEffect(() => {
    if (!user && syncedUserId) {
      setSyncedUserId(null)
    }
  }, [user, syncedUserId, setSyncedUserId])

  return null // Invisible sync bridge
}
