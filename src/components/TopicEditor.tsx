'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useAuth } from '@/components/AuthProvider'
import { syncPreferencesToCloud } from '@/lib/cloud-sync'

/**
 * TopicEditor — a modal sheet to add/remove interests AFTER onboarding.
 * Reachable from the mobile header (tune icon) and the desktop left rail.
 * Works signed-out (local Zustand store) and signed-in (also syncs prefs to
 * Supabase). Changing topics re-drives the feed (Feed keys its fetch on
 * selectedTopics) so the new interests take effect immediately on close.
 */
export function TopicEditor() {
  const topicsOpen = useUIStore((s) => s.topicsOpen)
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const setFeedFilter = useUIStore((s) => s.setFeedFilter)
  const { selectedTopics, toggleTopic } = usePlaxStore()
  const { user } = useAuth()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOPICS
    return TOPICS.filter((t) => t.label.toLowerCase().includes(q))
  }, [query])

  const close = () => {
    setQuery('')
    setTopicsOpen(false)
    // Clear any single-topic filter so the refreshed multi-topic feed shows.
    setFeedFilter(null)
    // Persist to cloud for signed-in users (fire-and-forget).
    if (user) {
      const s = usePlaxStore.getState()
      syncPreferencesToCloud(user, {
        selectedTopics: s.selectedTopics,
        hasOnboarded: s.hasOnboarded,
        cardsRead: s.cardsRead,
      }).catch(() => {})
    }
  }

  const enough = selectedTopics.length >= 1

  return (
    <AnimatePresence>
      {topicsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full sm:max-w-2xl bg-dark-bg sm:bg-dark-card border-t sm:border border-dark-border sm:rounded-2xl rounded-t-2xl shadow-2xl shadow-black/60 flex flex-col max-h-[88dvh] sm:max-h-[80dvh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-dark-border">
              <div>
                <h2 className="text-lg font-bold text-white font-display">Your interests</h2>
                <p className="text-xs text-dark-muted mt-0.5">
                  {selectedTopics.length} selected · tap to add or remove
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="p-2 text-dark-muted hover:text-white rounded-full hover:bg-white/5 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pt-4">
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search topics…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-card sm:bg-dark-bg border border-dark-border text-white placeholder:text-dark-subtle text-sm outline-none focus:border-violet-500/50 focus-ring transition-colors"
                />
              </div>
            </div>

            {/* Topic grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto thin-scrollbar px-5 py-4">
              {filtered.map((topic) => {
                const isSelected = selectedTopics.includes(topic.id)
                return (
                  <button
                    key={topic.id}
                    onClick={() => toggleTopic(topic.id)}
                    aria-pressed={isSelected}
                    className={`topic-chip focus-ring relative flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left transition ${
                      isSelected
                        ? 'border-violet-500/60 bg-violet-500/12 selected'
                        : 'border-dark-border bg-dark-card sm:bg-dark-bg hover:bg-dark-card-hover'
                    }`}
                  >
                    <span className="text-xl shrink-0">{topic.emoji}</span>
                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-dark-muted'}`}>
                      {topic.label}
                    </span>
                    {isSelected && (
                      <span className="ml-auto shrink-0 w-4 h-4 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-full flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-dark-border">
              <button
                onClick={close}
                disabled={!enough}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-violet-500/20 transition"
              >
                {enough ? 'Done' : 'Pick at least one topic'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
