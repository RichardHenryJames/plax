import { KNOWN_FEATURES, LAYOUT_RANGES, MAX_BYTES, Num, checkAppConfig, parseStrict } from '@shared/app-config-rules'
import { STORIES_PER_AD } from '@shared/ad-slots'
import { BUILT_IN_TOPICS, type Topic } from '@/data/topic'
import { en } from '@/i18n/en'
import { hi } from '@/i18n/hi'
import type { Lang } from '@/i18n'
import { utf8Length } from './limits'

/**
 * What the Plax website tells the app to be: the topics it lists, the sections of the news, which features are on, how often a
 * full-page ad comes, how big a story's picture may be, one notice, whether a newer version is on Google Play, and a few links for the
 * menu. A port of AppConfig.java of the native app (1.7.1).
 *
 * The file (public/app-config.json, at /news/app-config.json) is data: it never holds code, so it cannot fix a bug or add a screen. Every
 * part has a built-in value (DEFAULT_APP_CONFIG), which is what a build that has never read the file does, and every part is judged on
 * its own: a part that breaks a rule is refused and its built-in value stays, while the parts that are fine are taken. The judging is
 * the website's own (src/lib/app-config-rules.ts, shared as @shared/app-config-rules), so a file that passes the website's test is a file
 * the app takes whole. This file only reads the values of the parts that check let through.
 */

/** The builds a notice or a link is for: all of them, the Google Play build, or the build the website hands out ("direct"). */
export type Audience = 'all' | 'play' | 'direct'

/** A switch is on unless the file says it is off, except the publisher's name, whose built-in value is the website's: off. */
export interface Features {
  /** The Go deeper button. */
  readonly deeper: boolean
  /** Share makes a Plax page for the story (off: it shares the publisher's link). */
  readonly shareLinks: boolean
  /** All ads. */
  readonly ads: boolean
  /** The full-page ad between stories. */
  readonly adPages: boolean
  /** Whether a story's line names its publisher. See showsSourceName. */
  readonly sourceName: boolean
}

/** How big a story's picture may be (a share of the column's width and of the page's height) and the least it is given. */
export interface Layout {
  readonly heroMaxWidth: number
  readonly heroMaxHeight: number
  readonly photoMinWidth: number
  readonly photoMinHeight: number
}

/** A chip of the news topic: the English and Hindi name, as the built-in ones carry them too. */
export interface Section {
  readonly id: string
  readonly en: string
  readonly hi: string
}

/** One notice, shown once to each reader it applies to (see config-prompts.ts). The Hindi texts are empty when there are none. */
export interface Notice {
  readonly id: string
  /** An important notice comes back at each start until the reader has said Done. */
  readonly important: boolean
  readonly titleEn: string
  readonly titleHi: string
  readonly bodyEn: string
  readonly bodyHi: string
  /** A page to open from "Learn more", or '' when there is none. */
  readonly url: string
  readonly build: Audience
  /** The least and the most version code it is for; 0 for no limit. */
  readonly minVersionCode: number
  readonly maxVersionCode: number
  /** The moment it ends, in milliseconds since 1970; 0 for never. */
  readonly untilMillis: number
}

/** That a newer version is on Google Play (read by the Google Play build only: the website's build has its own update feed). */
export interface StoreUpdate {
  readonly latestVersionCode: number
  readonly latestVersionName: string
  readonly minSupportedVersionCode: number
}

/** A row for the menu. */
export interface Link {
  readonly id: string
  readonly en: string
  readonly hi: string
  readonly url: string
  readonly build: Audience
}

export interface AppConfig {
  readonly topics: readonly Topic[]
  readonly sections: readonly Section[]
  readonly features: Features
  /** How many stories one full-page ad stands for. */
  readonly adPageEvery: number
  readonly layout: Layout
  readonly notice: Notice | null
  readonly update: StoreUpdate | null
  readonly links: readonly Link[]
}

/** What was read, and the parts that were refused (named as `topics`, `features.deeper`, `links[1]` and so on). */
export interface ParsedAppConfig {
  readonly config: AppConfig
  /** The names of what the app refused: it keeps its built-in value for each. */
  readonly rejected: string[]
  /** Names the app ignores but the owner most likely mistyped. Only the website's check says so. */
  readonly unknown: string[]
}

/** The most bytes the file may have; a longer one is refused whole. */
export const MAX_CONFIG_BYTES = MAX_BYTES

const section = (id: string, english: string, hindi: string): Section => ({ id, en: english, hi: hindi })

/** The sections of the news as the app was made with them, which are the ones of the website. */
export const BUILT_IN_SECTIONS: readonly Section[] = [
  section('us', en.section_us, hi.section_us),
  section('india', en.section_india, hi.section_india),
  section('world', en.section_world, hi.section_world),
  section('tech', en.section_tech, hi.section_tech),
  section('business', en.section_business, hi.section_business),
  section('science', en.section_science, hi.section_science),
]

/**
 * What a build that has not read the file does: the same as the file the website publishes (public/app-config.json, which a test keeps
 * equal). The publisher's name is off here as it is there and on the website itself; the native app had it on until a file said otherwise.
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  topics: BUILT_IN_TOPICS,
  sections: BUILT_IN_SECTIONS,
  features: { deeper: true, shareLinks: true, ads: true, adPages: true, sourceName: false },
  adPageEvery: STORIES_PER_AD,
  layout: { heroMaxWidth: 1.25, heroMaxHeight: 0.6, photoMinWidth: 0.6, photoMinHeight: 0.3 },
  notice: null,
  update: null,
  links: [],
}

const REPLACEMENT_CHARACTER = '\uFFFD'

/**
 * Reads the file. The whole file is refused (null) when it is empty, over MAX_CONFIG_BYTES, not UTF-8, not strict JSON, or not of schema
 * version 1; otherwise each part is judged on its own and the refused ones are named in `rejected`. Never throws.
 *
 * The text of a file that was not UTF-8 reaches the app with the replacement character where the bad bytes were, and cannot be told
 * from a file that really holds that character; neither is taken.
 */
export function parseAppConfig(text: string): ParsedAppConfig | null {
  if (text === '' || utf8Length(text) > MAX_CONFIG_BYTES || text.includes(REPLACEMENT_CHARACTER)) return null
  try {
    const root = parseStrict(text)
    const checked = checkAppConfig(root)
    // The check names 'schemaVersion' only for a document it refuses whole: not an object, or not of schema version 1.
    if (!(root instanceof Map) || checked.rejected.includes('schemaVersion')) return null
    const refused = new Set(checked.rejected)
    const config: AppConfig = {
      topics: taken(root, 'topics', refused, readTopics) ?? DEFAULT_APP_CONFIG.topics,
      sections: taken(root, 'sections', refused, readSections) ?? DEFAULT_APP_CONFIG.sections,
      features: readFeatures(root, refused),
      adPageEvery: readPageEvery(root, refused),
      layout: readLayout(root, refused),
      notice: taken(root, 'notice', refused, readNotice) ?? null,
      update: taken(root, 'update', refused, readUpdate) ?? null,
      links: taken(root, 'links', refused, (value) => readLinks(value, refused)) ?? [],
    }
    return { config, rejected: checked.rejected, unknown: checked.unknown }
  } catch {
    // Not strict JSON, or something no rule foresaw: the file is refused whole and the one taken before stays.
    return null
  }
}

type Tree = Map<string, unknown>

const isTree = (value: unknown): value is Tree => value instanceof Map
const textOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const numberOf = (value: unknown): number | undefined => (value instanceof Num ? Number(value.text) : undefined)
const isAudience = (value: unknown): value is Audience => value === 'all' || value === 'play' || value === 'direct'

/** What a part holds, if the file has it and the check let it through; undefined where the built-in value stays. */
function taken<T>(root: Tree, name: string, refused: ReadonlySet<string>, read: (value: unknown) => T | undefined): T | undefined {
  return root.has(name) && !refused.has(name) ? read(root.get(name)) : undefined
}

function readTopics(value: unknown): Topic[] | undefined {
  if (!Array.isArray(value)) return undefined
  const topics: Topic[] = []
  for (const entry of value) {
    if (!isTree(entry)) return undefined
    const id = textOf(entry.get('id'))
    const emoji = textOf(entry.get('emoji'))
    const english = textOf(entry.get('en'))
    const hindi = textOf(entry.get('hi'))
    if (id === undefined || emoji === undefined || english === undefined || hindi === undefined) return undefined
    topics.push({ id, emoji, en: english, hi: hindi })
  }
  return topics
}

function readSections(value: unknown): Section[] | undefined {
  if (!Array.isArray(value)) return undefined
  const sections: Section[] = []
  for (const entry of value) {
    if (!isTree(entry)) return undefined
    const id = textOf(entry.get('id'))
    const english = textOf(entry.get('en'))
    const hindi = textOf(entry.get('hi'))
    if (id === undefined || english === undefined || hindi === undefined) return undefined
    sections.push({ id, en: english, hi: hindi })
  }
  return sections
}

function readFeatures(root: Tree, refused: ReadonlySet<string>): Features {
  const features: { -readonly [K in keyof Features]: boolean } = { ...DEFAULT_APP_CONFIG.features }
  const listed = taken(root, 'features', refused, (value) => (isTree(value) ? value : undefined))
  if (listed === undefined) return features
  for (const name of KNOWN_FEATURES) {
    const value = listed.get(name)
    if (typeof value === 'boolean' && !refused.has(`features.${name}`)) features[name] = value
  }
  return features
}

function readPageEvery(root: Tree, refused: ReadonlySet<string>): number {
  const ads = taken(root, 'ads', refused, (value) => (isTree(value) ? value : undefined))
  const every = ads !== undefined && !refused.has('ads.pageEvery') ? numberOf(ads.get('pageEvery')) : undefined
  return every ?? DEFAULT_APP_CONFIG.adPageEvery
}

function readLayout(root: Tree, refused: ReadonlySet<string>): Layout {
  const layout: { -readonly [K in keyof Layout]: number } = { ...DEFAULT_APP_CONFIG.layout }
  const listed = taken(root, 'layout', refused, (value) => (isTree(value) ? value : undefined))
  if (listed === undefined) return layout
  for (const name of Object.keys(LAYOUT_RANGES) as (keyof typeof LAYOUT_RANGES)[]) {
    const number = refused.has(`layout.${name}`) ? undefined : numberOf(listed.get(name))
    if (number !== undefined) layout[name] = number
  }
  return layout
}

function readNotice(value: unknown): Notice | undefined {
  if (!isTree(value)) return undefined
  const id = textOf(value.get('id'))
  const title = value.get('title')
  const body = value.get('body')
  if (id === undefined || !isTree(title) || !isTree(body)) return undefined
  const titleEn = textOf(title.get('en'))
  const bodyEn = textOf(body.get('en'))
  const build = value.has('build') ? value.get('build') : 'all'
  const until = value.has('until') ? Date.parse(textOf(value.get('until')) ?? '') : 0
  const min = value.has('minVersionCode') ? numberOf(value.get('minVersionCode')) : 0
  const max = value.has('maxVersionCode') ? numberOf(value.get('maxVersionCode')) : 0
  if (titleEn === undefined || bodyEn === undefined || !isAudience(build) || Number.isNaN(until) || min === undefined || max === undefined) {
    return undefined
  }
  return {
    id,
    important: value.get('level') === 'important',
    titleEn,
    titleHi: textOf(title.get('hi')) ?? '',
    bodyEn,
    bodyHi: textOf(body.get('hi')) ?? '',
    url: textOf(value.get('url')) ?? '',
    build,
    minVersionCode: min,
    maxVersionCode: max,
    untilMillis: until,
  }
}

function readUpdate(value: unknown): StoreUpdate | undefined {
  if (!isTree(value)) return undefined
  const latest = numberOf(value.get('latestVersionCode'))
  const name = textOf(value.get('latestVersionName'))
  const least = numberOf(value.get('minSupportedVersionCode'))
  if (latest === undefined || name === undefined || least === undefined) return undefined
  return { latestVersionCode: latest, latestVersionName: name, minSupportedVersionCode: least }
}

function readLinks(value: unknown, refused: ReadonlySet<string>): Link[] | undefined {
  if (!Array.isArray(value)) return undefined
  const links: Link[] = []
  value.forEach((entry, index) => {
    const link = refused.has(`links[${index}]`) ? undefined : readLink(entry)
    if (link !== undefined) links.push(link)
  })
  return links
}

function readLink(value: unknown): Link | undefined {
  if (!isTree(value)) return undefined
  const id = textOf(value.get('id'))
  const english = textOf(value.get('en'))
  const hindi = textOf(value.get('hi'))
  const url = textOf(value.get('url'))
  const build = value.has('build') ? value.get('build') : 'all'
  if (id === undefined || english === undefined || hindi === undefined || url === undefined || !isAudience(build)) return undefined
  return { id, en: english, hi: hindi, url, build }
}

/** Whether this is a chip the news can be narrowed to: the empty one, for all, always is. */
export function hasSection(config: AppConfig, id: string): boolean {
  return id === '' || config.sections.some((entry) => entry.id === id)
}

export const sectionLabel = (entry: Section, lang: Lang): string => (lang === 'hi' ? entry.hi : entry.en)

export const noticeTitle = (notice: Notice, lang: Lang): string => (lang === 'hi' && notice.titleHi !== '' ? notice.titleHi : notice.titleEn)

export const noticeBody = (notice: Notice, lang: Lang): string => (lang === 'hi' && notice.bodyHi !== '' ? notice.bodyHi : notice.bodyEn)

export const linkLabel = (link: Link, lang: Lang): string => (lang === 'hi' ? link.hi : link.en)

/** Whether a link is for this build: the Google Play build (`playBuild`) or any other. */
export const linkApplies = (link: Link, playBuild: boolean): boolean => link.build === 'all' || (link.build === 'play') === playBuild

export interface NoticeContext {
  /** Whether this is the Google Play build (false: the build the website hands out). */
  playBuild: boolean
  /** The version code installed. */
  versionCode: number
  /** The time, in milliseconds since 1970. */
  now: number
}

/** Whether a notice is for this build, this version, and this moment. */
export function noticeApplies(notice: Notice, context: NoticeContext): boolean {
  if ((notice.build === 'play' && !context.playBuild) || (notice.build === 'direct' && context.playBuild)) return false
  const { versionCode } = context
  if ((notice.minVersionCode > 0 && versionCode < notice.minVersionCode) || (notice.maxVersionCode > 0 && versionCode > notice.maxVersionCode)) {
    return false
  }
  return notice.untilMillis === 0 || context.now < notice.untilMillis
}

/**
 * Whether a story's line names its publisher: exactly when the website's switch says so, in every build, so that the app does what
 * the website does. (The Google Play build of the native app named the publisher whatever the file said, for Google Play's News policy
 * on aggregators; that rule is gone by the owner's decision.)
 */
export const showsSourceName = (config: AppConfig): boolean => config.features.sourceName
