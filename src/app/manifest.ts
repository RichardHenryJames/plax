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
      // The same amber tile and dark P as the app's launcher icon. Android crops install icons to its own shape, so these are
      // full-bleed with the P kept in the middle (see src/lib/brand.ts); the browser tab and Apple icons are app/icon.png and
      // app/apple-icon.png.
      { src: withBase('/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: withBase('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: withBase('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}