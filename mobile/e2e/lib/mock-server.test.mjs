import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createMockServer } from './mock-server.mjs'
import { imageFor, pool } from './fixtures.mjs'

const server = createMockServer({ port: 8799 })
const get = (path) => fetch(`http://127.0.0.1:8799${path}`)
before(() => server.start())
after(() => server.stop())

test('the feed gives 30 stories of the topic asked for, newest first, in the language asked for', async () => {
  const body = await (await get('/news/api/feed?categories=news&limit=30&lang=en')).json()
  assert.equal(body.cards.length, 30)
  assert.ok(body.cards.every((c) => c.category === 'news'))
  assert.ok(body.cards[0].publishedAt > body.cards[29].publishedAt)
  const hindi = await (await get('/news/api/feed?categories=news&limit=5&lang=hi')).json()
  assert.ok(/[\u0900-\u097f]/.test(hindi.cards[0].title))
})

test('the stories the app has are left out, and the feed runs out', async () => {
  const first = await (await get('/news/api/feed?categories=science&limit=30&lang=en')).json()
  const ids = first.cards.map((c) => c.id)
  const rest = await (await get(`/news/api/feed?categories=science&limit=30&lang=en&exclude=${ids.join(',')}`)).json()
  assert.equal(rest.cards.length, 10)
  assert.ok(rest.cards.every((c) => !ids.includes(c.id)))
  const none = await (await get(`/news/api/feed?categories=science&limit=30&lang=en&exclude=${[...ids, ...rest.cards.map((c) => c.id)].join(',')}`)).json()
  assert.equal(none.cards.length, 0)
})

test('a personalised mix interleaves its topics', async () => {
  const body = await (await get('/news/api/feed?categories=science,space,books&limit=6&lang=en')).json()
  assert.deepEqual(body.cards.map((c) => c.category), ['science', 'space', 'books', 'science', 'space', 'books'])
})

test('a story is valid for the app: unique ids, https links, a 32-digit signature, text within limits', () => {
  const all = pool('news', 'en', Date.now())
  assert.equal(new Set(all.map((c) => c.id)).size, all.length)
  for (const c of all) {
    assert.match(c.sig, /^[0-9a-f]{32}$/)
    assert.ok(c.sourceUrl.startsWith('https://'))
    assert.ok(c.image === '' || c.image.startsWith('https://'))
    assert.ok(c.title.length > 0 && c.title.length <= 2000 && c.content.length <= 8000)
  }
  assert.ok(all.some((c) => c.image === ''), 'some stories have no picture')
  assert.ok(all.some((c) => c.image.includes('broken')), 'some pictures are broken')
  assert.ok(all.some((c) => c.content.length < 90) && all.some((c) => c.content.length > 700))
})

test('the pictures are PNG files of several shapes, and a broken one is not there', async () => {
  const image = imageFor('portrait-2.png')
  assert.equal(image.readUInt32BE(0), 0x89504e47)
  assert.equal(image.readUInt32BE(16), 640)
  assert.equal(image.readUInt32BE(20), 960)
  assert.equal((await get('/news/e2e-img/landscape-1.png')).headers.get('content-type'), 'image/png')
  assert.equal((await get('/news/e2e-img/broken-1.png')).status, 404)
})

test('the feed can be made to fail, in the ways a network does', async () => {
  server.setFeed({ mode: 'error500' })
  assert.equal((await get('/news/api/feed?categories=news')).status, 500)
  server.setFeed({ mode: 'error429' })
  assert.equal((await get('/news/api/feed?categories=news')).status, 429)
  server.setFeed({ mode: 'invalid' })
  assert.equal(await (await get('/news/api/feed?categories=news')).text(), 'this is not json')
  server.setFeed({ mode: 'drop' })
  await assert.rejects(get('/news/api/feed?categories=news'))
  server.setFeed({ mode: 'ok' })
  assert.equal((await get('/news/api/feed?categories=news')).status, 200)
})

test('newer stories can arrive, and the settings file can be changed', async () => {
  server.inject('news', 'en', 2)
  const body = await (await get('/news/api/feed?categories=news&limit=3&lang=en')).json()
  assert.ok(body.cards[0].id.startsWith('e2e-fresh-'))
  const before = await (await get('/news/app-config.json')).json()
  assert.equal(before.schemaVersion, 1)
  server.setConfig({ ...before, notice: { id: 'x1', title: 'Hello', body: 'A notice' } })
  assert.equal((await (await get('/news/app-config.json')).json()).notice.id, 'x1')
  server.setConfig(null)
  assert.equal((await (await get('/news/app-config.json')).json()).notice, null)
})

test('what the app asked for is kept for a test to look at', async () => {
  server.clearLog()
  await get('/news/api/feed?categories=news&lang=hi&limit=7')
  const [entry] = server.requests('/news/api/feed')
  assert.equal(entry.query.lang, 'hi')
  assert.equal(entry.query.limit, '7')
})

test('Go deeper and Share answer as the real site does', async () => {
  const deeper = await (await fetch('http://127.0.0.1:8799/news/api/deeper', { method: 'POST', body: JSON.stringify({ title: 'A title', content: 'x', lang: 'en' }) })).json()
  assert.equal(deeper.insights.length, 3)
  const share = await (await fetch('http://127.0.0.1:8799/news/api/share', { method: 'POST', body: JSON.stringify({ id: 'abc' }) })).json()
  assert.equal(share.id, 'abc')
  assert.ok(share.url.includes('/news/s/abc'))
})
