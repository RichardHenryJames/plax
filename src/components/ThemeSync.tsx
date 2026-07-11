'use client'

import { useEffect } from 'react'
import { usePlaxStore } from '@/lib/store'

// Keeps the <html> theme class in sync with the persisted store theme. The
// initial class is set pre-paint by an inline script in layout.tsx; this handles
// live toggles + rehydration.
export function ThemeSync() {
  const theme = usePlaxStore((s) => s.theme)

  useEffect(() => {
    const el = document.documentElement
    if (theme === 'light') {
      el.classList.add('light')
      el.classList.remove('dark')
    } else {
      el.classList.add('dark')
      el.classList.remove('light')
    }
  }, [theme])

  return null
}
