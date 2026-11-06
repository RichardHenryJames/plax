import { Num, parseStrict } from '@shared/app-config-rules'
import { APPLICATION_IDS } from '@/build'
import { DAY, dueAfter, utf8Length } from '@/config/limits'
import { defaultRequest, fetchSiteFile, type RequestFn } from '@/config/site-file'

/** The Google Play page of the app (what the Google Play build's menu and its update prompt open). */
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${APPLICATION_IDS.play}`

/** The most bytes the feed may have. */
export const MAX_MANIFEST = 4096
/** The oldest Android release the app runs on; keep in step with minSdkVersion in app.config.js. */
export const MIN_SDK = 26
/** The most an APK the feed advertises may weigh. */
export const MAX_APK_BYTES = 95 * 1024 * 1024
/** An automatic look for a newer APK is made at most this often. */
export const APK_CHECK_INTERVAL = DAY
/** The whole request: the native app allowed 3 seconds to connect, 3 to read and 6 in all. */
const FEED_TIMEOUT_MS = 6_000

const FIELDS = ['schemaVersion', 'versionCode', 'versionName', 'minSdk', 'apkUrl', 'sha256', 'size'] as const
const NUMBERS: ReadonlySet<string> = new Set(['schemaVersion', 'versionCode', 'minSdk', 'size'])
const WHOLE_NUMBER = /^[1-9][0-9]{0,9}$/
const VERSION_NAME = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
const SHA256 = /^[0-9a-f]{64}$/
const MAX_VERSION_CODE = 2_147_483_647

/** A build newer than the installed one, which this phone can run. */
export interface Release {
  readonly versionCode: number
  readonly versionName: string
  readonly apkUrl: string
}

/** What the feed says to one phone: it is not valid (`ok: false`), or it names a newer release for this phone, or none. */
export type FeedVerdict = { readonly ok: true; readonly release: Release | null } | { readonly ok: false }

export interface FeedQuestion {
  /** The version code installed. */
  installed: number
  /** This phone's Android API level. */
  android: number
  /** The website's address: the APK must be the exact versioned file of this site. */
  origin: string
}

/**
 * Reads the feed (updates.json) and checks what it says before the app believes any of it. Anything unexpected (an unknown, repeated or
 * missing field, a wrong type, a number written another way than plain digits, an address that is not exactly this site's file for
 * that version) makes the whole feed invalid, not a guess. A port of AppUpdates.parse. Never throws.
 *
 * The app only offers the update: the browser downloads the APK and Android asks the reader to approve the install, so nothing is ever
 * installed silently. The checksum and size are there for people comparing a download; the app does not verify the file itself. What
 * stops a file from anyone else is Android, which installs an update only when the publisher's key signed it.
 */
export function parseUpdateFeed(text: string, question: FeedQuestion): FeedVerdict {
  const invalid: FeedVerdict = { ok: false }
  const size = utf8Length(text)
  if (size === 0 || size > MAX_MANIFEST) return invalid
  let root: unknown
  try {
    // A byte order mark in front is skipped, as the native app's reader skipped it.
    root = parseStrict(text.startsWith('\uFEFF') ? text.slice(1) : text)
  } catch {
    return invalid
  }
  if (!(root instanceof Map) || root.size !== FIELDS.length) return invalid
  const fields = new Map<string, string>()
  for (const [name, value] of root) {
    if (!(FIELDS as readonly string[]).includes(name)) return invalid
    if (NUMBERS.has(name)) {
      if (!(value instanceof Num) || !WHOLE_NUMBER.test(value.text)) return invalid
      fields.set(name, value.text)
    } else {
      if (typeof value !== 'string') return invalid
      fields.set(name, value)
    }
  }
  const versionCode = Number(fields.get('versionCode'))
  const minSdk = Number(fields.get('minSdk'))
  const versionName = fields.get('versionName') ?? ''
  const apkUrl = fields.get('apkUrl') ?? ''
  if (
    fields.get('schemaVersion') !== '1' ||
    versionCode > MAX_VERSION_CODE ||
    minSdk < MIN_SDK ||
    minSdk > 1000 ||
    Number(fields.get('size')) > MAX_APK_BYTES ||
    versionName.length > 40 ||
    !VERSION_NAME.test(versionName) ||
    !SHA256.test(fields.get('sha256') ?? '') ||
    apkUrl !== `${question.origin}/plax-${versionName}.apk`
  ) {
    return invalid
  }
  if (versionCode <= question.installed || minSdk > question.android) return { ok: true, release: null }
  return { ok: true, release: { versionCode, versionName, apkUrl } }
}

/** True when an automatic check is allowed: never checked, the clock went backwards, or a day has passed. */
export const apkCheckDue = (now: number, lastCheck: number): boolean => dueAfter(now, lastCheck, APK_CHECK_INTERVAL)

/** A release the reader put off is not offered again for a day, but a newer one is offered at once. */
export function shouldPrompt(release: Release, dismissedVersion: number, dismissedAt: number, now: number): boolean {
  return release.versionCode !== dismissedVersion || apkCheckDue(now, dismissedAt)
}

/** The feed could not be had or is not valid. Carries nothing of what was asked or answered. */
export class UpdateFeedError extends Error {
  constructor() {
    super('update feed unavailable')
    this.name = 'UpdateFeedError'
  }
}

/**
 * Asks the website's feed (at `${origin}/updates.json`) whether it advertises a newer build that this phone can run. Rejects with an
 * UpdateFeedError when the answer does not come, is not status 200 and JSON of at most MAX_MANIFEST bytes, or is not valid; resolves
 * with null when there is no newer build.
 */
export async function fetchRelease(send: RequestFn, question: FeedQuestion): Promise<Release | null> {
  const text = await fetchSiteFile(send, `${question.origin}/updates.json`, { maxBytes: MAX_MANIFEST, timeoutMs: FEED_TIMEOUT_MS })
  const verdict = text === null ? null : parseUpdateFeed(text, question)
  if (verdict === null || !verdict.ok) throw new UpdateFeedError()
  return verdict.release
}

/** Asks about the installed version code and this phone's Android API level. Rejects when the website cannot be asked. */
export type Feed = (installed: number, android: number) => Promise<Release | null>

export function createUpdateFeed(deps: { request?: RequestFn; site: () => string }): Feed {
  const send = deps.request ?? defaultRequest
  return (installed, android) => fetchRelease(send, { installed, android, origin: deps.site() })
}
