'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { useUIStore } from '@/lib/ui-store'
import { usePlaxStore } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { withBase } from '@/lib/base-path'

/**
 * Phone header, as in the Android app: logo, English | हिन्दी, then the few actions that matter. Topics and
 * saved stories moved to the tabs at the bottom; the account is one quiet button, never a gate.
 */
export function NavBar() {
  const { user, loading } = useAuth()
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const setAccountOpen = useUIStore((s) => s.setAccountOpen)
  const requestRefresh = useUIStore((s) => s.requestRefresh)
  const language = usePlaxStore((s) => s.language)
  const setLanguage = usePlaxStore((s) => s.setLanguage)
  const theme = usePlaxStore((s) => s.theme)
  const toggleTheme = usePlaxStore((s) => s.toggleTheme)
  const { t } = useT()

  return (
    <nav className="lg:hidden absolute top-0 left-0 right-0 z-50 pointer-events-none">
      {/* Solid glass header bar (Inshorts-style fixed chrome) */}
      <div className="glass border-b border-white/[0.06] flex items-center justify-between px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pointer-events-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="brand-badge rounded-md transition-opacity group-hover:opacity-90">
            <img
              src={withBase('/plaxlabs_logo.png')}
              alt="Plax"
              className="w-7 h-7 rounded-md"
            />
          </span>
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

          {/* Theme toggle — dark ⇄ light, mirrors the EN/हि pill placement */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? t('themeDark') : t('themeLight')}
            aria-pressed={theme === 'light'}
            className="p-2 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5 mr-0.5"
          >
            {theme === 'light' ? (
              <svg className="w-[21px] h-[21px]" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
            ) : (
              <svg className="w-[21px] h-[21px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            )}
          </button>

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
            onClick={requestRefresh}
            aria-label={t('refresh')}
            className="p-2 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5"
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5" />
            </svg>
          </button>

          {/* Account: one quiet button. It opens the same optional sheet as the app's Account screen. */}
          {!loading && (
            <button
              onClick={() => setAccountOpen(true)}
              aria-label={t('account')}
              className="ml-0.5 p-0.5 rounded-full hover:bg-white/5 transition"
            >
              {user ? (
                user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt=""
                    className="w-8 h-8 rounded-full ring-1 ring-[color:var(--hair-strong)] hover:ring-[color:var(--signal)] transition"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-[color:var(--signal)] flex items-center justify-center text-sm font-bold text-[color:var(--signal-ink)]">
                    {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                  </span>
                )
              ) : (
                <span className="flex w-8 h-8 items-center justify-center text-dark-muted hover:text-white transition-colors">
                  <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M12 4a4 4 0 100 8 4 4 0 000-8zM4.5 20a7.5 7.5 0 0115 0" />
                  </svg>
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
