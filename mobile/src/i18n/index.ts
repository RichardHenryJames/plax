import { en, enPlurals } from './en'
import { hi, hiPlurals } from './hi'

export type Lang = 'en' | 'hi'
export type StringKey = keyof typeof en
export type PluralKey = keyof typeof enPlurals

export const LANGS: readonly Lang[] = ['en', 'hi']
export const isLang = (value: unknown): value is Lang => value === 'en' || value === 'hi'

const DICTIONARIES: Record<Lang, Record<StringKey, string>> = { en, hi }
const PLURALS: Record<Lang, Record<PluralKey, Record<string, string>>> = { en: enPlurals, hi: hiPlurals }

/**
 * Fills the positions of a string: %1$s, %2$d ... by position, plain %s and %d in order, %% for a percent sign. A position with no
 * argument is left empty, never printed as a pattern.
 */
export function format(template: string, args: readonly (string | number)[] = []): string {
  let next = 0
  return template.replace(/%(?:(\d+)\$)?([sd%])/g, (_whole, position: string | undefined, kind: string) => {
    if (kind === '%') return '%'
    const index = position ? Number(position) - 1 : next++
    const value = args[index]
    return value === undefined ? '' : String(value)
  })
}

/** The string in this language, with its arguments filled in. */
export function translate(lang: Lang, key: StringKey, ...args: (string | number)[]): string {
  return format(DICTIONARIES[lang][key] ?? DICTIONARIES.en[key], args)
}

/** The form of a counted string that suits the number: Hindi and English both take "one" for 1 (Hindi also for 0) and "other". */
export function translatePlural(lang: Lang, key: PluralKey, count: number, ...args: (string | number)[]): string {
  const forms = PLURALS[lang][key] ?? PLURALS.en[key]
  const form = (lang === 'hi' ? count === 0 || count === 1 : count === 1) ? forms.one ?? forms.other : forms.other ?? forms.one
  return format(form, [count, ...args])
}

export const hasKey = (key: string): key is StringKey => Object.prototype.hasOwnProperty.call(en, key)
