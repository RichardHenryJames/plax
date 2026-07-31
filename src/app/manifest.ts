import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/seo'
import { withBase } from '@/lib/base-path'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Plax — Get Smarter Every Day',
    short_name: SITE.shortName,
    description: SITE.description,
    start_url: '/news',
    display: 'standalone',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    categories: ['education', 'news', 'books'],
    icons: [
      {
        src: withBase('/plaxlabs_logo.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}