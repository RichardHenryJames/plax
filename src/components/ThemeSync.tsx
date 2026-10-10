'use client'

import { useEffect } from 'react'
import { usePlaxStore } from '@/lib/store'
import { resolveTheme } from '@/lib/theme'

// Keeps the <html> theme class in sync with the reader's choice, and with the system's own setting while the choice
// is System. The initial class is set before paint by THEME_SCRIPT in layout.tsx; this handles live changes.
export function ThemeSync() {
  const mode = usePlaxStore((s) => s.themeMode)
  const setResolvedTheme = usePlaxStore((s) => s.setResolvedTheme)

  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const theme = resolveTheme(mode, system.matches)
      const el = document.documentElement
      el.classList.toggle('light', theme === 'light')
      el.classList.toggle('dark', theme === 'dark')
      setResolvedTheme(theme)
    }
    apply()
    if (mode !== 'system') return
    system.addEventListener('change', apply)
    return () => system.removeEventListener('change', apply)
  }, [mode, setResolvedTheme])

  return null
}
