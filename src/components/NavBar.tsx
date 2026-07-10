'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/lib/ui-store'
import { usePlaxStore } from '@/lib/store'
import { useT } from '@/lib/i18n'

export function NavBar() {
  const { user, signInWithGoogle, signOut, loading } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const language = usePlaxStore((s) => s.language)
  const setLanguage = usePlaxStore((s) => s.setLanguage)
  const { t, lang } = useT()

  return (
    <nav className="lg:hidden absolute top-0 left-0 right-0 z-50 pointer-events-none">
      {/* Solid glass header bar (Inshorts-style fixed chrome) */}
      <div className="glass border-b border-white/[0.06] flex items-center justify-between px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pointer-events-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <img
            src="/plaxlabs_logo.png"
            alt="Plax"
            className="w-7 h-7 rounded-md transition-opacity group-hover:opacity-90"
          />
          <span className="text-base font-bold text-white/90">Plax</span>
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-0.5">
          {/* Feed language toggle — quick EN / हिन्दी switch right in the header */}
          <div className="flex items-center rounded-full bg-white/[0.06] border border-white/10 p-0.5 mr-1">
            {[
              { id: 'en', label: 'EN' },
              { id: 'hi', label: 'हि' },
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => setLanguage(l.id)}
                aria-pressed={language === l.id}
                aria-label={l.id === 'hi' ? 'हिन्दी' : 'English'}
                className={`px-2 py-0.5 rounded-full text-xs font-semibold transition ${
                  language === l.id
                    ? 'bg-[color:var(--signal)] text-[color:var(--signal-ink)]'
                    : 'text-dark-muted hover:text-white'
                } ${l.id === 'hi' ? 'lang-hi' : ''}`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCommandOpen(true)}
            aria-label={t('search')}
            className="p-2 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5"
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <button
            onClick={() => setTopicsOpen(true)}
            aria-label={t('editInterests')}
            className="p-2 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5"
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>

          <Link href="/profile" aria-label={t('bookmarks')} className="p-2 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5">
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </Link>

          {/* User Avatar / Sign In */}
          {!loading && (
            <div className="relative">
              {user ? (
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="ml-0.5 p-0.5"
                >
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="Avatar"
                      className="w-8 h-8 rounded-full ring-1 ring-[color:var(--hair-strong)] hover:ring-[color:var(--signal)] transition"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[color:var(--signal)] flex items-center justify-center transition">
                      <span className="text-sm font-bold text-[color:var(--signal-ink)]">
                        {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className={`px-3.5 py-1.5 bg-[color:var(--signal)] rounded-md text-[color:var(--signal-ink)] text-sm font-semibold hover:bg-[#ffc257] transition ml-1 ${lang === 'hi' ? 'lang-hi' : ''}`}
                >
                  {t('signIn')}
                </button>
              )}

              {/* Dropdown Menu */}
              <AnimatePresence>
                {showMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowMenu(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-12 w-56 bg-dark-card border border-dark-border rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
                    >
                      {user ? (
                        <>
                          <div className="px-4 py-3.5 border-b border-dark-border">
                            <p className="text-sm font-medium truncate">
                              {user.user_metadata?.full_name || user.email?.split('@')[0]}
                            </p>
                            <p className="text-xs text-dark-muted truncate">{user.email}</p>
                          </div>
                          <Link
                            href="/profile"
                            onClick={() => setShowMenu(false)}
                            className="flex items-center gap-3 px-4 py-3.5 text-sm text-dark-text hover:bg-white/5 transition"
                          >
                            <span>👤</span> {t('profileAndStats')}
                          </Link>
                          <button
                            onClick={() => { signOut(); setShowMenu(false) }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-400 hover:bg-white/5 transition"
                          >
                            <span>🚪</span> {t('signOut')}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="px-4 py-3.5 border-b border-dark-border">
                            <p className="text-sm font-medium">{t('signInToSync')}</p>
                            <p className="text-xs text-dark-muted">{t('cloudBenefits')}</p>
                          </div>
                          <button
                            onClick={() => { signInWithGoogle(); setShowMenu(false) }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-dark-text hover:bg-white/5 transition"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            {t('continueWithGoogle')}
                          </button>
                        </>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
