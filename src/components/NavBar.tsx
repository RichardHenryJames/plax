'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function NavBar() {
  const { user, signInWithGoogle, signInWithGithub, signOut, loading } = useAuth()
  const [showMenu, setShowMenu] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 gradient-top pointer-events-none">
      <div className="flex items-center justify-between px-5 py-4 pointer-events-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <img
            src="/plaxlabs_logo.png"
            alt="Plax"
            className="w-8 h-8 rounded-lg group-hover:shadow-lg group-hover:shadow-violet-500/20 transition-shadow"
          />
          <span className="text-lg font-bold text-white/90">Plax</span>
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button className="p-3 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <Link href="/profile" className="p-3 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </Link>

          {/* User Avatar / Sign In */}
          {!loading && (
            <div className="relative">
              {user ? (
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="ml-1 p-1"
                >
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="Avatar"
                      className="w-10 h-10 rounded-full ring-2 ring-violet-500/30 hover:ring-violet-500/60 transition"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center hover:shadow-lg hover:shadow-violet-500/20 transition">
                      <span className="text-base font-bold text-white">
                        {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="px-4 py-2 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-xl text-white text-sm font-semibold hover:shadow-lg hover:shadow-violet-500/20 transition ml-1"
                >
                  Sign in
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
                            <span>👤</span> Profile & Stats
                          </Link>
                          <button
                            onClick={() => { signOut(); setShowMenu(false) }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-400 hover:bg-white/5 transition"
                          >
                            <span>🚪</span> Sign Out
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="px-4 py-3.5 border-b border-dark-border">
                            <p className="text-sm font-medium">Sign in to sync</p>
                            <p className="text-xs text-dark-muted">Cloud bookmarks, streaks & more</p>
                          </div>
                          <button
                            onClick={() => { signInWithGoogle(); setShowMenu(false) }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-dark-text hover:bg-white/5 transition"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            Continue with Google
                          </button>
                          <button
                            onClick={() => { signInWithGithub(); setShowMenu(false) }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-dark-text hover:bg-white/5 transition"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                            Continue with GitHub
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
