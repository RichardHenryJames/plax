import { createContext, createElement, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { format, translate, translatePlural, type Lang, type PluralKey, type StringKey } from '../i18n'

export interface Translator {
  readonly lang: Lang
  /** A string of the screen's language, with its positions filled: t('minutes_ago', 5). */
  t(key: StringKey, ...args: (string | number)[]): string
  /** A counted string: tp('interests_selected', 3). */
  tp(key: PluralKey, count: number, ...args: (string | number)[]): string
  /** Fills the positions of a text that is not one of the app's own strings (a notice from the website, say). */
  fill(template: string, ...args: (string | number)[]): string
}

const make = (lang: Lang): Translator => ({
  lang,
  t: (key, ...args) => translate(lang, key, ...args),
  tp: (key, count, ...args) => translatePlural(lang, key, count, ...args),
  fill: (template, ...args) => format(template, args),
})

const I18nContext = createContext<Translator>(make('en'))

/** Gives the screens below it the reader's language. */
export function LanguageProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => make(lang), [lang])
  return createElement(I18nContext.Provider, { value }, children)
}

export const useT = (): Translator => useContext(I18nContext)

/** For a callback that needs the language without making the component depend on the whole translator. */
export function useTranslate(): (key: StringKey, ...args: (string | number)[]) => string {
  const { t } = useT()
  return useCallback((key, ...args) => t(key, ...args), [t])
}
