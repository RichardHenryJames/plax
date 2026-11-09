import { PRODUCTION_SITE, site } from '../../build'
import { HttpError } from '../../platform/http'
import { fakeFetch, setVariant } from '../../test/helpers'
import type { RequestFn } from '../feed-api'
import { makeStory, type Story } from '../story'
import {
  TRANSLATE_MAX_CHARS,
  TRANSLATE_MAX_SOURCE,
  TRANSLATE_MAX_TITLE,
  TRANSLATE_TIMEOUT_MS,
  TranslateError,
  createTranslateApi,
  parseTranslated,
  plainSummary,
  translateRequestBody,
} from '../translate-api'

const ROUTE = `${PRODUCTION_SITE}/api/summarize`

const item = (fields: Partial<Story> = {}): Story =>
  makeStory({
    id: 'secret-id',
    title: 'Hindustan Coca-Cola Holdings files draft papers with SEBI for IPO',
    content: 'Hindustan Coca-Cola Holdings, the parent company of Coca-Cola\u2019s India bottling operations, has filed a draft red herring prospectus.',
    category: 'stocks',
    section: 'stocks',
    source: 'The Hindu BusinessLine',
    sourceUrl: 'https://example.com/story',
    image: 'https://example.com/i.jpg',
    readTime: '1 min',
    publishedAt: 1,
    sig: 'a'.repeat(32),
    ...fields,
  })

// What the live endpoint answered for a Stocks card on 7 November 2026 (shortened): Markdown emphasis in the Hindi, and the title translated too.
const LIVE = {
  title: 'कोका-कोला इंडिया ने ड्राफ्ट आईपीओ प्रॉस्पेक्टस दाखिल किया',
  content: 'हिंदुस्तान कोका-कोला होल्डिंग्स ने सेबी के पास ड्राफ्ट रेड हेरिंग प्रॉस्पेक्टस दाखिल किया है, जो **इनिशियल पब्लिक ऑफरिंग** का संकेत देता है।',
  type: 'microessay',
  translated: true,
}

describe('the request for a translation', () => {
  it('is the request the website makes for a card in Hindi, with its fields and no others', () => {
    const body = JSON.parse(translateRequestBody(item(), 'hi')) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['card', 'category', 'content', 'lang', 'title', 'type'])
    expect(body).toEqual({ content: item().content, title: item().title, type: 'microessay', lang: 'hi', category: 'stocks', card: true })
  })

  it('sends nothing that says who the reader is or which story it is: the id, the picture, the publisher and the signature stay', () => {
    const text = translateRequestBody(item(), 'hi')
    for (const hidden of ['secret-id', 'example.com', 'The Hindu BusinessLine', 'aaaaaaaa']) expect(text).not.toContain(hidden)
  })

  it('cuts a long text and a long headline, so that the request stays small', () => {
    const body = JSON.parse(translateRequestBody(item({ content: 'x'.repeat(9000), title: 'y'.repeat(900) }), 'hi')) as { content: string; title: string }
    expect(body.content).toHaveLength(TRANSLATE_MAX_SOURCE)
    expect(body.title).toHaveLength(TRANSLATE_MAX_TITLE)
    const short = JSON.parse(translateRequestBody(item({ content: 'x'.repeat(2999) }), 'hi')) as { content: string }
    expect(short.content).toHaveLength(2999)
  })
})

describe('the words of an AI draft as a page sets them', () => {
  it('drops the Markdown emphasis and keeps the words', () => {
    expect(plainSummary('जो **इनिशियल पब्लिक ऑफरिंग** का संकेत देता है')).toBe('जो इनिशियल पब्लिक ऑफरिंग का संकेत देता है')
    expect(plainSummary('A __strong__ move and an *odd* one')).toBe('A strong move and an odd one')
    expect(plainSummary('**One** and **two** and *three*')).toBe('One and two and three')
  })

  it('makes one run of text of the lines the draft came in, and drops the bullets of a list', () => {
    expect(plainSummary('First line.\n\nSecond line.\n  third\tspaced')).toBe('First line. Second line. third spaced')
    expect(plainSummary('* one\n* two\n- three\n\u2022 four')).toBe('one two three four')
  })

  it('leaves a lone asterisk, a product of numbers and a dash in a sentence alone', () => {
    expect(plainSummary('5 * 3 = 15, and a note*')).toBe('5 * 3 = 15, and a note*')
    expect(plainSummary('Shares rose - then fell')).toBe('Shares rose - then fell')
  })

  it('removes the markers of emphasis that never closed', () => {
    expect(plainSummary('An **unfinished phrase')).toBe('An unfinished phrase')
  })

  it('gives nothing for nothing', () => {
    expect(plainSummary('')).toBe('')
    expect(plainSummary('  \n ')).toBe('')
    expect(plainSummary('****')).toBe('')
  })
})

describe('the answer with the translation', () => {
  it('has the headline and the text, as plain words', () => {
    expect(parseTranslated(JSON.stringify(LIVE), 'hi')).toEqual({
      title: 'कोका-कोला इंडिया ने ड्राफ्ट आईपीओ प्रॉस्पेक्टस दाखिल किया',
      content: 'हिंदुस्तान कोका-कोला होल्डिंग्स ने सेबी के पास ड्राफ्ट रेड हेरिंग प्रॉस्पेक्टस दाखिल किया है, जो इनिशियल पब्लिक ऑफरिंग का संकेत देता है।',
    })
  })

  it('has no headline when the endpoint gave none, which the page then keeps as it was', () => {
    expect(parseTranslated(JSON.stringify({ content: LIVE.content }), 'hi').title).toBe('')
    expect(parseTranslated(JSON.stringify({ content: LIVE.content, title: 5 }), 'hi').title).toBe('')
  })

  it('refuses the English the endpoint gives back when every service it tries was out', () => {
    const english = { title: 'Hindustan Coca-Cola files for an IPO', content: 'Hindustan Coca-Cola Holdings has filed draft papers with the regulator for an initial public offering.', type: 'microessay' }
    expect(() => parseTranslated(JSON.stringify(english), 'hi')).toThrow(TranslateError)
    expect(() => parseTranslated(JSON.stringify(english), 'hi')).toThrow('Not translated')
  })

  it('refuses an answer that is not exactly that', () => {
    const invalid = ['', 'not json', 'null', '[]', '"text"', '{}', '{"content":5}', '{"content":null}', '{"content":""}', '{"content":"  \\n "}', '{"content":"****"}', '{"title":"x"}']
    for (const text of invalid) {
      expect({ text, error: (() => { try { parseTranslated(text, 'hi'); return null } catch (e) { return e instanceof TranslateError } })() }).toEqual({ text, error: true })
    }
  })

  it('never puts the text it refused into its message', () => {
    const failure = (() => { try { parseTranslated('{"content":5,"secret":"private-text"}', 'hi') } catch (e) { return e as TranslateError } return null })()
    expect(failure?.message).not.toContain('private-text')
    expect(failure?.aborted).toBe(false)
  })

  it('takes whatever the English asked for, as nothing else is ever asked for', () => {
    expect(parseTranslated('{"content":"Plain English."}', 'en')).toEqual({ title: '', content: 'Plain English.' })
  })
})

describe('asking for a translation', () => {
  it('posts the story to the endpoint of the website and returns the translation', async () => {
    const { calls } = fakeFetch({ [ROUTE]: { body: LIVE } })
    const translated = await createTranslateApi().translate(item(), 'hi')
    expect(translated.title).toBe(LIVE.title)
    expect(translated.content).not.toContain('**')
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe(ROUTE)
    expect(calls[0].headers.Accept).toBe('application/json')
    expect(calls[0].headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(calls[0].body).toBe(translateRequestBody(item(), 'hi'))
  })

  it('is limited in time and in size', async () => {
    const send = jest.fn<ReturnType<RequestFn>, Parameters<RequestFn>>(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: JSON.stringify(LIVE) }))
    const controller = new AbortController()
    await createTranslateApi({ request: send }).translate(item(), 'hi', controller.signal)
    expect(send.mock.calls[0][1]).toMatchObject({ method: 'POST', timeoutMs: TRANSLATE_TIMEOUT_MS, maxChars: TRANSLATE_MAX_CHARS, signal: controller.signal })
    expect([TRANSLATE_TIMEOUT_MS, TRANSLATE_MAX_CHARS]).toEqual([25_000, 65_536])
  })

  it('fails for every way the website can fail', async () => {
    const failures: Record<string, () => void> = {
      'a status that is not a success': () => fakeFetch({ [ROUTE]: { status: 500, body: { error: 'Summarization failed' } } }),
      'rate limited': () => fakeFetch({ [ROUTE]: { status: 429, body: {} } }),
      'no connection': () => fakeFetch({ [ROUTE]: { networkError: true } }),
      'not json': () => fakeFetch({ [ROUTE]: { body: '<html>' } }),
      'english back': () => fakeFetch({ [ROUTE]: { body: { title: 'Title', content: 'The same English text, untranslated, as the endpoint answers when it cannot translate.' } } }),
      'too long an answer': () => fakeFetch({ [ROUTE]: { body: ' '.repeat(TRANSLATE_MAX_CHARS + 1) } }),
    }
    for (const [name, arrange] of Object.entries(failures)) {
      arrange()
      const failure = await createTranslateApi().translate(item(), 'hi').catch((e: unknown) => e)
      expect({ name, failure: failure instanceof TranslateError, aborted: (failure as TranslateError).aborted }).toEqual({ name, failure: true, aborted: false })
    }
  })

  it('fails for a timeout, and for a failure it does not know', async () => {
    for (const thrown of [new HttpError('timeout'), new HttpError('insecure'), new Error('anything'), null]) {
      const send: RequestFn = async () => {
        throw thrown
      }
      await expect(createTranslateApi({ request: send }).translate(item(), 'hi')).rejects.toMatchObject({ name: 'TranslateError', aborted: false })
    }
  })

  it('stops when the caller gives up, and says so, so that it is not tried again', async () => {
    fakeFetch({ [ROUTE]: { hang: true } })
    const controller = new AbortController()
    const pending = createTranslateApi().translate(item(), 'hi', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'TranslateError', aborted: true })
  })

  it('asks the website of the build that is running', async () => {
    setVariant('e2e')
    const { calls } = fakeFetch({ 'http://10.0.2.2:8787/news/api/summarize': { body: LIVE } })
    await createTranslateApi().translate(item(), 'hi')
    expect(calls[0].url).toBe(`${site()}/api/summarize`)
  })
})
