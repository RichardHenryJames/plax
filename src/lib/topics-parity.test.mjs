import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The topic list is kept in three places: the website (lib/store.ts, with the Hindi names in lib/i18n.ts) and the app (Topic.java, with
// its names in res/values and res/values-hi). A topic in one and not another is a tile that opens an empty feed, or has no name.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const ids = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1])

const web = ids(read('./store.ts'), /\{ id: '([a-z]+)', label: '/g)
const app = ids(read('../../android/app/src/main/java/com/plaxlabs/news/Topic.java'), /^\s+[A-Z]+\("([a-z]+)", R\.string\.topic_/gm)

test('the website and the app have the same topics', () => {
  assert.ok(web.length >= 18, `${web.length} topics read from store.ts`)
  assert.deepEqual([...app].sort(), [...web].sort())
  assert.equal(new Set(web).size, web.length, 'a topic is listed twice')
})

test('every topic has a Hindi name on the website and in the app, and an English one in the app', () => {
  const block = read('./i18n.ts').match(/export const TOPIC_LABELS_HI[^{]*\{([\s\S]*?)\n\}/)
  assert.ok(block, 'TOPIC_LABELS_HI not found in lib/i18n.ts')
  const hindi = ids(block[1], /^\s+([a-z]+): '/gm)
  assert.ok(hindi.length >= 17 && hindi.length < 30, `${hindi.length} Hindi names read: the block was not cut right`)
  const english = ids(read('../../android/app/src/main/res/values/strings.xml'), /<string name="topic_([a-z]+)">/g)
  const appHindi = ids(read('../../android/app/src/main/res/values-hi/strings.xml'), /<string name="topic_([a-z]+)">/g)
  for (const id of web) {
    assert.ok(hindi.includes(id), `no Hindi name for ${id} in lib/i18n.ts`)
    assert.ok(english.includes(id), `no English name for ${id} in the app`)
    assert.ok(appHindi.includes(id), `no Hindi name for ${id} in the app`)
  }
})

test('the Stocks topic is the second one, next to the News, and has its page', () => {
  assert.deepEqual(web.slice(0, 2), ['news', 'stocks'])
  assert.deepEqual(app.slice(0, 2), ['news', 'stocks'])
  assert.match(read('./seo.ts'), /id: 'stocks',/)
})
