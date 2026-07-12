'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CardData } from '@/lib/sample-data'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

interface CardProps {
  card: CardData
  isActive: boolean
  translating?: boolean
}

// Compact relative time ("just now", "2h ago", "3d ago") for news cards. Returns
// '' when there's no publish time or it's older than a week (not worth showing).
function relativeTimeLabel(publishedAt: number | undefined, hindi: boolean): string {
  if (!publishedAt) return ''
  const diff = Date.now() - publishedAt
  if (diff < 0 || diff > 7 * 24 * 3600 * 1000) return ''
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return hindi ? 'अभी' : 'just now'
  if (mins < 60) return hindi ? `${mins} मिनट पहले` : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hindi ? `${hrs} घंटे पहले` : `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return hindi ? `${days} दिन पहले` : `${days}d ago`
}

export function Card({ card, isActive, translating = false }: CardProps) {
  const { t, tp } = useT()
  const topicMeta = TOPICS.find((t) => t.id === card.category)
  const gradientClass = topicMeta?.color || (card.category === 'general' ? 'from-slate-500 to-slate-600' : 'from-gray-500 to-gray-600')
  const categoryLabel = topicMeta ? tp(card.category, topicMeta.label) : (card.category === 'general' ? tp('general', 'Discover') : card.category === 'news' ? tp('news', 'News') : card.category)
  // Detect Devanagari so the card renders with a proper Hindi font + line-height,
  // independent of the app's language toggle (robust for mixed/partial states).
  const isHindi = /[\u0900-\u097F]/.test(`${card.title || ''} ${card.content || ''}`)
  // Long articles get top-aligned on desktop (avoid a big centered gap on the tall
  // desktop viewport); short cards/quotes stay vertically centered.
  const isLong = (card.content?.length ?? 0) > 360
  // News cards live under the section filter pill bar, so they always top-align
  // (never center — that wastes the tall desktop viewport) and get extra top
  // padding to clear the pills.
  const isNews = card.category === 'news'
  // Relative "2h ago" for time-sensitive news cards (only when a publish time is
  // known and reasonably recent — stale timestamps aren't worth showing).
  const relativeTime = relativeTimeLabel(card.publishedAt, isHindi)
  // "Breaking" for very fresh news (published within the last 30 minutes).
  const isBreaking = !!card.publishedAt && Date.now() - card.publishedAt < 30 * 60 * 1000 && Date.now() - card.publishedAt >= 0

  return (
    <div className={`relative flex flex-col overflow-hidden select-none h-full w-full lg:max-w-3xl lg:mx-auto ${isHindi ? 'lang-hi' : ''}`}>
      {/* Main content area — plain-block scroll container + an inner `min-h-full`
          flex wrapper. Short cards center vertically; long cards top-align and
          ALWAYS scroll from the top so the title is never clipped (a flex scroll
          container with margin:auto/justify-center clips the overflowing top in
          Chrome). Padding clears the navbar (top) + floating action pill (bottom). */}
      <div data-card-scroll className="flex-1 relative z-10 overflow-y-auto hide-scrollbar overscroll-contain">
        <div className={`min-h-full flex flex-col px-6 sm:px-10 lg:px-14 pb-36 lg:pb-28 ${
          isNews
            ? 'justify-start pt-[7.25rem] lg:pt-16'
            : isLong
            ? 'justify-start pt-20 lg:pt-10'
            : 'justify-center pt-20 lg:pt-16'
        }`}>
          <div className="max-w-xl lg:max-w-2xl mx-auto w-full">
            {/* Category + metadata */}
            <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={isActive ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.2 }}
            className="flex items-center flex-wrap gap-2.5 mb-6"
          >
            <CategoryChip category={card.category} label={categoryLabel} emoji={card.emoji} gradientClass={gradientClass} isHindi={isHindi} />
            {isBreaking && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white bg-red-600 px-2 py-1 rounded-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {isHindi ? 'ताज़ा' : 'Breaking'}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-dark-subtle text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {card.readTime}
            </span>
            {relativeTime && (
              <span className="inline-flex items-center gap-1 text-[color:var(--signal)] text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--signal)] animate-pulse" />
                {relativeTime}
              </span>
            )}
          </motion.div>

          {/* Hero image — news cards carry a publisher thumbnail; a subtle framed
              image makes the feed far more visual/premium. Hidden on error. */}
          {card.image && !translating && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={isActive ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.3 }}
              className="mb-6 -mt-1 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.image}
                alt=""
                loading="lazy"
                className="w-full h-44 sm:h-52 lg:h-56 object-cover"
                onError={(e) => { (e.currentTarget.closest('div') as HTMLElement).style.display = 'none' }}
              />
            </motion.div>
          )}

          {/* Title */}
          {translating ? (
            <TranslatingSkeleton lang={isHindi} />
          ) : (
          <>
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
                  className="hover:text-[color:var(--signal)] transition-colors inline-flex items-start gap-2 group"
                >
                  {card.title}
                  <svg className="w-4 h-4 mt-2 flex-shrink-0 text-dark-subtle group-hover:text-[color:var(--signal)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <span className="absolute -left-1 -top-4 text-6xl leading-none text-[color:var(--signal)]/30 font-serif select-none">&ldquo;</span>
                <div className="absolute -left-2 top-2 bottom-2 w-[3px] bg-[color:var(--signal)]" />
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
          </>
          )}

          {/* Actions row — the trigger buttons sit horizontally (wrapping as needed)
              so they take less vertical space, especially on desktop; the expanded
              panels (Go deeper insights / Test yourself quiz) use `basis-full` to
              break onto their own full-width line below the button row. */}
          <div className="mt-7 flex flex-wrap items-start gap-2.5">
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
                className="btn-secondary focus-ring group inline-flex items-center gap-2 px-4 py-2.5 text-sm"
              >
                {t('readFullStory')}
                <svg className="w-4 h-4 text-dark-muted group-hover:text-[color:var(--signal)] group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </motion.a>
            )}

            {/* Go deeper — AI-generated bonus insights on tap */}
            {card.type !== 'quote' && (card.content?.length ?? 0) > 120 && (
              <DeeperSection card={card} isHindi={isHindi} />
            )}

            {/* Test yourself — AI-generated one-question quiz for active recall.
                Skipped for news (a quiz on a breaking headline adds no value). */}
            {card.type !== 'quote' && card.category !== 'news' && (card.content?.length ?? 0) > 160 && (
              <QuizSection card={card} isHindi={isHindi} />
            )}

            {/* More by this author — book cards let a reader discover the author's
                other works with one tap (Open Library). */}
            {card.category === 'books' && card.author && (
              <MoreByAuthor author={card.author} title={card.title || ''} url={card.sourceUrl || ''} isHindi={isHindi} />
            )}
          </div>

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
                      className="text-dark-subtle text-xs hover:text-[color:var(--signal)] transition-colors inline-flex items-center gap-1"
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

// A polished shimmer shown in place of the title + body while the card is being
// translated/enhanced into the active language — so switching language feels
// instant and premium instead of leaving stale wrong-language text on screen.
function TranslatingSkeleton({ lang }: { lang: boolean }) {
  const { t } = useT()
  return (
    <div className="animate-pulse">
      {/* Title shimmer */}
      <div className="space-y-3 mb-7">
        <div className="h-8 sm:h-9 rounded-lg bg-white/[0.07] w-4/5" />
        <div className="h-8 sm:h-9 rounded-lg bg-white/[0.05] w-3/5" />
      </div>
      {/* Body shimmer */}
      <div className="space-y-3.5">
        {[92, 98, 85, 96, 70].map((w, i) => (
          <div key={i} className="h-4 rounded bg-white/[0.045]" style={{ width: `${w}%` }} />
        ))}
      </div>
      {/* Label */}
      <div className={`mt-6 inline-flex items-center gap-2 text-xs text-[color:var(--signal)] ${lang ? 'lang-hi' : ''}`}>
        <span className="w-3.5 h-3.5 border-[1.5px] border-[color:var(--signal)] border-t-transparent rounded-full animate-spin" />
        {t('translating')}
      </div>
    </div>
  )
}

// Interactive category chip on each card. Tapping it opens a dropdown that lets
// the user SWITCH between the topics they follow (tap a topic → filter the feed to
// it) AND remove any of them (× → confirm). If the card's topic isn't followed yet,
// the dropdown offers to add it. So managing + navigating interests is possible
// right from any card (mobile + desktop).
function CategoryChip({
  category,
  label,
  emoji,
  gradientClass,
  isHindi,
}: {
  category: string
  label: string
  emoji?: string
  gradientClass: string
  isHindi: boolean
}) {
  const selectedTopics = usePlaxStore((s) => s.selectedTopics)
  const toggleTopic = usePlaxStore((s) => s.toggleTopic)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const setFeedFilter = useUIStore((s) => s.setFeedFilter)
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const { t, tp } = useT()
  const [open, setOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const isTopic = TOPICS.some((x) => x.id === category) // 'general' is not toggleable
  const isFollowed = selectedTopics.includes(category)

  const close = () => { setOpen(false); setConfirmRemove(null) }

  // Followed topics to list in the switcher, with the current card's topic first.
  const listedTopics = selectedTopics

  const removeTopic = (id: string) => {
    toggleTopic(id)
    if (useUIStore.getState().feedFilter === id) useUIStore.getState().setFeedFilter(null)
    setConfirmRemove(null)
    // If nothing left to show, close.
    if (usePlaxStore.getState().selectedTopics.length === 0) setOpen(false)
  }

  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (isTopic) setOpen((v) => !v)
        }}
        className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider border border-[color:var(--hair-strong)] bg-dark-card text-dark-text hover:border-[color:var(--signal)] transition-colors ${isTopic ? 'cursor-pointer' : 'cursor-default'}`}
        aria-haspopup={isTopic || undefined}
        aria-expanded={open || undefined}
      >
        <span className="text-xs">{emoji}</span> {label}
        {isTopic && (
          <svg className="w-3 h-3 -mr-0.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away layer */}
            <span
              className="fixed inset-0 z-40"
              onClick={(e) => { e.stopPropagation(); close() }}
            />
            <motion.span
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className={`absolute top-full left-0 mt-2 z-50 w-64 rounded-xl bg-dark-card border border-dark-border shadow-2xl shadow-black/60 p-2 normal-case ${isHindi ? 'lang-hi' : ''}`}
            >
              {/* When the card's own topic isn't followed yet → offer to add it. */}
              {isTopic && !isFollowed ? (
                <div className="p-1.5">
                  <p className="text-[13px] text-dark-text mb-3 leading-snug tracking-normal font-normal">
                    {t('addToFeedQ', { x: label })}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleTopic(category); close() }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--signal-ink)] bg-[color:var(--signal)] hover:bg-[#ffc257] transition"
                    >
                      {t('add')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); close() }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-dark-muted bg-white/5 hover:bg-white/10 transition"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-dark-subtle">
                    {t('switchTopic')}
                  </p>

                  {/* All (clear filter) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setFeedFilter(null); close() }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition ${
                      feedFilter === null ? 'bg-[color:var(--signal)]/12 text-white' : 'text-dark-text hover:bg-white/5'
                    }`}
                  >
                    <span className="w-6 text-center">✨</span>
                    <span className="flex-1 font-medium">{t('allTopics')}</span>
                    {feedFilter === null && (
                      <svg className="w-4 h-4 text-[color:var(--signal)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </button>

                  {/* Each followed topic — tap to switch, × to remove */}
                  {listedTopics.map((id) => {
                    const tm = TOPICS.find((x) => x.id === id)
                    if (!tm) return null
                    const active = feedFilter === id
                    const confirming = confirmRemove === id
                    return (
                      <div key={id} className="group flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setFeedFilter(id); close() }}
                          className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition min-w-0 ${
                            active ? 'bg-[color:var(--signal)]/12 text-white' : 'text-dark-text hover:bg-white/5'
                          }`}
                        >
                          <span className="w-6 text-center">{tm.emoji}</span>
                          <span className="flex-1 font-medium truncate">{tp(id, tm.label)}</span>
                          {active && (
                            <svg className="w-4 h-4 text-[color:var(--signal)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </button>
                        {confirming ? (
                          <div className="flex items-center gap-1 pr-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); removeTopic(id) }}
                              aria-label={t('remove')}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-red-500/90 hover:bg-red-500 transition"
                            >
                              {t('remove')}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmRemove(null) }}
                              aria-label={t('cancel')}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-dark-muted bg-white/5 hover:bg-white/10 transition"
                            >
                              {t('cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmRemove(id) }}
                            aria-label={t('remove')}
                            className="p-1.5 rounded-md text-dark-subtle hover:text-red-400 hover:bg-white/5 transition shrink-0"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Explore — opens the full topic selector (same as header filter) */}
                  <div className="mt-1 pt-1 border-t border-dark-border">
                    <button
                      onClick={(e) => { e.stopPropagation(); close(); setTopicsOpen(true) }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm text-dark-text hover:bg-white/5 transition"
                    >
                      <span className="w-6 text-center">
                        <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </span>
                      <span className="flex-1 font-medium">{t('exploreTopics')}</span>
                    </button>
                  </div>
                </>
              )}
            </motion.span>
          </>
        )}
      </AnimatePresence>
    </span>
  )
}

// "Go deeper" — a tap loads 3 AI-generated bonus insights that build on the card,
// so a curious reader can learn more without leaving the feed.
function DeeperSection({ card, isHindi }: { card: CardData; isHindi: boolean }) {
  const { t, lang } = useT()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [insights, setInsights] = useState<string[]>([])

  const load = async () => {
    if (state === 'loading' || state === 'done') return
    setState('loading')
    try {
      const res = await fetch('/api/deeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: card.title, content: card.content, lang }),
      })
      const data = await res.json()
      if (data?.insights?.length) {
        setInsights(data.insights)
        setState('done')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <>
      {state !== 'done' && (
        <button
          onClick={load}
          disabled={state === 'loading'}
          className="focus-ring group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[color:var(--signal)]/10 border border-[color:var(--signal)]/25 text-[color:var(--signal)] text-sm font-medium hover:bg-[color:var(--signal)]/15 transition disabled:opacity-60"
        >
          {state === 'loading' ? (
            <span className="w-4 h-4 border-[1.5px] border-[color:var(--signal)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          {state === 'loading' ? t('deeperLoading') : t('goDeeper')}
        </button>
      )}

      {state === 'error' && (
        <p className="order-last basis-full w-full text-xs text-dark-subtle">{t('deeperError')}</p>
      )}

      <AnimatePresence>
        {state === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`order-last basis-full w-full space-y-2.5 ${isHindi ? 'lang-hi' : ''}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--signal)] mb-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {t('goDeeper')}
            </div>
            {insights.map((ins, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]"
              >
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-md bg-[color:var(--signal)]/20 border border-[color:var(--signal)]/30 text-[color:var(--signal)] text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-sm text-dark-text/90 leading-relaxed">{ins}</p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// "More by this author" — book cards let a reader tap to discover the author's
// other works from Open Library, turning a single book into a reading trail.
function MoreByAuthor({ author, title, url, isHindi }: { author: string; title: string; url: string; isHindi: boolean }) {
  const { t } = useT()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'empty'>('idle')
  const [works, setWorks] = useState<{ title: string; url: string }[]>([])

  const load = async () => {
    if (state === 'loading' || state === 'done') return
    setState('loading')
    try {
      const res = await fetch('/api/author-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, exclude: title, excludeUrl: url }),
      })
      const data = await res.json()
      if (data?.works?.length) {
        setWorks(data.works)
        setState('done')
      } else {
        setState('empty')
      }
    } catch {
      setState('empty')
    }
  }

  if (state === 'empty') return null

  return (
    <>
      {state !== 'done' && (
        <button
          onClick={load}
          disabled={state === 'loading'}
          className="focus-ring group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-[color:var(--hair-strong)] text-dark-text text-sm font-medium hover:border-[color:var(--signal)] hover:bg-white/[0.05] transition disabled:opacity-60"
        >
          {state === 'loading' ? (
            <span className="w-4 h-4 border-[1.5px] border-[color:var(--signal)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          )}
          {state === 'loading' ? t('moreByAuthorLoading') : t('moreByAuthor')}
        </button>
      )}

      <AnimatePresence>
        {state === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`order-last basis-full w-full space-y-2 ${isHindi ? 'lang-hi' : ''}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--signal)] mb-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              {t('moreByAuthor')}
            </div>
            {works.map((w, i) => (
              <motion.a
                key={w.url}
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:border-[color:var(--signal)]/50 transition group"
              >
                <span className="w-5 h-5 shrink-0 rounded-md bg-[color:var(--signal)]/20 border border-[color:var(--signal)]/30 text-[color:var(--signal)] text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm text-dark-text/90 leading-snug flex-1 group-hover:text-[color:var(--signal)] transition-colors">{w.title}</span>
                <svg className="w-3.5 h-3.5 text-dark-subtle group-hover:text-[color:var(--signal)] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </motion.a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// "Test yourself" — a tap builds one AI multiple-choice question from the card so
// the reader actively recalls the key idea instead of passively scrolling past it.
type Quiz = { question: string; options: string[]; correct: number; explanation: string }

function QuizSection({ card, isHindi }: { card: CardData; isHindi: boolean }) {
  const { t, lang } = useT()
  const recordQuizAnswer = usePlaxStore((s) => s.recordQuizAnswer)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [picked, setPicked] = useState<number | null>(null)

  const load = async () => {
    if (state === 'loading' || state === 'ready') return
    setState('loading')
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: card.title, content: card.content, lang }),
      })
      const data = await res.json()
      if (data?.quiz?.options?.length === 4) {
        setQuiz(data.quiz)
        setState('ready')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  // Record the attempt once, on the first answer the user picks for this card.
  const answer = (i: number) => {
    if (picked !== null || !quiz) return
    setPicked(i)
    recordQuizAnswer(i === quiz.correct)
  }

  return (
    <>
      {state !== 'ready' && (
        <button
          onClick={load}
          disabled={state === 'loading'}
          className="focus-ring group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-[color:var(--hair-strong)] text-dark-text text-sm font-medium hover:border-[color:var(--signal)] hover:bg-white/[0.05] transition disabled:opacity-60"
        >
          {state === 'loading' ? (
            <span className="w-4 h-4 border-[1.5px] border-[color:var(--signal)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {state === 'loading' ? t('quizLoading') : t('testYourself')}
        </button>
      )}

      {state === 'error' && (
        <p className="order-last basis-full w-full text-xs text-dark-subtle">{t('quizError')}</p>
      )}

      <AnimatePresence>
        {state === 'ready' && quiz && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`order-last basis-full w-full rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 ${isHindi ? 'lang-hi' : ''}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--signal)] mb-3">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {t('testYourself')}
            </div>
            <p className="text-sm font-medium text-dark-text mb-3 leading-relaxed">{quiz.question}</p>
            <div className="space-y-2">
              {quiz.options.map((opt, i) => {
                const isPicked = picked === i
                const isCorrect = i === quiz.correct
                const answered = picked !== null
                let cls = 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-dark-text/90'
                if (answered && isCorrect) cls = 'border-green-500/50 bg-green-500/15 text-green-100'
                else if (answered && isPicked) cls = 'border-red-500/50 bg-red-500/15 text-red-100'
                else if (answered) cls = 'border-white/[0.06] bg-white/[0.02] text-dark-muted'
                return (
                  <button
                    key={i}
                    disabled={answered}
                    onClick={(e) => { e.stopPropagation(); answer(i) }}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm transition ${cls} disabled:cursor-default`}
                  >
                    <span className="w-5 h-5 shrink-0 rounded-md bg-white/5 border border-white/10 text-[11px] font-bold flex items-center justify-center">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="leading-snug">{opt}</span>
                    {answered && isCorrect && (
                      <svg className="w-4 h-4 ml-auto text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </button>
                )
              })}
            </div>
            <AnimatePresence>
              {picked !== null && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 overflow-hidden"
                >
                  <p className={`text-sm font-semibold ${picked === quiz.correct ? 'text-green-300' : 'text-red-300'}`}>
                    {picked === quiz.correct ? t('quizCorrect') : t('quizWrong')}
                  </p>
                  {quiz.explanation && (
                    <p className="mt-1 text-xs text-dark-subtle leading-relaxed">{quiz.explanation}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function formatText(text: string): React.ReactNode[] {
  // Defensive HTML cleanup — some cached AI outputs / source extracts contain HTML
  // (<p>, <strong>, <em>). Convert emphasis to markdown and strip other tags so a
  // reader never sees literal tags in the body.
  text = text
    .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '**$2**')
    .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$2*')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
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
            <code key={`${i}-${j}`} className="code-text bg-dark-card px-1.5 py-0.5 rounded text-[color:var(--signal)]">
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
          <span className="text-[color:var(--signal)] mt-1">→</span>
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
