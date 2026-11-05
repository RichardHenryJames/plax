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
// out: these tests apply the app's rules to the real file, and run the same cases as AppConfigTest in the app, so that what
// passes here is what the app takes whole.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const FILE = read('public/app-config.json')
const LIBRARY = read('android/app/src/main/java/com/plaxlabs/news/AppConfig.java')

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
  // The name is on: Google Play asks an aggregator for clear information about its publishing sources, and the declaration in Play
  // Console says each card shows its source. If it is ever switched off on purpose, change this test and the declaration with it.
  assert.equal(features.get('sourceName'), true)
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

test('the list of sites a link may open is the same in the website and in the app', () => {
  const written = /LINK_HOSTS\s*=\s*Set\.of\(([^)]*)\)/.exec(LIBRARY)
  assert.ok(written, 'LINK_HOSTS not found in AppConfig.java')
  const hosts = [...written[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
  assert.deepEqual(hosts, [...LINK_HOSTS].sort())
})

test('the server sends the file as JSON that no cache keeps', () => {
  const config = read('next.config.js')
  const rule = /source:\s*'\/app-config\.json',\s*headers:\s*\[([^\]]*)\]/.exec(config)
  assert.ok(rule, 'next.config.js has no rule for /app-config.json')
  assert.match(rule[1], /application\/json; charset=utf-8/)
  assert.match(rule[1], /no-store/)
  assert.match(rule[1], /nosniff/)
})
