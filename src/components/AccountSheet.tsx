'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/components/AuthProvider'
import { useUIStore } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

/**
 * The optional account, as in the Android app's Account sheet: what signing in does, how to do it, and how to
 * leave again. Plax works fully without it; signing in only keeps the reader's topics and saved stories in
 * their account so they follow them to another device.
 */
export function AccountSheet() {
  const open = useUIStore((s) => s.accountOpen)
  const setOpen = useUIStore((s) => s.setAccountOpen)
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const { user, loading, signInWithGoogle, signOut } = useAuth()
  const { t, lang } = useT()
  const [checking, setChecking] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const close = () => {
    setOpen(false)
    setUnavailable(false)
    setChecking(false)
  }

  const signIn = async () => {
    setChecking(true)
    setUnavailable(false)
    const result = await signInWithGoogle()
    // On success the browser is already on its way to Google; only a failure comes back here.
    if (result === 'unavailable') {
      setUnavailable(true)
      setChecking(false)
    }
  }

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  const hi = lang === 'hi' ? 'lang-hi' : ''

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={t('accountTitle')}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`relative z-10 w-full sm:max-w-md bg-dark-bg sm:bg-dark-card border-t sm:border border-dark-border sm:rounded-2xl rounded-t-2xl shadow-2xl shadow-black/60 ${hi}`}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-dark-border">
              <h2 className="text-lg font-bold text-white font-display">{t('accountTitle')}</h2>
              <button
                onClick={close}
                aria-label={t('close')}
                className="p-2 text-dark-muted hover:text-white rounded-full hover:bg-white/5 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              {user ? (
                <>
                  <div className="flex items-center gap-3">
                    {user.user_metadata?.avatar_url ? (
                      <img src={user.user_metadata.avatar_url} alt="" className="w-11 h-11 rounded-full ring-1 ring-[color:var(--hair-strong)]" />
                    ) : (
                      <span className="w-11 h-11 rounded-full bg-[color:var(--signal)] flex items-center justify-center text-base font-bold text-[color:var(--signal-ink)]">
                        {(name || 'U')[0].toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-white truncate" aria-live="polite">{t('signedInAs', { x: name })}</p>
                      <p className="text-xs text-dark-muted truncate">{user.email}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-dark-muted leading-relaxed">{t('signedInDetail')}</p>
                  <div className="mt-5 flex flex-col gap-2.5">
                    <button
                      onClick={() => { close(); setTopicsOpen(true) }}
                      className="focus-ring w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-white transition"
                    >
                      {t('topicsCardTitle')}
                    </button>
                    <Link
                      href="/profile"
                      onClick={close}
                      className="focus-ring w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-white text-center transition"
                    >
                      {t('accountOpenProfile')}
                    </Link>
                    <button
                      onClick={() => { signOut(); close() }}
                      className="focus-ring w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-red-400 transition"
                    >
                      {t('signOut')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[15px] text-white leading-relaxed">{t('accountIntro')}</p>
                  <p className="mt-3 text-[13px] text-dark-muted leading-relaxed">{t('accountUploadNote')}</p>
                  <button
                    onClick={signIn}
                    disabled={checking || loading}
                    className="focus-ring mt-5 w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 disabled:opacity-60 transition"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    {checking ? t('accountChecking') : t('continueWithGoogle')}
                  </button>
                  {unavailable && (
                    <p role="status" className="mt-4 rounded-xl bg-white/5 px-3.5 py-3 text-[13px] text-white leading-relaxed">
                      {t('accountUnavailable')}
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
