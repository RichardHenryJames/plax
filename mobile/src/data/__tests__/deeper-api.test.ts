import { PRODUCTION_SITE, site } from '../../build'
import { HttpError } from '../../platform/http'
import { fakeFetch, setVariant } from '../../test/helpers'
import type { RequestFn } from '../feed-api'
import { DEEPER_CACHE_SIZE, DEEPER_MAX_CHARS, DEEPER_TIMEOUT_MS, DeeperError, createDeeperApi, deeperCache, deeperKey, deeperRequestBody, loadDeeper, parseDeeper, type Deeper, type DeeperSource } from '../deeper-api'
import { Lru } from '../lru'
import { makeStory, type Story } from '../story'

const ROUTE = `${PRODUCTION_SITE}/api/deeper`

const item = (fields: Partial<Story> = {}): Story =>
  makeStory({ id: 'secret-id', title: 'A headline', content: 'x'.repeat(5000), category: 'science', source: 'BBC', sourceUrl: 'https://example.com/story', image: 'https://example.com/i.jpg', readTime: '1 min', publishedAt: 1, ...fields })

const answer = (...insights: string[]) => ({ insights, cached: true })

beforeEach(() => deeperCache.clear())

describe('the request for the facts', () => {
  it('sends only the headline, the text and the language', () => {
    const body = JSON.parse(deeperRequestBody(item(), 'hi')) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['content', 'lang', 'title'])
    expect((body.content as string).length).toBe(1500)
    expect(body.title).toBe('A headline')
    expect(body.lang).toBe('hi')
    const text = deeperRequestBody(item(), 'hi')
    for (const hidden of ['secret-id', 'example.com', 'science', 'BBC']) expect(text).not.toContain(hidden)
  })

  it('cuts the text where the endpoint does, after the white space at its ends has gone', () => {
    const body = (content: string) => (JSON.parse(deeperRequestBody(item({ content }), 'en')) as { content: string }).content
    expect(body(`  ${'y'.repeat(1600)}`)).toBe('y'.repeat(1500))
    expect(body('y'.repeat(1500))).toBe('y'.repeat(1500))
    expect(body('  short text \n')).toBe('short text')
    expect(body('z'.repeat(1499))).toHaveLength(1499)
  })

  it('names the story and the language in the key of the facts already written', () => {
    expect(deeperKey(item(), 'en')).not.toBe(deeperKey(item(), 'hi'))
    expect(deeperKey(item({ id: 'a' }), 'en')).not.toBe(deeperKey(item({ id: 'b' }), 'en'))
    expect(deeperKey(item({ id: 'a' }), 'en')).toBe('a|en')
  })
})

describe('the answer with the facts', () => {
  it('has the facts, without the blanks and with the spaces at their ends gone', () => {
    expect(parseDeeper('{"insights":[" One. ","Two **bold**.","","Three."],"cached":true}')).toEqual({ insights: ['One.', 'Two **bold**.', 'Three.'] })
  })

  it('keeps no more than five, though a few more than three are shown if they come', () => {
    expect(parseDeeper('{"insights":["1","2","3","4","5","6","7"]}').insights).toEqual(['1', '2', '3', '4', '5'])
    expect(parseDeeper('{"insights":["1","","2","  ","3","4","5","6"]}').insights).toEqual(['1', '2', '3', '4', '5'])
  })

  it('refuses an answer that is not exactly that', () => {
    const invalid = [
      '{"insights":[]}',
      '{"insights":["",  "  "]}',
      '{"insights":"text"}',
      '{"insights":[5]}',
      '{"insights":[null]}',
      '{"insights":[true]}',
      '{"insights":[["nested"]]}',
      '{"insights":[{"text":"x"}]}',
      '{"insights":null}',
      '{}',
      '[]',
      'null',
      '"text"',
      '',
      'not json',
      `{"insights":["${'y'.repeat(1001)}"]}`,
    ]
    for (const text of invalid) expect({ text, error: (() => { try { parseDeeper(text); return null } catch (e) { return e instanceof DeeperError } })() }).toEqual({ text, error: true })
  })

  it('checks every fact, also the ones past the fifth, which are not kept', () => {
    expect(() => parseDeeper(`{"insights":["1","2","3","4","5","${'y'.repeat(1001)}"]}`)).toThrow(DeeperError)
    expect(() => parseDeeper('{"insights":["1","2","3","4","5",6]}')).toThrow(DeeperError)
    expect(parseDeeper(`{"insights":["${'y'.repeat(1000)}"]}`).insights[0]).toHaveLength(1000)
    expect(parseDeeper(`{"insights":["  ${'y'.repeat(1000)}  "]}`).insights[0]).toHaveLength(1000)
  })

  it('never puts the text it refused into its message', () => {
    const failure = (() => { try { parseDeeper('{"insights":[5],"secret":"private-text"}') } catch (e) { return e as DeeperError } return null })()
    expect(failure?.message).not.toContain('private-text')
    expect(failure?.key).toBe('deeper_error')
  })
})

describe('asking for the facts', () => {
  it('posts the story to the endpoint of the website and returns the facts', async () => {
    const { calls } = fakeFetch({ [ROUTE]: { body: answer('First.', 'Second.', 'Third.') } })
    const facts = await createDeeperApi().deeper(item(), 'hi')
    expect(facts).toEqual({ insights: ['First.', 'Second.', 'Third.'] })
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe(ROUTE)
    expect(calls[0].headers.Accept).toBe('application/json')
    expect(calls[0].headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(calls[0].body).toBe(deeperRequestBody(item(), 'hi'))
  })

  it('is limited in time and in size', async () => {
    const send = jest.fn<ReturnType<RequestFn>, Parameters<RequestFn>>(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: JSON.stringify(answer('A.')) }))
    const controller = new AbortController()
    await createDeeperApi({ request: send }).deeper(item(), 'en', controller.signal)
    expect(send.mock.calls[0][1]).toMatchObject({ method: 'POST', timeoutMs: DEEPER_TIMEOUT_MS, maxChars: DEEPER_MAX_CHARS, signal: controller.signal })
    expect([DEEPER_TIMEOUT_MS, DEEPER_MAX_CHARS]).toEqual([45_000, 65_536])
  })

  it('fails for every way the website can fail, with the string that tells the reader', async () => {
    const failures: Record<string, () => void> = {
      'a status that is not a success': () => fakeFetch({ [ROUTE]: { status: 503, body: answer('A.') } }),
      'rate limited': () => fakeFetch({ [ROUTE]: { status: 429, body: {} } }),
      'no connection': () => fakeFetch({ [ROUTE]: { networkError: true } }),
      'not json': () => fakeFetch({ [ROUTE]: { body: '<html>' } }),
      'no facts': () => fakeFetch({ [ROUTE]: { body: { insights: [] } } }),
      'too long an answer': () => fakeFetch({ [ROUTE]: { body: ' '.repeat(DEEPER_MAX_CHARS + 1) } }),
    }
    for (const [name, arrange] of Object.entries(failures)) {
      arrange()
      const failure = await createDeeperApi().deeper(item(), 'en').catch((e: unknown) => e)
      expect({ name, failure: failure instanceof DeeperError, key: (failure as DeeperError).key, aborted: (failure as DeeperError).aborted }).toEqual({ name, failure: true, key: 'deeper_error', aborted: false })
    }
  })

  it('fails for a timeout, and for a failure it does not know', async () => {
    for (const thrown of [new HttpError('timeout'), new HttpError('insecure'), new Error('anything'), null]) {
      const send: RequestFn = async () => {
        throw thrown
      }
      await expect(createDeeperApi({ request: send }).deeper(item(), 'en')).rejects.toMatchObject({ key: 'deeper_error', aborted: false })
    }
  })

  it('stops when the caller gives up, and says so', async () => {
    fakeFetch({ [ROUTE]: { hang: true } })
    const controller = new AbortController()
    const pending = createDeeperApi().deeper(item(), 'en', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ key: 'deeper_error', aborted: true })
  })

  it('asks the website of the build that is running', async () => {
    setVariant('e2e')
    const { calls } = fakeFetch({ 'http://10.0.2.2:8787/news/api/deeper': { body: answer('A.') } })
    await createDeeperApi().deeper(item(), 'en')
    expect(calls[0].url).toBe(`${site()}/api/deeper`)
  })
})

describe('the facts already written', () => {
  const source = () => {
    const calls: { story: Story; lang: string; signal: AbortSignal | undefined }[] = []
    const fake: DeeperSource = {
      async deeper(story, lang, signal) {
        calls.push({ story, lang, signal })
        return { insights: [`${story.id} in ${lang}`] }
      },
    }
    return { calls, fake }
  }

  it('are asked for once for a story and a language, and the language it is switched to is asked for once as well', async () => {
    const { calls, fake } = source()
    const story = item({ id: 'a' })
    await expect(loadDeeper(fake, story, 'en')).resolves.toEqual({ insights: ['a in en'] })
    await loadDeeper(fake, story, 'hi')
    expect(await loadDeeper(fake, story, 'en')).toEqual({ insights: ['a in en'] })
    expect(await loadDeeper(fake, story, 'hi')).toEqual({ insights: ['a in hi'] })
    // Switching back must reuse the insights already written.
    expect(calls.map((call) => call.lang)).toEqual(['en', 'hi'])
  })

  it('are kept apart for every story', async () => {
    const { calls, fake } = source()
    await loadDeeper(fake, item({ id: 'a' }), 'en')
    await loadDeeper(fake, item({ id: 'b' }), 'en')
    expect(calls.map((call) => call.story.id)).toEqual(['a', 'b'])
  })

  it('are not kept when the request failed, and it is asked again', async () => {
    let attempts = 0
    const flaky: DeeperSource = {
      async deeper() {
        attempts++
        if (attempts === 1) throw new DeeperError()
        return { insights: ['fine'] }
      },
    }
    await expect(loadDeeper(flaky, item(), 'en')).rejects.toBeInstanceOf(DeeperError)
    await expect(loadDeeper(flaky, item(), 'en')).resolves.toEqual({ insights: ['fine'] })
    expect(attempts).toBe(2)
  })

  it('hand the signal to the request, so that closing the sheet can stop it', async () => {
    const { calls, fake } = source()
    const controller = new AbortController()
    await loadDeeper(fake, item({ id: 'z' }), 'en', controller.signal)
    expect(calls[0].signal).toBe(controller.signal)
  })

  it('are 40 at most, and the one used longest ago goes', async () => {
    const { calls, fake } = source()
    expect(DEEPER_CACHE_SIZE).toBe(40)
    for (let index = 0; index < 41; index++) await loadDeeper(fake, item({ id: `s${index}` }), 'en')
    expect(deeperCache.size).toBe(40)
    await loadDeeper(fake, item({ id: 's0' }), 'en')
    expect(calls).toHaveLength(42)
    await loadDeeper(fake, item({ id: 's40' }), 'en')
    expect(calls).toHaveLength(42)
  })

  it('can be kept in a cache of the caller\u2019s own', async () => {
    const { calls, fake } = source()
    const own = new Lru<string, Deeper>(2)
    await loadDeeper(fake, item({ id: 'a' }), 'en', undefined, own)
    await loadDeeper(fake, item({ id: 'a' }), 'en', undefined, own)
    expect(calls).toHaveLength(1)
    expect(own.size).toBe(1)
    expect(deeperCache.size).toBe(0)
  })
})
