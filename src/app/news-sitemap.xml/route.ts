import { SITE_URL, SITE } from '@/lib/seo'
import { NEWS_SECTIONS } from '@/lib/types'

// Google News sitemap — lists Plax's continuously-updated news hub/section pages
// with <news:publication> tags so Google News treats them as fresh news surfaces.
// Regenerated every 15 min to keep the <news:publication_date> current.
export const revalidate = 900

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const now = new Date().toISOString()

  // Each entry: url, publication name, language, title. News pages update
  // continuously, so publication_date = now (within Google's 48h window).
  const entries: { url: string; lang: string; title: string }[] = [
    { url: `${SITE_URL}/news`, lang: 'en', title: 'Latest News Today — India & World Headlines' },
    ...NEWS_SECTIONS.map((s) => ({
      url: `${SITE_URL}/news/${s.id}`,
      lang: 'en',
      title: `${s.label} News Today — Latest Headlines`,
    })),
    { url: `${SITE_URL}/samachar`, lang: 'hi', title: 'आज की ताज़ा खबरें — भारत और दुनिया' },
  ]

  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${xmlEscape(e.url)}</loc>
    <news:news>
      <news:publication>
        <news:name>${xmlEscape(SITE.name)}</news:name>
        <news:language>${e.lang}</news:language>
      </news:publication>
      <news:publication_date>${now}</news:publication_date>
      <news:title>${xmlEscape(e.title)}</news:title>
    </news:news>
  </url>`
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  })
}
