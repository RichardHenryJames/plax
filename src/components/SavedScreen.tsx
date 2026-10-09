'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useAuth } from '@/components/AuthProvider'
import { removeBookmarkFromCloud } from '@/lib/cloud-sync'
import { useT } from '@/lib/i18n'

/**
 * The Saved tab: the stories the reader bookmarked, newest first. They live in this browser, and in the
 * reader's account too when they are signed in (a story restored from an account has text only).
 */
export function SavedScreen() {
  const bookmarkedIds = usePlaxStore((s) => s.bookmarkedIds)
  const bookmarkedCards = usePlaxStore((s) => s.bookmarkedCards)
  const toggleBookmark = usePlaxStore((s) => s.toggleBookmark)
  const pinCard = useUIStore((s) => s.pinCard)
  const { user } = useAuth()
  const { t, tp, lang } = useT()

  const saved = useMemo(
    () => [...bookmarkedIds].reverse().map((id) => bookmarkedCards[id]).filter(Boolean),
    [bookmarkedIds, bookmarkedCards]
  )

  const remove = (id: string) => {
    toggleBookmark(id)
    if (user) removeBookmarkFromCloud(user, id).catch(() => {})
  }

  return (
    <div className={`feed-container overflow-y-auto thin-scrollbar overscroll-contain ${lang === 'hi' ? 'lang-hi' : ''}`} data-no-feed-scroll>
      <div className="mx-auto w-full max-w-2xl px-5 pt-[calc(4.75rem+env(safe-area-inset-top))] lg:pt-10 pb-10">
        {saved.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 pt-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center" aria-hidden>
              <svg className="w-8 h-8 text-dark-muted" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M7 3.5h10a1.5 1.5 0 011.5 1.5v15l-6.5-3.5L5.5 20V5A1.5 1.5 0 017 3.5z" />
              </svg>
            </div>
            <h2 className="text-white text-2xl font-bold font-display">{t('savedHeading')}</h2>
            <p className="text-dark-muted text-sm max-w-xs leading-relaxed">{t('savedEmptyDetail')}</p>
          </motion.div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-white font-display leading-tight mb-5">{t('tabSaved')}</h1>
            <ul className="space-y-3">
              {saved.map((card) => {
                const topic = TOPICS.find((x) => x.id === card.category)
                return (
                  <li key={card.id} className="rounded-2xl border border-dark-border bg-dark-card p-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--signal)]">
                      <span aria-hidden>{topic?.emoji ?? card.emoji ?? '✨'}</span>
                      <span>{topic ? tp(topic.id, topic.label) : card.category}</span>
                      {card.source && <span className="normal-case tracking-normal font-medium text-dark-muted">· {card.source}</span>}
                    </div>
                    {card.title && (
                      <h2 className="mt-2 text-lg font-bold text-white font-display leading-snug">
                        <button onClick={() => pinCard(card.id)} className="focus-ring rounded-md text-left hover:text-[color:var(--signal)] transition-colors">
                          {card.title}
                        </button>
                      </h2>
                    )}
                    {card.content && <p className="mt-1.5 text-sm text-dark-muted leading-relaxed line-clamp-3">{card.content}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => pinCard(card.id)}
                        className="btn-primary focus-ring px-4 py-2 text-xs"
                      >
                        {t('openStory')}
                      </button>
                      <button
                        onClick={() => remove(card.id)}
                        className="focus-ring px-3 py-2 rounded-xl text-xs font-semibold text-dark-muted hover:text-red-400 hover:bg-white/5 transition"
                      >
                        {t('remove')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
