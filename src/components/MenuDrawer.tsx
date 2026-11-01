'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { BrandMark } from '@/components/BrandMark'
import { useUIStore } from '@/lib/ui-store'
import { usePlaxStore } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { NEWS_SECTIONS } from '@/lib/types'
import type { ThemeMode } from '@/lib/theme'

type Tab = 'feed' | 'foryou' | 'topics' | 'saved'

const ICONS: Record<Tab, string> = {
  feed: 'M5.5 4.5h13a1 1 0 011 1v4.5h-15V5.5a1 1 0 011-1zM4.5 14h15v4.5a1 1 0 01-1 1h-13a1 1 0 01-1-1V14z',
  foryou: 'M12 3.5l2.6 5.5 5.9.7-4.4 4.1 1.2 5.9L12 16.8l-5.3 2.9 1.2-5.9L3.5 9.7 9.4 9z',
  topics: 'M4.5 4.5H10V10H4.5zM14 4.5h5.5V10H14zM4.5 14H10v5.5H4.5zM14 14h5.5v5.5H14z',
  saved: 'M7 3.5h10a1.5 1.5 0 011.5 1.5v15l-6.5-3.5L5.5 20V5A1.5 1.5 0 017 3.5z',
}

const THEMES: { id: ThemeMode; key: string }[] = [
  { id: 'system', key: 'themeSystem' },
  { id: 'light', key: 'themeLight' },
  { id: 'dark', key: 'themeDark' },
]

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Icon({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

/**
 * Everything the phone's header and bottom bar used to hold, in one panel that slides in from the left when the menu button is
 * pressed: the feed language, the four places (Feed, For you, Topics, Saved), the news sections, search, the account, the
 * theme, and the contact and privacy pages as quiet links at the foot. (Choosing topics is on the Topics screen, which has a
 * card for it, and looking for new stories needs no row: the feed does it when the reader comes back, every few minutes
 * while the tab is open, and on the caught-up card. A row for either repeated something.) With it out of the way a story
 * has the whole screen, as in Inshorts. Phones and tablets only: a desktop has the side rail, which holds the same.
 */
export function MenuDrawer() {
  const open = useUIStore((s) => s.menuOpen)
  const setOpen = useUIStore((s) => s.setMenuOpen)
  const screen = useUIStore((s) => s.screen)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const feedTopic = useUIStore((s) => s.feedTopic)
  const setFeedFilter = useUIStore((s) => s.setFeedFilter)
  const setScreen = useUIStore((s) => s.setScreen)
  const newsSection = useUIStore((s) => s.newsSection)
  const setNewsSection = useUIStore((s) => s.setNewsSection)
  const currentCard = useUIStore((s) => s.currentCard)
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const setAccountOpen = useUIStore((s) => s.setAccountOpen)
  const language = usePlaxStore((s) => s.language)
  const setLanguage = usePlaxStore((s) => s.setLanguage)
  const themeMode = usePlaxStore((s) => s.themeMode)
  const setThemeMode = usePlaxStore((s) => s.setThemeMode)
  const setStartOnForYou = usePlaxStore((s) => s.setStartOnForYou)
  const savedCount = usePlaxStore((s) => s.bookmarkedIds.length)
  const { user } = useAuth()
  const { t, lang } = useT()
  const panel = useRef<HTMLElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const hindi = lang === 'hi' ? 'lang-hi' : ''

  const active: Tab = screen === 'topics' ? 'topics' : screen === 'saved' ? 'saved' : feedFilter === null ? 'foryou' : 'feed'
  // The sections narrow the news, so they are offered where news is being read.
  const showSections = screen === 'feed' && (feedFilter === 'news' || newsSection !== null || currentCard?.category === 'news')

  // Closing is also what happens when the window grows into a desktop, which has the rail instead.
  const close = () => setOpen(false)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const wide = window.matchMedia('(min-width: 1024px)')
    const onWide = () => wide.matches && setOpen(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    wide.addEventListener('change', onWide)
    document.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('[data-menu-close]')?.focus()
    return () => {
      wide.removeEventListener('change', onWide)
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, setOpen])

  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  const openTab = (tab: Tab) => {
    if (tab === 'feed') {
      setStartOnForYou(false)
      setFeedFilter(feedTopic)
    } else if (tab === 'foryou') {
      setStartOnForYou(true)
      setFeedFilter(null)
    } else setScreen(tab)
  }

  const name = user ? String(user.user_metadata?.full_name || user.email || '') : ''
  const avatar = user?.user_metadata?.avatar_url as string | undefined
  const row = `focus-ring w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[15px] text-dark-text hover:bg-[var(--wash-1)] transition-colors ${hindi}`
  const label = `mb-2 text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${hindi}`
  const chip = (on: boolean) =>
    `focus-ring shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition ${
      on ? 'bg-[color:var(--signal)] text-[color:var(--signal-ink)]' : 'bg-[var(--wash-1)] text-dark-text hover:bg-[var(--wash-2)]'
    } ${hindi}`

  const tabs: { id: Tab; label: string }[] = [
    { id: 'feed', label: t('tabFeed') },
    { id: 'foryou', label: t('tabForYou') },
    { id: 'topics', label: t('tabTopics') },
    { id: 'saved', label: t('tabSaved') },
  ]

  return (
    <AnimatePresence>
      {open && (
        <div key="menu" className="lg:hidden fixed inset-0 z-[60]" data-no-feed-scroll>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            className="absolute inset-0 bg-black/55"
            aria-hidden="true"
          />
          <motion.aside
            key="panel"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={t('menu')}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onTouchStart={(event) => {
              touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
            }}
            onTouchEnd={(event) => {
              const start = touch.current
              touch.current = null
              if (!start) return
              const dx = event.changedTouches[0].clientX - start.x
              const dy = event.changedTouches[0].clientY - start.y
              if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.4) close()
            }}
            className={`absolute inset-y-0 left-0 flex w-[min(86vw,22rem)] flex-col bg-dark-card border-r border-dark-border shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${hindi}`}
          >
            <div className="flex items-center justify-between gap-2 pl-5 pr-2 pt-3 pb-2">
              <BrandMark href={null} />
              <button
                type="button"
                data-menu-close
                onClick={close}
                aria-label={t('closeMenu')}
                className="focus-ring flex items-center justify-center w-10 h-10 rounded-full text-dark-text hover:bg-[var(--wash-1)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain thin-scrollbar px-2 pb-4">
              {/* Feed language: the two words, as the app's toggle reads */}
              <div className="px-3 pt-2 pb-3">
                <p className={label}>{t('feedLanguage')}</p>
                <div role="group" aria-label={t('feedLanguage')} className="flex p-0.5 rounded-full bg-[var(--wash-1)]">
                  {[
                    { id: 'en', label: 'English' },
                    { id: 'hi', label: 'हिन्दी' },
                  ].map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={then(() => setLanguage(l.id))}
                      aria-pressed={language === l.id}
                      className={`focus-ring flex-1 py-2 rounded-full text-sm font-semibold transition ${
                        language === l.id ? 'bg-[color:var(--signal)] text-[color:var(--signal-ink)]' : 'text-dark-muted hover:text-white'
                      } ${l.id === 'hi' ? 'lang-hi' : ''}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* The four places, as the bottom bar had them */}
              <nav aria-label="Plax" className="space-y-0.5">
                {tabs.map((tab) => {
                  const selected = active === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={then(() => openTab(tab.id))}
                      aria-current={selected ? 'page' : undefined}
                      className={`${row} ${selected ? 'bg-[color:var(--signal)]/15 text-white font-semibold' : ''}`}
                    >
                      <Icon className={selected ? 'text-[color:var(--signal)]' : 'text-dark-muted'}>
                        <path d={ICONS[tab.id]} />
                      </Icon>
                      <span className="flex-1">{tab.label}</span>
                      {tab.id === 'saved' && savedCount > 0 && (
                        <span className="text-[10px] font-semibold bg-[color:var(--signal)]/20 text-[color:var(--signal)] rounded-full px-1.5 py-0.5 tabular-nums">{savedCount}</span>
                      )}
                    </button>
                  )
                })}
              </nav>

              {showSections && (
                <div className="mt-4">
                  <p className={`px-3 ${label}`}>{t('sections')}</p>
                  <div className="flex flex-wrap gap-2 px-3">
                    <button type="button" onClick={then(() => setNewsSection(null))} aria-pressed={newsSection === null} className={chip(newsSection === null)}>
                      {language === 'hi' ? 'सभी' : 'All'}
                    </button>
                    {NEWS_SECTIONS.map((s) => (
                      <button key={s.id} type="button" onClick={then(() => setNewsSection(s.id))} aria-pressed={newsSection === s.id} className={chip(newsSection === s.id)}>
                        {language === 'hi' ? s.labelHi : s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-dark-border space-y-0.5">
                <button type="button" onClick={then(() => setCommandOpen(true))} className={row}>
                  <Icon className="text-dark-muted"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></Icon>
                  {t('search')}
                </button>
                <button type="button" onClick={then(() => setAccountOpen(true))} className={row}>
                  {user ? (
                    avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" referrerPolicy="no-referrer" className="w-5 h-5 rounded-full shrink-0" />
                    ) : (
                      <span className="w-5 h-5 shrink-0 rounded-full bg-[color:var(--signal)] text-[color:var(--signal-ink)] text-[11px] font-bold grid place-items-center" aria-hidden="true">
                        {(name || 'U')[0].toUpperCase()}
                      </span>
                    )
                  ) : (
                    <Icon className="text-dark-muted"><path d="M12 4a4 4 0 100 8 4 4 0 000-8zM4.5 20a7.5 7.5 0 0115 0" /></Icon>
                  )}
                  <span className="flex-1 min-w-0">
                    {t('account')}
                    {name && <span className="block text-xs text-dark-subtle truncate">{name}</span>}
                  </span>
                </button>
              </div>

              <div className="px-3 pt-4">
                <p className={label}>{t('theme')}</p>
                <div role="group" aria-label={t('theme')} className="flex p-0.5 rounded-full bg-[var(--wash-1)]">
                  {THEMES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setThemeMode(mode.id)}
                      aria-pressed={themeMode === mode.id}
                      className={`focus-ring flex-1 py-2 rounded-full text-xs font-semibold transition ${hindi} ${
                        themeMode === mode.id ? 'bg-[color:var(--signal)] text-[color:var(--signal-ink)]' : 'text-dark-muted hover:text-white'
                      }`}
                    >
                      {t(mode.key)}
                    </button>
                  ))}
                </div>
              </div>

              {/* The two pages every reader may look for, as quiet links at the foot of the menu */}
              <div className={`flex items-center gap-5 px-3 pt-5 pb-1 text-[13px] text-dark-muted ${hindi}`}>
                <Link href="/contact" onClick={close} className="focus-ring rounded underline-offset-4 hover:text-dark-text hover:underline">
                  {t('contactUs')}
                </Link>
                <Link href="/privacy" onClick={close} className="focus-ring rounded underline-offset-4 hover:text-dark-text hover:underline">
                  {t('privacyPolicy')}
                </Link>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
