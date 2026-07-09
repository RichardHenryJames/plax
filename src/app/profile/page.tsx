'use client'

import { useAuth } from '@/components/AuthProvider'
import { useEffect, useState } from 'react'
import { getUserStats, loadBookmarksFromCloud } from '@/lib/cloud-sync'
import { usePlaxStore, TOPICS } from '@/lib/store'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

interface Stats {
  cardsRead: number
  readingStreak: number
  bookmarkCount: number
  totalMinutes: number
  topCategories: string[]
  memberSince: string
}

interface Bookmark {
  id: string
  card_id: string
  card_title: string | null
  card_category: string | null
  card_content: string | null
  created_at: string
}

export default function ProfilePage() {
  const { user, signOut, loading: authLoading } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [tab, setTab] = useState<'stats' | 'bookmarks' | 'settings'>('stats')
  const [loading, setLoading] = useState(true)
  const selectedTopics = usePlaxStore((s) => s.selectedTopics)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    Promise.all([getUserStats(user), loadBookmarksFromCloud(user)]).then(
      ([s, b]) => {
        setStats(s)
        setBookmarks(b as Bookmark[])
        setLoading(false)
      }
    )
  }, [user])

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-dark-bg text-dark-text">
        <div className="max-w-3xl mx-auto px-5 pt-6">
          <div className="flex items-center gap-4 mb-8">
            <div className="skeleton w-16 h-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-5 w-40 rounded" />
              <div className="skeleton h-3.5 w-56 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-dark-bg flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">👤</div>
          <h1 className="text-xl font-bold text-white mb-2 font-display">Sign in to see your profile</h1>
          <p className="text-dark-muted text-sm mb-6">Track your streak, save bookmarks across devices, and see your top interests.</p>
          <Link
            href="/"
            className="btn-primary focus-ring inline-flex px-6 py-3 text-sm"
          >
            Back to feed
          </Link>
        </motion.div>
      </main>
    )
  }

  const EMOJI_MAP: Record<string, string> = {
    science: '🔬', technology: '💻', philosophy: '🤔', psychology: '🧠',
    history: '📜', finance: '💰', space: '🚀', programming: '⚡',
    books: '📚', health: '🏥', math: '📐', nature: '🌿',
    art: '🎨', physics: '⚛️', business: '📈', language: '🗣️',
  }

  return (
    <main className="min-h-screen bg-dark-bg text-dark-text">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="pt-6 px-5">
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="focus-ring flex items-center gap-1.5 -ml-1 px-2.5 py-1.5 rounded-lg text-dark-muted hover:text-white hover:bg-white/5 transition text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Feed
            </Link>
            <h1 className="text-base font-semibold">Profile</h1>
            <div className="w-14" />
          </div>

          {/* Avatar + Name */}
          <div className="flex items-center gap-4 mb-8">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-full blur-lg opacity-30" />
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="relative w-[70px] h-[70px] rounded-full ring-2 ring-white/10"
                />
              ) : (
                <div className="relative w-[70px] h-[70px] rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold font-display truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </h2>
              <p className="text-dark-muted text-sm truncate">{user.email}</p>
              {stats && (
                <p className="text-dark-subtle text-xs mt-1">
                  Member since {new Date(stats.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="px-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard emoji="📖" label="Cards Read" value={stats.cardsRead.toString()} />
            <StatCard emoji="🔥" label="Day Streak" value={stats.readingStreak.toString()} />
            <StatCard emoji="⏱️" label="Minutes" value={stats.totalMinutes.toString()} />
            <StatCard emoji="🔖" label="Bookmarks" value={stats.bookmarkCount.toString()} />
          </div>
        )}

        {/* Tabs */}
        <div className="mx-5 flex gap-1 mb-5 bg-dark-card border border-dark-border rounded-xl p-1">
          {(['stats', 'bookmarks', 'settings'] as const).map((t) => (
            <button
              key={t}
            onClick={() => setTab(t)}
            className={`focus-ring flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-dark-muted hover:text-white'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-5 pb-24">
        <AnimatePresence mode="wait">
          {tab === 'stats' && stats && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h3 className="text-sm font-semibold text-dark-muted uppercase tracking-wider mb-3">
                Top Interests
              </h3>
              <div className="space-y-2">
                {stats.topCategories.length > 0 ? (
                  stats.topCategories.map((cat, i) => (
                    <div
                      key={cat}
                      className="flex items-center gap-3 p-3.5 card-elevated"
                    >
                      <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">{EMOJI_MAP[cat] || '📄'}</span>
                      <span className="font-medium capitalize flex-1">{cat}</span>
                      <span className="text-dark-subtle text-xs font-semibold tabular-nums">#{i + 1}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-dark-muted text-sm">Keep reading to see your top interests!</p>
                )}
              </div>

              <h3 className="text-sm font-semibold text-dark-muted uppercase tracking-wider mt-6 mb-3">
                Selected Topics
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedTopics.map((topicId) => {
                  const topic = TOPICS.find((t) => t.id === topicId)
                  return (
                    <span
                      key={topicId}
                      className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm"
                    >
                      {topic?.emoji} {topic?.label || topicId}
                    </span>
                  )
                })}
              </div>
            </motion.div>
          )}

          {tab === 'bookmarks' && (
            <motion.div
              key="bookmarks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {bookmarks.length > 0 ? (
                bookmarks.map((bm) => (
                  bm.card_content ? (
                    <a
                      key={bm.id}
                      href={`#${bm.card_id}`}
                      className="block p-4 card-elevated"
                    >
                      <div className="flex items-start gap-2.5 mb-2">
                        <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-base shrink-0">
                          {EMOJI_MAP[bm.card_category || ''] || '📄'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm leading-snug line-clamp-2">
                            {bm.card_title || 'Untitled'}
                          </h4>
                          <span className="text-xs text-dark-subtle capitalize">
                            {bm.card_category}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-dark-muted line-clamp-2 leading-relaxed">
                        {bm.card_content}
                      </p>
                    </a>
                  ) : (
                    <div key={bm.id} className="p-4 card-elevated">
                      <div className="flex items-start gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-base shrink-0">
                          {EMOJI_MAP[bm.card_category || ''] || '📄'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm leading-snug line-clamp-2">
                            {bm.card_title || 'Untitled'}
                          </h4>
                          <span className="text-xs text-dark-subtle capitalize">{bm.card_category}</span>
                        </div>
                      </div>
                    </div>
                  )
                ))
              ) : (
                <div className="text-center py-14">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">🔖</div>
                  <p className="text-white font-medium mb-1">No bookmarks yet</p>
                  <p className="text-dark-muted text-sm">Tap Save on cards you want to revisit.</p>
                </div>
              )}
            </motion.div>
          )}

          {tab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <button
                onClick={signOut}
                className="focus-ring w-full p-4 card-elevated text-left flex items-center gap-3"
              >
                <span className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-lg shrink-0">🚪</span>
                <div>
                  <p className="font-medium text-red-400">Sign Out</p>
                  <p className="text-xs text-dark-muted">{user.email}</p>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </main>
  )
}

function StatCard({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="card-elevated p-4">
      <span className="text-2xl">{emoji}</span>
      <p className="text-2xl font-bold mt-2">{value}</p>
      <p className="text-xs text-dark-muted mt-0.5">{label}</p>
    </div>
  )
}
