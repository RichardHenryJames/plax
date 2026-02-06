'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'

export function Onboarding() {
  const { selectedTopics, toggleTopic, setOnboarded } = usePlaxStore()
  const [step, setStep] = useState(0)

  const canProceed = selectedTopics.length >= 3

  return (
    <div className="fixed inset-0 bg-dark-bg z-50 flex items-center justify-center">
      {/* Subtle animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 text-center px-6 max-w-md"
          >
            {/* Logo */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="w-20 h-20 mx-auto mb-8 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-2xl flex items-center justify-center glow-accent"
            >
              <span className="text-white font-bold text-3xl">P</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-4xl font-bold text-white mb-3"
            >
              Welcome to Plax
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-dark-muted text-lg mb-2"
            >
              Swipe through knowledge.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-dark-subtle text-sm mb-12"
            >
              Bite-sized insights from science, philosophy, history, and more — personalized for you.
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              onClick={() => setStep(1)}
              className="px-8 py-4 bg-gradient-to-r from-violet-500 to-cyan-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity glow-accent text-lg"
            >
              Get Started
            </motion.button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="topics"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-lg px-6"
          >
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              What are you curious about?
            </h2>
            <p className="text-dark-muted text-center mb-2">
              Pick at least 3 topics. We&apos;ll personalize your feed.
            </p>
            <p className="text-dark-subtle text-xs text-center mb-8">
              You can always change these later.
            </p>

            {/* Topic grid */}
            <div className="grid grid-cols-2 gap-3 mb-8 max-h-[55vh] overflow-y-auto hide-scrollbar pr-1">
              {TOPICS.map((topic, i) => {
                const isSelected = selectedTopics.includes(topic.id)
                return (
                  <motion.button
                    key={topic.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    onClick={() => toggleTopic(topic.id)}
                    className={`topic-chip flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? `border-violet-500/50 bg-violet-500/10 selected`
                        : 'border-dark-border bg-dark-card hover:border-dark-subtle'
                    }`}
                  >
                    <span className="text-2xl">{topic.emoji}</span>
                    <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-dark-muted'}`}>
                      {topic.label}
                    </span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-auto w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.div>
                    )}
                  </motion.button>
                )
              })}
            </div>

            {/* Continue button */}
            <div className="flex flex-col items-center gap-2">
              <motion.button
                animate={{ opacity: canProceed ? 1 : 0.4 }}
                onClick={() => {
                  if (canProceed) {
                    setOnboarded()
                  }
                }}
                disabled={!canProceed}
                className="w-full py-4 bg-gradient-to-r from-violet-500 to-cyan-500 text-white font-semibold rounded-xl transition-opacity glow-accent text-lg disabled:cursor-not-allowed"
              >
                Start Reading →
              </motion.button>
              <span className="text-dark-subtle text-xs">
                {selectedTopics.length}/3 minimum selected
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
