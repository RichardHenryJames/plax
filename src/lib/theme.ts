// How the site chooses between its light and dark look. Like the Android app, it follows the phone or computer's own
// setting unless the reader picks one; a reader who had chosen Light on the old two-way switch keeps it.

export type ThemeMode = 'system' | 'light' | 'dark'

export function resolveTheme(mode: string | undefined, prefersDark: boolean): 'light' | 'dark' {
  return mode === 'light' ? 'light' : mode === 'dark' ? 'dark' : prefersDark ? 'dark' : 'light'
}

/**
 * The saved choice. Older saved state has only the resolved `theme`, and that was "dark" for everyone who never
 * touched the switch, so only an explicit Light carries over; everything else follows the system.
 */
export function themeModeOf(saved: { themeMode?: unknown; theme?: unknown } | null | undefined): ThemeMode {
  const mode = saved?.themeMode
  if (mode === 'light' || mode === 'dark' || mode === 'system') return mode
  return saved?.theme === 'light' ? 'light' : 'system'
}

/**
 * Runs in the page's head before anything is drawn, so the page never flashes the wrong theme. It must do exactly what
 * themeModeOf and resolveTheme do (theme.test.mjs runs this very text against both).
 */
export const THEME_SCRIPT =
  `try{var s=JSON.parse(localStorage.getItem('plax-store-v2')||'{}'),a=(s&&s.state)||{},m=a.themeMode;` +
  `if(m!=='light'&&m!=='dark'&&m!=='system')m=a.theme==='light'?'light':'system';` +
  `var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches),e=document.documentElement;` +
  `e.classList.toggle('dark',d);e.classList.toggle('light',!d)}catch(x){}`
