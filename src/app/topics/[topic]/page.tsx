import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL, TOPIC_SEO, getTopicSeo } from '@/lib/seo'
import { guidesForTopic, readingMinutes } from '@/lib/guides'
import { TOPIC_OVERVIEWS } from '@/lib/topic-overviews'
import { BrandMark } from '@/components/BrandMark'
import { SiteLinks } from '@/components/SiteLinks'

// Statically pre-render one page per topic at build time.
export function generateStaticParams() {
  return TOPIC_SEO.map((t) => ({ topic: t.id }))
}

export const dynamicParams = false

type Params = { params: Promise<{ topic: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { topic } = await params
  const t = getTopicSeo(topic)
  if (!t) return {}
  const title = t.title ?? `${t.label} — Bite-Sized ${t.label} Insights`
  const url = `${SITE_URL}/topics/${t.id}`
  return {
    title,
    description: t.description,
    keywords: [...t.keywords, 'Plax', `${t.label} feed`, `learn ${t.label}`],
    alternates: { canonical: `/topics/${t.id}` },
    openGraph: {
      title: `${t.label} · Plax`,
      description: t.description,
      url,
      type: 'website',
      // images omitted → Next uses the per-topic opengraph-image.tsx automatically
    },
    twitter: {
      card: 'summary_large_image',
      title: `${t.label} · Plax`,
      description: t.description,
    },
  }
}

export default async function TopicPage({ params }: Params) {
  const { topic } = await params
  const t = getTopicSeo(topic)
  if (!t) notFound()

  const url = `${SITE_URL}/topics/${t.id}`
  const related = TOPIC_SEO.filter((x) => x.id !== t.id).slice(0, 6)
  const overview = TOPIC_OVERVIEWS[t.id] ?? []
  const guides = guidesForTopic(t.id)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}/#page`,
        url,
        name: `${t.label} — Plax`,
        description: t.description,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: t.label,
        inLanguage: 'en',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Topics', item: `${SITE_URL}/topics` },
          { '@type': 'ListItem', position: 3, name: t.label, item: url },
        ],
      },
    ],
  }

  return (
    <main className="h-[100dvh] overflow-y-auto bg-dark-bg text-dark-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-dark-border">
        <div className="absolute inset-0 bg-[radial-gradient(90%_130%_at_15%_-10%,rgba(245,177,58,0.12),transparent_55%)]" />
        <div className="relative max-w-3xl mx-auto px-5 sm:px-6 pt-8 pb-12">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-dark-muted">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span className="mx-2 text-dark-subtle">/</span>
            <Link href="/topics" className="hover:text-white transition-colors">Topics</Link>
            <span className="mx-2 text-dark-subtle">/</span>
            <span className="text-dark-text">{t.label}</span>
          </nav>

          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl mb-5">
            {t.emoji}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white font-display leading-[1.05] tracking-[-0.02em] mb-4">
            {t.label}
          </h1>
          <p className="text-dark-muted text-lg leading-relaxed max-w-2xl">{t.intro}</p>
          <Link href={`/?topic=${t.id}`} className="btn-primary focus-ring inline-flex mt-7 px-6 py-3 text-sm">
            Read {t.label} on Plax
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-10">
        <section aria-labelledby="discover-heading">
          <h2 id="discover-heading" className="text-sm font-semibold uppercase tracking-wider text-dark-subtle mb-4">
            What you&apos;ll discover
          </h2>
          <ul className="space-y-3">
            {t.discover.map((d) => (
              <li key={d} className="flex items-start gap-3 card-elevated p-4">
                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-lg bg-[color:var(--signal)]/15 text-[color:var(--signal)] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </span>
                <span className="text-dark-text/90 leading-relaxed">{d}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* What this section is for, in Plax's own words (a different text for every topic: lib/topic-overviews.ts) */}
        {overview.length > 0 && (
          <section className="mt-12" aria-labelledby="about-heading">
            <h2 id="about-heading" className="text-sm font-semibold uppercase tracking-wider text-dark-subtle mb-4">
              About {t.label} on Plax
            </h2>
            <div className="card-elevated p-6 leading-relaxed text-dark-text/85 space-y-3">
              {overview.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        )}

        {/* Where to start reading about it: the guides in Learn on this topic */}
        {guides.length > 0 && (
          <section className="mt-12" aria-labelledby="guides-heading">
            <h2 id="guides-heading" className="text-sm font-semibold uppercase tracking-wider text-dark-subtle mb-4">
              Start with {guides.length === 1 ? 'this guide' : 'these guides'}
            </h2>
            <ul className="space-y-3">
              {guides.map((guide) => (
                <li key={guide.slug} className="card-elevated p-4">
                  <Link href={`/learn/${guide.slug}`} className="focus-ring font-semibold text-white hover:underline rounded">
                    {guide.title}
                  </Link>
                  <p className="mt-1 text-[15px] leading-relaxed text-dark-muted">{guide.summary}</p>
                  <p className="mt-1.5 text-xs text-dark-subtle">{readingMinutes(guide)} min read</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/learn" className="focus-ring font-semibold text-[color:var(--signal-text)] hover:underline rounded">
                All Plax guides
              </Link>
            </p>
          </section>
        )}

        {/* Related topics */}
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-dark-subtle mb-4">
            Related topics
          </h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/topics/${r.id}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-dark-text hover:bg-white/10 hover:border-white/20 transition-colors focus-ring"
              >
                <span>{r.emoji}</span>
                {r.label}
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-14 relative overflow-hidden rounded-2xl border border-[color:var(--signal)]/25 p-7 text-center">
          <div className="absolute inset-0 bg-[color:var(--signal)]/8" />
          <div className="relative">
            <h2 className="text-2xl font-bold text-white font-display mb-2">
              Get smarter every day
            </h2>
            <p className="text-dark-muted mb-6 max-w-md mx-auto">
              Join Plax and turn spare minutes into a daily habit of learning.
            </p>
            <Link href="/" className="btn-primary focus-ring inline-flex px-6 py-3 text-sm">
              Start reading free
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-dark-border">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/topics" className="flex items-center gap-2 text-dark-muted hover:text-white transition-colors">
            <BrandMark size="sm" href={null} className="!text-current" />
            <span className="text-sm font-medium">Explore all topics</span>
          </Link>
          <SiteLinks />
          <p className="text-dark-subtle text-xs">© {new Date().getFullYear()} Plax Labs</p>
        </div>
      </footer>
    </main>
  )
}