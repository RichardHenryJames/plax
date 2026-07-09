import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProviderWrapper } from '@/components/AuthProviderWrapper'
import { SITE, SITE_URL, TOPIC_SEO } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE.title,
    template: '%s · Plax',
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: SITE.keywords,
  authors: [{ name: 'Plax Labs', url: SITE_URL }],
  creator: 'Plax Labs',
  publisher: 'Plax Labs',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    url: SITE_URL,
    locale: SITE.locale,
    images: [
      {
        url: SITE.ogImage,
        width: 512,
        height: 512,
        alt: 'Plax — get smarter every day',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.title,
    description: SITE.description,
    images: [SITE.ogImage],
    creator: SITE.twitter,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/plaxlabs_logo.png',
    apple: '/plaxlabs_logo.png',
  },
  manifest: '/manifest.webmanifest',
  category: 'education',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0c',
}

// Organization + WebSite structured data (helps brand knowledge panel + rich results)
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE.name,
      url: SITE_URL,
      logo: SITE.ogImage,
      description: SITE.description,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE.name,
      url: SITE_URL,
      description: SITE.description,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-dark-bg text-dark-text antialiased">
        {/* Server-rendered, screen-reader-only site nav. Present in the raw HTML
            (no JS needed) so crawlers reliably discover the topic hub + every
            topic page directly from the homepage, independent of client render. */}
        <nav aria-label="Browse topics" className="sr-only">
          <a href="/">Home</a>
          <a href="/topics">Explore all topics</a>
          {TOPIC_SEO.map((t) => (
            <a key={t.id} href={`/topics/${t.id}`}>{t.label}</a>
          ))}
        </nav>
        <AuthProviderWrapper>{children}</AuthProviderWrapper>
      </body>
    </html>
  )
}
