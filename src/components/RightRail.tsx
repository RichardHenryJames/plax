'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useAuth } from '@/components/AuthProvider'
import { addBookmarkToCloud, removeBookmarkFromCloud } from '@/lib/cloud-sync'

/**
 * RightRail — desktop context panel (hidden below xl).
 * Now-reading · live stats · top interests · keyboard shortcuts.
 */
export function RightRail() {
  const cardsRead = usePlaxStore((s) => s.cardsRead)
  const bookmarkedIds = usePlaxStore((s) => s.bookmarkedIds)
  const engagements = usePlaxStore((s) => s.engagements)
  const getTopCategories = usePlaxStore((s) => s.getTopCategories)
  const toggleBookmark = usePlaxStore((s) => s.toggleBookmark)
  const currentCard = useUIStore((s) => s.currentCard)
  const { user } = useAuth()

  const minutes = useMemo(
    () => Math.round(engagements.reduce((sum, e) => sum + e.timeSpent, 0) / 60000),
    [engagements]
  )
  const topCategories = useMemo(() => getTopCategories().slice(0, 4), [getTopCategories, engagements]) // eslint-disable-line react-hooks/exhaustive-deps

  const isBookmarked = currentCard ? bookmarkedIds.includes(currentCard.id) : false

  const handleBookmark = () => {
    if (!currentCard) return
    const wasBookmarked = isBookmarked
    toggleBookmark(currentCard.id)
    if (user) {
      if (wasBookmarked) removeBookmarkFromCloud(user, currentCard.id)
      else addBookmarkToCloud(user, currentCard)
    }
  }

  const cardTopic = currentCard ? TOPICS.find((t) => t.id === currentCard.category) : undefined

  return (
    <aside className="hidden xl:flex flex-col w-80 shrink-0 h-full border-l border-dark-border bg-dark-card/30 backdrop-blur-xl overflow-y-auto hide-scrollbar">
      {/* Now reading */}
      <div className="p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-subtle">Now Reading</span>
        {currentCard ? (
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-4 rounded-2xl bg-dark-bg/60 border border-dark-border"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gradient-to-r ${cardTopic?.color || 'from-gray-500 to-gray-600'} text-white`}>
                {currentCard.emoji} {cardTopic?.label || currentCard.category}
              </span>
              <span className="text-dark-subtle text-[11px]">{currentCard.readTime} read</span>
            </div>
            <p className="text-sm text-white/90 font-medium leading-snug line-clamp-3">
              {currentCard.title || currentCard.content.slice(0, 100)}
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleBookmark}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isBookmarked ? 'bg-violet-500/15 text-violet-300' : 'bg-white/5 text-dark-muted hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {isBookmarked ? 'Saved' : 'Save'}
              </button>
              {currentCard.sourceUrl && (
                <a
                  href={currentCard.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-dark-muted hover:text-white transition-colors"
                >
                  Source
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </motion.div>
        ) : (
          <p className="mt-3 text-xs text-dark-subtle">Start reading to see details here.</p>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-subtle">Your Activity</span>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Cards read" value={cardsRead} accent="🔥" />
          <Stat label="Bookmarks" value={bookmarkedIds.length} accent="🔖" />
          <Stat label="Minutes" value={minutes} accent="⏱️" />
          <Stat label="Interests" value={topCategories.length} accent="✨" />
        </div>
      </div>

      {/* Top interests */}
      {topCategories.length > 0 && (
        <div className="px-4 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-subtle">Top Interests</span>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topCategories.map((cat) => {
              const t = TOPICS.find((x) => x.id === cat)
              return (
                <span key={cat} className="px-2.5 py-1 rounded-full text-xs bg-white/5 text-dark-text border border-dark-border">
                  {t?.emoji} {t?.label || cat}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Keyboard shortcuts */}
      <div className="mt-auto p-4 border-t border-dark-border">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-subtle">Shortcuts</span>
        <div className="mt-3 space-y-1.5">
          <Shortcut keys={['↓', 'Space', 'J']} label="Next card" />
          <Shortcut keys={['↑', 'K']} label="Previous card" />
          <Shortcut keys={['⌘', 'K']} label="Search & jump" />
        </div>
      </div>
    </aside>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="p-3 rounded-xl bg-dark-bg/60 border border-dark-border">
      <div className="text-lg font-bold text-white">{accent} {value}</div>
      <div className="text-[11px] text-dark-muted mt-0.5">{label}</div>
    </div>
  )
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-dark-muted">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd key={k} className="text-[10px] font-medium text-dark-subtle bg-dark-card border border-dark-border rounded px-1.5 py-0.5">{k}</kbd>
        ))}
      </span>
    </div>
  )
}
