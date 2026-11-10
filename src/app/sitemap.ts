import type { MetadataRoute } from 'next'
import { SITE_URL, TOPIC_SEO } from '@/lib/seo'
import { NEWS_SECTIONS } from '@/lib/types'
import { sharePath } from '@/lib/share'
import { recentShares } from '@/lib/share-store'
import { LEGAL } from '@/lib/legal'
import { GUIDES, LEARN_UPDATED } from '@/lib/guides'

// Shared stories join the sitemap as they appear; an hour's delay is fine for a page that never changes.
export const revalidate = 3600
const SHARED_STORIES = 500

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      // Without the trailing slash: ".../news/" redirects to this address.
      url: SITE_URL,
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
    // The site's own writing: the Learn guides and the pages that say who makes Plax and how. They change when a guide is edited, so they say when.
    {
      url: `${SITE_URL}/learn`,
      lastModified: new Date(LEARN_UPDATED),
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(LEGAL.aboutUpdatedIso),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/editorial-policy`,
      lastModified: new Date(LEGAL.aboutUpdatedIso),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    // The policy pages Google Play requires; they change rarely, so they say when.
    {
      url: `${SITE_URL}${LEGAL.contactPath}`,
      lastModified: new Date(LEGAL.contactUpdatedIso),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(LEGAL.updatedIso),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/delete-account`,
      lastModified: new Date(LEGAL.updatedIso),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const newsSectionRoutes: MetadataRoute.Sitemap = NEWS_SECTIONS.map((s) => ({
    url: `${SITE_URL}/headlines/${s.id}`,
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.85,
  }))

  const guideRoutes: MetadataRoute.Sitemap = GUIDES.map((guide) => ({
    url: `${SITE_URL}/learn/${guide.slug}`,
    lastModified: new Date(guide.updated),
    changeFrequency: 'monthly',
    priority: 0.75,
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

  return [...staticRoutes, ...guideRoutes, ...newsSectionRoutes, ...topicRoutes, ...storyRoutes]
}
