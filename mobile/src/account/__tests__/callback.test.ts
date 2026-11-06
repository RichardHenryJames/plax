import { appRedirect, APP_SCHEMES } from '@shared/app-redirect'
import { CALLBACK_HOST, parseCallback } from '../callback'

const SCHEME = 'com.plaxlabs.news.preview'

describe('the address the browser returns to', () => {
  it('is read strictly', () => {
    const ok = parseCallback(`${SCHEME}://auth-callback?code=abc12345-6789&error=`, SCHEME)
    expect(ok?.code).toBe('abc12345-6789')
    expect(parseCallback(`${SCHEME}://auth-callback?code=short`, SCHEME)?.code).toBeNull()
    expect(parseCallback(`${SCHEME}://auth-callback?code=${'x'.repeat(600)}`, SCHEME)?.code).toBeNull()
    // Characters an address never holds make the whole address unusable.
    expect(parseCallback(`${SCHEME}://auth-callback?code=<script>alert(1)</script>`, SCHEME)).toBeNull()
    // An empty error is not an error.
    expect(parseCallback(`${SCHEME}://auth-callback?code=abc12345&error=`, SCHEME)?.error).toBeNull()
    expect(parseCallback(`${SCHEME}://auth-callback?error=access_denied`, SCHEME)?.error).toBe('access_denied')
    expect(parseCallback(`${SCHEME}://auth-callback?error=${'y'.repeat(100)}`, SCHEME)?.error).toBe('error')
    expect(parseCallback('com.other://auth-callback?code=abc12345', SCHEME)).toBeNull()
    expect(parseCallback(`${SCHEME}://auth-callback.evil.example?code=abc12345`, SCHEME)).toBeNull()
    expect(parseCallback('::not a uri::', SCHEME)).toBeNull()
  })

  it('is read as the live site sends it: Vercel writes a slash before the query', () => {
    expect(parseCallback(`${SCHEME}://auth-callback/?code=abc12345-6789`, SCHEME)?.code).toBe('abc12345-6789')
    expect(parseCallback(`${SCHEME}://auth-callback/?error=access_denied&error_description=User+denied`, SCHEME)?.error).toBe('access_denied')
  })

  it('is this app only: its scheme, its host, and exactly that', () => {
    const code = 'code=abc12345'
    expect(parseCallback(`${SCHEME}://auth-callback?${code}`, SCHEME)).not.toBeNull()
    expect(CALLBACK_HOST).toBe('auth-callback')
    for (const address of [
      `com.plaxlabs.news://auth-callback?${code}`,
      `COM.PLAXLABS.NEWS.PREVIEW://auth-callback?${code}`,
      `${SCHEME}://elsewhere?${code}`,
      `${SCHEME}://AUTH-CALLBACK?${code}`,
      `${SCHEME}://auth-callback.evil.example?${code}`,
      `${SCHEME}://evil.example@auth-callback?${code}`,
      `${SCHEME}://auth-callback@evil.example?${code}`,
      `${SCHEME}://auth-callback:8080?${code}`,
      `${SCHEME}://auth-callback/extra?${code}`,
      `${SCHEME}://auth-callback//?${code}`,
      `${SCHEME}:auth-callback?${code}`,
      `${SCHEME}:///auth-callback?${code}`,
      `https://auth-callback/?${code}`,
      `https://example.com/auth-callback?${code}`,
      `javascript:alert(1)//auth-callback?${code}`,
      `${SCHEME}//auth-callback?${code}`,
      `x${SCHEME}://auth-callback?${code}`,
      '',
      '//auth-callback',
      'auth-callback',
    ]) {
      expect({ address, callback: parseCallback(address, SCHEME) }).toEqual({ address, callback: null })
    }
  })

  it('is refused whole when it holds a character no address holds', () => {
    for (const bad of ['a b', 'a"b', 'a<b', 'a>b', 'a\\b', 'a^b', 'a`b', 'a{b', 'a|b', 'a}b', 'a\nb', 'a\tb', 'a\u0000b', 'a\u00a0b', 'a\u2028b', 'a%zzb', 'a%4', 'a%', 'a#b#c']) {
      expect({ bad, callback: parseCallback(`${SCHEME}://auth-callback?x=${bad}`, SCHEME) }).toEqual({ bad, callback: null })
    }
  })

  it('accepts the characters an address may hold, escapes among them, and text in other scripts', () => {
    for (const good of ['a-b_c.d~e!f*g(h)i', "a'b", 'a;b/c?d:e@f$g,h[i]', 'a%20b', 'a%C3%A9b', 'a+b', '\u00e9\u0928']) {
      expect({ good, ok: parseCallback(`${SCHEME}://auth-callback?x=${good}&code=abc12345`, SCHEME) !== null }).toEqual({ good, ok: true })
    }
  })

  it('lets the first of a repeated field count, and reads only the query, not the fragment', () => {
    expect(parseCallback(`${SCHEME}://auth-callback?code=first1234&code=second5678`, SCHEME)?.code).toBe('first1234')
    expect(parseCallback(`${SCHEME}://auth-callback?x=1#code=abcdefgh`, SCHEME)).toEqual({ code: null, error: null })
    expect(parseCallback(`${SCHEME}://auth-callback?code=abcdefgh#frag`, SCHEME)?.code).toBe('abcdefgh')
    expect(parseCallback(`${SCHEME}://auth-callback?error=first&error=access_denied`, SCHEME)?.error).toBe('first')
  })

  it('skips what is not a name and a value', () => {
    expect(parseCallback(`${SCHEME}://auth-callback?&&code&=x&code=abcdefgh`, SCHEME)).toEqual({ code: 'abcdefgh', error: null })
    expect(parseCallback(`${SCHEME}://auth-callback`, SCHEME)).toEqual({ code: null, error: null })
    expect(parseCallback(`${SCHEME}://auth-callback?`, SCHEME)).toEqual({ code: null, error: null })
  })

  it('accepts a code of 8 to 512 characters of the standard alphabet only', () => {
    const code = (value: string) => parseCallback(`${SCHEME}://auth-callback?code=${value}`, SCHEME)?.code
    expect(code('a'.repeat(8))).toBe('a'.repeat(8))
    expect(code('a'.repeat(7))).toBeNull()
    expect(code('a'.repeat(512))).toBe('a'.repeat(512))
    expect(code('a'.repeat(513))).toBeNull()
    expect(code('Aa0_.~-Aa0_.~-')).toBe('Aa0_.~-Aa0_.~-')
    // A percent-escape is decoded first, so an escaped letter is the letter and an escaped slash is no code.
    expect(code('%61bcdefgh')).toBe('abcdefgh')
    expect(code('abcdefg%2Fh')).toBeNull()
    expect(code('abc%20defgh')).toBeNull()
    expect(code('abcdefg+h')).toBeNull()
  })

  it('reads form encoding: a plus is a space, %XX is a byte, and a broken sequence is no code and no crash', () => {
    expect(parseCallback(`${SCHEME}://auth-callback?error=access%5Fdenied`, SCHEME)?.error).toBe('access_denied')
    expect(parseCallback(`${SCHEME}://auth-callback?error=a+b`, SCHEME)?.error).toBe('a b')
    expect(parseCallback(`${SCHEME}://auth-callback?error=%C3%A9`, SCHEME)?.error).toBe('\u00e9')
    expect(parseCallback(`${SCHEME}://auth-callback?code=%FF%FEabcdefgh`, SCHEME)?.code).toBeNull()
  })

  it('keeps an error of 64 characters and shortens a longer one to "error"', () => {
    expect(parseCallback(`${SCHEME}://auth-callback?error=${'e'.repeat(64)}`, SCHEME)?.error).toBe('e'.repeat(64))
    expect(parseCallback(`${SCHEME}://auth-callback?error=${'e'.repeat(65)}`, SCHEME)?.error).toBe('error')
  })
})

describe('what the website sends back (src/lib/app-redirect.ts)', () => {
  it('is read for every app the website knows', () => {
    for (const app of APP_SCHEMES) {
      const location = appRedirect(new URLSearchParams({ app, code: 'abc-123-DEF_456.x' }))
      expect(location).toBe(`${app}://auth-callback?code=abc-123-DEF_456.x`)
      expect(parseCallback(location as string, app)).toEqual({ code: 'abc-123-DEF_456.x', error: null })
      // Another build's address is not this build's.
      const other = APP_SCHEMES.find((scheme) => scheme !== app) as string
      expect(parseCallback(location as string, other)).toBeNull()
    }
  })

  it('is read when the reader said no, however the website escaped the words', () => {
    const location = appRedirect(new URLSearchParams({ app: SCHEME, error: 'access_denied', error_code: 'x', error_description: 'User said no & left <now>' })) as string
    expect(parseCallback(location, SCHEME)).toEqual({ code: null, error: 'access_denied' })
  })

  it('is read when the website sent a value with characters an address must escape', () => {
    const location = appRedirect(new URLSearchParams({ app: SCHEME, code: 'a&b=c#d?e', error: 'x y' })) as string
    expect(parseCallback(location, SCHEME)).toEqual({ code: null, error: 'x y' })
  })

  it('is read with the slash that Vercel writes before the query', () => {
    const location = (appRedirect(new URLSearchParams({ app: SCHEME, code: 'abcdefgh' })) as string).replace('auth-callback?', 'auth-callback/?')
    expect(parseCallback(location, SCHEME)?.code).toBe('abcdefgh')
  })
})
