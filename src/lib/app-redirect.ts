/**
 * The Android app signs in through the system browser. After Google, Supabase returns the browser to
 * /news/auth/app with a one-time code (the same hostname as the site, which Supabase always accepts).
 * This page turns that into a link back into the app, using the sign-in scheme of whichever build asked.
 *
 * Only two schemes are known, and only the standard OAuth result fields are forwarded, so the page
 * cannot be used to open anything else or to carry arbitrary data into the app.
 */
export const APP_SCHEMES = ['com.plaxlabs.news', 'com.plaxlabs.news.preview'] as const

const FORWARDED = ['code', 'error', 'error_code', 'error_description'] as const
const PRINTABLE = /^[\x20-\x7e]{1,1024}$/

/** The address that opens the app with the sign-in result, or null when the request names no known app. */
export function appRedirect(params: URLSearchParams): string | null {
  const app = params.get('app') ?? ''
  if (!(APP_SCHEMES as readonly string[]).includes(app)) return null
  const forwarded = new URLSearchParams()
  for (const key of FORWARDED) {
    const value = params.get(key)
    if (value !== null && PRINTABLE.test(value)) forwarded.set(key, value)
  }
  return `${app}://auth-callback?${forwarded.toString()}`
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
