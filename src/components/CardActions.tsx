'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore } from '@/lib/store'
import { useAuth } from '@/components/AuthProvider'
import { addBookmarkToCloud, removeBookmarkFromCloud } from '@/lib/cloud-sync'
import { useT } from '@/lib/i18n'
import { withBase } from '@/lib/base-path'
import { SITE_DISPLAY, SITE_URL } from '@/lib/site'
import { createShareLink, knownShareLink, shareBody, signedFields } from '@/lib/share-client'

/**
 * CardActions — Listen / Copy / Save / Share, as a row of round buttons that stands at the right end of a card's source line
 * ("WORLD  BBC World · 3h ago"), so the story has the whole screen: there is no bar at the bottom any more. Reading the story
 * at the publisher is the headline's own link (Card). Each card carries its own row, so narration and a pending share stop
 * with the card; the toast ("Copied", "Saved") appears under the buttons that asked for it.
 */
export function CardActions({ card }: { card: CardData | null }) {
  const { bookmarkedIds, toggleBookmark } = usePlaxStore()
  const { user } = useAuth()
  const { t } = useT()
  const [toast, setToast] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  // Which of Share or Copy is waiting for the story's page to be made, if either, and how to stop waiting.
  const [making, setMaking] = useState<'share' | 'copy' | null>(null)
  const waiting = useRef<AbortController | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardIdRef = useRef<string | null>(card?.id ?? null)

  const isBookmarked = card ? bookmarkedIds.includes(card.id) : false

  // One toast at a time: a new one restarts the clock, so an earlier timer cannot take it away early.
  const flashToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1600)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

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

  // The card's own page on Plax (a link that previews well and brings readers here), or null when it cannot have
  // one; the publisher's link is shared instead, as it always was. A first request can take a few seconds, so the
  // button shows it is working, and a second click gives up waiting: the first click then carries on with the
  // publisher's link.
  const plaxLink = async (purpose: 'share' | 'copy'): Promise<string | null> => {
    const body = shareBody(card)
    if (!body) return null
    if (knownShareLink(body)) return knownShareLink(body)
    const own = new AbortController()
    waiting.current = own
    setMaking(purpose)
    try {
      return await createShareLink(body, { endpoint: withBase('/api/share'), signal: own.signal })
    } finally {
      if (waiting.current === own) waiting.current = null
      setMaking(null)
    }
  }
  const stopWaiting = (): boolean => {
    if (!waiting.current) return false
    waiting.current.abort()
    return true
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
    flashToast(wasBookmarked ? t('removedToast') : t('savedToast'))
    if (user) {
      if (wasBookmarked) removeBookmarkFromCloud(user, card.id)
      else addBookmarkToCloud(user, { id: card.id, title: card.title, category: card.category, content: card.content })
    }
  }

  return (
    <div className="relative ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
      {/* Listen (text-to-speech) — hands-free audio reading */}
      <button
        type="button"
        onClick={toggleSpeech}
        aria-label={speaking ? t('listenStop') : t('listen')}
        title={speaking ? t('listenStop') : t('listen')}
        className={`flex ${ROUND} ${speaking ? ROUND_ON : ROUND_OFF}`}
      >
        {speaking ? (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" strokeWidth={1.6} />
            <rect x="14" y="5" width="4" height="14" rx="1" strokeWidth={1.6} />
          </svg>
        ) : (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11 5L6 9H2v6h4l5 4V5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
          </svg>
        )}
      </button>

      <ActionButton
        label={t('copy')}
        hiddenOnPhone
        busy={making === 'copy'}
        icon={
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7h8M8 11h5M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
        onClick={async () => {
          if (stopWaiting()) return
          // Copy a shareable, attributed snippet (title + a clean excerpt +
          // link) rather than just a truncated title — more useful to
          // paste and better for word-of-mouth sharing.
          const plain = card.content
            .replace(/\*\*(.*?)\*\*/g, '$1') // strip bold markers
            .replace(/\*(.*?)\*/g, '$1')     // strip italic markers
            .replace(/\s+/g, ' ')
            .trim()
          const excerpt = plain.slice(0, 200).trim()
          const link = (await plaxLink('copy')) || card.sourceUrl || SITE_URL
          const text = [
            card.title ? `“${card.title}”` : '',
            `${excerpt}${excerpt.length >= 200 ? '…' : ''}`,
            `${card.source ? `Source: ${card.source} · ` : ''}${link}`,
            `via Plax — ${SITE_DISPLAY}`,
          ].filter(Boolean).join('\n\n')
          navigator.clipboard.writeText(text).then(() => flashToast(t('copied'))).catch(() => {})
        }}
      />

      {/* Save */}
      <button
        type="button"
        onClick={handleBookmark}
        aria-label={isBookmarked ? t('remove') : t('save')}
        aria-pressed={isBookmarked}
        title={isBookmarked ? t('saved') : t('save')}
        className={`flex ${ROUND} ${isBookmarked ? ROUND_ON : ROUND_OFF}`}
      >
        <motion.svg
          key={String(isBookmarked)}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          className="w-[18px] h-[18px]"
          fill={isBookmarked ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </motion.svg>
      </button>

      <ActionButton
        label={t('share')}
        busy={making === 'share'}
        icon={
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        }
        onClick={async () => {
          if (stopWaiting()) return
          const wrapped = await plaxLink('share')
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

      {/* Saved / copied / share-again: under the buttons that asked for it, right-aligned so it stays on the screen */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium text-white shadow-lg glass-strong pointer-events-none"
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// The round buttons, as in the app: soft discs, marigold when switched on. 36 px (40 from a tablet up) with a larger touch
// area around them, so three of them fit on the source line of a small phone.
const ROUND = 'focus-ring relative items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-colors before:absolute before:-inset-1 before:content-[""]'
const ROUND_OFF = 'bg-[var(--control)] text-dark-text hover:bg-[var(--control-hover)]'
const ROUND_ON = 'bg-[var(--signal-soft)] text-[color:var(--signal-text)]'

function ActionButton({ icon, label, onClick, hiddenOnPhone = false, busy = false }: { icon: React.ReactNode; label: string; onClick?: () => void; hiddenOnPhone?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-busy={busy || undefined}
      title={label}
      className={`${hiddenOnPhone ? 'hidden sm:flex' : 'flex'} ${ROUND} ${ROUND_OFF}`}
    >
      {busy ? (
        <span className="w-[16px] h-[16px] border-[1.5px] border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
    </button>
  )
}
