'use client'

import { motion } from 'framer-motion'
import { useT } from '@/lib/i18n'

/**
 * Shown after the last new story: the reader has seen everything for now. It offers the two ways forward the
 * Android app does: look for newer stories, or go back over the ones already read.
 */
export function CaughtUp({
  earlier,
  checking,
  onCheck,
  onEarlier,
}: {
  earlier: number
  checking: boolean
  onCheck: () => void
  onEarlier: () => void
}) {
  const { t, lang } = useT()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center ${lang === 'hi' ? 'lang-hi' : ''}`}
    >
      <div className="w-20 h-20 rounded-full bg-[color:var(--signal)]/15 flex items-center justify-center" aria-hidden>
        <svg className="w-10 h-10 text-[color:var(--signal)]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l3 3 5-6" />
        </svg>
      </div>
      <div className="max-w-sm">
        <h2 className="text-white text-2xl font-bold font-display mb-2">{t('caughtUp')}</h2>
        <p className="text-dark-muted text-sm leading-relaxed">{t('caughtUpDetail')}</p>
      </div>
      <div className="flex flex-col items-stretch gap-2.5 w-full max-w-xs">
        <button onClick={onCheck} disabled={checking} className="btn-primary focus-ring px-6 py-3 text-sm">
          {t('checkNew')}
        </button>
        {earlier > 0 && (
          <button
            onClick={onEarlier}
            className="focus-ring px-6 py-3 rounded-xl text-sm font-semibold text-[color:var(--signal)] bg-[color:var(--signal)]/12 hover:bg-[color:var(--signal)]/20 transition"
          >
            {earlier === 1 ? t('readEarlierOne') : t('readEarlier', { x: String(earlier) })}
          </button>
        )}
      </div>
    </motion.div>
  )
}
