import { useEffect, useState } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useStore } from '../state/store'
import { LanguageProvider } from '../ui/i18n-context'
import { ToastProvider } from '../ui/overlays'
import { ThemeProvider, type ThemeMode } from '../ui/theme'
import { AppShell } from './AppShell'
import type { Services } from './container'
import { ErrorBoundary } from './ErrorBoundary'
import type { Host } from './host'

/**
 * The splash screen waits for the first stories (from the cache, or the network's answer), but never longer than this: the native app
 * waited 700 ms, and this one has a bundle to load first.
 */
export const SPLASH_LIMIT_MS = 2000

export interface RootProps {
  readonly services: Services
  readonly host?: Host
}

/**
 * The app from the outside in: starts the services (the order is the container's), holds the splash screen until the first screen is
 * decided, then draws the shell inside the reader's theme and language. A failure while drawing ends in a page with a button, never a
 * closed app.
 */
export function Root({ services, host }: RootProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [started, setStarted] = useState(false)
  const [late, setLate] = useState(false)
  const lang = useStore(services.engine.store, (state) => state.lang)
  const ready = useStore(services.engine.store, (state) => state.ready)

  useEffect(() => {
    let alive = true
    void services
      .start()
      .then(() => services.prefs.theme())
      .then(
        (mode) => {
          if (!alive) return
          setThemeMode(mode)
          setStarted(true)
        },
        () => alive && setStarted(true),
      )
    const limit = setTimeout(() => alive && setLate(true), SPLASH_LIMIT_MS)
    return () => {
      alive = false
      clearTimeout(limit)
      services.stop()
    }
  }, [services])

  const show = late || (started && ready)
  useEffect(() => {
    if (show) void SplashScreen.hideAsync().catch(() => undefined)
  }, [show])
  if (!show) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider mode={themeMode}>
        <LanguageProvider lang={lang}>
          <ToastProvider>
            <ErrorBoundary>
              <AppShell services={services} host={host} themeMode={themeMode} onThemeMode={setThemeMode} />
            </ErrorBoundary>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
