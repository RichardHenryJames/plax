import { createContext, createElement, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { Appearance, useColorScheme } from 'react-native'

/** The colours of one theme: the same names and values as the native app's colors.xml (day) and values-night/colors.xml (night). */
export interface Palette {
  readonly bg: string
  readonly surface: string
  readonly surfaceAlt: string
  readonly border: string
  readonly text: string
  readonly text2: string
  readonly accent: string
  readonly onAccent: string
  readonly accentText: string
  readonly accentSoft: string
  readonly danger: string
  readonly skeleton: string
  /** What dims the screen behind a sheet, a menu or a dialog. */
  readonly scrim: string
}

export const LIGHT_PALETTE: Palette = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceAlt: '#EFECE5',
  border: '#E2DED4',
  text: '#17171B',
  text2: '#5B5B66',
  accent: '#F5B13A',
  onAccent: '#1A1203',
  accentText: '#8F5400',
  accentSoft: '#FCEBC8',
  danger: '#B3261E',
  skeleton: '#E6E2D9',
  scrim: 'rgba(0,0,0,0.5)',
}

export const DARK_PALETTE: Palette = {
  bg: '#0B0B0E',
  surface: '#15151A',
  surfaceAlt: '#1F1F26',
  border: '#2B2B34',
  text: '#F5F5F7',
  text2: '#A9A9B5',
  accent: '#F5B13A',
  onAccent: '#1A1203',
  accentText: '#F5B13A',
  accentSoft: '#3A2C0E',
  danger: '#F2B8B5',
  skeleton: '#24242C',
  scrim: 'rgba(0,0,0,0.6)',
}

/** The reader's choice: follow the phone, or always light, or always dark. */
export type ThemeMode = 'system' | 'light' | 'dark'

export const isThemeMode = (value: unknown): value is ThemeMode => value === 'system' || value === 'light' || value === 'dark'

export interface Theme {
  readonly mode: ThemeMode
  readonly dark: boolean
  readonly palette: Palette
}

/** The theme to draw with: the one chosen, or the phone's when the choice is "system". */
export function resolveTheme(mode: ThemeMode, system: string | null | undefined): Theme {
  const dark = mode === 'dark' || (mode === 'system' && system === 'dark')
  return { mode, dark, palette: dark ? DARK_PALETTE : LIGHT_PALETTE }
}

/** Fonts: the phone's own families, as the native app used them. */
export const FONT = {
  sans: { fontFamily: 'sans-serif', fontWeight: '400' },
  sansMedium: { fontFamily: 'sans-serif-medium', fontWeight: '500' },
  serif: { fontFamily: 'serif', fontWeight: '400' },
  serifBold: { fontFamily: 'serif', fontWeight: '700' },
} as const

export type FontName = keyof typeof FONT

const ThemeContext = createContext<Theme>(resolveTheme('light', 'light'))

export function ThemeProvider({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  const system = useColorScheme()
  // The phone's own parts (the ads, the system dialogs) follow the reader's choice too.
  useEffect(() => {
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode)
  }, [mode])
  const theme = useMemo(() => resolveTheme(mode, system), [mode, system])
  return createElement(ThemeContext.Provider, { value: theme }, children)
}

export const useTheme = (): Theme => useContext(ThemeContext)
