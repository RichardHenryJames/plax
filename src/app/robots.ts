import type { MetadataRoute } from 'next'
import { SITE_HOST, SITE_URL } from '@/lib/seo'

// Crawlers only read robots.txt from the domain root, which the website-builder
// app owns — see its app/robots.ts, which covers this zone too. This copy is
// served at /news/robots.txt and is kept correct for direct access only.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/news',
        // Auth callback + write API endpoints have no SEO value
        disallow: ['/news/auth/', '/news/api/'],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_HOST,
  }
}
