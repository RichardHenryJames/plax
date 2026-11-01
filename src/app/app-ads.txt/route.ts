import { ads, adsTxtLine } from '@/lib/ads-config'

// app-ads.txt is ads.txt for the Android app: AdMob checks it, at the root of the developer's website named on the app's store
// listing, to know that the publisher really owns the app. The publisher is the same Google account, so the line is the same.
export const dynamic = 'force-static'

export function GET() {
  if (!ads.client) return new Response('Not found', { status: 404 })
  return new Response(`${adsTxtLine(ads.client)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
