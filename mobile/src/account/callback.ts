/** The address the browser returns to is `<scheme>://auth-callback`: the website's /auth/app page redirects there (src/lib/app-redirect.ts). */
export const CALLBACK_HOST = 'auth-callback'

/** What the browser brought back: the one-time code, or the reason there is none. A field that is not usable is null. */
export interface Callback {
  readonly code: string | null
  readonly error: string | null
}

const CODE = /^[A-Za-z0-9_.~-]{8,512}$/
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/
const ASCII = /^[A-Za-z0-9\-_.!~*'();/?:@&=+$,[\]#]$/
const HEX = /^[0-9A-Fa-f]{2}$/
const UNUSABLE = /[\s\u0080-\u009f]/

/**
 * Whether the text is an address in the sense of RFC 2396: its characters are the ones an address may hold, and a percent sign is
 * followed by two hexadecimal digits. Anything else (a space, an angle bracket, a quote) makes the whole address unusable.
 */
function isAddress(text: string): boolean {
  let fragments = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '%') {
      if (!HEX.test(text.slice(index + 1, index + 3))) return false
      index += 2
    } else if (text.charCodeAt(index) > 0x7f) {
      if (UNUSABLE.test(char)) return false
    } else if (!ASCII.test(char)) return false
    else if (char === '#' && ++fragments > 1) return false
  }
  return true
}

/** A query value as form data: a plus sign is a space and %XX is a byte. What cannot be decoded becomes a replacement character. */
function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return '\uFFFD'
  }
}

/**
 * Reads the address the browser returned to, or null when it is not this app's sign-in callback: another scheme, another host, or not an
 * address at all. The website's redirect passes through Vercel, which writes a slash before the query, so both forms are read. Where a
 * field is given twice the first counts; a code that is not 8 to 512 characters of the standard's alphabet is not a code; an error longer
 * than 64 characters is only "error".
 */
export function parseCallback(address: string, scheme: string): Callback | null {
  if (!isAddress(address)) return null
  const parts = /^([^:/?#]+):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/.exec(address)
  if (!parts || !SCHEME.test(parts[1]) || parts[1] !== scheme || parts[2] !== CALLBACK_HOST || (parts[3] !== '' && parts[3] !== '/')) return null
  const values = new Map<string, string>()
  for (const pair of (parts[4] ?? '').split('&')) {
    const equals = pair.indexOf('=')
    if (equals <= 0) continue
    const name = pair.slice(0, equals)
    if (!values.has(name)) values.set(name, decode(pair.slice(equals + 1)))
  }
  const code = values.get('code')
  const error = values.get('error')
  return {
    code: code !== undefined && CODE.test(code) ? code : null,
    error: error === undefined || error === '' ? null : error.length > 64 ? 'error' : error,
  }
}
