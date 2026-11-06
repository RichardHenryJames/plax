import { HttpError, allowedUrl, request, requestJson } from '../http'
import { fakeFetch, setVariant } from '../../test/helpers'

describe('which addresses may be asked', () => {
  it('allows https, and refuses plain http and other schemes in the real builds', () => {
    for (const name of ['play', 'preview'] as const) {
      setVariant(name)
      expect(allowedUrl('https://plax-rouge.vercel.app/news/api/feed')).toBe(true)
      expect(allowedUrl('http://plax-rouge.vercel.app/news/api/feed')).toBe(false)
      expect(allowedUrl('http://10.0.2.2:8787/news/x')).toBe(false)
      expect(allowedUrl('file:///data/x')).toBe(false)
      expect(allowedUrl('ftp://example.com/x')).toBe(false)
    }
  })

  it('lets only the test build reach its own machine over http', () => {
    setVariant('e2e')
    expect(allowedUrl('http://10.0.2.2:8787/news/api/feed')).toBe(true)
    expect(allowedUrl('http://localhost:8787/news/x')).toBe(true)
    expect(allowedUrl('http://example.com/x')).toBe(false)
    expect(allowedUrl('http://10.0.2.2.example.com/x')).toBe(false)
  })

  it('never makes a request to an address it refuses', async () => {
    setVariant('play')
    const { fetch } = fakeFetch({})
    await expect(request('http://example.com/x')).rejects.toMatchObject({ kind: 'insecure' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('request', () => {
  it('returns the status, the headers and the text', async () => {
    fakeFetch({ 'https://a.test/x': { status: 201, body: 'hello', headers: { 'x-n': '1' } } })
    const result = await request('https://a.test/x')
    expect(result).toMatchObject({ status: 201, ok: true, text: 'hello' })
    expect(result.headers.get('X-N')).toBe('1')
  })

  it('sends the method, headers and body it was given', async () => {
    const { calls } = fakeFetch({ 'https://a.test/p': { body: {} } })
    await request('https://a.test/p', { method: 'POST', headers: { A: 'b' }, body: '{"x":1}' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'POST', headers: { A: 'b' }, body: '{"x":1}' })
  })

  it('reports a connection that fails as a network error without the address in the message', async () => {
    fakeFetch({ 'https://secret.test/token?code=abc': { networkError: true } })
    const failure = await request('https://secret.test/token?code=abc').catch((e: HttpError) => e)
    expect(failure).toBeInstanceOf(HttpError)
    expect((failure as HttpError).kind).toBe('network')
    expect(String((failure as HttpError).message)).not.toMatch(/secret|abc/)
  })

  it('gives up when the answer does not come in time', async () => {
    fakeFetch({ 'https://a.test/slow': { hang: true } })
    await expect(request('https://a.test/slow', { timeoutMs: 30 })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('stops when the caller aborts, and says so', async () => {
    fakeFetch({ 'https://a.test/slow': { hang: true } })
    const controller = new AbortController()
    const pending = request('https://a.test/slow', { signal: controller.signal, timeoutMs: 5000 })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('does not even start when the caller has already aborted', async () => {
    fakeFetch({ 'https://a.test/slow': { hang: true } })
    const controller = new AbortController()
    controller.abort()
    await expect(request('https://a.test/slow', { signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('refuses an answer longer than the limit', async () => {
    fakeFetch({ 'https://a.test/big': { body: 'x'.repeat(2000) } })
    await expect(request('https://a.test/big', { maxChars: 1000 })).rejects.toMatchObject({ kind: 'too-large' })
    await expect(request('https://a.test/big', { maxChars: 2000 })).resolves.toMatchObject({ status: 200 })
  })
})

describe('requestJson', () => {
  it('parses the answer and asks for JSON', async () => {
    const { calls } = fakeFetch({ 'https://a.test/j': { body: { a: 1 } } })
    const { data } = await requestJson<{ a: number }>('https://a.test/j')
    expect(data).toEqual({ a: 1 })
    expect(calls[0].headers.Accept).toBe('application/json')
  })

  it('turns a status outside 200 to 299 into an error that carries the code', async () => {
    fakeFetch({ 'https://a.test/429': { status: 429, body: {} } })
    await expect(requestJson('https://a.test/429')).rejects.toMatchObject({ kind: 'status', status: 429 })
  })

  it('turns text that is not JSON into an error, never a thrown parse error', async () => {
    fakeFetch({ 'https://a.test/html': { body: '<html>', headers: { 'content-type': 'text/html' } } })
    await expect(requestJson('https://a.test/html')).rejects.toMatchObject({ kind: 'status', status: 200 })
  })
})
