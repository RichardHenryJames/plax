import { HttpError, type RequestOptions } from '@/platform/http'
import { fakeFetch, setVariant } from '@/test/helpers'
import { defaultRequest, fetchSiteFile, isJsonType, type RequestFn } from '../site-file'
import { answer } from './helpers'

const URL = 'https://plax-rouge.vercel.app/news/x.json'
const LIMITS = { maxBytes: 100, timeoutMs: 2000 }

const sending = (reply: ReturnType<typeof answer> | Error) => {
  const calls: { url: string; options: RequestOptions | undefined }[] = []
  const send: RequestFn = async (url, options) => {
    calls.push({ url, options })
    if (reply instanceof Error) throw reply
    return reply
  }
  return { send, calls }
}

describe('isJsonType', () => {
  it('takes application/json with or without parameters, in any case', () => {
    for (const type of ['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON', 'application/json;charset=UTF-8', ' application/json ']) {
      expect(isJsonType(type)).toBe(true)
    }
  })

  it('refuses every other type, and none', () => {
    for (const type of ['text/json', 'application/jsonp', 'application/vnd.api+json', 'text/html', 'application/json5', 'json', '', null, ';application/json']) {
      expect(isJsonType(type)).toBe(false)
    }
  })
})

describe('fetchSiteFile', () => {
  it('asks for JSON and for nothing to be kept, with the time and size limits, and sends nothing else', async () => {
    const { send, calls } = sending(answer('{}'))
    expect(await fetchSiteFile(send, URL, LIMITS)).toBe('{}')
    expect(calls).toEqual([
      { url: URL, options: { headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, timeoutMs: 2000, maxChars: 100 } },
    ])
  })

  it('gives the text of a file that is status 200 and JSON and within its limit', async () => {
    expect(await fetchSiteFile(sending(answer('x'.repeat(100))).send, URL, LIMITS)).toBe('x'.repeat(100))
  })

  it('gives nothing for any other status', async () => {
    for (const status of [201, 204, 301, 304, 400, 404, 500]) {
      expect(await fetchSiteFile(sending(answer('{}', { status })).send, URL, LIMITS)).toBeNull()
    }
  })

  it('gives nothing for an answer that is not JSON', async () => {
    for (const type of ['text/html', 'text/plain', null]) {
      expect(await fetchSiteFile(sending(answer('{}', { type })).send, URL, LIMITS)).toBeNull()
    }
  })

  it('gives nothing for an answer over the limit, counted in bytes', async () => {
    expect(await fetchSiteFile(sending(answer('x'.repeat(101))).send, URL, LIMITS)).toBeNull()
    // 40 letters of Hindi are 120 bytes.
    expect(await fetchSiteFile(sending(answer('\u0915'.repeat(40))).send, URL, LIMITS)).toBeNull()
    expect(await fetchSiteFile(sending(answer('\u0915'.repeat(33))).send, URL, LIMITS)).toBe('\u0915'.repeat(33))
  })

  it('gives nothing, and never throws, when the request fails', async () => {
    for (const failure of [new HttpError('network'), new HttpError('timeout'), new HttpError('too-large'), new HttpError('insecure'), new Error('x')]) {
      expect(await fetchSiteFile(sending(failure).send, URL, LIMITS)).toBeNull()
    }
    const throwing: RequestFn = () => {
      throw new TypeError('at once')
    }
    expect(await fetchSiteFile(throwing, URL, LIMITS)).toBeNull()
  })

  it('works through the real request: https only', async () => {
    setVariant('preview')
    const { calls } = fakeFetch({ [URL]: { body: '{"a":1}' } })
    expect(await fetchSiteFile(defaultRequest, URL, LIMITS)).toBe('{"a":1}')
    expect(calls[0]).toMatchObject({ url: URL, method: 'GET' })
    const refused = fakeFetch({})
    expect(await fetchSiteFile(defaultRequest, 'http://plax-rouge.vercel.app/news/x.json', LIMITS)).toBeNull()
    expect(refused.fetch).not.toHaveBeenCalled()
  })
})
