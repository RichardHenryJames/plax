'use client'

import { useAuth } from '@/components/AuthProvider'
import { BrandMark } from '@/components/BrandMark'
import { HeaderMenu } from '@/components/HeaderMenu'
import { useUIStore } from '@/lib/ui-store'
import { usePlaxStore } from '@/lib/store'
import { useT } from '@/lib/i18n'

/**
 * Phone header, as in the Android app: the Plax mark, English | हिन्दी, refresh, and one menu for the rest. Topics and
 * saved stories are the tabs at the bottom; the account is in the menu, never a gate.
 */
export function NavBar() {
  const requestRefresh = useUIStore((s) => s.requestRefresh)
  const language = usePlaxStore((s) => s.language)
  const setLanguage = usePlaxStore((s) => s.setLanguage)
  const { t } = useT()

  return (
    <nav className="lg:hidden absolute top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="bg-dark-bg flex items-center justify-between gap-2 pl-4 pr-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pointer-events-auto">
        <BrandMark />

        <div className="flex items-center gap-0.5">
          {/* Feed language: the two words, as the app's toggle reads */}
          <div role="group" aria-label={t('feedLanguage')} className="flex items-center rounded-full bg-[var(--wash-1)] p-0.5 mr-1">
            {[
              { id: 'en', label: 'English' },
              { id: 'hi', label: 'हिन्दी' },
            ].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLanguage(l.id)}
                aria-pressed={language === l.id}
                className={`focus-ring px-3 py-1.5 rounded-full text-[13px] font-semibold transition ${
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
            type="button"
            onClick={requestRefresh}
            aria-label={t('refresh')}
            className="focus-ring flex items-center justify-center w-10 h-10 rounded-full text-dark-text hover:bg-[var(--wash-1)] transition-colors"
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5" />
            </svg>
          </button>

          <HeaderMenu />
        </div>
      </div>
    </nav>
  )
}
