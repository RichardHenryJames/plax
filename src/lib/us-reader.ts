// Which news section a reader starts on. A reader in the US starts on the US news, until they choose a section themselves; everyone
// else starts on All, as before. It is decided from what the browser itself says (its language and its time zone): nothing is
// asked of a server, no location is looked up, and the only thing kept is a flag that the reader has chosen a section.

/** The time zones of the United States, as a browser reports them (including the older names some still do). */
const US_ZONES =
  /^(America\/(New_York|Detroit|Chicago|Menominee|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Indianapolis|Louisville|Fort_Wayne|Shiprock|Indiana\/[A-Za-z_]+|Kentucky\/[A-Za-z_]+|North_Dakota\/[A-Za-z_]+)|Pacific\/Honolulu|US\/[A-Za-z-]+|EST5EDT|CST6CDT|MST7MDT|PST8PDT)$/

/** Whether this is a time zone of the United States (Toronto, Mexico City and São Paulo are not). */
export const isUsTimeZone = (zone: string | undefined): boolean => typeof zone === 'string' && US_ZONES.test(zone)

/** Whether the browser's language is American English: an Indian, British or Canadian English browser is not. */
export const isUsEnglish = (language: string | undefined): boolean => typeof language === 'string' && /^en-US(-|$)/i.test(language)

/** Whether the browser says its reader is in the US: American English, in a US time zone. */
export const isUsReader = (language: string | undefined, zone: string | undefined): boolean => isUsEnglish(language) && isUsTimeZone(zone)

/** The key under which a reader's own choice of a section is remembered, so that the start below is only ever a first start. */
export const SECTION_CHOSEN_KEY = 'plax-section-chosen'

/** The section to start the news on: 'us' for a reader in the US who has not chosen one yet, else null (All). */
export function startSection(input: { language?: string; zone?: string; chosen: boolean }): string | null {
  return !input.chosen && isUsReader(input.language, input.zone) ? 'us' : null
}

/** Whether this browser's reader has chosen a section themselves (storage that cannot be read says no). */
export function sectionChosen(): boolean {
  try {
    return localStorage.getItem(SECTION_CHOSEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Remembers that the reader chose a section (private mode and the like: they just start on the US again, which is harmless). */
export function rememberSectionChosen(): void {
  try {
    localStorage.setItem(SECTION_CHOSEN_KEY, '1')
  } catch {
    /* nothing to keep it in */
  }
}

/** The section this browser's reader starts on: what `startSection` says for the browser's language and time zone. */
export function browserStartSection(): string | null {
  if (typeof navigator === 'undefined') return null
  let zone: string | undefined
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    zone = undefined
  }
  return startSection({ language: navigator.language, zone, chosen: sectionChosen() })
}
