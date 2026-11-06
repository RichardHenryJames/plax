import { SITE_HOST } from './site.ts'
import { BASE_PATH } from './base-path.ts'

// The rules of public/app-config.json, the file the Plax website serves to the Android app (at /news/app-config.json) and
// that the website itself reads for the numbers it shares with the app. The app (mobile/src/config/app-config.ts) imports these same
// rules (as @shared/app-config-rules) and applies them to what it receives, keeping its built-in value for anything that breaks one;
// this is the same check for the owner, run by the tests before a bad file can be published. app-config.test.mjs runs the cases
// (app-config-cases.json) through this, and the app's own test runs the same cases through the app's parser, so the two cannot drift
// apart.
//
// The file is DATA ONLY. It can switch things off, change a number within its bounds, list the topics, show one notice,
// say that a newer version is on Google Play, and add a few links. It never holds code, so it cannot fix a bug, change a
// screen or add a feature: those need a new app version, or an over-the-air update of the app's JavaScript (mobile/README.md).

export const SCHEMA_VERSION = 1
export const MAX_BYTES = 16 * 1024
export const MAX_TOPICS = 40
export const MAX_SECTIONS = 12
export const MAX_LINKS = 4
/** The switches the app knows. A switch is on unless it is false. */
export const KNOWN_FEATURES = ['deeper', 'shareLinks', 'ads', 'adPages', 'sourceName'] as const
/** Stories between full-page ads. */
export const PAGE_EVERY_RANGE = [3, 20] as const
/** How big a story's picture may be (a share of the column's width, and of the page's height) and the least it is given. */
export const LAYOUT_RANGES = {
  heroMaxWidth: [1, 1.6],
  heroMaxHeight: [0.4, 0.7],
  photoMinWidth: [0.4, 0.7],
  photoMinHeight: [0.2, 0.35],
} as const
/** Hosts, besides this site and Google Play, that a link in the menu or a notice may open. */
export const LINK_HOSTS = [
  'instagram.com', 'www.instagram.com', 'x.com', 'twitter.com', 'www.facebook.com', 'www.youtube.com', 'youtube.com', 'youtu.be',
  't.me', 'chat.whatsapp.com', 'www.linkedin.com', 'github.com',
] as const

/** A number as it was written, so that "5.0" can be told from "5". */
export class Num {
  readonly text: string
  constructor(text: string) { this.text = text }
}

/**
 * Reads JSON the way the app does: strictly. No comments, no trailing commas, no name twice in one object, nothing after the
 * value, at most six levels deep. Objects come back as Maps and numbers as Num, so that nothing is guessed.
 */
export function parseStrict(text: string): unknown {
  let at = 0
  const fail = (why: string): never => { throw new Error(`${why} at ${at}`) }
  const space = () => { while (at < text.length && ' \t\n\r'.includes(text[at])) at++ }
  const string = (): string => {
    at++ // the opening quote
    let out = ''
    for (;;) {
      if (at >= text.length) fail('unterminated string')
      const c = text[at++]
      if (c === '"') return out
      if (c < ' ') fail('control character in string')
      if (c !== '\\') { out += c; continue }
      const e = text[at++]
      if ('"\\/'.includes(e)) out += e
      else if (e === 'b') out += '\b'
      else if (e === 'f') out += '\f'
      else if (e === 'n') out += '\n'
      else if (e === 'r') out += '\r'
      else if (e === 't') out += '\t'
      else if (e === 'u') {
        const hex = text.slice(at, at + 4)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad escape')
        out += String.fromCharCode(parseInt(hex, 16))
        at += 4
      } else fail('bad escape')
    }
  }
  const value = (depth: number): unknown => {
    if (depth > 6) fail('too deep')
    space()
    const c = text[at]
    if (c === '{') {
      at++
      const map = new Map<string, unknown>()
      space()
      if (text[at] === '}') { at++; return map }
      for (;;) {
        space()
        if (text[at] !== '"') fail('a name was expected')
        const name = string()
        if (map.has(name)) fail(`the name ${name} is repeated`)
        space()
        if (text[at++] !== ':') fail('a colon was expected')
        map.set(name, value(depth + 1))
        space()
        if (text[at] === ',') { at++; continue }
        if (text[at] === '}') { at++; return map }
        fail('a comma or the end was expected')
      }
    }
    if (c === '[') {
      at++
      const list: unknown[] = []
      space()
      if (text[at] === ']') { at++; return list }
      for (;;) {
        list.push(value(depth + 1))
        space()
        if (text[at] === ',') { at++; continue }
        if (text[at] === ']') { at++; return list }
        fail('a comma or the end was expected')
      }
    }
    if (c === '"') return string()
    if (text.startsWith('true', at)) { at += 4; return true }
    if (text.startsWith('false', at)) { at += 5; return false }
    if (text.startsWith('null', at)) { at += 4; return null }
    const number = /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y
    number.lastIndex = at
    const found = number.exec(text)
    if (!found) return fail('a value was expected')
    at += found[0].length
    return new Num(found[0])
  }
  const root = value(0)
  space()
  if (at !== text.length) fail('something follows the value')
  return root
}

const isMap = (value: unknown): value is Map<string, unknown> => value instanceof Map

function intIn(value: unknown, low: number, high: number): number | null {
  if (!(value instanceof Num) || !/^-?(0|[1-9][0-9]*)$/.test(value.text) || value.text.length > 10) return null
  const number = Number(value.text)
  return number >= low && number <= high ? number : null
}

function numberIn(value: unknown, low: number, high: number): number | null {
  if (!(value instanceof Num)) return null
  const number = Number(value.text)
  return Number.isFinite(number) && number >= low && number <= high ? number : null
}

/**
 * One line of plain text (or up to six line breaks, when multiline): no control, format, separator, private-use or
 * unassigned characters, no space at either end, nothing but the plain space for a space.
 */
export function plain(value: unknown, max: number, multiline = false): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) return false
  if (value !== value.trim()) return false
  let lines = 0
  for (const ch of value) {
    if (ch === '\n') {
      if (!multiline) return false
      lines++
      continue
    }
    if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(ch)) return false
    if (/\p{Zs}/u.test(ch) && ch !== ' ') return false
  }
  return lines <= 6
}

const EMOJI_RANGES: [number, number][] = [
  [0x00a9, 0x00a9], [0x00ae, 0x00ae], [0x203c, 0x203c], [0x2049, 0x2049], [0x2122, 0x2122], [0x2139, 0x2139],
  [0x2190, 0x21ff], [0x2300, 0x23ff], [0x24c2, 0x24c2], [0x25a0, 0x27bf], [0x2900, 0x297f], [0x2b00, 0x2bff],
  [0x3030, 0x3030], [0x303d, 0x303d], [0x3297, 0x3297], [0x3299, 0x3299], [0x1f000, 0x1faff],
]
const JOINERS = new Set([0xfe0f, 0x200d, 0x20e3])

/** An emoji, or a short sequence of them: judged by code point ranges, not by what a phone's Unicode data knows. */
export function emoji(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16) return false
  const points = Array.from(value, (ch) => ch.codePointAt(0) as number)
  if (JOINERS.has(points[0])) return false
  return points.every((p) => JOINERS.has(p) || EMOJI_RANGES.some(([low, high]) => p >= low && p <= high))
}

const URL_SHAPE = /^https:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9])(\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/
const PACKAGE_QUERY = /^\?id=[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/

/**
 * A link the app may open from the menu or a notice: https only, no port, no user name, no fragment; a page of this site, the
 * Google Play page of an app, or a page of one of a few well-known sites. Judged on the text itself, so that the browser's
 * and the app's readers of addresses cannot disagree about where it goes.
 */
export function allowedLink(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200) return false
  const match = URL_SHAPE.exec(value)
  if (!match) return false
  const host = match[1]
  const path = match[2] ?? ''
  const query = match[3] ?? ''
  if (/\/\.|\/\/|%2e|%2f|%5c/i.test(path) || host.includes('..')) return false
  const site = new URL(SITE_HOST).host
  if (host === site) return path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)
  if (host === 'play.google.com') return path === '/store/apps/details' && PACKAGE_QUERY.test(query)
  return (LINK_HOSTS as readonly string[]).includes(host)
}

const ID = /^[A-Za-z0-9._-]{1,40}$/
const TOPIC_ID = /^[a-z][a-z0-9]{1,23}$/
const SECTION_ID = /^[a-z][a-z0-9]{1,15}$/
const VERSION_NAME = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
const UNTIL = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/
const BUILDS = ['all', 'play', 'direct']

function untilValid(text: string): boolean {
  if (!UNTIL.test(text)) return false
  const date = new Date(text)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) === text.slice(0, 19)
}

export interface Checked {
  /** Sections, or parts of one, the app will not take: it keeps its built-in value for each. */
  rejected: string[]
  /** Names the app ignores but the owner most likely mistyped. */
  unknown: string[]
}

function topicsOk(value: unknown, unknown: string[]): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TOPICS) return false
  const seen = new Set<string>()
  value.forEach((entry, index) => {
    if (isMap(entry)) for (const key of entry.keys()) if (!['id', 'emoji', 'en', 'hi'].includes(key)) unknown.push(`unknown:topics[${index}].${key}`)
  })
  for (const entry of value) {
    if (!isMap(entry)) return false
    const id = entry.get('id')
    if (typeof id !== 'string' || !TOPIC_ID.test(id) || seen.has(id)) return false
    seen.add(id)
    if (!emoji(entry.get('emoji')) || !plain(entry.get('en'), 24) || !plain(entry.get('hi'), 24)) return false
  }
  return seen.has('news')
}

/** The chips of the News topic. An empty list is allowed: the chips are then left out. */
function sectionsOk(value: unknown, unknown: string[]): boolean {
  if (!Array.isArray(value) || value.length > MAX_SECTIONS) return false
  const seen = new Set<string>()
  value.forEach((entry, index) => {
    if (isMap(entry)) for (const key of entry.keys()) if (!['id', 'en', 'hi'].includes(key)) unknown.push(`unknown:sections[${index}].${key}`)
  })
  for (const entry of value) {
    if (!isMap(entry)) return false
    const id = entry.get('id')
    if (typeof id !== 'string' || !SECTION_ID.test(id) || seen.has(id)) return false
    seen.add(id)
    if (!plain(entry.get('en'), 16) || !plain(entry.get('hi'), 16)) return false
  }
  return true
}

function textPair(value: unknown, max: number, multiline: boolean): boolean {
  return isMap(value) && plain(value.get('en'), max, multiline) && (!value.has('hi') || plain(value.get('hi'), max, multiline))
}

function noticeOk(value: Map<string, unknown>): boolean {
  const id = value.get('id')
  if (typeof id !== 'string' || !ID.test(id)) return false
  if (value.get('level') !== 'info' && value.get('level') !== 'important') return false
  if (!textPair(value.get('title'), 60, false) || !textPair(value.get('body'), 400, true)) return false
  if (value.has('url') && !allowedLink(value.get('url'))) return false
  if (value.has('build') && !BUILDS.includes(value.get('build') as string)) return false
  const min = value.has('minVersionCode') ? intIn(value.get('minVersionCode'), 0, 9_999_999) : 0
  const max = value.has('maxVersionCode') ? intIn(value.get('maxVersionCode'), 0, 9_999_999) : 0
  if (min === null || max === null || (min > 0 && max > 0 && min > max)) return false
  if (value.has('until') && !(typeof value.get('until') === 'string' && untilValid(value.get('until') as string))) return false
  return true
}

function updateOk(value: Map<string, unknown>): boolean {
  const latest = intIn(value.get('latestVersionCode'), 1, 9_999_999)
  const name = value.get('latestVersionName')
  if (latest === null || typeof name !== 'string' || !VERSION_NAME.test(name)) return false
  return intIn(value.get('minSupportedVersionCode'), 0, latest) !== null
}

function linkOk(value: unknown): boolean {
  if (!isMap(value)) return false
  const id = value.get('id')
  if (typeof id !== 'string' || !ID.test(id)) return false
  if (!plain(value.get('en'), 30) || !plain(value.get('hi'), 30) || !allowedLink(value.get('url'))) return false
  return !value.has('build') || BUILDS.includes(value.get('build') as string)
}

/**
 * What the app would not take from this document (already read with parseStrict), by the names the app's parser uses. A
 * document whose schemaVersion is not 1 is refused whole.
 */
export function checkAppConfig(root: unknown): Checked {
  const rejected: string[] = []
  const unknown: string[] = []
  if (!isMap(root)) return { rejected: ['schemaVersion'], unknown }
  const version = root.get('schemaVersion')
  if (!(version instanceof Num) || version.text !== String(SCHEMA_VERSION)) return { rejected: ['schemaVersion'], unknown }
  for (const key of root.keys()) {
    if (!['schemaVersion', 'topics', 'sections', 'features', 'ads', 'layout', 'notice', 'update', 'links'].includes(key)) unknown.push(`unknown:${key}`)
  }

  if (root.has('topics') && !topicsOk(root.get('topics'), unknown)) rejected.push('topics')
  if (root.has('sections') && !sectionsOk(root.get('sections'), unknown)) rejected.push('sections')

  if (root.has('features')) {
    const features = root.get('features')
    if (!isMap(features)) rejected.push('features')
    else {
      for (const [key, value] of features) {
        if (!(KNOWN_FEATURES as readonly string[]).includes(key)) unknown.push(`unknown:features.${key}`)
        else if (typeof value !== 'boolean') rejected.push(`features.${key}`)
      }
    }
  }

  if (root.has('ads')) {
    const ads = root.get('ads')
    if (!isMap(ads)) rejected.push('ads')
    else {
      for (const key of ads.keys()) if (key !== 'pageEvery') unknown.push(`unknown:ads.${key}`)
      if (ads.has('pageEvery') && intIn(ads.get('pageEvery'), PAGE_EVERY_RANGE[0], PAGE_EVERY_RANGE[1]) === null) rejected.push('ads.pageEvery')
    }
  }

  if (root.has('layout')) {
    const layout = root.get('layout')
    if (!isMap(layout)) rejected.push('layout')
    else {
      // Each number is judged on its own. The ranges keep a picture's least (at most 70% of the column, 35% of the page) below its
      // most (at least 100% and 40%), so the two can never cross; and the least is kept small enough that a story with a long
      // headline and a long summary still keeps its photograph on a 360 x 640 page at a 1.3 text size (the app's layout test,
      // mobile/src/ui/story/__tests__/layout.test.ts, lays stories out at both ends of every range).
      for (const [key, value] of layout) {
        const range = (LAYOUT_RANGES as Record<string, readonly [number, number]>)[key]
        if (!range) { unknown.push(`unknown:layout.${key}`); continue }
        if (numberIn(value, range[0], range[1]) === null) rejected.push(`layout.${key}`)
      }
    }
  }

  if (root.has('notice')) {
    const notice = root.get('notice')
    if (notice !== null && !(isMap(notice) && noticeOk(notice))) rejected.push('notice')
  }

  if (root.has('update')) {
    const update = root.get('update')
    if (update !== null && !(isMap(update) && updateOk(update))) rejected.push('update')
  }

  if (root.has('links')) {
    const links = root.get('links')
    if (!Array.isArray(links)) rejected.push('links')
    else {
      const seen = new Set<string>()
      links.forEach((link, index) => {
        const id = isMap(link) ? link.get('id') : undefined
        if (index >= MAX_LINKS || !linkOk(link) || seen.has(id as string)) rejected.push(`links[${index}]`)
        else seen.add(id as string)
      })
    }
  }

  return { rejected, unknown }
}
