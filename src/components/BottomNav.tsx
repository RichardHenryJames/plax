'use client'

import { usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

type Tab = 'feed' | 'foryou' | 'topics' | 'saved'

const ICONS: Record<Tab, string> = {
  feed: 'M5.5 4.5h13a1 1 0 011 1v4.5h-15V5.5a1 1 0 011-1zM4.5 14h15v4.5a1 1 0 01-1 1h-13a1 1 0 01-1-1V14z',
  foryou: 'M12 3.5l2.6 5.5 5.9.7-4.4 4.1 1.2 5.9L12 16.8l-5.3 2.9 1.2-5.9L3.5 9.7 9.4 9z',
  topics: 'M4.5 4.5H10V10H4.5zM14 4.5h5.5V10H14zM4.5 14H10v5.5H4.5zM14 14h5.5v5.5H14z',
  saved: 'M7 3.5h10a1.5 1.5 0 011.5 1.5v15l-6.5-3.5L5.5 20V5A1.5 1.5 0 017 3.5z',
}

/**
 * The same four tabs as the Android app: Feed (public news, or a topic you picked), For you (your own
 * topics), Topics and Saved. Phones only; the desktop left rail carries the same four entries.
 */
export function BottomNav() {
  const screen = useUIStore((s) => s.screen)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const feedTopic = useUIStore((s) => s.feedTopic)
  const setFeedFilter = useUIStore((s) => s.setFeedFilter)
  const setScreen = useUIStore((s) => s.setScreen)
  const setStartOnForYou = usePlaxStore((s) => s.setStartOnForYou)
  const { t, lang } = useT()

  const active: Tab = screen === 'topics' ? 'topics' : screen === 'saved' ? 'saved' : feedFilter === null ? 'foryou' : 'feed'

  const open = (tab: Tab) => {
    if (tab === 'feed') { setStartOnForYou(false); setFeedFilter(feedTopic) }
    else if (tab === 'foryou') { setStartOnForYou(true); setFeedFilter(null) }
    else setScreen(tab)
  }

  const items: { id: Tab; label: string }[] = [
    { id: 'feed', label: t('tabFeed') },
    { id: 'foryou', label: t('tabForYou') },
    { id: 'topics', label: t('tabTopics') },
    { id: 'saved', label: t('tabSaved') },
  ]

  return (
    <nav
      aria-label="Plax"
      className="lg:hidden shrink-0 flex border-t border-dark-border bg-dark-card pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => {
        const selected = active === item.id
        return (
          <button
            key={item.id}
            onClick={() => open(item.id)}
            aria-current={selected ? 'page' : undefined}
            className={`focus-ring flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-semibold transition-colors ${
              selected ? 'text-white' : 'text-dark-muted hover:text-white'
            } ${lang === 'hi' ? 'lang-hi' : ''}`}
          >
            <span
              className={`flex items-center justify-center w-16 h-8 rounded-2xl transition-colors ${
                selected ? 'bg-[color:var(--signal)]/18' : ''
              }`}
            >
              <svg
                className={`w-6 h-6 ${selected ? 'text-[color:var(--signal)]' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path d={ICONS[item.id]} />
              </svg>
            </span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
