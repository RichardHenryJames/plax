'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useAuth } from '@/components/AuthProvider'
import { useT } from '@/lib/i18n'

/**
 * LeftRail — persistent desktop navigation (hidden on mobile, where NavBar is used).
 * Logo · search · nav · topic filters · auth.
 */
export function LeftRail() {
  const selectedTopics = usePlaxStore((s) => s.selectedTopics)
  const bookmarkedIds = usePlaxStore((s) => s.bookmarkedIds)
  const toggleTopic = usePlaxStore((s) => s.toggleTopic)
  const language = usePlaxStore((s) => s.language)
  const setLanguage = usePlaxStore((s) => s.setLanguage)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const setFeedFilter = useUIStore((s) => s.setFeedFilter)
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const { user, signInWithGoogle, signOut } = useAuth()
  const { t, tp, lang } = useT()

  const topics = TOPICS.filter((t) => selectedTopics.includes(t.id))

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-full border-r border-dark-border bg-dark-card/30 backdrop-blur-xl overflow-y-auto overscroll-contain thin-scrollbar">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <img
            src="/plaxlabs_logo.png"
            alt="Plax"
            className="w-9 h-9 rounded-xl group-hover:shadow-lg group-hover:shadow-violet-500/20 transition-shadow"
          />
          <span className="text-xl font-bold text-white/90">Plax</span>
        </Link>
      </div>

      {/* Search / command palette trigger */}
      <div className="px-2 mb-3">
        <button
          onClick={() => setCommandOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-dark-bg/60 border border-dark-border text-dark-muted hover:text-white hover:border-dark-subtle transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="flex-1 text-left">{t('search')}</span>
          <kbd className="text-[10px] font-medium text-dark-subtle bg-dark-card border border-dark-border rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
      </div>

      {/* Primary nav */}
      <nav className="px-2 space-y-0.5">
        <NavItem
          href="/"
          active={feedFilter === null}
          onClick={() => setFeedFilter(null)}
          label={t('forYou')}
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          }
        />
        <NavItem
          href="/profile"
          label={t('bookmarks')}
          badge={bookmarkedIds.length || undefined}
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />}
        />
        <NavItem
          href="/topics"
          label={t('exploreTopics')}
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM17.25 3.75a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM13.5 16.5a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0z" />}
        />
        <NavItem
          href="/profile"
          label={t('profileStats')}
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 0115 0" />}
        />
      </nav>

      {/* Language switcher (desktop parity with the mobile tune-icon editor) */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wider text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('feedLanguage')}</span>
        </div>
        <div className="inline-flex w-full p-0.5 rounded-lg bg-dark-bg/60 border border-dark-border">
          {[
            { id: 'en', label: 'English' },
            { id: 'hi', label: 'हिन्दी' },
          ].map((l) => (
            <button
              key={l.id}
              onClick={() => setLanguage(l.id)}
              aria-pressed={language === l.id}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
                language === l.id
                  ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow'
                  : 'text-dark-muted hover:text-white'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topic filters */}
      <div className="mt-6 px-2 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-3 mb-2.5">
          <span className={`text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>{t('yourTopics')}</span>
          <button
            onClick={() => setTopicsOpen(true)}
            className={`text-[11px] text-violet-400 hover:text-violet-300 transition-colors ${lang === 'hi' ? 'lang-hi' : ''}`}
          >
            {t('edit')}
          </button>
        </div>
        <div className="overflow-y-auto thin-scrollbar space-y-0.5 pr-1">
          {topics.map((topic) => {
            const active = feedFilter === topic.id
            return (
              <div
                key={topic.id}
                className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-violet-500/15 text-white'
                    : 'text-dark-muted hover:text-white hover:bg-white/5'
                }`}
              >
                <button
                  onClick={() => setFeedFilter(active ? null : topic.id)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  title={tp(topic.id, topic.label)}
                >
                  <span className="text-base">{topic.emoji}</span>
                  <span className={`truncate ${lang === 'hi' ? 'lang-hi' : ''}`}>{tp(topic.id, topic.label)}</span>
                </button>
                {active && (
                  <motion.span layoutId="topic-active-dot" className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                )}
                <button
                  onClick={() => {
                    if (feedFilter === topic.id) setFeedFilter(null)
                    toggleTopic(topic.id)
                  }}
                  aria-label={`${t('remove')} ${tp(topic.id, topic.label)}`}
                  title={`${t('remove')} ${tp(topic.id, topic.label)}`}
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded-md text-dark-subtle hover:text-red-400 hover:bg-white/5 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
          {topics.length === 0 && (
            <p className={`px-3 py-2 text-xs text-dark-subtle ${lang === 'hi' ? 'lang-hi' : ''}`}>
              <button onClick={() => setTopicsOpen(true)} className="text-violet-400 hover:text-violet-300 transition-colors">
                {t('addTopics')}
              </button>{' '}
              {t('addTopicsToPersonalize')}
            </p>
          )}
        </div>
      </div>

      {/* Auth */}
      <div className="px-2 py-4 border-t border-dark-border">
        {user ? (
          <div className="flex items-center gap-2.5 px-1">
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="w-9 h-9 rounded-full ring-2 ring-violet-500/30" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                <span className="text-sm font-bold text-white">
                  {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </p>
              <button onClick={() => signOut()} className={`text-xs text-dark-muted hover:text-red-400 transition-colors ${lang === 'hi' ? 'lang-hi' : ''}`}>
                {t('signOut')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => signInWithGoogle()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {t('signInWithGoogle')}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
  onClick,
}: {
  href: string
  label: string
  icon: React.ReactNode
  active?: boolean
  badge?: number
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? 'bg-white/10 text-white' : 'text-dark-muted hover:text-white hover:bg-white/5'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-gradient-to-b from-violet-400 to-cyan-400"
        />
      )}
      <svg className={`w-5 h-5 transition-transform group-hover:scale-110 ${active ? 'text-violet-300' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icon}
      </svg>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] font-semibold bg-violet-500/20 text-violet-300 rounded-full px-1.5 py-0.5 tabular-nums">{badge}</span>
      )}
    </Link>
  )
}
