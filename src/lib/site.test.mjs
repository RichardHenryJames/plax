import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_DISPLAY, SITE_HOST, SITE_URL } from './site.ts'
import { BASE_PATH } from './base-path.ts'

// The address the Plax website and both Android apps use. It stopped working once before: the domain they were built
// around expired, and every installed app lost its stories and its sign-in at once. These tests keep the address in one
// place and fail if a different one, or the expired one, is left anywhere the apps or the site run from.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

// Built from two parts so that this file does not contain the expired domain itself.
const EXPIRED = new RegExp('plaxlabs' + '\\.com', 'i')

test('the site address is one https origin under the base path, and the written form matches it', () => {
  assert.match(SITE_HOST, /^https:\/\/[a-z0-9.-]+$/, 'an https origin with no path or trailing slash')
  assert.doesNotMatch(SITE_HOST, EXPIRED, 'the expired domain')
  assert.equal(BASE_PATH, '/news')
  assert.equal(SITE_URL, `${SITE_HOST}${BASE_PATH}`)
  assert.equal(SITE_DISPLAY, SITE_URL.slice('https://'.length), 'the address without its scheme')
})

test('the Android app has the same address built in', () => {
  const source = read('android/app/src/main/java/com/plaxlabs/news/FeedApi.java')
  const built = /static final String SITE = "([^"]+)";/.exec(source)
  assert.ok(built, 'FeedApi.SITE not found')
  assert.equal(built[1], SITE_URL, 'the app would talk to a different address from the one the site publishes')
})

test('the update feed names a file on this site, with the version in the name', () => {
  const feed = JSON.parse(read('public/updates.json'))
  assert.equal(feed.apkUrl, `${SITE_URL}/plax-${feed.versionName}.apk`)
  assert.ok(existsSync(join(ROOT, 'public', `plax-${feed.versionName}.apk`)), 'the advertised file is not in public/')
})

// Where the site and the apps are built from. Documentation and test fixtures are free to mention history.
const RUNS_FROM = ['src', 'next.config.js', 'vercel.json', 'public/updates.json', 'android/app/build.gradle', 'android/app/src/main',
  'android/publish-update.ps1', 'android/verify-update.ps1', 'scripts']
const EXTENSIONS = /\.(ts|tsx|js|mjs|json|css|java|xml|gradle|ps1|yml|properties)$/
// The two files that explain the history of the address.
const EXEMPT = new Set(['src/lib/site.ts', 'src/lib/site.test.mjs'])

function files(path) {
  const full = join(ROOT, path)
  if (!existsSync(full)) return []
  if (statSync(full).isFile()) return [path]
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(child)
    return EXTENSIONS.test(entry.name) ? [child] : []
  })
}

test('nothing the site or the apps run from mentions the expired domain', () => {
  const found = []
  for (const file of RUNS_FROM.flatMap(files)) {
    if (EXEMPT.has(file)) continue
    read(file).split(/\r?\n/).forEach((line, index) => {
      if (EXPIRED.test(line)) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(found, [], `the expired domain is still used:\n${found.join('\n')}`)
})
