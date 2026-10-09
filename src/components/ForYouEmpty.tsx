'use client'

import { motion } from 'framer-motion'
import { useAuth } from '@/components/AuthProvider'
import { useUIStore } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

/**
 * What For you shows before the reader has chosen any topics. Reading never needs an account or topics:
 * this tab simply invites a choice, and offers sign-in only to someone who already has an account.
 */
export function ForYouEmpty() {
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const setAccountOpen = useUIStore((s) => s.setAccountOpen)
  const { user } = useAuth()
  const { t, lang } = useT()

  return (
    <div className="feed-container flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex flex-col items-center gap-5 px-6 text-center max-w-sm ${lang === 'hi' ? 'lang-hi' : ''}`}
      >
        <div className="w-16 h-16 rounded-2xl bg-[color:var(--signal)]/15 border border-[color:var(--signal)]/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-[color:var(--signal)]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 3.5l2.6 5.5 5.9.7-4.4 4.1 1.2 5.9L12 16.8l-5.3 2.9 1.2-5.9L3.5 9.7 9.4 9z" />
          </svg>
        </div>
        <div>
          <h2 className="text-white text-2xl font-bold font-display mb-2">{t('forYouTitle')}</h2>
          <p className="text-dark-muted text-sm leading-relaxed">{t('forYouDetail')}</p>
        </div>
        <button onClick={() => setTopicsOpen(true)} className="btn-primary focus-ring px-6 py-3 text-sm">
          {t('chooseTopics')}
        </button>
        {!user && (
          <button
            onClick={() => setAccountOpen(true)}
            className="focus-ring px-5 py-2.5 rounded-xl text-sm font-semibold text-[color:var(--signal)] bg-[color:var(--signal)]/12 hover:bg-[color:var(--signal)]/20 transition"
          >
            {t('haveAccount')}
          </button>
        )}
      </motion.div>
    </div>
  )
}
