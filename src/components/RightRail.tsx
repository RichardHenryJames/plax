'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useAuth } from '@/components/AuthProvider'
import { addBookmarkToCloud, removeBookmarkFromCloud } from '@/lib/cloud-sync'
import { useT } from '@/lib/i18n'

/**
 * RightRail — desktop context panel (hidden below xl).
 * Now-reading · live stats · top interests · keyboard shortcuts.
 */
export function RightRail() {
  const cardsRead = usePlaxStore((s) => s.cardsRead)
  const bookmarkedIds = usePlaxStore((s) => s.bookmarkedIds)
  const engagements = usePlaxStore((s) => s.engagements)
  const quizAttempted = usePlaxStore((s) => s.quizAttempted)
  const quizCorrect = usePlaxStore((s) => s.quizCorrect)
  const getTopCategories = usePlaxStore((s) => s.getTopCategories)
  const toggleBookmark = usePlaxStore((s) => s.toggleBookmark)
  const currentCard = useUIStore((s) => s.currentCard)
  const { user } = useAuth()
  const { t, tp, lang } = useT()

  const minutes = useMemo(
    () => Math.round(engagements.reduce((sum, e) => sum + e.timeSpent, 0) / 60000),
    [engagements]
  )
  const topCategories = useMemo(() => getTopCategories().slice(0, 4), [getTopCategories, engagements]) // eslint-disable-line react-hooks/exhaustive-deps

  const isBookmarked = currentCard ? bookmarkedIds.includes(currentCard.id) : false

  const handleBookmark = () => {
    if (!currentCard) return
    const wasBookmarked = isBookmarked
    toggleBookmark(currentCard.id, {
      id: currentCard.id,
      title: currentCard.title,
      content: currentCard.originalContent ?? currentCard.content,
      category: currentCard.category,
      source: currentCard.source,
      sourceUrl: currentCard.sourceUrl,
      emoji: currentCard.emoji,
      savedAt: Date.now(),
    })
    if (user) {
      if (wasBookmarked) removeBookmarkFromCloud(user, currentCard.id)
      else addBookmarkToCloud(user, currentCard)
    }
  }

  const cardTopic = currentCard ? TOPICS.find((t) => t.id === currentCard.category) : undefined

  return (
    <aside className="hidden xl:flex flex-col w-80 shrink-0 h-full border-l border-dark-border bg-dark-card overflow-y-auto overscroll-contain thin-scrollbar">
      {/* Now reading */}
      <div className="px-5 pt-6 pb-4">
        <span className={`text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('nowReading')}</span>
        {currentCard ? (
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-4 card-elevated"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider border border-[color:var(--hair-strong)] bg-dark-card text-dark-text">
                {currentCard.emoji} {cardTopic ? tp(currentCard.category, cardTopic.label) : (currentCard.category === 'general' ? tp('general', 'Discover') : currentCard.category)}
              </span>
              <span className="text-dark-subtle text-[11px]">{currentCard.readTime} {t('read')}</span>
            </div>
            <p className="text-sm text-white/90 font-medium leading-snug line-clamp-3">
              {currentCard.title || currentCard.content.slice(0, 100)}
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleBookmark}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isBookmarked ? 'bg-[color:var(--signal)]/12 text-[color:var(--signal)]' : 'bg-white/5 text-dark-muted hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {isBookmarked ? t('saved') : t('save')}
              </button>
              {currentCard.sourceUrl && (
                <a
                  href={currentCard.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-dark-muted hover:text-white transition-colors"
                >
                  {t('source')}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </motion.div>
        ) : (
          <p className={`mt-3 text-xs text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('startReadingToSeeDetails')}</p>
        )}
      </div>

      {/* Stats */}
      <div className="px-5 pb-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('yourActivity')}</span>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Stat label={t('cardsRead')} value={cardsRead} accent="🔥" />
          <Stat label={t('bookmarks')} value={bookmarkedIds.length} accent="🔖" />
          <Stat label={t('minutes')} value={minutes} accent="⏱️" />
          <Stat label={t('interests')} value={topCategories.length} accent="✨" />
        </div>
      </div>

      {/* Quiz mastery — active-recall accuracy from the 'Test yourself' quizzes */}
      {quizAttempted > 0 && (
        <div className="px-5 pt-3 pb-2">
          <span className={`text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('quizMastery')}</span>
          <div className="mt-3 card-elevated p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold text-white tabular-nums leading-none">
                  {Math.round((quizCorrect / quizAttempted) * 100)}<span className="text-lg text-dark-muted">%</span>
                </div>
                <div className={`text-[11px] text-dark-muted mt-1 ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('accuracy')}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[color:var(--signal)] tabular-nums">{quizCorrect}/{quizAttempted}</div>
                <div className={`text-[11px] text-dark-muted mt-0.5 ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('correctAnswers')}</div>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((quizCorrect / quizAttempted) * 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full bg-[color:var(--signal)]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Top interests */}
      {topCategories.length > 0 && (
        <div className="px-5 py-5">
          <span className={`text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('topInterests')}</span>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topCategories.map((cat) => {
              const tm = TOPICS.find((x) => x.id === cat)
              return (
                <span key={cat} className={`px-2.5 py-1 rounded-full text-xs bg-white/5 text-dark-text border border-dark-border ${lang === 'hi' ? 'lang-hi' : ''}`}>
                  {tm?.emoji} {tm ? tp(cat, tm.label) : (cat === 'general' ? tp('general', 'Discover') : cat)}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Keyboard shortcuts */}
      <div className="mt-auto px-5 py-5 border-t border-dark-border">
        <span className={`text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('shortcuts')}</span>
        <div className="mt-3 space-y-2">
          <Shortcut keys={['↓', 'Space', 'J']} label={t('nextCard')} />
          <Shortcut keys={['↑', 'K']} label={t('previousCard')} />
          <Shortcut keys={['⌘', 'K']} label={t('searchAndJump')} />
        </div>
      </div>
    </aside>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card-elevated p-3">
      <div className="text-lg font-bold text-white tabular-nums">{accent} {value}</div>
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
