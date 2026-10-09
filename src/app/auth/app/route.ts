import { NextRequest } from 'next/server'
import { appRedirect, escapeHtml } from '@/lib/app-redirect'

export const dynamic = 'force-dynamic'

const HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
}

/**
 * Where the Android app's Google sign-in comes back to. See `appRedirect`: it forwards the one-time
 * code into the app with a redirect, and shows a link in case the browser does not follow it.
 */
export function GET(request: NextRequest) {
  const location = appRedirect(request.nextUrl.searchParams)
  if (!location) {
    return new Response('Unknown app.', { status: 400, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  const page =
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Opening Plax</title><body style="font:16px system-ui;margin:2rem;line-height:1.5">' +
    `<p>Returning to Plax&hellip;</p><p><a href="${escapeHtml(location)}">Open Plax</a></p></body></html>`
  return new Response(page, {
    status: 302,
    headers: { ...HEADERS, Location: location, 'Content-Type': 'text/html; charset=utf-8' },
  })
}
