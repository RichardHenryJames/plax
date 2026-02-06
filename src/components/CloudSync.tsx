'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from './AuthProvider'
import { usePlaxStore } from '@/lib/store'
import {
  loadPreferencesFromCloud,
  loadBookmarksFromCloud,
  syncPreferencesToCloud,
  saveEngagementToCloud,
  updateReadingStreak,
} from '@/lib/cloud-sync'

/**
 * CloudSync — bridges Supabase auth with Zustand store.
 * When a user signs in:
 *   1. Loads their profile + bookmarks from Supabase
 *   2. Hydrates the local Zustand store
 *   3. Syncs local changes back to cloud (debounced)
 */
export function CloudSync() {
  const { user } = useAuth()
  const syncedUserId = usePlaxStore((s) => s.syncedUserId)
  const setSyncedUserId = usePlaxStore((s) => s.setSyncedUserId)
  const hydrateFromCloud = usePlaxStore((s) => s.hydrateFromCloud)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Hydrate from cloud on sign-in ──
  useEffect(() => {
    if (!user || user.id === syncedUserId) return

    const hydrate = async () => {
      try {
        const [profile, bookmarks] = await Promise.all([
          loadPreferencesFromCloud(user),
          loadBookmarksFromCloud(user),
        ])

        if (profile) {
          hydrateFromCloud({
            selectedTopics: profile.selected_topics || [],
            hasOnboarded: profile.has_onboarded,
            cardsRead: profile.cards_read,
            bookmarkedIds: bookmarks.map((b) => b.card_id),
          })
        }

        setSyncedUserId(user.id)

        // Update reading streak on sign-in
        await updateReadingStreak(user)
      } catch (err) {
        console.error('[Plax] Cloud hydration error:', err)
      }
    }

    hydrate()
  }, [user, syncedUserId, setSyncedUserId, hydrateFromCloud])

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
