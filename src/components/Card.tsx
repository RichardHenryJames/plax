'use client'

import { motion } from 'framer-motion'
import { CardData } from '@/lib/sample-data'
import { TOPICS } from '@/lib/store'

interface CardProps {
  card: CardData
  isActive: boolean
}

export function Card({ card, isActive }: CardProps) {
  const topicMeta = TOPICS.find((t) => t.id === card.category)
  const gradientClass = topicMeta?.color || (card.category === 'general' ? 'from-slate-500 to-slate-600' : 'from-gray-500 to-gray-600')
  const categoryLabel = topicMeta?.label || (card.category === 'general' ? 'Discover' : card.category)
  // Detect Devanagari so the card renders with a proper Hindi font + line-height,
  // independent of the app's language toggle (robust for mixed/partial states).
  const isHindi = /[\u0900-\u097F]/.test(`${card.title || ''} ${card.content || ''}`)

  return (
    <div className={`relative flex flex-col overflow-hidden select-none h-full w-full lg:h-[86vh] lg:max-h-[880px] lg:max-w-3xl lg:mx-auto lg:rounded-[28px] lg:border lg:border-white/[0.08] lg:bg-[#0f0f15] lg:shadow-2xl lg:shadow-black/60 ${isHindi ? 'lang-hi' : ''}`}>      {/* Desktop panel sheen */}
      <div className="hidden lg:block absolute inset-0 rounded-[28px] pointer-events-none bg-[radial-gradient(130%_85%_at_50%_0%,rgba(139,92,246,0.08),transparent_55%)]" />
      {/* Background glow */}
      <div className={`absolute inset-0 bg-gradient-to-b ${gradientClass} opacity-[0.05]`} />
      {/* Top category accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${gradientClass} opacity-70 z-10`} />

      {/* Main content area — plain-block scroll container + an inner `min-h-full`
          flex wrapper. Short cards center vertically; long cards top-align and
          ALWAYS scroll from the top so the title is never clipped (a flex scroll
          container with margin:auto/justify-center clips the overflowing top in
          Chrome). Padding clears the navbar (top) + floating action pill (bottom). */}
      <div data-card-scroll className="flex-1 relative z-10 overflow-y-auto hide-scrollbar overscroll-contain">
        <div className="min-h-full flex flex-col justify-center px-6 sm:px-10 lg:px-14 pt-20 pb-28 lg:pt-16 lg:pb-24">
          <div className="max-w-xl lg:max-w-2xl mx-auto w-full">
            {/* Category + metadata */}
            <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={isActive ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.2 }}
            className="flex items-center flex-wrap gap-2.5 mb-6"
          >
            <span className={`inline-flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-gradient-to-r ${gradientClass} text-white shadow-lg`}>
              <span className="text-xs">{card.emoji}</span> {categoryLabel}
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

          {/* Read full story CTA */}
          {card.sourceUrl && card.type !== 'quote' && (
            <motion.a
              href={card.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 8 }}
              animate={isActive ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.28 }}
              className="btn-secondary focus-ring group mt-7 inline-flex items-center gap-2 px-4 py-2.5 text-sm"
            >
              Read full story
              <svg className="w-4 h-4 text-dark-muted group-hover:text-violet-300 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </motion.a>
          )}

          {/* Author / Source credibility */}
          {(card.author || card.source) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={isActive ? { opacity: 1 } : {}}
              transition={{ delay: 0.35 }}
              className="mt-5 pt-4 border-t border-dark-border/50 flex items-center gap-2.5"
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
      </div>
    </div>
  )
}

function formatText(text: string): React.ReactNode[] {
  // Bold (**x**) and italic (*x*) — split on both so single asterisks used by the
  // AI (common in Hindi output) render as emphasis instead of literal '*'.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic text-white/90">
          {part.slice(1, -1)}
        </em>
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
