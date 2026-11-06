import { isLang, type Lang } from '../i18n'

/** The reading language: it selects both the interface strings and the Hindi or English feed. */
export const ENGLISH: Lang = 'en'
export const HINDI: Lang = 'hi'

/** The language a locale ("hi-IN", "en_GB", "fr") asks for: Hindi for a Hindi locale, English for every other and for none. */
export function languageOf(locale: string | null | undefined): Lang {
  if (typeof locale !== 'string') return ENGLISH
  const language = locale.split(/[-_]/)[0].toLowerCase()
  return language === HINDI ? HINDI : ENGLISH
}

/** The language of the phone, from its locale; English when that cannot be told. */
export function detectLanguage(): Lang {
  try {
    return languageOf(Intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    return ENGLISH
  }
}

export { isLang }
