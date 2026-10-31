'use client'

import { useUIStore } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

/**
 * The one button that stands where the header and the bottom bar used to be: a small glass circle that floats over a story
 * (over its picture, or at the start of its source line when it has none) and opens the menu. A story gets the whole screen;
 * the language, the four places, the sections, search, topics, account and theme are one tap away in MenuDrawer.
 *
 * Phones and tablets only: a desktop has the side rail. `corner` is for the screens that are not a story (loading, caught
 * up, Topics, Saved): it stands in the top-left corner of the screen instead of inside the card.
 */
export function MenuButton({ corner = false }: { corner?: boolean }) {
  const setMenuOpen = useUIStore((s) => s.setMenuOpen)
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setMenuOpen(true)
      }}
      aria-label={t('menu')}
      aria-haspopup="dialog"
      data-menu-button
      className={`menu-fab focus-ring ${corner ? 'menu-fab--corner' : ''}`}
    >
      <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  )
}
