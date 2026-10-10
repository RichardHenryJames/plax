'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { useUIStore } from '@/lib/ui-store'
import { usePlaxStore } from '@/lib/store'
import { useT } from '@/lib/i18n'
import type { ThemeMode } from '@/lib/theme'

const MODES: { id: ThemeMode; key: string }[] = [
  { id: 'system', key: 'themeSystem' },
  { id: 'light', key: 'themeLight' },
  { id: 'dark', key: 'themeDark' },
]

/**
 * The ⋮ menu of the phone header. It holds what the Android app's menu holds (account, topics, theme), plus the
 * website's search, so the header itself stays as quiet as the app's.
 */
export function HeaderMenu() {
  const { user, loading } = useAuth()
  const setCommandOpen = useUIStore((s) => s.setCommandOpen)
  const setAccountOpen = useUIStore((s) => s.setAccountOpen)
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const themeMode = usePlaxStore((s) => s.themeMode)
  const setThemeMode = usePlaxStore((s) => s.setThemeMode)
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const hindi = lang === 'hi' ? 'lang-hi' : ''

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const then = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  const name = user ? String(user.user_metadata?.full_name || user.email || '') : ''
  const avatar = user?.user_metadata?.avatar_url as string | undefined
  const item = `focus-ring w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[15px] text-dark-text hover:bg-[var(--wash-1)] ${hindi}`

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('moreOptions')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="focus-ring flex items-center justify-center w-10 h-10 rounded-full text-dark-text hover:bg-[var(--wash-1)] transition-colors"
      >
        <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-dark-card border border-dark-border shadow-lg p-1.5 z-50">
          <button role="menuitem" type="button" onClick={then(() => setCommandOpen(true))} className={item}>
            <svg className="w-5 h-5 text-dark-muted" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            {t('search')}
          </button>
          {!loading && (
            <button role="menuitem" type="button" onClick={then(() => setAccountOpen(true))} className={item}>
              {user ? (
                avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" referrerPolicy="no-referrer" className="w-5 h-5 rounded-full" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-[color:var(--signal)] text-[color:var(--signal-ink)] text-[11px] font-bold grid place-items-center" aria-hidden="true">
                    {(name || 'U')[0].toUpperCase()}
                  </span>
                )
              ) : (
                <svg className="w-5 h-5 text-dark-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a4 4 0 100 8 4 4 0 000-8zM4.5 20a7.5 7.5 0 0115 0" /></svg>
              )}
              <span className="flex-1 min-w-0">
                {t('account')}
                {name && <span className="block text-xs text-dark-subtle truncate">{name}</span>}
              </span>
            </button>
          )}
          <button role="menuitem" type="button" onClick={then(() => setTopicsOpen(true))} className={item}>
            <svg className="w-5 h-5 text-dark-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5H10V10H4.5zM14 4.5h5.5V10H14zM4.5 14H10v5.5H4.5zM14 14h5.5v5.5H14z" /></svg>
            {t('yourTopics')}
          </button>

          <div className="px-3 pt-2.5 pb-2 mt-1 border-t border-dark-border">
            <p className={`text-[11px] font-semibold uppercase tracking-wider text-dark-subtle mb-2 ${hindi}`}>{t('theme')}</p>
            <div role="group" aria-label={t('theme')} className="flex p-0.5 rounded-full bg-[var(--wash-1)]">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setThemeMode(mode.id)}
                  aria-pressed={themeMode === mode.id}
                  className={`focus-ring flex-1 py-1.5 rounded-full text-xs font-semibold transition ${hindi} ${
                    themeMode === mode.id ? 'bg-[color:var(--signal)] text-[color:var(--signal-ink)]' : 'text-dark-muted hover:text-white'
                  }`}
                >
                  {t(mode.key)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
