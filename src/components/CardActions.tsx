'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore } from '@/lib/store'
import { useAuth } from '@/components/AuthProvider'
import { addBookmarkToCloud, removeBookmarkFromCloud } from '@/lib/cloud-sync'
import { useT } from '@/lib/i18n'

/**
 * CardActions — the Copy / Share / Save dock.
 * Rendered by the Feed as FIXED chrome (a sibling of the animating card), so it
 * stays put while cards flip — the Inshorts-style fixed-bottom pattern. Reads the
 * currently-visible card via props (not animated). Read progress is owned by the
 * Feed and shown in the top segmented bar.
 */
export function CardActions({ card }: { card: CardData | null }) {
  const { bookmarkedIds, toggleBookmark } = usePlaxStore()
  const { user } = useAuth()
  const { t } = useT()
  const [showBookmarkFeedback, setShowBookmarkFeedback] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const isBookmarked = card ? bookmarkedIds.includes(card.id) : false

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1600)
  }

  if (!card) return null

  const handleBookmark = () => {
    const wasBookmarked = isBookmarked
    toggleBookmark(card.id)
    setShowBookmarkFeedback(true)
    setTimeout(() => setShowBookmarkFeedback(false), 1200)
    if (user) {
      if (wasBookmarked) removeBookmarkFromCloud(user, card.id)
      else addBookmarkToCloud(user, { id: card.id, title: card.title, category: card.category, content: card.content })
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 pointer-events-none">
      {/* Bottom scrim (mobile only — desktop dock floats over the panel) */}
      <div className="lg:hidden absolute inset-x-0 bottom-0 h-32 gradient-bottom" />

      {/* Action dock */}
      <div className="relative flex items-center justify-center pb-[calc(1.25rem+env(safe-area-inset-bottom))] lg:pb-8 pt-10">
        <div className="action-pill pointer-events-auto flex items-center gap-1 p-1.5">
          <ActionButton
            label={t('copy')}
            icon={
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7h8M8 11h5M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            onClick={() => {
              const text = `${card.title || card.content.slice(0, 80)}… — via Plax`
              navigator.clipboard.writeText(text).then(() => flashToast(t('copy'))).catch(() => {})
            }}
          />
          <ActionButton
            label={t('share')}
            icon={
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            }
            onClick={() => {
              const shareData = {
                title: card.title || 'Plax',
                text: card.content.slice(0, 200) + '…',
                url: card.sourceUrl || window.location.origin,
              }
              if (navigator.share) {
                navigator.share(shareData).catch(() => {})
              } else {
                navigator.clipboard.writeText(`${card.title || ''} — ${card.sourceUrl || window.location.origin}`)
                  .then(() => flashToast('Link copied')).catch(() => {})
              }
            }}
          />

          <span className="w-px h-6 bg-white/10 mx-0.5" />

          {/* Save */}
          <div className="relative">
            <button
              onClick={handleBookmark}
              aria-label={isBookmarked ? t('remove') : t('save')}
              data-tip={isBookmarked ? t('saved') : t('save')}
              className={`tooltip focus-ring flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 ${
                isBookmarked ? 'text-violet-300 bg-violet-500/15' : 'text-dark-muted hover:text-white hover:bg-white/10'
              }`}
            >
              <motion.svg
                key={String(isBookmarked)}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                className="w-[19px] h-[19px]"
                fill={isBookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </motion.svg>
            </button>

            <AnimatePresence>
              {showBookmarkFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -46, scale: 1 }}
                  exit={{ opacity: 0, y: -60, scale: 0.8 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 glass-strong px-3 py-1.5 rounded-lg text-xs text-white whitespace-nowrap shadow-lg"
                >
                  {isBookmarked ? '✓ Saved to bookmarks' : 'Removed'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Copy / share toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            className="absolute left-1/2 -translate-x-1/2 bottom-24 glass-strong px-4 py-2 rounded-full text-xs font-medium text-white shadow-lg flex items-center gap-2 pointer-events-none"
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      className="tooltip icon-btn focus-ring flex items-center justify-center w-11 h-11"
    >
      {icon}
    </button>
  )
}
