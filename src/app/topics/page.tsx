import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE, SITE_URL, TOPIC_SEO } from '@/lib/seo'
import { TopicHubCard } from '@/components/TopicHubCard'

export const metadata: Metadata = {
  title: 'Explore Topics — Personalized Knowledge Feeds',
  description:
    'Browse every Plax topic — science, technology, AI, startups, finance, philosophy, space and more. Pick what you love and get smarter in five minutes a day.',
  alternates: { canonical: '/topics' },
  openGraph: {
    title: 'Explore Topics · Plax',
    description:
      'Browse every Plax topic and build a personalized feed of bite-sized, AI-summarized insights.',
    url: `${SITE_URL}/topics`,
    type: 'website',
    images: [SITE.ogImage],
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'Topics', item: `${SITE_URL}/topics` },
  ],
}

const itemListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Plax Topics',
  itemListElement: TOPIC_SEO.map((t, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: t.label,
    url: `${SITE_URL}/topics/${t.id}`,
  })),
}

export default function TopicsHubPage() {
  return (
    <main className="h-[100dvh] overflow-y-auto bg-dark-bg text-dark-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, itemListJsonLd]) }}
      />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-dark-border">
        <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_15%_-10%,rgba(139,92,246,0.18),transparent_55%),radial-gradient(80%_120%_at_100%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
        <div className="relative max-w-4xl mx-auto px-5 sm:px-6 pt-8 pb-12">
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-dark-muted">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span className="mx-2 text-dark-subtle">/</span>
            <span className="text-dark-text">Topics</span>
          </nav>

          <div className="flex items-center gap-2 mb-4">
            <Link href="/" className="flex items-center gap-2 group">
              <img src="/plaxlabs_logo.png" alt="Plax" className="w-8 h-8 rounded-lg" />
              <span className="text-lg font-bold text-white/90">Plax</span>
            </Link>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white font-display leading-[1.05] tracking-[-0.02em] mb-4">
            Explore every topic
          </h1>
          <p className="text-dark-muted text-lg max-w-2xl leading-relaxed">
            Plax turns the world&apos;s best content into bite-sized, AI-summarized insights.
            Pick the topics you care about and build a feed that makes you smarter every day.
          </p>
          <Link href="/" className="btn-primary focus-ring inline-flex mt-7 px-6 py-3 text-sm">
            Start reading free
          </Link>
        </div>
      </div>

      {/* Topic grid */}
      <div className="max-w-4xl mx-auto px-5 sm:px-6 py-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-dark-subtle mb-5">
          All {TOPIC_SEO.length} topics
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOPIC_SEO.map((t) => (
            <TopicHubCard key={t.id} id={t.id} emoji={t.emoji} label={t.label} description={t.description} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-dark-border mt-6">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-dark-muted hover:text-white transition-colors">
            <img src="/plaxlabs_logo.png" alt="Plax" className="w-6 h-6 rounded" />
            <span className="text-sm font-medium">Plax — get smarter every day</span>
          </Link>
          <p className="text-dark-subtle text-xs">© {new Date().getFullYear()} Plax Labs</p>
        </div>
      </footer>
    </main>
  )
}
