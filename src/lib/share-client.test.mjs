import test from 'node:test'
import assert from 'node:assert/strict'
import { shareBody, signedFields, storyAddress, createShareLink, knownShareLink, resetShareLinks } from './share-client.ts'
import { signCard, signingKey } from './share-sign.ts'
import { shareId, sharePath, readShareCard } from './share.ts'

const KEY = signingKey({ SHARE_SECRET: 'a-test-secret-of-sufficient-length' })

const served = () => ({
  id: 'the-hindu-1x2y3z',
  title: 'Regional parties join protests in Kashmir',
  content: 'Leaders of the National Conference and the PDP joined a march in Srinagar on Friday.',
  source: 'The Hindu',
  sourceUrl: 'https://www.thehindu.com/news/story.ece?id=7',
  image: 'https://th-i.thgim.com/a.jpg',
  publishedAt: 1791621638608,
  category: 'news',
  section: 'india',
  type: 'microessay',
  readTime: '30s',
})
const signed = () => ({ ...served(), sig: signCard(served(), KEY) })

test('a signed card with a publisher link becomes a share body; nothing else does', () => {
  const body = shareBody(signed())
  assert.ok(body)
  assert.equal(body.sig, signed().sig)
  assert.equal(body.title, served().title)
  assert.equal('type' in body, false, 'only what the signature covers is sent')
  assert.equal('readTime' in body, false)
  assert.equal(shareBody({ ...signed(), sig: undefined }), null, 'unsigned (an older cached card)')
  assert.equal(shareBody({ ...signed(), sig: 'abc' }), null, 'malformed signature')
  assert.equal(shareBody({ ...signed(), sourceUrl: undefined }), null, 'no publisher link to point back to')
})

test('a translated card is shared by the words the feed served, which is what the signature covers', () => {
  const translated = { ...signed(), title: 'क्षेत्रीय दल कश्मीर में विरोध में शामिल', content: 'अनुवादित पाठ', originalTitle: served().title, originalContent: served().content }
  const body = shareBody(translated)
  assert.equal(body.title, served().title)
  assert.equal(body.content, served().content)
  // The server accepts it as the genuine card.
  const read = readShareCard(JSON.parse(JSON.stringify(body)))
  assert.ok(read)
  assert.equal(signCard(read.card, KEY), body.sig)
})

test('a saved copy keeps what is needed to share it later', () => {
  assert.deepEqual(signedFields(signed()), { image: served().image, publishedAt: served().publishedAt, section: 'india', sig: signed().sig })
  assert.deepEqual(signedFields(served()), {}, 'nothing to keep for an unsigned card')
})

test('only the story address of this very card is accepted from the server', () => {
  const body = shareBody(signed())
  const id = shareId(body.sig)
  const good = `https://www.plaxlabs.com/news/s/regional-parties-join-protests-in-kashmir-${id}`
  assert.equal(storyAddress(good, id, body), good)
  assert.equal(storyAddress(good, 'ffffffffffffffff', body), null, 'another story id')
  assert.equal(storyAddress(`https://www.plaxlabs.com/news/s/x-ffffffffffffffff`, id, body), null, 'address of another story')
  assert.equal(storyAddress(`https://www.plaxlabs.com/news/x/y-${id}`, id, body), null, 'not a story path')
  assert.equal(storyAddress(`javascript:alert(1)//s/x-${id}`, id, body), null, 'not a web address')
  assert.equal(storyAddress(`ftp://example.com/s/x-${id}`, id, body), null)
  assert.equal(storyAddress(42, id, body), null)
  assert.equal(storyAddress('not a url', id, body), null)
})

const answer = (status, payload) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => payload })

test('the link is made once per card and remembered for the session', async () => {
  resetShareLinks()
  const body = shareBody(signed())
  const id = shareId(body.sig)
  const url = `https://www.plaxlabs.com/news${sharePath(body.title, body.sig)}`
  let calls = 0
  let sent
  const fetcher = async (endpoint, init) => { calls += 1; sent = { endpoint, init }; return answer(200, { url, id })() }
  assert.equal(knownShareLink(body), null)
  assert.equal(await createShareLink(body, { endpoint: '/news/api/share', fetcher }), url)
  assert.equal(calls, 1)
  assert.equal(sent.endpoint, '/news/api/share')
  assert.equal(sent.init.method, 'POST')
  assert.deepEqual(JSON.parse(sent.init.body).sig, body.sig)
  assert.equal(knownShareLink(body), url)
  assert.equal(await createShareLink(body, { endpoint: '/news/api/share', fetcher }), url)
  assert.equal(calls, 1, 'the second share does not ask again')
})

test('every way the server can fail yields no link, never an exception', async () => {
  const body = shareBody(signed())
  const id = shareId(body.sig)
  const url = `https://www.plaxlabs.com/news${sharePath(body.title, body.sig)}`
  const cases = {
    'unavailable': answer(503, { error: 'unavailable' }),
    'unverified': answer(403, { error: 'unverified' }),
    'rate limited': answer(429, { error: 'slow_down' }),
    'not json': async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json') } }),
    'another story answered': answer(200, { url, id: 'ffffffffffffffff' }),
    'an address for a different story': answer(200, { url: 'https://www.plaxlabs.com/news/s/x-ffffffffffffffff', id }),
    'empty answer': answer(200, null),
    'network error': async () => { throw new TypeError('Failed to fetch') },
  }
  for (const [name, fetcher] of Object.entries(cases)) {
    resetShareLinks()
    assert.equal(await createShareLink(body, { endpoint: '/news/api/share', fetcher }), null, name)
    assert.equal(knownShareLink(body), null, `${name}: nothing remembered`)
  }
})

test('a server that does not answer in time is given up on', async () => {
  resetShareLinks()
  const body = shareBody(signed())
  const fetcher = (_endpoint, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
  const started = Date.now()
  assert.equal(await createShareLink(body, { endpoint: '/news/api/share', fetcher, timeoutMs: 60 }), null)
  assert.ok(Date.now() - started < 1000)
})
