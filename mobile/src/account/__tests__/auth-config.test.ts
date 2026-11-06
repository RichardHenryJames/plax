import type { HttpResult } from '@/platform/http'
import { fetchAuthConfig, parseAuthConfig } from '../auth-config'
import { AccountError, Rejected, Unauthorized } from '../errors'
import type { RequestFn } from '../transport'
import { PROJECT, SITE } from './helpers'

const KEY = 'anon-key-0123456789abcdef'
const json = (url: unknown, anonKey: unknown = KEY) => JSON.stringify({ url, anonKey })

describe('the address of the account project', () => {
  it('is accepted only as a Supabase project over https', () => {
    for (const url of [
      'http://abcdefghij.supabase.co',
      'https://abcdefghij.supabase.co:8443',
      'https://evil.example.com',
      'https://abcdefghij.supabase.co.evil.com',
      'https://user:pass@abcdefghij.supabase.co',
      'https://abcdefghij.supabase.co/path',
      'https://abcdefghij.supabase.co?x=1',
      'https://abcdefghij.supabase.co#frag',
      'https://abcdefghij.supabase.co//',
      'https://abcdefghij.supabase.co.',
      'https://supabase.co',
      'https://abc.supabase.co',
      `https://${'a'.repeat(41)}.supabase.co`,
      'https://abcdefghij.supabase.com',
      'https://abcdefghij_x.supabase.co',
      'ftp://abcdefghij.supabase.co',
      ' https://abcdefghij.supabase.co',
      'https://abcdefghij.supabase.co ',
      'javascript:alert(1)',
      '',
      'not a url',
    ]) {
      expect(() => parseAuthConfig(json(url))).toThrow(AccountError)
    }
  })

  it('is accepted with a trailing slash, the standard port, capitals, or a name of 8 to 40 characters', () => {
    expect(parseAuthConfig(json(`${PROJECT}/`)).url).toBe(PROJECT)
    expect(parseAuthConfig(json(`${PROJECT}:443`)).url).toBe(PROJECT)
    expect(parseAuthConfig(json(`${PROJECT}:443/`)).url).toBe(PROJECT)
    expect(parseAuthConfig(json('HTTPS://ABCDEFGHIJ.SUPABASE.CO')).url).toBe(PROJECT)
    expect(parseAuthConfig(json(`https://${'a'.repeat(8)}.supabase.co`)).url).toBe(`https://${'a'.repeat(8)}.supabase.co`)
    expect(parseAuthConfig(json(`https://${'z9'.repeat(20)}.supabase.co`)).url).toBe(`https://${'z9'.repeat(20)}.supabase.co`)
  })

  it('is always given back as plain https://<project>.supabase.co, nothing more', () => {
    expect(parseAuthConfig(json(`${PROJECT}:443/`))).toEqual({ url: PROJECT, anonKey: KEY })
  })
})

describe('the client key', () => {
  it('is 20 to 2000 characters of a JWT or a Supabase key, and nothing else', () => {
    expect(parseAuthConfig(json(PROJECT, 'a'.repeat(20))).anonKey).toBe('a'.repeat(20))
    expect(parseAuthConfig(json(PROJECT, 'a.b_c-D9'.repeat(250))).anonKey).toHaveLength(2000)
    for (const bad of ['bad key!', 'a'.repeat(19), 'a'.repeat(2001), '', 'key with space 0123456789', 'new\nline0123456789012345', 'é'.repeat(30)]) {
      expect(() => parseAuthConfig(json(PROJECT, bad))).toThrow('Unexpected client key')
    }
  })
})

describe('an answer that is not a project address and key', () => {
  it('is refused, whatever it is', () => {
    for (const text of ['[]', 'null', '"x"', '1', 'true', '{}', '', 'not json', '<html>captive portal</html>', json(PROJECT, 12345678901234567890), json(1234, KEY), json(null), `{"url":"${PROJECT}"}`, `{"anonKey":"${KEY}"}`]) {
      expect(() => parseAuthConfig(text)).toThrow(AccountError)
    }
  })

  it('is refused without the address or the key in the message', () => {
    for (const text of [json('https://evil.example.com', KEY), json(PROJECT, 'bad key!'), 'https://evil.example.com']) {
      const failure = (() => {
        try {
          parseAuthConfig(text)
        } catch (error) {
          return error as Error
        }
        throw new Error('it was accepted')
      })()
      expect(failure.message).not.toMatch(/evil|abcdefghij|anon-key|bad key/)
    }
  })
})

describe('asking the website where the accounts live', () => {
  const answer = (status: number, text: string, calls: { url: string; headers?: Record<string, string>; method?: string }[] = []): RequestFn =>
    async (url, options) => {
      calls.push({ url, headers: options?.headers, method: options?.method })
      return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, text } satisfies HttpResult
    }

  it('reads the answer of /api/auth-config, asking for nothing but JSON', async () => {
    const calls: { url: string; headers?: Record<string, string>; method?: string }[] = []
    await expect(fetchAuthConfig(answer(200, json(PROJECT), calls), SITE)).resolves.toEqual({ url: PROJECT, anonKey: KEY })
    expect(calls).toEqual([{ url: `${SITE}/api/auth-config`, headers: { Accept: 'application/json' }, method: 'GET' }])
  })

  it('tells a website that has no project (503) from one that is out of reach', async () => {
    await expect(fetchAuthConfig(answer(503, '{"error":"unavailable"}'), SITE)).rejects.toThrow('Service unavailable')
    await expect(fetchAuthConfig(answer(404, ''), SITE)).rejects.toBeInstanceOf(Rejected)
    await expect(fetchAuthConfig(answer(401, ''), SITE)).rejects.toBeInstanceOf(Unauthorized)
  })

  it('does not trust a website that names another host', async () => {
    await expect(fetchAuthConfig(answer(200, json('https://evil.example.com')), SITE)).rejects.toThrow('Not a Supabase project address')
  })
})
