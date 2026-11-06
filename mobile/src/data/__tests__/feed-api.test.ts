import { E2E_SITE, PRODUCTION_SITE } from '../../build'
import { HttpError } from '../../platform/http'
import { fakeFetch, setVariant } from '../../test/helpers'
import { FEED_TIMEOUT_MS, FeedLoadError, PAGE_SIZE, createFeedApi, feedUrl, type FeedRequest, type RequestFn } from '../feed-api'
import { MAX_BYTES } from '../feed-parser'

const FEED_ROUTE = `${PRODUCTION_SITE}/api/feed`
const ask = (fields: Partial<FeedRequest> = {}): FeedRequest => ({ categories: 'news', lang: 'en', excluded: [], refresh: false, ...fields })
const page = (...ids: string[]) => ({ cards: ids.map((id) => ({ id, title: `Headline ${id}`, content: 'Body of the story.', category: 'news' })) })

function url(text: string): URL {
  return new URL(text)
}

describe('the address of a page of the feed', () => {
  it('uses the news base path, the language and the encoded exclusions', () => {
    const address = url(feedUrl('news', 'en', ['id with space', 'b&c'], false))
    expect(address.protocol).toBe('https:')
    expect(address.host).toBe('plax-rouge.vercel.app')
    expect(address.pathname).toBe('/news/api/feed')
    expect(address.searchParams.get('categories')).toBe('news')
    expect(address.searchParams.get('limit')).toBe('30')
    expect(address.searchParams.get('lang')).toBe('en')
    expect(address.searchParams.get('refresh')).toBeNull()
    expect(address.searchParams.get('exclude')).toBe('id with space,b&c')
    expect(feedUrl('news', 'en', ['id with space', 'b&c'], false)).toContain('exclude=id%20with%20space%2Cb%26c')
    expect(PAGE_SIZE).toBe(30)
  })

  it('asks for a live refresh only when told to', () => {
    expect(url(feedUrl('science', 'en', [], true)).searchParams.get('refresh')).toBe('true')
    expect(url(feedUrl('science', 'en', [], false)).searchParams.has('refresh')).toBe(false)
  })

  it('asks for the language it is given', () => {
    expect(url(feedUrl('news', 'hi', [], false)).searchParams.get('lang')).toBe('hi')
  })

  it('asks for all the topics of a personalised feed at once', () => {
    expect(url(feedUrl('science,space', 'en', [], false)).searchParams.get('categories')).toBe('science,space')
  })

  it('makes a plain request the same every time, so that the website can answer it from its cache', () => {
    expect(feedUrl('news', 'en', [], false)).toBe(`${PRODUCTION_SITE}/api/feed?categories=news&limit=30&lang=en`)
    expect(url(feedUrl('news', 'en', [], false)).searchParams.has('exclude')).toBe(false)
  })

  it('is the address of the build that is running', () => {
    setVariant('e2e')
    expect(feedUrl('news', 'en', [], false)).toBe(`${E2E_SITE}/api/feed?categories=news&limit=30&lang=en`)
  })
})

describe('loading a page', () => {
  it('returns the stories of the answer, asking for JSON', async () => {
    const { calls } = fakeFetch({ [FEED_ROUTE]: { body: page('a', 'b') } })
    const stories = await createFeedApi().load(ask())
    expect(stories.map((item) => item.id)).toEqual(['a', 'b'])
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].headers.Accept).toBe('application/json')
    expect(calls[0].url).toBe(feedUrl('news', 'en', [], false))
  })

  it('sends what it was asked for', async () => {
    const { calls } = fakeFetch({ [FEED_ROUTE]: { body: page('a') } })
    await createFeedApi().load(ask({ categories: 'science,space', lang: 'hi', excluded: ['x', 'y'], refresh: true }))
    expect(calls[0].url).toBe(feedUrl('science,space', 'hi', ['x', 'y'], true))
  })

  it('returns no stories for a feed with none', async () => {
    fakeFetch({ [FEED_ROUTE]: { body: { cards: [] } } })
    await expect(createFeedApi().load(ask())).resolves.toEqual([])
  })

  it('is limited in time and in size', async () => {
    const send = jest.fn<ReturnType<RequestFn>, Parameters<RequestFn>>(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: '{"cards":[]}' }))
    const controller = new AbortController()
    await createFeedApi({ request: send }).load(ask(), controller.signal)
    expect(send).toHaveBeenCalledWith(feedUrl('news', 'en', [], false), { headers: { Accept: 'application/json' }, timeoutMs: FEED_TIMEOUT_MS, maxChars: MAX_BYTES, signal: controller.signal })
    expect(FEED_TIMEOUT_MS).toBe(25_000)
  })

  it('says too many requests for a 429, and unavailable for any other status that is not a success', async () => {
    for (const [status, key] of [[429, 'rate_error'], [500, 'service_error'], [502, 'service_error'], [503, 'service_error'], [404, 'service_error'], [403, 'service_error'], [301, 'service_error']] as const) {
      fakeFetch({ [FEED_ROUTE]: { status, body: page('a') } })
      await expect(createFeedApi().load(ask())).rejects.toMatchObject({ name: 'FeedLoadError', key })
    }
  })

  it('says unavailable when the website says it could not build the feed', async () => {
    fakeFetch({ [FEED_ROUTE]: { body: { cards: [], error: 'upstream failed' } } })
    await expect(createFeedApi().load(ask())).rejects.toMatchObject({ key: 'service_error' })
  })

  it('says the feed is unreadable for an answer that is not one, however it is wrong', async () => {
    for (const body of ['', 'not json', '<html>busy</html>', '[]', 'null', '{"cards":null}', '{"cards":[{}]}', JSON.stringify(page('a', 'a'))]) {
      fakeFetch({ [FEED_ROUTE]: { body } })
      await expect({ body, failure: await createFeedApi().load(ask()).catch((e: FeedLoadError) => e.key) }).toEqual({ body, failure: 'invalid_feed' })
    }
  })

  it('says the feed is unreadable for an answer longer than a megabyte', async () => {
    fakeFetch({ [FEED_ROUTE]: { body: ' '.repeat(MAX_BYTES + 1) } })
    await expect(createFeedApi().load(ask())).rejects.toMatchObject({ key: 'invalid_feed' })
  })

  it('says there is no connection when none answers', async () => {
    fakeFetch({ [FEED_ROUTE]: { networkError: true } })
    await expect(createFeedApi().load(ask())).rejects.toMatchObject({ key: 'network_error', aborted: false })
  })

  it('says there is no connection when the answer does not come in time, and for a failure it does not know', async () => {
    for (const failure of [new HttpError('timeout'), new HttpError('insecure'), new Error('anything'), 'text', null]) {
      const send: RequestFn = async () => {
        throw failure
      }
      await expect(createFeedApi({ request: send }).load(ask())).rejects.toMatchObject({ key: 'network_error', aborted: false })
    }
  })

  it('stops when the caller gives the request up, and says so', async () => {
    fakeFetch({ [FEED_ROUTE]: { hang: true } })
    const controller = new AbortController()
    const pending = createFeedApi().load(ask(), controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ key: 'network_error', aborted: true })
  })

  it('does not wait when the caller has already given the request up', async () => {
    fakeFetch({ [FEED_ROUTE]: { hang: true } })
    const controller = new AbortController()
    controller.abort()
    await expect(createFeedApi().load(ask(), controller.signal)).rejects.toMatchObject({ key: 'network_error', aborted: true })
  })

  it('carries a failure as an error with the string that tells the reader why, and nothing of the request', async () => {
    fakeFetch({ [FEED_ROUTE]: { status: 429, body: {} } })
    const failure = await createFeedApi().load(ask({ excluded: ['secret-id'] })).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(FeedLoadError)
    expect((failure as FeedLoadError).message).toBe('rate_error')
    expect(JSON.stringify(failure)).not.toContain('secret-id')
  })

  it('reads the feed of the test build over plain http', async () => {
    setVariant('e2e')
    const { calls } = fakeFetch({ [`${E2E_SITE}/api/feed`]: { body: page('a') } })
    await expect(createFeedApi().load(ask())).resolves.toHaveLength(1)
    expect(calls[0].url.startsWith('http://10.0.2.2:8787/news/api/feed?')).toBe(true)
  })
})
