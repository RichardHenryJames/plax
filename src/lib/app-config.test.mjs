import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkAppConfig, parseStrict, plain, emoji, allowedLink, Num, MAX_BYTES, MAX_TOPICS, MAX_SECTIONS, MAX_LINKS, KNOWN_FEATURES, LAYOUT_RANGES, LINK_HOSTS,
} from './app-config-rules.ts'

// public/app-config.json is data the Android app reads at run time (and the website reads for the numbers it shares with the
// app), so that a topic, a switch, a notice or a number can change without a new Google Play bundle. A bad file must never get
// out: these tests apply the app's rules to the real file, and run the same cases as the app's own test
// (mobile/src/config/__tests__/app-config.test.ts), so that what passes here is what the app takes whole.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const FILE = read('public/app-config.json')

test('the published file is plain strict JSON, small, and passes every rule of the app', () => {
  assert.ok(Buffer.byteLength(FILE, 'utf8') <= MAX_BYTES, `at most ${MAX_BYTES} bytes: the app refuses a larger one`)
  const checked = checkAppConfig(parseStrict(FILE))
  assert.deepEqual(checked.rejected, [], `the app would keep its built-in value for: ${checked.rejected.join(', ')}`)
  assert.deepEqual(checked.unknown, [], `names the app ignores (a typing mistake?): ${checked.unknown.join(', ')}`)
})

test('the published file says every setting, so that nothing is left to a default by accident', () => {
  const root = parseStrict(FILE)
  for (const section of ['schemaVersion', 'topics', 'sections', 'features', 'ads', 'layout', 'notice', 'update', 'links']) {
    assert.ok(root.has(section), `${section} is missing`)
  }
  assert.deepEqual([...root.get('features').keys()].sort(), [...KNOWN_FEATURES].sort())
  assert.deepEqual([...root.get('layout').keys()].sort(), Object.keys(LAYOUT_RANGES).sort())
  assert.ok(root.get('topics').length <= MAX_TOPICS)
  assert.ok(root.get('sections').length <= MAX_SECTIONS)
  assert.ok(root.get('links').length <= MAX_LINKS)
})

const expand = (text) => text.replace(/@repeat:(.):(\d+)/g, (_, character, count) => character.repeat(Number(count)))
const CASES = JSON.parse(read('src/lib/app-config-cases.json')).cases

test('the cases are named once each', () => {
  const names = CASES.map((entry) => entry.name)
  assert.equal(new Set(names).size, names.length)
  assert.ok(CASES.length >= 100, 'the cases are the contract with the app')
})

for (const entry of CASES) {
  test(`case: ${entry.name}`, () => {
    const text = expand(entry.json ?? JSON.stringify(entry.config))
    // A document that is not strict JSON is refused whole, which the app and this check both call a schema they do not take.
    let root
    try { root = parseStrict(text) } catch { root = undefined }
    const checked = root === undefined ? { rejected: ['schemaVersion'], unknown: [] } : checkAppConfig(root)
    assert.deepEqual([...checked.rejected].sort(), [...entry.rejected].sort(), 'what the app refuses')
    // The app ignores what it does not know; only the website's check says so.
    assert.deepEqual([...checked.unknown].sort(), [...(entry.webOnly ?? [])].sort(), 'what only this check flags')
  })
}

test('the strict reader refuses what the app refuses', () => {
  for (const bad of ['{"a":1,"a":2}', '{"a":1,}', '{a:1}', "{'a':1}", '{"a":1} x', '// c\n{}', '{"a":NaN}', '[1,]', '{"a":01}', '', '{"a":"\u0001"}']) {
    assert.throws(() => parseStrict(bad), undefined, bad)
  }
  assert.throws(() => parseStrict('[[[[[[[1]]]]]]]'), /too deep/)
  assert.ok(parseStrict('{"a":5.0}').get('a') instanceof Num)
  assert.equal(parseStrict('{"a":5.0}').get('a').text, '5.0')
  assert.equal(parseStrict(' {"__proto__": 1} ').get('__proto__').text, '1', 'a name such as __proto__ is only a name')
})

test('text, emoji and link rules', () => {
  assert.ok(plain('Hello', 10) && plain('a\nb', 10, true))
  assert.ok(!plain('a\nb', 10) && !plain(' a', 10) && !plain('', 10) && !plain('a\u200bb', 10) && !plain('a\u00a0b', 10))
  assert.ok(emoji('\ud83d\udcf0') && emoji('\u2328\ufe0f') && !emoji('A') && !emoji('') && !emoji('1'))
  assert.ok(allowedLink('https://plax-rouge.vercel.app/news') && allowedLink('https://plax-rouge.vercel.app/news/contact'))
  assert.ok(!allowedLink('https://plax-rouge.vercel.app/newsletter') && !allowedLink('https://plax-rouge.vercel.app/'))
  assert.ok(!allowedLink('https://plax-rouge.vercel.app/news/./x') && !allowedLink('https://plax-rouge.vercel.app/news//x'))
})

test('every topic the file lists is one the website can serve', () => {
  const store = read('src/lib/store.ts')
  const known = [...store.slice(store.indexOf('export const TOPICS'), store.indexOf('] as const')).matchAll(/id: '([a-z0-9]+)'/g)].map((m) => m[1])
  assert.ok(known.includes('news') && known.includes('stocks'))
  const listed = parseStrict(FILE).get('topics').map((topic) => topic.get('id'))
  const missing = listed.filter((id) => !known.includes(id))
  assert.deepEqual(missing, [], 'a topic in the app that the feed has no sources for would show nothing: add it to TOPICS and the feed first')
})

test('the website draws stories with the numbers the file publishes, so that the website and the app stay alike', () => {
  // The file is the one place the owner changes them for the app; the website reads its own constants, so a change in the file that is
  // not made in the website too fails here instead of leaving the two to differ.
  const layout = parseStrict(FILE).get('layout')
  const hook = read('src/components/useCardFit.ts')
  const web = (name) => Number(new RegExp(`const ${name} = ([0-9.]+)`).exec(hook)?.[1])
  for (const [key, name] of [['heroMaxWidth', 'HERO_MAX_WIDTH'], ['heroMaxHeight', 'HERO_MAX_HEIGHT'], ['photoMinWidth', 'PHOTO_MIN_WIDTH'], ['photoMinHeight', 'PHOTO_MIN_HEIGHT']]) {
    assert.equal(web(name), Number(layout.get(key).text), `${name} in useCardFit.ts differs from layout.${key} in app-config.json: change both`)
  }
  const slots = read('src/lib/ad-slots.ts')
  assert.equal(Number(/export const STORIES_PER_AD = (\d+)/.exec(slots)?.[1]), Number(parseStrict(FILE).get('ads').get('pageEvery').text),
    'STORIES_PER_AD in ad-slots.ts differs from ads.pageEvery in app-config.json: change both')
})

test('the website shows a publisher\'s name exactly when the file the app reads says so', () => {
  const features = parseStrict(FILE).get('features')
  const website = /export const SHOW_SOURCE_NAME = (true|false)/.exec(read('src/lib/app-features.ts'))?.[1]
  assert.ok(website, 'SHOW_SOURCE_NAME not found in app-features.ts')
  assert.equal(website, String(features.get('sourceName')), 'SHOW_SOURCE_NAME in app-features.ts differs from features.sourceName in app-config.json: change both')
  // The places that print a story's outlet in the app itself (the card, the saved list) ask the same constant, so that one switch
  // takes the name off all of them.
  assert.match(read('src/components/Card.tsx'), /const showSource = SHOW_SOURCE_NAME && !!card\.source/, 'the card does not ask SHOW_SOURCE_NAME')
  assert.match(read('src/components/SavedScreen.tsx'), /SHOW_SOURCE_NAME && card\.source/, 'the saved list does not ask SHOW_SOURCE_NAME')
})

test('the app names a publisher exactly when the file says so, in every build, the Google Play one too', () => {
  // The native app's Google Play build (1.7.1 and before) named the publisher whatever the file said, for Google Play's News policy on
  // aggregators, which asks for clear information about the publishing sources of what is shown. The React Native app does what the
  // website does: the one switch decides, and flipping features.sourceName to true brings the name back with no new bundle. If a build
  // is ever to name it whatever the file says, change this test, the declaration in Play Console and showsSourceName together.
  const config = read('mobile/src/config/app-config.ts')
  assert.match(config, /export const showsSourceName = \(config: AppConfig\): boolean => config\.features\.sourceName\s*$/m, 'the app no longer follows features.sourceName alone')
  assert.match(read('mobile/src/app/FeedView.tsx'), /const namesSource = showsSourceName\(config\)/, 'the credit line does not ask showsSourceName')
  assert.doesNotMatch(read('mobile/src/app/story-text.ts'), /isPlayBuild|playBuild/, 'the credit line looks at the build')
})

test('the news sections the file lists are the ones the website has, in the same order', () => {
  const types = read('src/lib/types.ts')
  const start = types.indexOf('export const NEWS_SECTIONS')
  const block = types.slice(start, types.indexOf('\n]', start))
  const website = [...block.matchAll(/id: '([a-z0-9]+)'/g)].map((m) => m[1])
  const listed = parseStrict(FILE).get('sections').map((section) => section.get('id'))
  assert.ok(website.length >= 6)
  assert.deepEqual(listed, website, 'a section on the website that the app does not list (or the other way round)')
})

test('the app takes its rules, and the list of sites a link may open, from this file\'s own module', () => {
  // The app imports app-config-rules.ts (as @shared/app-config-rules) instead of keeping a copy, so the two cannot differ.
  assert.match(read('mobile/src/config/app-config.ts'), /from '@shared\/app-config-rules'/)
  assert.match(read('mobile/src/updates/apk-updates.ts'), /from '@shared\/app-config-rules'/)
  assert.ok(LINK_HOSTS.length >= 1 && LINK_HOSTS.every((host) => /^[a-z0-9.-]+$/.test(host)), 'LINK_HOSTS is a list of host names')
})

test('the server sends the file as JSON that no cache keeps', () => {
  const config = read('next.config.js')
  const rule = /source:\s*'\/app-config\.json',\s*headers:\s*\[([^\]]*)\]/.exec(config)
  assert.ok(rule, 'next.config.js has no rule for /app-config.json')
  assert.match(rule[1], /application\/json; charset=utf-8/)
  assert.match(rule[1], /no-store/)
  assert.match(rule[1], /nosniff/)
})
