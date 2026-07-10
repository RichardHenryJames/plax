'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useT } from '@/lib/i18n'

const VALUE_PROPS = [
  { icon: '🧠', key: 'valueProp1' },
  { icon: '✨', key: 'valueProp2' },
  { icon: '🎯', key: 'valueProp3' },
]

export function Onboarding() {
  const { selectedTopics, toggleTopic, setOnboarded } = usePlaxStore()
  const { t, tp, lang } = useT()
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')

  const canProceed = selectedTopics.length >= 3
  const progress = Math.min(selectedTopics.length / 3, 1)

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOPICS
    return TOPICS.filter((topic) => topic.label.toLowerCase().includes(q) || tp(topic.id, topic.label).toLowerCase().includes(q))
  }, [query, tp])

  return (
    <div className="fixed inset-0 bg-dark-bg z-50 flex items-center justify-center">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[15%] -left-40 w-[28rem] h-[28rem] bg-violet-500/10 rounded-full blur-[120px] animate-float-slow" />
        <div className="absolute bottom-[10%] -right-40 w-[28rem] h-[28rem] bg-cyan-500/10 rounded-full blur-[120px] animate-float-slow" style={{ animationDelay: '2s' }} />
      </div>

      <AnimatePresence mode="popLayout">
        {step === 0 && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 text-center px-6 max-w-md"
          >
            {/* Logo */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="w-[76px] h-[76px] mx-auto mb-8 relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-[22px] blur-xl opacity-40" />
              <img
                src="/plaxlabs_logo.png"
                alt="Plax"
                className="relative w-[76px] h-[76px] rounded-[22px] shadow-2xl"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-dark-muted"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('yourDailyKnowledgeFeed')}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-[2.6rem] leading-[1.05] font-bold text-white mb-4 font-display"
            >
              {t('becomeSmarter')}
              <br />
              <span className="text-gradient">{t('oneSwipeAtATime')}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-dark-muted text-[15px] leading-relaxed mb-8 max-w-sm mx-auto"
            >
              {t('onboardingSub')}
            </motion.p>

            {/* Value props */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col gap-2.5 mb-10 text-left max-w-xs mx-auto"
            >
              {VALUE_PROPS.map((v, i) => (
                <motion.div
                  key={v.key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.65 + i * 0.08 }}
                  className={`flex items-center gap-3 text-sm text-dark-text/90 ${lang === 'hi' ? 'lang-hi' : ''}`}
                >
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-base">
                    {v.icon}
                  </span>
                  {t(v.key)}
                </motion.div>
              ))}
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              onClick={() => setStep(1)}
              className="btn-primary focus-ring w-full py-4 text-[15px]"
            >
              {t('getStarted')}
            </motion.button>
            <p className="text-dark-subtle text-xs mt-4">{t('freeNoAccount')}</p>
            {/* Crawlable link so search engines discover the topic hub from the homepage */}
            <p className="mt-6 text-sm text-dark-muted">
              {t('or')}{' '}
              <Link href="/topics" className="text-violet-400 hover:text-violet-300 underline underline-offset-4 transition-colors">
                {t('exploreAllTopics')}
              </Link>
            </p>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="topics"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-2xl px-6 flex flex-col max-h-[100dvh] py-8"
          >
            <div className="text-center mb-6">
              <h2 className={`text-2xl sm:text-3xl font-bold text-white mb-2 font-display ${lang === 'hi' ? 'lang-hi' : ''}`}>
                {t('whatAreYouCurious')}
              </h2>
              <p className={`text-dark-muted text-[15px] ${lang === 'hi' ? 'lang-hi' : ''}`}>
                {t('pickAtLeast3')}
              </p>
            </div>

            {/* Search */}
            <div className="relative mb-5 max-w-md mx-auto w-full">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchTopics')}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-card border border-dark-border text-white placeholder:text-dark-subtle text-sm outline-none focus:border-violet-500/50 focus-ring transition-colors"
              />
            </div>

            {/* Topic grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto thin-scrollbar pr-1 pb-2 -mx-1 px-1">
              {filteredTopics.map((topic, i) => {
                const isSelected = selectedTopics.includes(topic.id)
                return (
                  <motion.button
                    key={topic.id}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.025, 0.4), duration: 0.3 }}
                    onClick={() => toggleTopic(topic.id)}
                    aria-pressed={isSelected}
                    className={`topic-chip focus-ring relative flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left ${
                      isSelected
                        ? 'border-violet-500/60 bg-violet-500/12 selected'
                        : 'border-dark-border bg-dark-card hover:bg-dark-card-hover'
                    }`}
                  >
                    <span className="text-xl shrink-0">{topic.emoji}</span>
                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-dark-muted'} ${lang === 'hi' ? 'lang-hi' : ''}`}>
                      {tp(topic.id, topic.label)}
                    </span>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.span
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="ml-auto shrink-0 w-4 h-4 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-full flex items-center justify-center"
                        >
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                          </svg>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )
              })}
            </div>

            {/* Footer: progress + CTA */}
            <div className="pt-5 mt-auto">
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className={`text-dark-muted ${lang === 'hi' ? 'lang-hi' : ''}`}>
                  {selectedTopics.length} {t('selected')}
                  {!canProceed && <span className="text-dark-subtle"> · {3 - selectedTopics.length} {t('moreToContinue')}</span>}
                </span>
                {canProceed && <span className={`text-emerald-400 font-medium ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('readyCheck')}</span>}
              </div>
              <div className="h-1 w-full rounded-full bg-dark-border overflow-hidden mb-4">
                <motion.div
                  className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <button
                onClick={() => canProceed && setOnboarded()}
                disabled={!canProceed}
                className={`btn-primary focus-ring w-full py-4 text-[15px] ${lang === 'hi' ? 'lang-hi' : ''}`}
              >
                {t('startReading')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
