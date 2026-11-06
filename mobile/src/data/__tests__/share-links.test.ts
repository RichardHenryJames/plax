import { signingString, readShareCard, shareId, type ShareCard } from '@shared/share'
import { PRODUCTION_SITE } from '../../build'
import { HttpError } from '../../platform/http'
import { fakeFetch, setVariant } from '../../test/helpers'
import type { RequestFn } from '../feed-api'
import { parseFeed } from '../feed-parser'
import { Lru } from '../lru'
import { SHARE_CACHE_SIZE, SHARE_MAX_CHARS, SHARE_WAIT_MS, createShareLinks, resetShareLinks, shareAddress, shareEligible, shareEndpoint, shareMessage, shareRequestBody } from '../share-links'
import { caughtUp, isSignature, makeStory, type Story } from '../story'

const SIG = '45cf1f8654294cfdfa03b1376166de5b'
const ID = SIG.slice(0, 16)
const PAGE = `${PRODUCTION_SITE}/s/regional-parties-join-protests-${ID}`

const signed = (sig: string, sourceUrl: string): Story =>
  makeStory({
    id: 'the-hindu-1',
    title: 'Regional parties join protests',
    content: 'A march in Srinagar on Friday.',
    category: 'news',
    section: 'india',
    source: 'The Hindu',
    sourceUrl,
    image: 'https://th-i.thgim.com/a.jpg',
    readTime: '20s',
    publishedAt: 1_791_621_638_608,
    sig,
  })

const story = () => signed(SIG, 'https://www.thehindu.com/a')
const ENDPOINT = `${PRODUCTION_SITE}/api/share`
const reply = (url: string, id = ID) => JSON.stringify({ url, id })

interface Vector {
  served: Record<string, unknown>
  body: Record<string, unknown>
  sig: string
}
// The golden vector the website's own test (src/lib/share.test.mjs) signs and verifies: one story as the feed serves it, and what the
// app must send back for it.
const vector = require('../../../../src/lib/share-vector.json') as Vector

beforeEach(() => resetShareLinks())

describe('which stories can have a page of their own', () => {
  it('are the ones the server signed that point back to their publisher', () => {
    expect(shareEligible(story())).toBe(true)
    // A plain-http publisher link is still a link to point back to.
    expect(shareEligible(signed(SIG, 'http://www.example.com/a'))).toBe(true)
    // An older cached story has no signature.
    expect(shareEligible(signed('', 'https://www.thehindu.com/a'))).toBe(false)
    expect(shareEligible(signed(SIG.slice(1), 'https://www.thehindu.com/a'))).toBe(false)
    expect(shareEligible(signed(SIG.toUpperCase(), 'https://www.thehindu.com/a'))).toBe(false)
    // A quote has no publisher to point back to.
    expect(shareEligible(signed(SIG, ''))).toBe(false)
  })

  it('have a signature by its shape: 32 lower-case hexadecimal digits', () => {
    expect(isSignature(SIG)).toBe(true)
    for (const invalid of [null, '', 'abc', `${SIG}0`, SIG.replace('4', 'g'), SIG.toUpperCase(), ` ${SIG.slice(1)}`]) expect(isSignature(invalid)).toBe(false)
  })

  it('have none for a story made without one, or for the end-of-list card', () => {
    expect(makeStory({ id: 'a', title: 'T', content: 'C' }).sig).toBe('')
    expect(caughtUp().sig).toBe('')
    expect(shareEligible(caughtUp())).toBe(false)
  })
})

describe('what is sent back to be shared', () => {
  it('is exactly what the server signed', () => {
    const [read] = parseFeed(JSON.stringify({ cards: [vector.served] }))
    expect(read.sig).toBe(vector.sig)
    expect(shareEligible(read)).toBe(true)
    // The words the app sends are the trimmed, decoded ones the website verifies.
    expect(JSON.parse(shareRequestBody(read))).toEqual(vector.body)
  })

  it('is accepted by the website as that very story', () => {
    const [read] = parseFeed(JSON.stringify({ cards: [vector.served] }))
    const accepted = readShareCard(JSON.parse(shareRequestBody(read)))
    expect(accepted).not.toBeNull()
    expect(accepted?.signature).toBe(vector.sig)
    expect(signingString(accepted?.card as ShareCard)).toBe(signingString(vector.served as unknown as ShareCard))
    expect(shareId(read.sig)).toBe(read.sig.slice(0, 16))
  })

  it('carries only the story and nothing about the reader', () => {
    const body = JSON.parse(shareRequestBody(story())) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['category', 'content', 'id', 'image', 'publishedAt', 'section', 'sig', 'source', 'sourceUrl', 'title'])
    expect(body.publishedAt).toBe(1_791_621_638_608)
  })
})

describe('the address the server names', () => {
  it('is trusted when it is this story\u2019s own page on the Plax site', () => {
    expect(shareAddress(reply(PAGE), story())).toBe(PAGE)
    expect(shareAddress(JSON.stringify({ url: PAGE, id: ID, cached: true }), story())).toBe(PAGE)
  })

  it('is not trusted when it is anything else', () => {
    const wrong = [
      reply(PAGE, 'ffffffffffffffff'),
      reply(`${PRODUCTION_SITE}/s/x-ffffffffffffffff`),
      reply(`https://evil.example.com/news/s/x-${ID}`),
      reply(`https://plax-rouge.vercel.app.evil.example/news/s/x-${ID}`),
      reply(`http://plax-rouge.vercel.app/news/s/x-${ID}`),
      reply(`https://plax-rouge.vercel.app/other/s/x-${ID}`),
      reply(`https://plax-rouge.vercel.app/news/headlines/x-${ID}`),
      reply(`${PAGE}?next=https://evil.example`),
      reply(`${PAGE}?`),
      reply(`${PAGE}#fragment`),
      reply(`${PAGE}#`),
      reply(`https://plax-rouge.vercel.app:8443/news/s/x-${ID}`),
      reply(`https://user:secret@plax-rouge.vercel.app/news/s/x-${ID}`),
      reply(`https://plax-rouge.vercel.app@evil.example/news/s/x-${ID}`),
      reply(`https://evil.example/https://plax-rouge.vercel.app/news/s/x-${ID}`),
      reply(`https://plax-rouge.vercel.app/news/s/../x-${ID}`),
      reply(`https://plax-rouge.vercel.app/news/s/x-${ID}/more`),
      reply(`https://plax-rouge.vercel.app/news/s/${ID}`),
      reply('javascript:alert(1)'),
      reply('//plax-rouge.vercel.app/news/s/x-' + ID),
      reply('/news/s/x-' + ID),
      reply(''),
      reply(PAGE, ID.slice(0, 8)),
      reply(PAGE, `${ID}0`),
      reply(PAGE, ''),
      JSON.stringify({ url: PAGE }),
      JSON.stringify({ id: ID }),
      JSON.stringify({ url: 42, id: ID }),
      JSON.stringify({ url: PAGE, id: 42 }),
      JSON.stringify({ url: [PAGE], id: ID }),
      JSON.stringify({ url: PAGE, id: null }),
      '[]',
      'null',
      '42',
      '"text"',
      'not json',
      '',
    ]
    for (const text of wrong) expect({ text, address: shareAddress(text, story()) }).toEqual({ text, address: '' })
  })

  it('is not trusted for a story that has no valid signature to check it against', () => {
    expect(shareAddress(reply(PAGE), signed('', 'https://www.thehindu.com/a'))).toBe('')
    expect(shareAddress(reply(PAGE), signed(SIG.toUpperCase(), 'https://www.thehindu.com/a'))).toBe('')
  })

  it('is the page of this story, not of another signature', () => {
    const other = signed('ffffffffffffffffffffffffffffffff', 'https://www.thehindu.com/a')
    expect(shareAddress(reply(PAGE), other)).toBe('')
  })

  it('may say the default port, which is the same address', () => {
    expect(shareAddress(reply(`https://plax-rouge.vercel.app:443/news/s/x-${ID}`), story())).toBe(`${PRODUCTION_SITE}/s/x-${ID}`)
    expect(shareAddress(reply(`https://PLAX-ROUGE.vercel.app/news/s/x-${ID}`), story())).toBe(`${PRODUCTION_SITE}/s/x-${ID}`)
  })

  it('is the site of the test build in the test build, which is plain http', () => {
    setVariant('e2e')
    const page = `http://10.0.2.2:8787/news/s/x-${ID}`
    expect(shareAddress(reply(page), story())).toBe(page)
    expect(shareAddress(reply(`https://10.0.2.2:8787/news/s/x-${ID}`), story())).toBe('')
    expect(shareAddress(reply(PAGE), story())).toBe('')
    setVariant('play')
    expect(shareAddress(reply(page), story())).toBe('')
  })
})

describe('what the chooser is given', () => {
  it('is the headline, then one link on its own line', () => {
    // The page on Plax when there is one.
    expect(shareMessage(story(), PAGE, 'Plax')).toBe(`Regional parties join protests\n${PAGE}`)
    // Otherwise the publisher's own link, as before.
    expect(shareMessage(story(), '', 'Plax')).toBe('Regional parties join protests\nhttps://www.thehindu.com/a')
  })

  it('names the app for a story with no headline, and points at the site for one with no link', () => {
    const untitled = makeStory({ id: 'q', title: '  ', content: 'A quote with no headline.', category: 'philosophy' })
    expect(shareMessage(untitled, '', 'Plax')).toBe(`Plax\n${PRODUCTION_SITE}`)
    expect(shareMessage(makeStory({ id: 'q', title: '\u3000\t', content: 'Text', category: 'philosophy' }), PAGE, 'Plax')).toBe(`Plax\n${PAGE}`)
  })

  it('points at the site when the publisher\u2019s link is one the app does not open', () => {
    expect(shareMessage(signed('', 'http://www.example.com/a'), '', 'Plax')).toBe(`Regional parties join protests\n${PRODUCTION_SITE}`)
    expect(shareMessage(signed('', 'javascript:alert(1)'), '', 'Plax')).toBe(`Regional parties join protests\n${PRODUCTION_SITE}`)
  })

  it('is the site of the build that is running', () => {
    setVariant('e2e')
    expect(shareMessage(makeStory({ id: 'q', title: 'T', content: 'C', category: 'news' }), '', 'Plax')).toBe('T\nhttp://10.0.2.2:8787/news')
  })
})

describe('making the page', () => {
  it('posts the story to the site\u2019s link-making service and returns the address it names', async () => {
    const { calls } = fakeFetch({ [ENDPOINT]: { body: { url: PAGE, id: ID } } })
    expect(await createShareLinks().link(story())).toBe(PAGE)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe(ENDPOINT)
    expect(calls[0].headers.Accept).toBe('application/json')
    expect(calls[0].headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(calls[0].body).toBe(shareRequestBody(story()))
    expect(shareEndpoint()).toBe(ENDPOINT)
  })

  it('makes a story\u2019s page once a session, and shares it again at once', async () => {
    const { calls } = fakeFetch({ [ENDPOINT]: { body: { url: PAGE, id: ID } } })
    const links = createShareLinks()
    expect(await links.link(story())).toBe(PAGE)
    expect(await links.link(story())).toBe(PAGE)
    expect(await createShareLinks().link(story())).toBe(PAGE)
    expect(calls).toHaveLength(1)
  })

  it('does not ask for a story that cannot have a page', async () => {
    const { fetch } = fakeFetch({ [ENDPOINT]: { body: { url: PAGE, id: ID } } })
    expect(await createShareLinks().link(signed('', 'https://www.thehindu.com/a'))).toBe('')
    expect(await createShareLinks().link(signed(SIG, ''))).toBe('')
    expect(await createShareLinks().link(caughtUp())).toBe('')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is limited in time and in size', async () => {
    const send = jest.fn<ReturnType<RequestFn>, Parameters<RequestFn>>(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: reply(PAGE) }))
    const controller = new AbortController()
    await createShareLinks({ request: send }).link(story(), controller.signal)
    expect(send.mock.calls[0][1]).toMatchObject({ method: 'POST', timeoutMs: SHARE_WAIT_MS, maxChars: SHARE_MAX_CHARS, signal: controller.signal })
    expect(SHARE_MAX_CHARS).toBe(8 * 1024)
  })

  it('waits long enough for a cold server, and no longer than a reader will', () => {
    // A first request to a sleeping serverless instance took longer than the 4 seconds 1.4.0 allowed, so the page was silently lost for
    // exactly the shares that were slow. A reader who does not want to wait taps again.
    expect(SHARE_WAIT_MS).toBeGreaterThanOrEqual(6000)
    expect(SHARE_WAIT_MS).toBeLessThanOrEqual(10_000)
    expect(SHARE_WAIT_MS).toBe(7000)
  })

  it('gives no link, and remembers nothing, for every way the server can fail', async () => {
    const answers: Record<string, () => unknown> = {
      unavailable: () => fakeFetch({ [ENDPOINT]: { status: 503, body: { error: 'unavailable' } } }),
      unverified: () => fakeFetch({ [ENDPOINT]: { status: 403, body: { error: 'unverified' } } }),
      'rate limited': () => fakeFetch({ [ENDPOINT]: { status: 429, body: { error: 'slow_down' } } }),
      'not json': () => fakeFetch({ [ENDPOINT]: { body: '<html>' } }),
      'another story answered': () => fakeFetch({ [ENDPOINT]: { body: { url: PAGE, id: 'ffffffffffffffff' } } }),
      'an address for a different story': () => fakeFetch({ [ENDPOINT]: { body: { url: `${PRODUCTION_SITE}/s/x-ffffffffffffffff`, id: ID } } }),
      'an address on another site': () => fakeFetch({ [ENDPOINT]: { body: { url: `https://evil.example.com/news/s/x-${ID}`, id: ID } } }),
      'empty answer': () => fakeFetch({ [ENDPOINT]: { body: 'null' } }),
      'too long an answer': () => fakeFetch({ [ENDPOINT]: { body: ' '.repeat(SHARE_MAX_CHARS + 1) } }),
      'no connection': () => fakeFetch({ [ENDPOINT]: { networkError: true } }),
    }
    const cache = new Lru<string, string>(10)
    for (const [name, arrange] of Object.entries(answers)) {
      arrange()
      expect({ name, link: await createShareLinks({ cache }).link(story()) }).toEqual({ name, link: '' })
      expect({ name, remembered: cache.size }).toEqual({ name, remembered: 0 })
    }
  })

  it('gives no link for a timeout, or a failure it does not know', async () => {
    for (const thrown of [new HttpError('timeout'), new HttpError('network'), new HttpError('insecure'), new Error('anything'), 'text', null]) {
      const send: RequestFn = async () => {
        throw thrown
      }
      await expect(createShareLinks({ request: send }).link(story())).resolves.toBe('')
    }
  })

  it('gives no link when the reader stops waiting, and remembers nothing', async () => {
    fakeFetch({ [ENDPOINT]: { hang: true } })
    const cache = new Lru<string, string>(10)
    const controller = new AbortController()
    const pending = createShareLinks({ cache }).link(story(), controller.signal)
    controller.abort()
    expect(await pending).toBe('')
    expect(cache.size).toBe(0)
    // Abandoned before it even starts.
    expect(await createShareLinks({ cache }).link(story(), controller.signal)).toBe('')
  })

  it('keeps 60 links at most, the one used longest ago going first', async () => {
    const { calls } = fakeFetch({
      [ENDPOINT]: (call) => {
        const sent = JSON.parse(call.body as string) as { sig: string }
        return { body: { url: `${PRODUCTION_SITE}/s/x-${sent.sig.slice(0, 16)}`, id: sent.sig.slice(0, 16) } }
      },
    })
    const sigOf = (index: number) => `${index.toString(16).padStart(2, '0')}${SIG.slice(2)}`
    const links = createShareLinks()
    expect(SHARE_CACHE_SIZE).toBe(60)
    for (let index = 0; index < 61; index++) expect(await links.link(signed(sigOf(index), 'https://www.thehindu.com/a'))).toBe(`${PRODUCTION_SITE}/s/x-${sigOf(index).slice(0, 16)}`)
    expect(calls).toHaveLength(61)
    await links.link(signed(sigOf(60), 'https://www.thehindu.com/a'))
    expect(calls).toHaveLength(61)
    await links.link(signed(sigOf(0), 'https://www.thehindu.com/a'))
    expect(calls).toHaveLength(62)
  })

  it('forgets the links of the session when told to, and can keep them in a cache of the caller\u2019s own', async () => {
    const { calls } = fakeFetch({ [ENDPOINT]: { body: { url: PAGE, id: ID } } })
    await createShareLinks().link(story())
    resetShareLinks()
    await createShareLinks().link(story())
    expect(calls).toHaveLength(2)
    const own = new Lru<string, string>(5)
    await createShareLinks({ cache: own }).link(story())
    expect(own.get(SIG)).toBe(PAGE)
  })

  it('asks the site of the build that is running', async () => {
    setVariant('e2e')
    const page = `http://10.0.2.2:8787/news/s/x-${ID}`
    const { calls } = fakeFetch({ 'http://10.0.2.2:8787/news/api/share': { body: { url: page, id: ID } } })
    expect(await createShareLinks().link(story())).toBe(page)
    expect(calls[0].url).toBe('http://10.0.2.2:8787/news/api/share')
  })
})
