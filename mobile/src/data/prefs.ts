import { isLang, type Lang } from '../i18n'
import type { KeyValueStore } from '../platform/storage'

/** The colour theme the reader chose: follow the phone, or always light, or always dark. */
export type ThemeChoice = 'system' | 'light' | 'dark'

export const isThemeChoice = (value: unknown): value is ThemeChoice => value === 'system' || value === 'light' || value === 'dark'

/** Where each setting is kept (the topics for For you are in interests.ts). */
export const PREF_KEYS = {
  language: 'plax.language',
  theme: 'plax.theme',
  forYou: 'plax.for-you',
  bannerServedAt: 'plax.banner-served-at',
} as const

/**
 * Settings kept on the phone (the native app's Prefs.java and the language its Language.java kept through the system): the language
 * the reader chose, the colour theme, which feed the reader was last in, and when an ad last arrived in the strip (a time, nothing
 * about the reader). Reading never fails: what is missing or unreadable is the default.
 */
export class Prefs {
  constructor(private readonly store: KeyValueStore) {}

  private async read(key: string): Promise<string | null> {
    try {
      return await this.store.getItem(key)
    } catch {
      return null
    }
  }

  /** The language the reader chose, or null when they never did (the phone's language is used then: see language.ts). */
  async language(): Promise<Lang | null> {
    const value = await this.read(PREF_KEYS.language)
    return isLang(value) ? value : null
  }

  async setLanguage(language: Lang): Promise<void> {
    await this.store.setItem(PREF_KEYS.language, language)
  }

  async theme(): Promise<ThemeChoice> {
    const value = await this.read(PREF_KEYS.theme)
    return isThemeChoice(value) ? value : 'system'
  }

  async setTheme(theme: ThemeChoice): Promise<void> {
    await this.store.setItem(PREF_KEYS.theme, theme)
  }

  /** True when the reader last used For you, so the app opens there again. */
  async forYou(): Promise<boolean> {
    return (await this.read(PREF_KEYS.forYou)) === 'true'
  }

  async setForYou(selected: boolean): Promise<void> {
    await this.store.setItem(PREF_KEYS.forYou, selected ? 'true' : 'false')
  }

  /** When an ad last arrived in the strip at the foot of the screen (ms since 1970), or 0 if none ever did. */
  async bannerServedAt(): Promise<number> {
    const value = Number(await this.read(PREF_KEYS.bannerServedAt))
    return Number.isSafeInteger(value) && value > 0 ? value : 0
  }

  async setBannerServedAt(at: number): Promise<void> {
    await this.store.setItem(PREF_KEYS.bannerServedAt, String(Math.max(0, Math.floor(at))))
  }
}
