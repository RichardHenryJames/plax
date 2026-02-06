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
      <main className="h-screen bg-dark-bg flex items-center justify-center">
        <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-2xl flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">P</span>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="h-screen bg-dark-bg flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-dark-muted text-lg mb-4">Sign in to view your profile</p>
          <Link
            href="/"
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-xl text-white font-semibold"
          >
            Go Home
          </Link>
        </div>
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
      {/* Header */}
      <div className="pt-6 px-5">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="p-2 -ml-2 text-dark-muted hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold">Profile</h1>
          <div className="w-10" />
        </div>

        {/* Avatar + Name */}
        <div className="flex items-center gap-4 mb-8">
          {user.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="Avatar"
              className="w-16 h-16 rounded-full ring-2 ring-violet-500/30"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold">
              {user.user_metadata?.full_name || user.email?.split('@')[0]}
            </h2>
            <p className="text-dark-muted text-sm">{user.email}</p>
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
        <div className="px-5 mb-6 grid grid-cols-2 gap-3">
          <StatCard emoji="📖" label="Cards Read" value={stats.cardsRead.toString()} />
          <StatCard emoji="🔥" label="Day Streak" value={stats.readingStreak.toString()} />
          <StatCard emoji="⏱️" label="Minutes Read" value={stats.totalMinutes.toString()} />
          <StatCard emoji="🔖" label="Bookmarks" value={stats.bookmarkCount.toString()} />
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 flex gap-1 mb-4 bg-dark-card rounded-xl p-1 mx-5">
        {(['stats', 'bookmarks', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-violet-600/20 text-violet-400'
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
                      className="flex items-center gap-3 p-3 bg-dark-card rounded-xl"
                    >
                      <span className="text-xl">{EMOJI_MAP[cat] || '📄'}</span>
                      <span className="font-medium capitalize flex-1">{cat}</span>
                      <span className="text-dark-muted text-sm">#{i + 1}</span>
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
                      className="px-3 py-1.5 bg-dark-card rounded-full text-sm"
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
                  <div
                    key={bm.id}
                    className="p-4 bg-dark-card rounded-xl border border-dark-border"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">
                        {EMOJI_MAP[bm.card_category || ''] || '📄'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate">
                          {bm.card_title || 'Untitled'}
                        </h4>
                        <span className="text-xs text-dark-muted capitalize">
                          {bm.card_category}
                        </span>
                      </div>
                    </div>
                    {bm.card_content && (
                      <p className="text-xs text-dark-muted line-clamp-2">
                        {bm.card_content}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-dark-muted text-sm text-center py-8">
                  No bookmarks yet. Tap 🔖 on cards you love!
                </p>
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
                className="w-full p-4 bg-dark-card rounded-xl border border-dark-border text-left flex items-center gap-3 hover:bg-dark-card-hover transition"
              >
                <span className="text-xl">🚪</span>
                <div>
                  <p className="font-medium text-red-400">Sign Out</p>
                  <p className="text-xs text-dark-muted">{user.email}</p>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}

function StatCard({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="p-4 bg-dark-card rounded-xl border border-dark-border">
      <span className="text-2xl">{emoji}</span>
      <p className="text-2xl font-bold mt-2">{value}</p>
      <p className="text-xs text-dark-muted mt-0.5">{label}</p>
    </div>
  )
}
