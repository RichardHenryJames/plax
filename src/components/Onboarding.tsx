'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useT } from '@/lib/i18n'

const VALUE_KEYS = ['valueProp1', 'valueProp2', 'valueProp3']

export function Onboarding() {
  const { selectedTopics, toggleTopic, setOnboarded } = usePlaxStore()
  const { t, tp, lang } = useT()
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')
  const year = new Date().getFullYear()

  const canProceed = selectedTopics.length >= 3
  const progress = Math.min(selectedTopics.length / 3, 1)

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOPICS
    return TOPICS.filter(
      (topic) => topic.label.toLowerCase().includes(q) || tp(topic.id, topic.label).toLowerCase().includes(q)
    )
  }, [query, tp])

  const hi = lang === 'hi' ? 'lang-hi' : ''

  return (
    <div className="fixed inset-0 z-50 bg-dark-bg overflow-hidden">
      <AnimatePresence mode="wait">
        {/* ─────────────────────────  STEP 0 — EDITORIAL COVER  ───────────────────────── */}
        {step === 0 && (
          <motion.div
            key="cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: 0.4 }}
            className="h-full w-full grid grid-cols-1 lg:grid-cols-12"
          >
            {/* LEFT — dark cover (asymmetric 7/12) */}
            <div className="lg:col-span-7 h-full flex flex-col justify-between px-6 sm:px-10 lg:px-14 py-8 lg:py-10 min-h-0 overflow-y-auto hide-scrollbar">
              {/* Masthead row */}
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <img src="/plaxlabs_logo.png" alt="Plax" className="w-7 h-7 rounded-md" />
                  <span className="text-[15px] font-bold tracking-tight text-white">Plax</span>
                </div>
                <span className="eyebrow eyebrow--bare text-dark-subtle hidden sm:inline-flex">
                  Issue · {year}
                </span>
              </div>

              {/* Headline block */}
              <div className="py-10 lg:py-0">
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={`eyebrow ${hi}`}
                >
                  {t('yourDailyKnowledgeFeed')}
                </motion.span>

                <motion.h1
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className={`display-serif text-white mt-6 text-[clamp(2.9rem,7.5vw,5.6rem)] ${hi}`}
                >
                  {t('becomeSmarter')}
                  <br />
                  <em>{t('oneSwipeAtATime')}</em>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className={`mt-7 max-w-md text-[15px] leading-relaxed text-dark-muted ${hi}`}
                >
                  {t('onboardingSub')}
                </motion.p>
              </div>

              {/* Value props — numbered editorial list (no icon boxes) + CTA */}
              <div className="shrink-0">
                <ul className="mb-9 max-w-md">
                  {VALUE_KEYS.map((k, i) => (
                    <motion.li
                      key={k}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + i * 0.08 }}
                      className="rule-index pt-3 pb-3 pl-9"
                      data-i={`0${i + 1}`}
                    >
                      <span className={`text-[15px] text-dark-text/90 ${hi}`}>{t(k)}</span>
                    </motion.li>
                  ))}
                  <li className="border-t border-[color:var(--hair)]" />
                </ul>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="flex flex-wrap items-center gap-x-6 gap-y-3"
                >
                  <button onClick={() => setStep(1)} className={`btn-signal focus-ring ${hi}`}>
                    {t('getStarted')}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                  <span className={`eyebrow eyebrow--bare text-dark-subtle ${hi}`}>{t('freeNoAccount')}</span>
                </motion.div>

                <p className={`mt-6 text-sm text-dark-muted ${hi}`}>
                  {t('or')}{' '}
                  <Link href="/topics" className="link-ed text-white font-medium">
                    {t('exploreAllTopics')}
                  </Link>
                </p>
              </div>
            </div>

            {/* RIGHT — warm PAPER contents panel (mixes a light surface into the dark cover) */}
            <motion.aside
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="surface-paper relative hidden lg:flex lg:col-span-5 h-full flex-col justify-between px-12 py-12 border-l border-black/10 overflow-hidden"
            >
              <div>
                <span className="eyebrow eyebrow--bare" style={{ color: 'var(--paper-ink)', opacity: 0.55 }}>
                  In this feed
                </span>
                <ol className="mt-6">
                  {TOPICS.slice(0, 8).map((topic, i) => (
                    <li
                      key={topic.id}
                      className="flex items-baseline gap-4 py-[0.55rem] border-t border-black/10 first:border-t-0"
                    >
                      <span className="font-mono text-[0.72rem] tracking-wider" style={{ color: 'var(--signal-deep)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`display-serif text-[1.5rem] leading-none ${hi}`}
                        style={{ color: 'var(--paper-ink)' }}
                      >
                        {tp(topic.id, topic.label)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Oversized stat — a memorable typographic moment */}
              <div className="relative">
                <div className="flex items-end gap-4">
                  <span
                    className="display-serif leading-[0.8] text-[7rem]"
                    style={{ color: 'var(--signal-deep)' }}
                  >
                    5
                  </span>
                  <div className="pb-3">
                    <div className="font-mono text-[0.7rem] uppercase tracking-[0.2em]" style={{ color: 'var(--paper-ink)' }}>
                      minutes
                    </div>
                    <div className="text-sm max-w-[9rem] mt-1" style={{ color: 'rgba(26,23,18,0.62)' }}>
                      a day is all it takes to get sharper.
                    </div>
                  </div>
                </div>
              </div>

              {/* Corner index detail */}
              <span
                className="absolute top-10 right-12 font-mono text-[0.7rem] tracking-[0.2em]"
                style={{ color: 'rgba(26,23,18,0.4)' }}
              >
                PLX—{year}
              </span>
            </motion.aside>
          </motion.div>
        )}

        {/* ─────────────────────────  STEP 1 — CONTENTS / TOPIC PICK  ───────────────────────── */}
        {step === 1 && (
          <motion.div
            key="pick"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.35 }}
            className="h-full w-full flex flex-col"
          >
            {/* Header band */}
            <div className="px-6 sm:px-10 lg:px-14 pt-8 pb-5 border-b border-[color:var(--hair)] shrink-0">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => setStep(0)}
                  className={`eyebrow eyebrow--bare text-dark-subtle hover:text-white transition-colors ${hi}`}
                >
                  ← Plax
                </button>
                <span className="eyebrow eyebrow--bare text-dark-subtle">Step 02 / 02</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-5 lg:gap-x-10 items-end">
                <div className="lg:col-span-8">
                  <span className={`eyebrow ${hi}`}>Build your feed</span>
                  <h2 className={`display-serif text-white mt-4 text-[clamp(2rem,4.6vw,3.4rem)] ${hi}`}>
                    {t('whatAreYouCurious')}
                  </h2>
                </div>
                <div className="lg:col-span-4 lg:pb-2">
                  <p className={`text-dark-muted text-[14px] leading-relaxed ${hi}`}>{t('pickAtLeast3')}</p>
                  {/* Search */}
                  <div className="relative mt-4">
                    <svg className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('searchTopics')}
                      className={`w-full pl-7 pr-3 py-2 bg-transparent border-b border-[color:var(--hair-strong)] text-white placeholder:text-dark-subtle text-sm outline-none focus:border-[color:var(--signal)] transition-colors ${hi}`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Topic INDEX — numbered editorial rows in 2 columns (not identical chips) */}
            <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar px-6 sm:px-10 lg:px-14 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:gap-x-14">
                {filteredTopics.map((topic, i) => {
                  const isSelected = selectedTopics.includes(topic.id)
                  const ordinal = String(i + 1).padStart(2, '0')
                  return (
                    <button
                      key={topic.id}
                      onClick={() => toggleTopic(topic.id)}
                      aria-pressed={isSelected}
                      className="index-row group flex items-center gap-4 py-4 pr-2 text-left"
                    >
                      <span className="index-num text-[0.75rem] w-6 shrink-0">{ordinal}</span>
                      <span className="text-xl shrink-0 grayscale-[0.15] group-hover:grayscale-0 transition-[filter]">
                        {topic.emoji}
                      </span>
                      <span
                        className={`display-serif text-[1.55rem] leading-none flex-1 transition-colors ${
                          isSelected ? 'text-white' : 'text-dark-muted group-hover:text-white'
                        } ${hi}`}
                      >
                        {tp(topic.id, topic.label)}
                      </span>
                      {/* Editorial toggle — a marigold square that fills when selected */}
                      <span
                        className={`shrink-0 w-6 h-6 border flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-[color:var(--signal)] border-[color:var(--signal-deep)]'
                            : 'border-[color:var(--hair-strong)] group-hover:border-[color:var(--signal)]'
                        }`}
                      >
                        <AnimatePresence>
                          {isSelected && (
                            <motion.svg
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              className="w-3.5 h-3.5"
                              style={{ color: 'var(--signal-ink)' }}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </motion.svg>
                          )}
                        </AnimatePresence>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Footer — progress + CTA (marigold, no gradients) */}
            <div className="shrink-0 border-t border-[color:var(--hair)] px-6 sm:px-10 lg:px-14 py-5">
              <div className="flex items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`eyebrow eyebrow--bare text-dark-muted ${hi}`}>
                      {selectedTopics.length} {t('selected')}
                      {!canProceed && (
                        <span className="text-dark-subtle">
                          {' '}
                          · {3 - selectedTopics.length} {t('moreToContinue')}
                        </span>
                      )}
                    </span>
                    {canProceed && (
                      <span className={`eyebrow eyebrow--bare ${hi}`} style={{ color: 'var(--signal)' }}>
                        {t('readyCheck')}
                      </span>
                    )}
                  </div>
                  <div className="h-[3px] w-full bg-[color:var(--hair)] overflow-hidden">
                    <motion.div
                      className="h-full"
                      style={{ background: 'var(--signal)' }}
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => canProceed && setOnboarded()}
                  disabled={!canProceed}
                  className={`btn-signal focus-ring shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${hi}`}
                >
                  {t('startReading')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
