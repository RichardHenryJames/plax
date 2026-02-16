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
  const contentRef = useRef<HTMLDivElement>(null)

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
      <div className={`absolute inset-0 bg-gradient-to-b ${gradientClass} opacity-[0.04]`} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 py-24 relative z-10">
        <div className="max-w-xl mx-auto w-full">
          {/* Category + metadata */}
          <motion.div
            initial={{ opacity: 0, x: -5 }}
            animate={isActive ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3 mb-5"
          >
            <span className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-gradient-to-r ${gradientClass} text-white shadow-lg`}>
              {card.emoji} {topicMeta?.label || card.category}
            </span>
            <span className="text-dark-subtle text-xs font-medium">{card.readTime} read</span>
            {card.type !== 'quote' && (
              <span className="text-dark-subtle/60 text-xs capitalize">
                {card.type.replace('-', ' ')}
              </span>
            )}
          </motion.div>

          {/* Title */}
          {card.title && card.type !== 'quote' && (
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={isActive ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-2xl sm:text-[28px] font-bold text-white mb-6 leading-[1.3] tracking-tight"
            >
              {card.title}
            </motion.h1>
          )}

          {/* Content */}
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, y: 8 }}
            animate={isActive ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.05, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {card.type === 'quote' ? (
              <blockquote className="relative py-8">
                <div className="absolute -left-2 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-500 to-cyan-500 rounded-full" />
                <p className="text-2xl sm:text-3xl font-serif italic text-white/90 leading-relaxed pl-6">
                  {card.content}
                </p>
              </blockquote>
            ) : card.type === 'code' ? (
              <div className="space-y-4">
                {card.content.split('\n\n').map((paragraph, i) => {
                  if (paragraph.startsWith('```')) {
                    const code = paragraph.replace(/```\w*\n?/g, '').trim()
                    return (
                      <div key={i} className="bg-dark-card border border-dark-border rounded-xl p-4 overflow-x-auto">
                        <pre className="code-text text-dark-text/90">{code}</pre>
                      </div>
                    )
                  }
                  return (
                    <p key={i} className="reading-text text-dark-text/85 text-[15px] sm:text-base">
                      {formatText(paragraph)}
                    </p>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {card.content.split('\n\n').map((paragraph, i) => (
                  <p
                    key={i}
                    className="reading-text text-dark-text/85 text-[15px] sm:text-base"
                  >
                    {formatText(paragraph)}
                  </p>
                ))}
              </div>
            )}
          </motion.div>

          {/* Author / Source */}
          {(card.author || card.source) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={isActive ? { opacity: 1 } : {}}
              transition={{ delay: 0.4 }}
              className="mt-6 pt-4 border-t border-dark-border/40"
            >
              {card.author && (
                <p className="text-dark-muted text-sm font-medium">— {card.author}</p>
              )}
              {card.source && (
                <p className="text-dark-subtle text-xs mt-1">{card.source}</p>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 gradient-bottom pt-16 pb-6 px-6 z-40">
        <div className="max-w-xl mx-auto flex items-center justify-between">
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
          <div className="flex items-center gap-6">
            <ActionButton
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
              label="Discuss"
              onClick={() => {
                const text = `${card.title || card.content.slice(0, 80)}... — via Plax`
                navigator.clipboard.writeText(text)
                  .then(() => alert('Copied to clipboard!'))
                  .catch(() => {})
              }}
            />
            <ActionButton
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              }
              label="Share"
              onClick={() => {
                const shareData = {
                  title: card.title || 'Plax',
                  text: card.content.slice(0, 200) + '...',
                  url: window.location.origin,
                }
                if (navigator.share) {
                  navigator.share(shareData).catch(() => {})
                } else {
                  navigator.clipboard.writeText(`${card.title || ''} — ${window.location.origin}`)
                    .then(() => alert('Link copied!'))
                    .catch(() => {})
                }
              }}
            />
          </div>

          {/* Right: Bookmark */}
          <div className="relative">
            <button
              onClick={handleBookmark}
              className={`p-2 rounded-full transition-all duration-200 ${
                isBookmarked
                  ? 'text-violet-400 bg-violet-500/10'
                  : 'text-dark-muted hover:text-white'
              }`}
            >
              <svg
                className="w-6 h-6"
                fill={isBookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>

            {/* Bookmark feedback */}
            <AnimatePresence>
              {showBookmarkFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: -40, scale: 1 }}
                  exit={{ opacity: 0, y: -60, scale: 0.8 }}
                  className="absolute bottom-full right-0 bg-dark-card border border-dark-border px-3 py-1.5 rounded-lg text-xs text-white whitespace-nowrap"
                >
                  {isBookmarked ? '✓ Saved' : 'Removed'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ───

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 text-dark-muted hover:text-white transition-colors"
    >
      {icon}
      <span className="text-[10px]">{label}</span>
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
