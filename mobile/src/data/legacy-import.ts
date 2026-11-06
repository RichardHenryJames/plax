import type { Lang } from '../i18n'
import type { Clock } from '../platform/clock'
import type { KeyValueStore } from '../platform/storage'
import { SAVED_LIMIT, parseSaved } from './feed-parser'
import { INTERESTS_KEY, categories, sanitize } from './interests'
import { languageOf } from './language'
import { PREF_KEYS, type ThemeChoice } from './prefs'
import { SavedStories } from './saved-stories'
import { SeenFile } from './seen-file'
import { SeenStore } from './seen-store'
import type { Story } from './story'
import { BUILT_IN_TOPICS, type Topic } from './topic'

/**
 * A one-time import of what the native 1.x app kept, for the reader who updates to this app: the package id is the same, so the files
 * of the native app are still in the app's files directory. The saved stories and the seen history are imported (merged into what the
 * phone already holds, never over it); so are the language, the theme, the topics for For you and which feed was last used, when the
 * reader's phone has them to give. Nothing here ever throws, and nothing that is damaged is imported or replaced.
 *
 * Run it before the feed engine is started, so that the engine reads what was imported.
 */
export interface LegacyFiles {
  /** The text of a file in the app's files directory, or null when there is none or it cannot be read. */
  readText(name: string): Promise<string | null>
  /**
   * The text of the native app's settings file (shared_prefs/plax.xml), which is not in the files directory, so that a reader keeps
   * the topics they chose for For you, their theme and the feed they last used. Optional: without it those start from the defaults.
   */
  readPreferences?(): Promise<string | null>
}

/** The native app's files (FeedParser's saved-story format, SeenFile.java's history and the language AppCompat kept for it). */
export const LEGACY_SAVED_FILE = 'saved-stories.json'
export const LEGACY_SEEN_FILE = 'seen-stories.json'
export const LEGACY_LOCALE_FILE = 'androidx.appcompat.app.AppCompatDelegate.application_locales_record_file'

/** Where the phone notes that the import is done. */
export const LEGACY_DONE_KEY = 'plax.legacy-import'

export interface LegacyImportOptions {
  files: LegacyFiles
  storage: KeyValueStore
  clock: Clock
  /** The topics on offer, for the topics the reader chose. Default: the built-in ones. */
  topics?: () => readonly Topic[]
}

export interface LegacyImportResult {
  /** True when this call looked at the native app's data; false when that was done before. */
  ran: boolean
  /** Saved stories added to the phone's own. */
  saved: number
  /** Stories added to the seen history. */
  seen: number
  /** Settings taken over: the language, the theme, the feed last used and the topics. */
  settings: number
  /** Everything that could be imported was, and the import is marked done. When false the next launch tries again. */
  done: boolean
}

/** What AppCompat wrote for the language the reader chose: `<locales application_locales="hi" />`. */
export function parseLegacyLocale(xml: string): Lang | null {
  const tags = /application_locales="([^"]*)"/.exec(xml)?.[1] ?? ''
  const first = tags.split(',')[0].trim()
  return first === '' ? null : languageOf(first)
}

export interface LegacyPreferences {
  theme?: ThemeChoice
  forYou?: boolean
  interests?: string[]
}

const THEMES: Record<string, ThemeChoice> = { '0': 'system', '1': 'light', '2': 'dark' }

/** What the native app's SharedPreferences file held of the settings: `<int name="theme" value="2" />` and the like. */
export function parseLegacyPreferences(xml: string): LegacyPreferences {
  const result: LegacyPreferences = {}
  const theme = /<int\s+name="theme"\s+value="(\d+)"\s*\/>/.exec(xml)?.[1]
  if (theme !== undefined && THEMES[theme] !== undefined) result.theme = THEMES[theme]
  const forYou = /<boolean\s+name="for_you"\s+value="(true|false)"\s*\/>/.exec(xml)?.[1]
  if (forYou !== undefined) result.forYou = forYou === 'true'
  const interests = /<string\s+name="interests">([^<]*)<\/string>/.exec(xml)?.[1]
  if (interests !== undefined) result.interests = interests.split(',')
  return result
}

async function readFile(files: LegacyFiles, name: string): Promise<string | null> {
  try {
    return await files.readText(name)
  } catch {
    return null
  }
}

/**
 * What a file of the native app holds. The native app wrote its files in a way that leaves a `.bak` of the file before when a write
 * did not finish, and it reads that copy first, so this does too: the first of the two that is well formed is the one.
 */
async function readNative<T>(files: LegacyFiles, name: string, parse: (text: string) => T): Promise<T | null> {
  for (const candidate of [`${name}.bak`, name]) {
    const text = await readFile(files, candidate)
    if (text === null) continue
    try {
      return parse(text)
    } catch {
      continue
    }
  }
  return null
}

async function importSaved(options: LegacyImportOptions, result: LegacyImportResult): Promise<boolean> {
  const legacy = await readNative(options.files, LEGACY_SAVED_FILE, parseSaved)
  if (legacy === null || legacy.length === 0) return true
  const store = new SavedStories(options.storage)
  let current: Story[]
  try {
    current = await store.read()
  } catch {
    // What the phone holds is damaged: it is not replaced, and the import waits.
    return false
  }
  const have = new Set(current.map((story) => story.id))
  const merged = [...current]
  for (const story of legacy) {
    if (merged.length >= SAVED_LIMIT) break
    if (have.has(story.id)) continue
    have.add(story.id)
    merged.push(story)
  }
  if (merged.length === current.length) return true
  try {
    await store.write(merged)
  } catch {
    return false
  }
  result.saved = merged.length - current.length
  return true
}

async function importSeen(options: LegacyImportOptions, result: LegacyImportResult): Promise<boolean> {
  const now = options.clock()
  const legacy = await readNative(options.files, LEGACY_SEEN_FILE, (text) => SeenStore.fromJson(text, now))
  if (legacy === null || legacy.size === 0) return true
  const file = new SeenFile(options.storage)
  let current: SeenStore
  try {
    current = await file.read(now)
  } catch {
    // A damaged history is only a convenience gone: the engine would start it again anyway.
    current = new SeenStore()
  }
  const merged = current.merge(legacy, now)
  try {
    await file.write(merged)
  } catch {
    return false
  }
  result.seen = Math.max(0, merged.size - current.size)
  return true
}

async function importSettings(options: LegacyImportOptions, result: LegacyImportResult): Promise<boolean> {
  const { files, storage } = options
  const offered = options.topics?.() ?? BUILT_IN_TOPICS
  const locale = await readFile(files, LEGACY_LOCALE_FILE)
  let preferences: LegacyPreferences = {}
  if (files.readPreferences !== undefined) {
    try {
      const xml = await files.readPreferences()
      if (xml !== null) preferences = parseLegacyPreferences(xml)
    } catch {
      preferences = {}
    }
  }
  const language = locale === null ? null : parseLegacyLocale(locale)
  const interests = preferences.interests === undefined ? null : categories(sanitize(preferences.interests, offered))
  const settings: [string, string | null][] = [
    [PREF_KEYS.language, language],
    [PREF_KEYS.theme, preferences.theme ?? null],
    [PREF_KEYS.forYou, preferences.forYou === undefined ? null : preferences.forYou ? 'true' : 'false'],
    [INTERESTS_KEY, interests !== null && interests !== '' ? interests : null],
  ]
  try {
    for (const [key, value] of settings) {
      // What the reader has already set on this phone wins.
      if (value === null || (await storage.getItem(key)) !== null) continue
      await storage.setItem(key, value)
      result.settings++
    }
  } catch {
    return false
  }
  return true
}

export async function importLegacyData(options: LegacyImportOptions): Promise<LegacyImportResult> {
  const result: LegacyImportResult = { ran: false, saved: 0, seen: 0, settings: 0, done: false }
  try {
    if ((await options.storage.getItem(LEGACY_DONE_KEY)) !== null) return { ...result, done: true }
    result.ran = true
    const saved = await importSaved(options, result)
    const seen = await importSeen(options, result)
    const settings = await importSettings(options, result)
    if (saved && seen && settings) {
      await options.storage.setItem(LEGACY_DONE_KEY, JSON.stringify({ at: options.clock() }))
      result.done = true
    }
  } catch {
    // The import is a convenience: whatever went wrong, the app starts, and the next launch tries again.
  }
  return result
}
