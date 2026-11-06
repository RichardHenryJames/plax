import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCTION_SITE } from '@/build'
import { HttpError, type RequestOptions } from '@/platform/http'
import { fakeFetch, setVariant } from '@/test/helpers'
import type { RequestFn } from '@/config/site-file'
import {
  APK_CHECK_INTERVAL,
  MAX_APK_BYTES,
  MAX_MANIFEST,
  MIN_SDK,
  PLAY_URL,
  UpdateFeedError,
  createUpdateFeed,
  apkCheckDue,
  fetchRelease,
  parseUpdateFeed,
  shouldPrompt,
  type Release,
} from '../apk-updates'
import { APK, ORIGIN, SHA, answer, manifest, manifestText } from './helpers'

const ask = (text: string, installed = 9, android = 36) => parseUpdateFeed(text, { installed, android, origin: ORIGIN })
const RELEASE_10: Release = { versionCode: 10, versionName: '1.4.0', apkUrl: APK }

describe('which releases are offered', () => {
  it('are the newer ones that this phone can run', () => {
    expect(ask(manifestText())).toEqual({ ok: true, release: RELEASE_10 })
    // The same version is not an update, nor is an older one.
    expect(ask(manifestText(), 10, 36)).toEqual({ ok: true, release: null })
    expect(ask(manifestText(), 11, 36)).toEqual({ ok: true, release: null })
    // A phone older than the build's minimum is not offered it.
    expect(ask(manifestText(), 9, 25)).toEqual({ ok: true, release: null })
    expect(ask(manifestText({ minSdk: 33 }), 9, 32)).toEqual({ ok: true, release: null })
    expect(ask(manifestText({ minSdk: 33 }), 9, 33)).toEqual({ ok: true, release: RELEASE_10 })
  })

  it('are named by what the feed says, whatever it advertises besides', () => {
    expect(ask(manifestText({ versionCode: 2_147_483_647, versionName: '10.20.30', apkUrl: `${ORIGIN}/plax-10.20.30.apk` }), 9, 36)).toEqual({
      ok: true,
      release: { versionCode: 2_147_483_647, versionName: '10.20.30', apkUrl: `${ORIGIN}/plax-10.20.30.apk` },
    })
  })
})

describe('the download', () => {
  it('is only the exact versioned https file of this site', () => {
    for (const url of [
      'http://plax-rouge.vercel.app/news/plax-1.4.0.apk', 'https://example.org/news/plax-1.4.0.apk',
      'https://plax-rouge.vercel.app.example.org/news/plax-1.4.0.apk', `${ORIGIN}/plax-1.3.9.apk`, `${ORIGIN}/plax-1.4.0.apk?token=anything`,
      `${ORIGIN}/plax-1.4.0.apk#fragment`, 'https://user@plax-rouge.vercel.app/news/plax-1.4.0.apk', 'https://plax-rouge.vercel.app:444/news/plax-1.4.0.apk',
      `${ORIGIN}/other/../plax-1.4.0.apk`, 'https://plax-rouge.vercel.app/plax-1.4.0.apk', 'https://www.plax-rouge.vercel.app/news/plax-1.4.0.apk',
      `${ORIGIN}/plax-1.4.0.APK`, `${ORIGIN}/vanishr-1.4.0.apk`, `${ORIGIN}/plax-1.4.0.apk `, ` ${APK}`, '', 'javascript:alert(1)',
      'file:///data/local/tmp/app.apk', `${ORIGIN}//plax-1.4.0.apk`, `${ORIGIN}/plax-1.4.0.apk/`,
    ]) {
      expect(ask(manifestText({ apkUrl: url }))).toEqual({ ok: false })
    }
  })

  it('is the file of the origin it is asked about, which is how the test build names its own', () => {
    const other = 'http://10.0.2.2:8787/news'
    const verdict = parseUpdateFeed(manifestText({ apkUrl: `${other}/plax-1.4.0.apk` }), { installed: 9, android: 36, origin: other })
    expect(verdict).toEqual({ ok: true, release: { versionCode: 10, versionName: '1.4.0', apkUrl: `${other}/plax-1.4.0.apk` } })
    expect(ask(manifestText({ apkUrl: `${other}/plax-1.4.0.apk` }))).toEqual({ ok: false })
  })
})

describe('metadata that is malformed, repeated, unknown or oversized', () => {
  const valid = manifestText()
  const replacing = (from: string, to: string) => {
    expect(valid).toContain(from)
    return valid.replace(from, to)
  }
  const bad: [string, string][] = [
    ['null', 'null'], ['a list', '[]'], ['an empty object', '{}'], ['nothing', ''], ['a space', ' '], ['a second object after it', `${valid}{}`],
    ['text after it', `${valid}x`], ['cut short', valid.slice(0, valid.length - 1)],
    ['a repeated name', replacing('"versionCode":10', '"versionCode":10,"versionCode":11')],
    ['a code as text', replacing('"versionCode":10', '"versionCode":"10"')], ['a code with a fraction', replacing('"versionCode":10', '"versionCode":10.1')],
    ['a code in exponent form', replacing('"versionCode":10', '"versionCode":1e1')], ['a code with a leading zero', replacing('"versionCode":10', '"versionCode":010')],
    ['a code over a 32-bit integer', replacing('"versionCode":10', '"versionCode":2147483648')], ['a negative code', replacing('"versionCode":10', '"versionCode":-1')],
    ['a code of zero', replacing('"versionCode":10', '"versionCode":0')],
    ['schema 2', replacing('"schemaVersion":1', '"schemaVersion":2')], ['schema as text', replacing('"schemaVersion":1', '"schemaVersion":"1"')],
    ['a size of zero', replacing('"size":1850000', '"size":0')], ['a size over the limit', replacing('"size":1850000', '"size":100000000')],
    ['a minimum Android of zero', replacing('"minSdk":26', '"minSdk":0')], ['a minimum Android below the app\'s', replacing('"minSdk":26', '"minSdk":25')],
    ['a minimum Android that cannot be', replacing('"minSdk":26', '"minSdk":1001')],
    ['a checksum of null', replacing(`"sha256":"${SHA}"`, '"sha256":null')], ['a checksum in capitals', valid.replace(SHA, 'A'.repeat(64))],
    ['a checksum one short', valid.replace(SHA, 'a'.repeat(63))], ['a checksum of other letters', valid.replace(SHA, 'g'.repeat(64))],
    ['a name that goes up a folder', valid.replace(/1\.4\.0/g, '../apk')], ['a name with a suffix', replacing('"versionName":"1.4.0"', '"versionName":"1.4.0-preview"')],
    ['a name with a leading zero', replacing('"versionName":"1.4.0"', '"versionName":"01.4.0"')], ['a name of two parts', replacing('"versionName":"1.4.0"', '"versionName":"1.4"')],
    ['a name of four parts', valid.replace(/1\.4\.0/g, '1.4.0.1')],
    ['a field it does not know', replacing('"versionCode":10', '"script":"code","versionCode":10')], ['a missing size', replacing(',"size":1850000', '')],
    ['a comment before it', `// comment\n${valid}`], ['single quotes', "{'schemaVersion':1}"], ['a trailing comma', valid.replace(/\}$/, ',}')],
    ['more than it may hold', ' '.repeat(MAX_MANIFEST) + valid], ['a name that is a number', replacing('"versionName":"1.4.0"', '"versionName":1.4')],
    ['a link that is a number', replacing(`"apkUrl":"${APK}"`, '"apkUrl":1')], ['a minimum that is text', replacing('"minSdk":26', '"minSdk":"26"')],
    ['a checksum that is a number', replacing(`"sha256":"${SHA}"`, '"sha256":1')], ['a size as text', replacing('"size":1850000', '"size":"1850000"')],
    ['nested values', replacing('"size":1850000', '"size":[1850000]')],
  ]

  it.each(bad)('is refused whole: %s', (_name, text) => {
    expect(ask(text)).toEqual({ ok: false })
  })

  it('has a name of 40 characters at the most', () => {
    const name = (digits: number) => `1.2.${'3'.repeat(digits)}`
    const long = name(36)
    expect(long.length).toBe(40)
    expect(ask(manifestText({ versionName: long, apkUrl: `${ORIGIN}/plax-${long}.apk` }))).toMatchObject({ ok: true })
    const tooLong = name(37)
    expect(ask(manifestText({ versionName: tooLong, apkUrl: `${ORIGIN}/plax-${tooLong}.apk` }))).toEqual({ ok: false })
  })

  it('has a size of 95 MB at the most', () => {
    expect(ask(manifestText({ size: MAX_APK_BYTES }))).toMatchObject({ ok: true })
    expect(ask(manifestText({ size: MAX_APK_BYTES + 1 }))).toEqual({ ok: false })
    expect(MAX_APK_BYTES).toBe(95 * 1024 * 1024)
  })

  it('has a minimum Android from the app\'s own up to 1000', () => {
    expect(ask(manifestText({ minSdk: MIN_SDK }), 9, 36)).toMatchObject({ ok: true })
    expect(ask(manifestText({ minSdk: MIN_SDK - 1 }), 9, 36)).toEqual({ ok: false })
    expect(ask(manifestText({ minSdk: 1000 }), 9, 36)).toEqual({ ok: true, release: null })
    expect(MIN_SDK).toBe(26)
  })

  it('has exactly the room it says: up to MAX_MANIFEST bytes, counted as bytes', () => {
    const padded = (length: number) => valid.padEnd(length, ' ')
    expect(ask(padded(MAX_MANIFEST))).toMatchObject({ ok: true })
    expect(ask(padded(MAX_MANIFEST + 1))).toEqual({ ok: false })
  })

  it('skips one byte order mark in front, as the native app\'s reader did, and no other thing in front', () => {
    expect(ask(`\ufeff${valid}`)).toEqual({ ok: true, release: RELEASE_10 })
    expect(ask(`\ufeff\ufeff${valid}`)).toEqual({ ok: false })
    expect(ask(` \ufeff${valid}`)).toEqual({ ok: false })
  })

  it('takes JSON written with spaces and line breaks', () => {
    expect(ask(JSON.stringify(manifest(), null, 2))).toEqual({ ok: true, release: RELEASE_10 })
  })

  it('never throws, whatever it is given', () => {
    for (const text of ['\ud800', '{"schemaVersion":1,"a":"\\ud800"}', '\u0000', '{"a":"\\u00"}', '9'.repeat(4000), '{'.repeat(4000), '[[[[[[[[[[1]]]]]]]]]]']) {
      expect(() => ask(text)).not.toThrow()
      expect(ask(text)).toEqual({ ok: false })
    }
  })
})

describe('the cool-downs', () => {
  const now = 1_800_000_000_000

  it('allow a check when it was never made, the clock went backwards, or a day has passed', () => {
    expect(apkCheckDue(now, 0)).toBe(true)
    expect(apkCheckDue(now, now - 1000)).toBe(false)
    expect(apkCheckDue(now, now - APK_CHECK_INTERVAL + 1)).toBe(false)
    expect(apkCheckDue(now, now - APK_CHECK_INTERVAL)).toBe(true)
    expect(apkCheckDue(now, now + 1000)).toBe(true)
    expect(APK_CHECK_INTERVAL).toBe(24 * 3_600_000)
  })

  it('keep a release the reader put off from being offered for a day, but not a different one', () => {
    const release: Release = { versionCode: 10, versionName: '1.4.0', apkUrl: APK }
    expect(shouldPrompt(release, 10, now - 1000, now)).toBe(false)
    expect(shouldPrompt(release, 9, now - 1000, now)).toBe(true)
    expect(shouldPrompt(release, 11, now - 1000, now)).toBe(true)
    expect(shouldPrompt(release, 10, now - APK_CHECK_INTERVAL, now)).toBe(true)
    expect(shouldPrompt(release, 0, 0, now)).toBe(true)
  })
})

/** A request function that returns this answer, or fails, and keeps what it was asked. */
function sending(reply: ReturnType<typeof answer> | Error) {
  const calls: { url: string; options: RequestOptions | undefined }[] = []
  const send: RequestFn = async (url, options) => {
    calls.push({ url, options })
    if (reply instanceof Error) throw reply
    return reply
  }
  return { send, calls }
}

const QUESTION = { installed: 9, android: 36, origin: ORIGIN }

describe('asking the website', () => {
  it('asks for the feed of this site, and carries nothing about the reader', async () => {
    const { send, calls } = sending(answer(manifestText()))
    await fetchRelease(send, QUESTION)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${ORIGIN}/updates.json`)
    const options = calls[0].options as RequestOptions
    expect(options.method).toBeUndefined()
    expect(options.body).toBeUndefined()
    expect(options.headers).toEqual({ Accept: 'application/json', 'Cache-Control': 'no-store' })
    expect(options.headers).not.toHaveProperty('Authorization')
    expect(options.headers).not.toHaveProperty('Cookie')
    expect(calls[0].url).not.toContain('?')
    expect(options.timeoutMs).toBe(6000)
    expect(options.maxChars).toBe(MAX_MANIFEST)
  })

  it('takes a good answer as an update, and an up to date app is told nothing', async () => {
    await expect(fetchRelease(sending(answer(manifestText())).send, QUESTION)).resolves.toEqual(RELEASE_10)
    await expect(fetchRelease(sending(answer(manifestText(), { type: 'application/json; charset=utf-8' })).send, QUESTION)).resolves.toEqual(RELEASE_10)
    await expect(fetchRelease(sending(answer(manifestText())).send, { ...QUESTION, installed: 10 })).resolves.toBeNull()
  })

  it('is told only that it is unavailable, for anything else', async () => {
    for (const status of [204, 301, 302, 304, 401, 404, 429, 500, 503]) {
      await expect(fetchRelease(sending(answer(manifestText(), { status })).send, QUESTION)).rejects.toBeInstanceOf(UpdateFeedError)
    }
    for (const type of ['text/html', 'text/plain', 'application/octet-stream', 'application/xml', 'image/png', null]) {
      await expect(fetchRelease(sending(answer(manifestText(), { type })).send, QUESTION)).rejects.toBeInstanceOf(UpdateFeedError)
    }
    await expect(fetchRelease(sending(answer('{}')).send, QUESTION)).rejects.toBeInstanceOf(UpdateFeedError)
    await expect(fetchRelease(sending(answer(manifestText({ schemaVersion: 2 }))).send, QUESTION)).rejects.toBeInstanceOf(UpdateFeedError)
  })

  it('bounds the answer, and being offline is not an update', async () => {
    await expect(fetchRelease(sending(answer(' '.repeat(MAX_MANIFEST + 1))).send, QUESTION)).rejects.toBeInstanceOf(UpdateFeedError)
    for (const failure of [new HttpError('network'), new HttpError('timeout'), new HttpError('too-large'), new HttpError('insecure'), new Error('x')]) {
      await expect(fetchRelease(sending(failure).send, QUESTION)).rejects.toBeInstanceOf(UpdateFeedError)
    }
  })

  it('says nothing of what was asked or answered when it fails', async () => {
    const failure = await fetchRelease(sending(answer('secret text of the answer')).send, QUESTION).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(UpdateFeedError)
    expect(String((failure as Error).message)).toBe('update feed unavailable')
    expect(JSON.stringify(failure)).not.toMatch(/secret|plax-rouge/)
  })

  it('works through the real request, and a redirect or an answer too long is only unavailable', async () => {
    setVariant('preview')
    const { calls } = fakeFetch({ [`${ORIGIN}/updates.json`]: { body: manifestText() } })
    await expect(createUpdateFeed({ site: () => ORIGIN })(9, 36)).resolves.toEqual(RELEASE_10)
    expect(calls[0]).toMatchObject({ url: `${ORIGIN}/updates.json`, method: 'GET', body: undefined })
    expect(calls[0].headers).toEqual({ Accept: 'application/json', 'Cache-Control': 'no-store' })
    fakeFetch({ [`${ORIGIN}/updates.json`]: { status: 302, headers: { location: 'https://example.org/updates.json', 'content-type': 'application/json' }, body: '' } })
    await expect(createUpdateFeed({ site: () => ORIGIN })(9, 36)).rejects.toBeInstanceOf(UpdateFeedError)
    fakeFetch({ [`${ORIGIN}/updates.json`]: { body: ' '.repeat(MAX_MANIFEST + 1) } })
    await expect(createUpdateFeed({ site: () => ORIGIN })(9, 36)).rejects.toBeInstanceOf(UpdateFeedError)
    fakeFetch({ [`${ORIGIN}/updates.json`]: { networkError: true } })
    await expect(createUpdateFeed({ site: () => ORIGIN })(9, 36)).rejects.toBeInstanceOf(UpdateFeedError)
  })

  it('asks the address its site() gives each time, and never over http outside the test build', async () => {
    setVariant('preview')
    let address = ORIGIN
    const feed = createUpdateFeed({ site: () => address })
    const { calls } = fakeFetch({ [`${ORIGIN}/updates.json`]: { body: manifestText() } })
    await feed(9, 36)
    address = 'http://plax-rouge.vercel.app/news'
    await expect(feed(9, 36)).rejects.toBeInstanceOf(UpdateFeedError)
    expect(calls).toHaveLength(1)
  })

  it('can be given its own request function', async () => {
    const { send, calls } = sending(answer(manifestText()))
    await createUpdateFeed({ request: send, site: () => ORIGIN })(9, 36)
    expect(calls).toHaveLength(1)
  })
})

describe('the Google Play page', () => {
  it('is the listing of the Google Play build', () => {
    expect(PLAY_URL).toBe('https://play.google.com/store/apps/details?id=com.plaxlabs.news')
  })
})

describe('the feed the website publishes', () => {
  const root = join(__dirname, '..', '..', '..', '..')
  const publicDir = join(root, 'public')
  const feedFile = join(publicDir, 'updates.json')
  const published = existsSync(feedFile) ? readFileSync(feedFile) : null
  const maybe = published === null ? it.skip : it

  maybe('is one this app accepts, written without a byte order mark', () => {
    const bytes = published as Buffer
    expect(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf).toBe(false)
    const verdict = parseUpdateFeed(bytes.toString('utf8'), { installed: 0, android: 36, origin: PRODUCTION_SITE })
    expect(verdict).toMatchObject({ ok: true })
    expect((verdict as { release: Release | null }).release).not.toBeNull()
  })

  maybe('does not advertise a build newer than this source', () => {
    const verdict = parseUpdateFeed((published as Buffer).toString('utf8'), { installed: 0, android: 36, origin: PRODUCTION_SITE })
    const advertised = (verdict as { release: Release }).release.versionCode
    const config = readFileSync(join(root, 'mobile', 'app.config.js'), 'utf8')
    const code = Number(/const VERSION_CODE = (\d+)/.exec(config)?.[1])
    expect(Number.isInteger(code)).toBe(true)
    // The native app's last build was 18; the app that replaces it is numbered higher, so the feed may name either.
    expect(advertised).toBeLessThanOrEqual(code)
  })

  maybe('names a file that is published next to it, of the size and checksum it says, and no other', () => {
    const verdict = parseUpdateFeed((published as Buffer).toString('utf8'), { installed: 0, android: 36, origin: PRODUCTION_SITE })
    const release = (verdict as { release: Release }).release
    const apk = join(publicDir, `plax-${release.versionName}.apk`)
    expect(existsSync(apk)).toBe(true)
    const fields = JSON.parse((published as Buffer).toString('utf8')) as { size: number; sha256: string }
    expect(statSync(apk).size).toBe(fields.size)
    expect(createHash('sha256').update(readFileSync(apk)).digest('hex')).toBe(fields.sha256)
    expect(readdirSync(publicDir).filter((name) => name.endsWith('.apk'))).toEqual([`plax-${release.versionName}.apk`])
  })
})
