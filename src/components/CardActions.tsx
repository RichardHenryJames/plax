'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [speaking, setSpeaking] = useState(false)
  const cardIdRef = useRef<string | null>(card?.id ?? null)

  const isBookmarked = card ? bookmarkedIds.includes(card.id) : false

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1600)
  }

  // ── Listen mode (text-to-speech) ────────────────────────────────────────
  // Reads the current card aloud via the free browser Speech API — hands-free
  // reading for commutes/walking. Picks a voice matching the card's language
  // (Hindi/English). Stops automatically when the card changes or unmounts.
  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSpeaking(false)
  }, [])

  // Stop narration whenever the visible card changes.
  useEffect(() => {
    if (card?.id !== cardIdRef.current) {
      cardIdRef.current = card?.id ?? null
      stopSpeech()
    }
  }, [card?.id, stopSpeech])

  // Stop on unmount.
  useEffect(() => () => stopSpeech(), [stopSpeech])

  const toggleSpeech = useCallback(() => {
    if (!card || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      flashToast(t('listenUnsupported'))
      return
    }
    if (speaking) {
      stopSpeech()
      return
    }
    const isHindi = /[\u0900-\u097F]/.test(`${card.title || ''} ${card.content || ''}`)
    // Strip markdown so it isn't read literally ("asterisk asterisk").
    const plain = `${card.title ? card.title + '. ' : ''}${card.content}`
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/[#`>_]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!plain) return
    const u = new SpeechSynthesisUtterance(plain)
    u.lang = isHindi ? 'hi-IN' : 'en-US'
    u.rate = 1
    // Prefer a voice matching the language if one is installed.
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find((v) => v.lang === u.lang) || voices.find((v) => v.lang.startsWith(u.lang.split('-')[0]))
    if (match) u.voice = match
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    setSpeaking(true)
  }, [card, speaking, stopSpeech, t])

  if (!card) return null

  const handleBookmark = () => {
    const wasBookmarked = isBookmarked
    toggleBookmark(card.id, {
      id: card.id,
      title: card.title,
      content: card.originalContent ?? card.content,
      category: card.category,
      source: card.source,
      sourceUrl: card.sourceUrl,
      emoji: card.emoji,
      savedAt: Date.now(),
    })
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
          {/* Listen (text-to-speech) — hands-free audio reading */}
          <button
            onClick={toggleSpeech}
            aria-label={speaking ? t('listenStop') : t('listen')}
            data-tip={speaking ? t('listenStop') : t('listen')}
            className={`tooltip focus-ring flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 ${
              speaking ? 'text-[color:var(--signal)] bg-[color:var(--signal)]/12' : 'text-dark-muted hover:text-white hover:bg-white/10'
            }`}
          >
            {speaking ? (
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" strokeWidth={1.6} />
                <rect x="14" y="5" width="4" height="14" rx="1" strokeWidth={1.6} />
              </svg>
            ) : (
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11 5L6 9H2v6h4l5 4V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
              </svg>
            )}
          </button>
          <ActionButton
            label={t('copy')}
            icon={
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7h8M8 11h5M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            onClick={() => {
              // Copy a shareable, attributed snippet (title + a clean excerpt +
              // source link) rather than just a truncated title — more useful to
              // paste and better for word-of-mouth sharing.
              const plain = card.content
                .replace(/\*\*(.*?)\*\*/g, '$1') // strip bold markers
                .replace(/\*(.*?)\*/g, '$1')     // strip italic markers
                .replace(/\s+/g, ' ')
                .trim()
              const excerpt = plain.slice(0, 200).trim()
              const link = card.sourceUrl || 'https://plaxlabs.com'
              const text = [
                card.title ? `“${card.title}”` : '',
                `${excerpt}${excerpt.length >= 200 ? '…' : ''}`,
                `${card.source ? `Source: ${card.source} · ` : ''}${link}`,
                `via Plax — plaxlabs.com`,
              ].filter(Boolean).join('\n\n')
              navigator.clipboard.writeText(text).then(() => flashToast(t('copied'))).catch(() => {})
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
                navigator.share(shareData).catch((err) => {
                  // User-cancelled share is not an error; only fall back on real
                  // failure (unsupported / permission) so the user still gets the link.
                  if (err?.name === 'AbortError') return
                  navigator.clipboard
                    .writeText(`${card.title || ''} — ${card.sourceUrl || window.location.origin}`)
                    .then(() => flashToast(t('copied')))
                    .catch(() => {})
                })
              } else {
                navigator.clipboard.writeText(`${card.title || ''} — ${card.sourceUrl || window.location.origin}`)
                  .then(() => flashToast(t('copied'))).catch(() => {})
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
                isBookmarked ? 'text-[color:var(--signal)] bg-[color:var(--signal)]/12' : 'text-dark-muted hover:text-white hover:bg-white/10'
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
