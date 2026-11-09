import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createMockServer } from './mock-server.mjs'
import { ENGLISH_ONLY_IN_HINDI, hindiTranslation, imageFor, pool } from './fixtures.mjs'

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

test('a feed with a cap gives no more than that many stories at a time, and goes on from where the app is', async () => {
  server.setFeed({ cap: 5 })
  const first = await (await get('/news/api/feed?categories=news&limit=30&lang=en')).json()
  assert.equal(first.cards.length, 5)
  const ids = first.cards.map((c) => c.id)
  const rest = await (await get(`/news/api/feed?categories=news&limit=30&lang=en&exclude=${ids.join(',')}`)).json()
  assert.equal(rest.cards.length, 5)
  assert.ok(rest.cards.every((c) => !ids.includes(c.id)))
  server.setFeed({ cap: undefined })
  assert.equal((await (await get('/news/api/feed?categories=news&limit=30&lang=en')).json()).cards.length, 30)
})

test('no two stories of a pool are one event to the app, which would show only one of them', async () => {
  // The app's own rule, the website's story-engine: stories with the same headline less than 16 hours apart are one event.
  const engine = await import('../../../src/lib/story-engine.ts')
  for (const lang of ['en', 'hi']) {
    for (const category of ['news', 'science']) {
      const stories = pool(category, lang, Date.now())
      const prints = stories.map((story) => engine.printOf(story))
      for (let a = 0; a < stories.length; a += 1) {
        for (let b = a + 1; b < stories.length; b += 1) assert.equal(engine.sameEvent(prints[a], prints[b]), false, `${category}/${lang}: stories ${a} and ${b} are one event`)
      }
    }
  }
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

test('the feed of Hindi has stories of its own for the news and most topics, and only the English ones for Stocks and Books, as the live feed has', async () => {
  const devanagari = /[\u0900-\u097f]/
  for (const category of ['news', 'science', 'space', 'history']) {
    const { cards } = await (await get(`/news/api/feed?categories=${category}&limit=30&lang=hi`)).json()
    assert.ok(cards.length > 0 && cards.every((c) => devanagari.test(c.title) && devanagari.test(c.content)), `${category} is in Hindi`)
  }
  for (const category of ENGLISH_ONLY_IN_HINDI) {
    const { cards } = await (await get(`/news/api/feed?categories=${category}&limit=30&lang=hi`)).json()
    assert.ok(cards.length > 0 && cards.every((c) => !devanagari.test(c.title) && !devanagari.test(c.content)), `${category} is in English in Hindi mode`)
    assert.ok(cards.every((c) => c.content.length >= 40), 'with text enough to be translated')
    const english = await (await get(`/news/api/feed?categories=${category}&limit=30&lang=en`)).json()
    assert.deepEqual(cards.map((c) => c.id), english.cards.map((c) => c.id), 'the very stories of the English feed')
  }
  assert.deepEqual(ENGLISH_ONLY_IN_HINDI, ['stocks', 'books'])
})

const post = (path, body) => fetch(`http://127.0.0.1:8799${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })
const asked = (title = 'Markets close higher as banks lead the gains', content = 'Analysts said the rally was led by banks and large technology companies, with small caps lagging behind.') => ({ title, content, type: 'microessay', lang: 'hi', category: 'stocks', card: true })

test('the endpoint that translates a card answers in the real one’s shape: Hindi words with Markdown emphasis, the same for the same request', async () => {
  server.setSummarize({ mode: 'ok', delayMs: 0, failFirst: 0 })
  const first = await (await post('/news/api/summarize', asked())).json()
  assert.deepEqual(Object.keys(first).sort(), ['content', 'title', 'translated', 'type'])
  assert.match(first.title, /[\u0900-\u097f]/)
  assert.match(first.content, /^\*\*[^*]+\*\*/)
  assert.equal(first.translated, true)
  assert.deepEqual(await (await post('/news/api/summarize', asked())).json(), first)
  const other = await (await post('/news/api/summarize', asked('Government extends deadline for filing returns'))).json()
  assert.notEqual(other.title, first.title)
  assert.deepEqual(hindiTranslation(asked()), first)
})

test('the endpoint that translates a card can fail in the ways the real one does', async () => {
  const status = async (body = asked()) => (await post('/news/api/summarize', body)).status
  server.setSummarize({ mode: 'error500' })
  assert.equal(await status(), 500)
  server.setSummarize({ mode: 'error429' })
  assert.equal(await status(), 429)
  server.setSummarize({ mode: 'invalid' })
  assert.equal(await (await post('/news/api/summarize', asked())).text(), 'this is not json')
  server.setSummarize({ mode: 'english' })
  const english = await (await post('/news/api/summarize', asked())).json()
  assert.equal(english.content, asked().content, 'the English as it was, with a 200')
  server.setSummarize({ mode: 'drop' })
  await assert.rejects(post('/news/api/summarize', asked()))
  server.setSummarize({ mode: 'ok' })
  assert.equal(await status({ title: 'x' }), 400, 'no content is refused')
})

test('the endpoint that translates a card can fail only its first requests, and take its time', async () => {
  server.setSummarize({ mode: 'ok', failFirst: 2, delayMs: 0 })
  assert.deepEqual([(await post('/news/api/summarize', asked())).status, (await post('/news/api/summarize', asked())).status, (await post('/news/api/summarize', asked())).status], [500, 500, 200])
  server.setSummarize({ delayMs: 120 })
  const started = Date.now()
  await post('/news/api/summarize', asked())
  assert.ok(Date.now() - started >= 100)
  server.setSummarize({ delayMs: 0 })
})

test('the translation is kept in the log with what was asked for', async () => {
  server.clearLog()
  await post('/news/api/summarize', asked())
  const [entry] = server.requests('/news/api/summarize')
  assert.equal(entry.method, 'POST')
  assert.deepEqual(Object.keys(JSON.parse(entry.body)).sort(), ['card', 'category', 'content', 'lang', 'title', 'type'])
})

test('the state of the endpoint is put back by a reset', async () => {
  server.setSummarize({ mode: 'error500', failFirst: 3, delayMs: 50 })
  server.reset()
  assert.deepEqual(server.state.summarize, { mode: 'ok', delayMs: 0, failFirst: 0 })
})

test('Go deeper and Share answer as the real site does', async () => {
  const deeper = await (await fetch('http://127.0.0.1:8799/news/api/deeper', { method: 'POST', body: JSON.stringify({ title: 'A title', content: 'x', lang: 'en' }) })).json()
  assert.equal(deeper.insights.length, 3)
  const share = await (await fetch('http://127.0.0.1:8799/news/api/share', { method: 'POST', body: JSON.stringify({ id: 'abc' }) })).json()
  assert.equal(share.id, 'abc')
  assert.ok(share.url.includes('/news/s/abc'))
})
