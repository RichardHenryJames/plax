'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore } from '@/lib/store'
import { useAuth } from '@/components/AuthProvider'
import { addBookmarkToCloud, removeBookmarkFromCloud } from '@/lib/cloud-sync'
import { useT } from '@/lib/i18n'
import { withBase } from '@/lib/base-path'
import { createShareLink, shareBody, signedFields } from '@/lib/share-client'

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

  // Where "Read full story" goes, shown under it as the app does.
  const sourceHost = (() => {
    try {
      return card.sourceUrl ? new URL(card.sourceUrl).hostname.replace(/^www\./, '') : ''
    } catch {
      return ''
    }
  })()
  // The card's own page on Plax (a link that previews well and brings readers here), or null when it cannot have
  // one; the publisher's link is shared instead, as it always was.
  const plaxLink = async (): Promise<string | null> => {
    const body = shareBody(card)
    return body ? createShareLink(body, { endpoint: withBase('/api/share') }) : null
  }

  const handleBookmark = () => {
    const wasBookmarked = isBookmarked
    toggleBookmark(card.id, {
      id: card.id,
      title: card.originalTitle ?? card.title,
      content: card.originalContent ?? card.content,
      category: card.category,
      source: card.source,
      sourceUrl: card.sourceUrl,
      emoji: card.emoji,
      savedAt: Date.now(),
      ...signedFields(card),
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
      {/* Fade, so text scrolling under the bar stays readable */}
      <div className="absolute inset-x-0 bottom-0 h-28 gradient-bottom" />

      {/* Action bar — the same row as the app's: Read full story, then round buttons. Listen and Copy are the website's own. */}
      <div className="relative mx-auto w-full lg:max-w-3xl px-5 sm:px-10 lg:px-14 pb-3 lg:pb-7 pt-4 pointer-events-none">
        <div className="pointer-events-auto max-w-xl lg:max-w-2xl mx-auto flex items-center gap-2">
          {card.sourceUrl && card.type !== 'quote' && (
            <a
              href={card.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring group flex-1 min-w-0 flex items-center justify-between gap-2 h-12 sm:h-14 pl-4 pr-3.5 rounded-2xl bg-[var(--control)] hover:bg-[var(--control-hover)] text-dark-text transition-colors"
            >
              <span className="min-w-0 text-left">
                <span className="block text-[15px] font-semibold leading-tight truncate">{t('readFullStory')}</span>
                {sourceHost && <span className="block text-xs text-dark-muted leading-tight truncate">{sourceHost}</span>}
              </span>
              <svg className="w-5 h-5 shrink-0 text-dark-muted group-hover:text-dark-text transition-colors" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          )}
          <div className="ml-auto flex items-center gap-2">
          {/* Listen (text-to-speech) — hands-free audio reading */}
          <button
            onClick={toggleSpeech}
            aria-label={speaking ? t('listenStop') : t('listen')}
            data-tip={speaking ? t('listenStop') : t('listen')}
            className={`flex ${ROUND} ${speaking ? ROUND_ON : ROUND_OFF}`}
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
            hiddenOnPhone
            icon={
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7h8M8 11h5M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            onClick={async () => {
              // Copy a shareable, attributed snippet (title + a clean excerpt +
              // link) rather than just a truncated title — more useful to
              // paste and better for word-of-mouth sharing.
              const plain = card.content
                .replace(/\*\*(.*?)\*\*/g, '$1') // strip bold markers
                .replace(/\*(.*?)\*/g, '$1')     // strip italic markers
                .replace(/\s+/g, ' ')
                .trim()
              const excerpt = plain.slice(0, 200).trim()
              const link = (await plaxLink()) || card.sourceUrl || 'https://plaxlabs.com'
              const text = [
                card.title ? `“${card.title}”` : '',
                `${excerpt}${excerpt.length >= 200 ? '…' : ''}`,
                `${card.source ? `Source: ${card.source} · ` : ''}${link}`,
                `via Plax — plaxlabs.com`,
              ].filter(Boolean).join('\n\n')
              navigator.clipboard.writeText(text).then(() => flashToast(t('copied'))).catch(() => {})
            }}
          />
          {/* Save */}
          <div className="relative">
            <button
              onClick={handleBookmark}
              aria-label={isBookmarked ? t('remove') : t('save')}
              aria-pressed={isBookmarked}
              data-tip={isBookmarked ? t('saved') : t('save')}
              className={`flex ${ROUND} ${isBookmarked ? ROUND_ON : ROUND_OFF}`}
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

          <ActionButton
            label={t('share')}
            icon={
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            }
            onClick={async () => {
              const wrapped = await plaxLink()
              const url = wrapped || card.sourceUrl || window.location.origin
              // A Plax link is a preview card of its own, so the message is just the headline above it.
              const shareData = wrapped
                ? { title: card.title || 'Plax', text: card.title || 'Plax', url }
                : { title: card.title || 'Plax', text: card.content.slice(0, 200) + '…', url }
              const copyInstead = () =>
                navigator.clipboard
                  .writeText(`${card.title || ''} — ${url}`)
                  .then(() => flashToast(t('copied')))
                  .catch(() => {})
              if (!navigator.share) {
                copyInstead()
                return
              }
              navigator.share(shareData).catch((err) => {
                // Closing the share sheet is not an error.
                if (err?.name === 'AbortError') return
                // Some browsers (iOS Safari) only open the sheet straight from the tap, not after the link had to be
                // made. It is made now, so the next tap shares at once.
                if (err?.name === 'NotAllowedError' && wrapped) {
                  flashToast(t('shareAgain'))
                  return
                }
                copyInstead()
              })
            }}
          />
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

// The round buttons beside "Read full story", as in the app: soft discs, marigold when switched on.
const ROUND = 'tooltip focus-ring items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full transition-colors'
const ROUND_OFF = 'bg-[var(--control)] text-dark-text hover:bg-[var(--control-hover)]'
const ROUND_ON = 'bg-[var(--signal-soft)] text-[color:var(--signal-text)]'

function ActionButton({ icon, label, onClick, hiddenOnPhone = false }: { icon: React.ReactNode; label: string; onClick?: () => void; hiddenOnPhone?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      className={`${hiddenOnPhone ? 'hidden sm:flex' : 'flex'} ${ROUND} ${ROUND_OFF}`}
    >
      {icon}
    </button>
  )
}
