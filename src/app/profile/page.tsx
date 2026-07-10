'use client'

import { useAuth } from '@/components/AuthProvider'
import { useEffect, useState } from 'react'
import { getUserStats, loadBookmarksFromCloud } from '@/lib/cloud-sync'
import { usePlaxStore, TOPICS } from '@/lib/store'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useT } from '@/lib/i18n'

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
  const localCardsRead = usePlaxStore((s) => s.cardsRead)
  const localBookmarks = usePlaxStore((s) => s.bookmarkedIds)
  const localEngagements = usePlaxStore((s) => s.engagements)
  const getTopCategories = usePlaxStore((s) => s.getTopCategories)
  const quizAttempted = usePlaxStore((s) => s.quizAttempted)
  const quizCorrect = usePlaxStore((s) => s.quizCorrect)
  const { t, tp, lang } = useT()

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
      <main className="h-[100dvh] overflow-y-auto bg-dark-bg text-dark-text">
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

  const EMOJI_MAP: Record<string, string> = {
    science: '🔬', technology: '💻', philosophy: '🤔', psychology: '🧠',
    history: '📜', finance: '💰', space: '🚀', programming: '⚡',
    books: '📚', health: '🏥', math: '📐', nature: '🌿',
    art: '🎨', physics: '⚛️', business: '📈', language: '🗣️',
  }

  if (!user) {
    // Signed-out: show the user's LOCAL reading activity (from the on-device store)
    // with a prompt to sign in and sync across devices.
    const localMinutes = Math.round(localEngagements.reduce((sum, e) => sum + (e.timeSpent || 0), 0) / 60000)
    const localTop = getTopCategories().slice(0, 5)
    return (
      <main className="h-[100dvh] overflow-y-auto bg-dark-bg text-dark-text">
        <div className="max-w-3xl lg:max-w-5xl mx-auto">
          {/* Cover banner */}
          <div className="relative h-36 sm:h-44 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/40 via-indigo-600/25 to-cyan-500/30" />
            <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_20%_0%,rgba(139,92,246,0.35),transparent_60%)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/40 to-transparent" />
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-5">
              <Link href="/" className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass text-white/90 hover:text-white transition text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('feed')}
              </Link>
            </div>
          </div>

          {/* Header — guest avatar */}
          <div className="px-5 -mt-12 relative z-10">
            <div className="flex items-end gap-4 mb-6">
              <div className="relative shrink-0">
                <div className="absolute -inset-1 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-full blur-md opacity-40" />
                <div className="relative w-[88px] h-[88px] rounded-full bg-gradient-to-br from-dark-card to-dark-card-hover border border-white/10 flex items-center justify-center ring-4 ring-dark-bg text-4xl">
                  👋
                </div>
              </div>
              <div className="min-w-0 pb-1">
                <h2 className={`text-2xl font-bold font-display ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('yourReading')}</h2>
                <p className={`text-dark-muted text-sm ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('savedOnDevice')}</p>
              </div>
            </div>
          </div>

          {/* Local stats */}
          <div className="px-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard emoji="📖" label={t('cardsReadCap')} value={localCardsRead.toString()} tint="from-violet-500/20 to-violet-500/5" />
            <StatCard emoji="🔖" label={t('bookmarks')} value={localBookmarks.length.toString()} tint="from-emerald-500/20 to-emerald-500/5" />
            <StatCard emoji="⏱️" label={t('minutes')} value={localMinutes.toString()} tint="from-cyan-500/20 to-cyan-500/5" />
            <StatCard emoji="✨" label={t('interestsCap')} value={localTop.length.toString()} tint="from-fuchsia-500/20 to-fuchsia-500/5" />
          </div>

          {/* Quiz mastery */}
          {quizAttempted > 0 && (
            <div className="px-5 mb-6">
              <QuizMasteryPanel attempted={quizAttempted} correct={quizCorrect} t={t} lang={lang} />
            </div>
          )}

          {/* Sync prompt */}
          <div className="mx-5 mb-6 relative overflow-hidden rounded-2xl border border-violet-500/25 p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/15 to-cyan-500/10" />
            <div className="relative flex items-start gap-4">
              <div className="w-11 h-11 shrink-0 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-xl">☁️</div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-white ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('signInToSyncTitle')}</h3>
                <p className={`text-dark-muted text-sm mt-0.5 mb-3 ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('signInToSyncBody')}</p>
                <Link href="/" className={`btn-primary focus-ring inline-flex px-4 py-2 text-sm ${lang === 'hi' ? 'lang-hi' : ''}`}>
                  {t('signIn')}
                </Link>
              </div>
            </div>
          </div>

          {/* Local top interests */}
          {localTop.length > 0 && (
            <div className="px-5 pb-12">
              <h3 className={`text-sm font-semibold text-dark-muted uppercase tracking-wider mb-3 ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('yourTopInterests')}</h3>
              <div className="space-y-2">
                {localTop.map((cat, i) => {
                  const tm = TOPICS.find((x) => x.id === cat)
                  return (
                  <div key={cat} className="flex items-center gap-3 p-3.5 card-elevated">
                    <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">{EMOJI_MAP[cat] || '📄'}</span>
                    <span className={`font-medium flex-1 ${lang === 'hi' ? 'lang-hi' : 'capitalize'}`}>{tm ? tp(cat, tm.label) : cat}</span>
                    <span className="text-dark-subtle text-xs font-semibold tabular-nums">#{i + 1}</span>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="h-[100dvh] overflow-y-auto bg-dark-bg text-dark-text">
      <div className="max-w-3xl lg:max-w-5xl mx-auto">
        {/* Cover banner */}
        <div className="relative h-36 sm:h-44 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/40 via-indigo-600/25 to-cyan-500/30" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_20%_0%,rgba(139,92,246,0.35),transparent_60%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/40 to-transparent" />
          {/* Back button over banner */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-5">
            <Link href="/" className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass text-white/90 hover:text-white transition text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('feed')}
            </Link>
          </div>
        </div>

        {/* Header — avatar overlaps banner */}
        <div className="px-5 -mt-12 relative z-10">
          <div className="flex items-end gap-4 mb-6">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-full blur-md opacity-40" />
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="relative w-[88px] h-[88px] rounded-full ring-4 ring-dark-bg"
                />
              ) : (
                <div className="relative w-[88px] h-[88px] rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center ring-4 ring-dark-bg">
                  <span className="text-3xl font-bold text-white">
                    {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="text-2xl font-bold font-display truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </h2>
              <p className="text-dark-muted text-sm truncate">{user.email}</p>
              {stats && (
                <p className="text-dark-subtle text-xs mt-1 inline-flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className={lang === 'hi' ? 'lang-hi' : ''}>{t('memberSince', { x: new Date(stats.memberSince).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', { month: 'short', year: 'numeric' }) })}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="px-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard emoji="📖" label={t('cardsReadCap')} value={stats.cardsRead.toString()} tint="from-violet-500/20 to-violet-500/5" />
            <StatCard emoji="🔥" label={t('dayStreak')} value={stats.readingStreak.toString()} tint="from-orange-500/20 to-orange-500/5" />
            <StatCard emoji="⏱️" label={t('minutes')} value={stats.totalMinutes.toString()} tint="from-cyan-500/20 to-cyan-500/5" />
            <StatCard emoji="🔖" label={t('bookmarks')} value={stats.bookmarkCount.toString()} tint="from-emerald-500/20 to-emerald-500/5" />
          </div>
        )}

        {/* Tabs */}
        <div className="mx-5 flex gap-1 mb-5 bg-dark-card border border-dark-border rounded-xl p-1">
          {(['stats', 'bookmarks', 'settings'] as const).map((tabId) => (
            <button
              key={tabId}
            onClick={() => setTab(tabId)}
            className={`focus-ring flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === tabId
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-dark-muted hover:text-white'
            } ${lang === 'hi' ? 'lang-hi' : ''}`}
          >
            {tabId === 'stats' ? t('tabStats') : tabId === 'bookmarks' ? t('tabBookmarks') : t('tabSettings')}
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
              {quizAttempted > 0 && (
                <div className="mb-6">
                  <QuizMasteryPanel attempted={quizAttempted} correct={quizCorrect} t={t} lang={lang} />
                </div>
              )}

              <h3 className={`text-sm font-semibold text-dark-muted uppercase tracking-wider mb-3 ${lang === 'hi' ? 'lang-hi' : ''}`}>
                {t('topInterests')}
              </h3>
              <div className="space-y-2">
                {stats.topCategories.length > 0 ? (
                  stats.topCategories.map((cat, i) => {
                    const tm = TOPICS.find((x) => x.id === cat)
                    return (
                    <div
                      key={cat}
                      className="flex items-center gap-3 p-3.5 card-elevated"
                    >
                      <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">{EMOJI_MAP[cat] || '📄'}</span>
                      <span className={`font-medium flex-1 ${lang === 'hi' ? 'lang-hi' : 'capitalize'}`}>{tm ? tp(cat, tm.label) : cat}</span>
                      <span className="text-dark-subtle text-xs font-semibold tabular-nums">#{i + 1}</span>
                    </div>
                    )
                  })
                ) : (
                  <p className={`text-dark-muted text-sm ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('keepReadingTopInterests')}</p>
                )}
              </div>

              <h3 className={`text-sm font-semibold text-dark-muted uppercase tracking-wider mt-6 mb-3 ${lang === 'hi' ? 'lang-hi' : ''}`}>
                {t('selectedTopics')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedTopics.map((topicId) => {
                  const topic = TOPICS.find((x) => x.id === topicId)
                  return (
                    <span
                      key={topicId}
                      className={`px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm ${lang === 'hi' ? 'lang-hi' : ''}`}
                    >
                      {topic?.emoji} {topic ? tp(topicId, topic.label) : (topicId === 'general' ? tp('general', 'Discover') : topicId)}
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
                            {bm.card_title || t('untitled')}
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
                            {bm.card_title || t('untitled')}
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
                  <p className={`text-white font-medium mb-1 ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('noBookmarksYet')}</p>
                  <p className={`text-dark-muted text-sm ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('tapSaveToRevisit')}</p>
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
                  <p className={`font-medium text-red-400 ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('signOut')}</p>
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

function StatCard({ emoji, label, value, tint }: { emoji: string; label: string; value: string; tint: string }) {
  return (
    <div className="card-elevated relative p-4 overflow-hidden group">
      <div className={`absolute inset-0 bg-gradient-to-br ${tint} opacity-70 group-hover:opacity-100 transition-opacity`} />
      <div className="relative">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/8 border border-white/10 text-lg">{emoji}</span>
        <p className="text-[26px] font-bold mt-3 tabular-nums leading-none font-display">{value}</p>
        <p className="text-xs text-dark-muted mt-1.5">{label}</p>
      </div>
    </div>
  )
}

// Quiz mastery — a prominent panel showing active-recall accuracy from the
// "Test yourself" quizzes, with a progress ring-style bar.
function QuizMasteryPanel({
  attempted,
  correct,
  t,
  lang,
}: {
  attempted: number
  correct: number
  t: (k: string) => string
  lang: string
}) {
  const pct = Math.round((correct / attempted) * 100)
  const hi = lang === 'hi' ? 'lang-hi' : ''
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/25 p-5">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/15 via-teal-500/10 to-green-500/10" />
      <div className="relative flex items-center gap-5">
        {/* Accuracy ring */}
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
            <circle
              cx="50" cy="50" r="42" fill="none" stroke="url(#quizgrad)" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 264} 264`}
            />
            <defs>
              <linearGradient id="quizgrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white tabular-nums leading-none font-display">{pct}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-300 mb-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className={hi}>{t('quizMastery')}</span>
          </div>
          <p className="text-2xl font-bold text-white font-display tabular-nums">
            {correct}<span className="text-dark-muted">/{attempted}</span>
          </p>
          <p className={`text-sm text-dark-muted ${hi}`}>{t('correctAnswers')} · {t('quizzesTaken')}</p>
        </div>
      </div>
    </div>
  )
}
