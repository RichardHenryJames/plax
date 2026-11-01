import { ads, adsTxtLine } from '@/lib/ads-config'

// ads.txt says who may sell this site's ad space: the AdSense publisher, directly. Google looks for it at the root of the domain, which
// next.config.js sends here. It exists only when the site has ads, and is read from the build's environment, so it is a static file.
export const dynamic = 'force-static'

export function GET() {
  if (!ads.client) return new Response('Not found', { status: 404 })
  return new Response(`${adsTxtLine(ads.client)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
