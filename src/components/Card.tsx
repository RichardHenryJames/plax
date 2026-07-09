'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore, TOPICS } from '@/lib/store'
import { useAuth } from '@/components/AuthProvider'
import { addBookmarkToCloud, removeBookmarkFromCloud } from '@/lib/cloud-sync'

interface CardProps {
  card: CardData
  isActive: boolean
}

export function Card({ card, isActive }: CardProps) {
  const { bookmarkedIds, toggleBookmark } = usePlaxStore()
  const { user } = useAuth()
  const isBookmarked = bookmarkedIds.includes(card.id)
  const [showBookmarkFeedback, setShowBookmarkFeedback] = useState(false)
  const [readProgress, setReadProgress] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1600)
  }

  // Simulate read progress based on time
  useEffect(() => {
    if (!isActive) return
    setReadProgress(0)
    const readTimeMs = parseReadTime(card.readTime)
    const interval = setInterval(() => {
      setReadProgress((prev) => Math.min(prev + 2, 100))
    }, readTimeMs / 50)
    return () => clearInterval(interval)
  }, [isActive, card.readTime])

  const handleBookmark = () => {
    const wasBookmarked = isBookmarked
    toggleBookmark(card.id)
    setShowBookmarkFeedback(true)
    setTimeout(() => setShowBookmarkFeedback(false), 1200)

    // Sync to cloud if signed in
    if (user) {
      if (wasBookmarked) {
        removeBookmarkFromCloud(user, card.id)
      } else {
        addBookmarkToCloud(user, {
          id: card.id,
          title: card.title,
          category: card.category,
          content: card.content,
        })
      }
    }
  }

  const topicMeta = TOPICS.find((t) => t.id === card.category)
  const gradientClass = topicMeta?.color || 'from-gray-500 to-gray-600'

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden select-none">
      {/* Background glow */}
      <div className={`absolute inset-0 bg-gradient-to-b ${gradientClass} opacity-[0.05]`} />
      {/* Top category accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${gradientClass} opacity-70 z-10`} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-12 py-24 relative z-10 overflow-y-auto hide-scrollbar">
        <div className="max-w-xl lg:max-w-2xl mx-auto w-full">
          {/* Category + metadata */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={isActive ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.2 }}
            className="flex items-center flex-wrap gap-2.5 mb-6"
          >
            <span className={`inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-gradient-to-r ${gradientClass} text-white shadow-lg`}>
              <span className="text-xs">{card.emoji}</span> {topicMeta?.label || card.category}
            </span>
            {card.aiEnhanced && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-violet-200 bg-violet-500/15 border border-violet-400/25 rounded-full px-2 py-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.4 6.5L21 11l-6.6 2.5L12 20l-2.4-6.5L3 11l6.6-2.5L12 2z" /></svg>
                AI summary
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-dark-subtle text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {card.readTime}
            </span>
          </motion.div>

          {/* Title */}
          {card.title && card.type !== 'quote' && (
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={isActive ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="text-[26px] sm:text-[32px] lg:text-[34px] font-bold text-white mb-6 leading-[1.15] tracking-[-0.02em] font-display"
            >
              {card.sourceUrl ? (
                <a
                  href={card.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-violet-200 transition-colors inline-flex items-start gap-2 group"
                >
                  {card.title}
                  <svg className="w-4 h-4 mt-2 flex-shrink-0 text-dark-subtle group-hover:text-violet-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : (
                card.title
              )}
            </motion.h1>
          )}

          {/* Content */}
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, y: 10 }}
            animate={isActive ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.08, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {card.type === 'quote' ? (
              <blockquote className="relative py-6">
                <span className="absolute -left-1 -top-4 text-6xl leading-none text-violet-500/30 font-serif select-none">&ldquo;</span>
                <div className="absolute -left-2 top-2 bottom-2 w-1 bg-gradient-to-b from-violet-500 to-cyan-500 rounded-full" />
                <p className="text-[26px] sm:text-[32px] font-serif italic text-white/95 leading-[1.4] pl-6">
                  {card.content}
                </p>
              </blockquote>
            ) : card.type === 'code' ? (
              <div className="space-y-4">
                {card.content.split('\n\n').map((paragraph, i) => {
                  if (paragraph.startsWith('```')) {
                    const code = paragraph.replace(/```\w*\n?/g, '').trim()
                    return (
                      <div key={i} className="bg-black/40 border border-dark-border rounded-xl p-4 overflow-x-auto">
                        <pre className="code-text text-dark-text/90">{code}</pre>
                      </div>
                    )
                  }
                  return (
                    <p key={i} className="reading-text">
                      {formatText(paragraph)}
                    </p>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {card.content.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="reading-text">
                    {formatText(paragraph)}
                  </p>
                ))}
              </div>
            )}
          </motion.div>

          {/* Author / Source credibility */}
          {(card.author || card.source) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={isActive ? { opacity: 1 } : {}}
              transition={{ delay: 0.35 }}
              className="mt-7 pt-4 border-t border-dark-border/50 flex items-center gap-2.5"
            >
              <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs shrink-0">
                {card.emoji || '📄'}
              </div>
              <div className="min-w-0">
                {card.author && (
                  <p className="text-dark-text/90 text-xs font-medium truncate">{card.author}</p>
                )}
                {card.source && (
                  card.sourceUrl ? (
                    <a
                      href={card.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-dark-subtle text-xs hover:text-violet-400 transition-colors inline-flex items-center gap-1"
                    >
                      {card.source}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <p className="text-dark-subtle text-xs">{card.source}</p>
                  )
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 gradient-bottom pt-16 pb-6 px-6 z-40">
        <div className="max-w-xl lg:max-w-2xl mx-auto flex items-center justify-between">
          {/* Left: Read progress */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 relative">
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18" cy="18" r="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-dark-border"
                />
                <circle
                  cx="18" cy="18" r="15"
                  fill="none"
                  stroke="url(#grad)"
                  strokeWidth="2.5"
                  strokeDasharray={`${readProgress * 0.94} 94`}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
                <defs>
                  <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Center actions */}
          <div className="flex items-center gap-2.5">
            <ActionButton
              icon={
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7h8M8 11h5M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
              label="Copy"
              onClick={() => {
                const text = `${card.title || card.content.slice(0, 80)}… — via Plax`
                navigator.clipboard.writeText(text).then(() => flashToast('Copied to clipboard')).catch(() => {})
              }}
            />
            <ActionButton
              icon={
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              }
              label="Share"
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
          </div>

          {/* Right: Bookmark */}
          <div className="relative">
            <button
              onClick={handleBookmark}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Save bookmark'}
              className={`focus-ring flex items-center gap-1.5 pl-2.5 pr-3 py-2 rounded-full transition-all duration-200 border ${
                isBookmarked
                  ? 'text-violet-200 bg-violet-500/15 border-violet-400/30'
                  : 'text-dark-muted hover:text-white border-white/10 bg-white/5 hover:bg-white/10'
              }`}
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
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </motion.svg>
              <span className="text-xs font-medium">{isBookmarked ? 'Saved' : 'Save'}</span>
            </button>

            {/* Bookmark feedback */}
            <AnimatePresence>
              {showBookmarkFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -44, scale: 1 }}
                  exit={{ opacity: 0, y: -60, scale: 0.8 }}
                  className="absolute bottom-full right-0 glass-strong px-3 py-1.5 rounded-lg text-xs text-white whitespace-nowrap shadow-lg"
                >
                  {isBookmarked ? '✓ Saved to bookmarks' : 'Removed'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Copy / share toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              className="absolute left-1/2 -translate-x-1/2 bottom-24 glass-strong px-4 py-2 rounded-full text-xs font-medium text-white shadow-lg flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Helpers ───

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="focus-ring flex items-center gap-1.5 px-3 py-2 rounded-full text-dark-muted hover:text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

function formatText(text: string): React.ReactNode[] {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    // Inline code
    const codeParts = part.split(/(`[^`]+`)/g)
    if (codeParts.length > 1) {
      return codeParts.map((cp, j) => {
        if (cp.startsWith('`') && cp.endsWith('`')) {
          return (
            <code key={`${i}-${j}`} className="code-text bg-dark-card px-1.5 py-0.5 rounded text-violet-300">
              {cp.slice(1, -1)}
            </code>
          )
        }
        return cp
      })
    }
    // Arrow points
    if (part.startsWith('→ ')) {
      return (
        <span key={i} className="flex items-start gap-2">
          <span className="text-violet-400 mt-1">→</span>
          <span>{part.slice(2)}</span>
        </span>
      )
    }
    // Bullet points
    if (part.startsWith('• ')) {
      return (
        <span key={i} className="flex items-start gap-2">
          <span className="text-dark-muted mt-1">•</span>
          <span>{part.slice(2)}</span>
        </span>
      )
    }
    return part
  })
}

function parseReadTime(readTime: string): number {
  if (readTime.includes('m')) return parseInt(readTime) * 60000
  return parseInt(readTime) * 1000
}
