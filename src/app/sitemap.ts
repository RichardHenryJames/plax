import type { MetadataRoute } from 'next'
import { SITE_URL, TOPIC_SEO } from '@/lib/seo'
import { NEWS_SECTIONS } from '@/lib/types'
import { sharePath } from '@/lib/share'
import { recentShares } from '@/lib/share-store'

// Shared stories join the sitemap as they appear; an hour's delay is fine for a page that never changes.
export const revalidate = 3600
const SHARED_STORIES = 500

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
      url: `${SITE_URL}/headlines`,
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
    url: `${SITE_URL}/headlines/${s.id}`,
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

  // Never let the database hold up the rest of the sitemap.
  const shared = await recentShares(SHARED_STORIES).catch(() => [])
  const storyRoutes: MetadataRoute.Sitemap = shared.map((story) => ({
    url: `${SITE_URL}${sharePath(story.title, story.sid)}`,
    lastModified: new Date(story.createdAt),
    changeFrequency: 'never',
    priority: 0.5,
  }))

  return [...staticRoutes, ...newsSectionRoutes, ...topicRoutes, ...storyRoutes]
}
