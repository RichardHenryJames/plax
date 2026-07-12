import type { MetadataRoute } from 'next'
import { SITE_URL, TOPIC_SEO } from '@/lib/seo'
import { NEWS_SECTIONS } from '@/lib/types'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/topics`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // News hub + Hindi hub — high priority, refreshed continuously.
    {
      url: `${SITE_URL}/news`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/samachar`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.95,
    },
  ]

  const newsSectionRoutes: MetadataRoute.Sitemap = NEWS_SECTIONS.map((s) => ({
    url: `${SITE_URL}/news/${s.id}`,
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.85,
  }))

  const topicRoutes: MetadataRoute.Sitemap = TOPIC_SEO.map((t) => ({
    url: `${SITE_URL}/topics/${t.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...newsSectionRoutes, ...topicRoutes]
}
