import { HttpError, type HttpResult, type RequestOptions } from '@/platform/http'
import { AccountError, Rejected, Unauthorized } from '../errors'
import { CALL_TIMEOUT_MS, isObject, MAX_CHARS, parseJson, send, type RequestFn } from '../transport'

const answer = (status: number, text = ''): HttpResult => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, text })
const replying = (status: number, text = ''): RequestFn => async () => answer(status, text)
const failing = (error: unknown): RequestFn => async () => {
  throw error
}
const outcome = (promise: Promise<unknown>) => promise.then(() => null, (error: Error) => error)

describe('one call to the account service or the website', () => {
  it('gives the text of a success, whatever the success status', async () => {
    for (const status of [200, 201, 204, 206, 299]) await expect(send(replying(status, 'text'), 'https://a.test/x', { headers: {} })).resolves.toBe('text')
  })

  it('tells the failures apart by status, and says only fixed words', async () => {
    const cases: [number, string, boolean, boolean][] = [
      // status, message, is a refusal (Rejected), is Unauthorized
      [401, 'Rejected with status 401', true, true],
      [400, 'Rejected with status 400', true, false],
      [403, 'Rejected with status 403', true, false],
      [404, 'Rejected with status 404', true, false],
      [409, 'Rejected with status 409', true, false],
      [422, 'Rejected with status 422', true, false],
      [499, 'Rejected with status 499', true, false],
      [408, 'Try again later', false, false],
      [429, 'Try again later', false, false],
      [500, 'Service unavailable', false, false],
      [503, 'Service unavailable', false, false],
      [302, 'Service unavailable', false, false],
      [301, 'Service unavailable', false, false],
      [199, 'Service unavailable', false, false],
      [100, 'Service unavailable', false, false],
    ]
    for (const [status, message, refusal, unauthorized] of cases) {
      const failure = await outcome(send(replying(status, '{"secret":"detail"}'), 'https://a.test/secret-path', { headers: { Authorization: 'Bearer secret-token' } }))
      expect({ status, message: (failure as Error).message, refusal: failure instanceof Rejected, unauthorized: failure instanceof Unauthorized, base: failure instanceof AccountError }).toEqual({
        status,
        message,
        refusal,
        unauthorized,
        base: true,
      })
      expect(String(failure)).not.toMatch(/secret|a\.test/)
    }
  })

  it('treats a failure of the connection, whatever its kind, as an unavailable service', async () => {
    for (const kind of ['network', 'timeout', 'too-large', 'insecure', 'aborted'] as const) {
      const failure = await outcome(send(failing(new HttpError(kind, 0, 'https://a.test/secret-path?token=secret')), 'https://a.test/secret-path', { headers: {} }))
      expect(failure).toBeInstanceOf(AccountError)
      expect((failure as Error).message).toBe('Service unavailable')
    }
    const odd = await outcome(send(failing(new TypeError('secret-token in a message')), 'https://a.test/x', { headers: {} }))
    expect((odd as Error).message).toBe('Service unavailable')
    const nothing = await outcome(send(failing('a string'), 'https://a.test/x', { headers: {} }))
    expect((nothing as Error).message).toBe('Service unavailable')
  })

  it('asks as it was told: a GET by default, with the headers and the body, within 25 seconds and 512 KiB', async () => {
    const seen: { url: string; options: RequestOptions | undefined }[] = []
    const request: RequestFn = async (url, options) => {
      seen.push({ url, options })
      return answer(200)
    }
    await send(request, 'https://a.test/one', { headers: { A: 'b' } })
    await send(request, 'https://a.test/two', { method: 'POST', headers: { C: 'd' }, body: '{"x":1}' })
    await send(request, 'https://a.test/three', { method: 'DELETE', headers: {} })
    expect(seen.map((call) => [call.url, call.options?.method, call.options?.headers, call.options?.body])).toEqual([
      ['https://a.test/one', 'GET', { A: 'b' }, undefined],
      ['https://a.test/two', 'POST', { C: 'd' }, '{"x":1}'],
      ['https://a.test/three', 'DELETE', {}, undefined],
    ])
    for (const call of seen) expect([call.options?.timeoutMs, call.options?.maxChars]).toEqual([25_000, 512 * 1024])
    expect([CALL_TIMEOUT_MS, MAX_CHARS]).toEqual([25_000, 524_288])
  })
})

describe('reading what the service sent', () => {
  it('parses JSON, or fails with the fixed words it was given', () => {
    expect(parseJson('{"a":[1]}', 'broken')).toEqual({ a: [1] })
    for (const text of ['', '{', 'nope', '<html>']) expect(() => parseJson(text, 'broken')).toThrow('broken')
    expect(() => parseJson('{"a":', 'broken')).toThrow(AccountError)
    const failure = (() => {
      try {
        parseJson('{"secret":', 'broken')
      } catch (error) {
        return error as Error
      }
      return new Error('none')
    })()
    expect(failure.message).toBe('broken')
  })

  it('tells an object from the things that are not one', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
    for (const value of [null, undefined, [], [1], 'x', 1, true, () => undefined]) expect(isObject(value)).toBe(false)
  })
})
