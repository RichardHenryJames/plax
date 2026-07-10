import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE, SITE_URL, TOPIC_SEO, getTopicSeo } from '@/lib/seo'

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
  const title = `${t.label} — Bite-Sized ${t.label} Insights`
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
      images: [SITE.ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${t.label} · Plax`,
      description: t.description,
      images: [SITE.ogImage],
    },
  }
}

export default async function TopicPage({ params }: Params) {
  const { topic } = await params
  const t = getTopicSeo(topic)
  if (!t) notFound()

  const url = `${SITE_URL}/topics/${t.id}`
  const related = TOPIC_SEO.filter((x) => x.id !== t.id).slice(0, 6)

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
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
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
        <div className="absolute inset-0 bg-[radial-gradient(90%_130%_at_15%_-10%,rgba(139,92,246,0.2),transparent_55%),radial-gradient(80%_120%_at_100%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
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
                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-lg bg-violet-500/15 text-violet-300 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </span>
                <span className="text-dark-text/90 leading-relaxed">{d}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Why Plax */}
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-dark-subtle mb-4">
            Learn {t.label} the smart way
          </h2>
          <div className="card-elevated p-6 leading-relaxed text-dark-text/85">
            <p>
              Every {t.label.toLowerCase()} card on Plax is short, clear and designed to be read in
              under a minute. Our AI distills long articles into crisp takeaways with the key points
              in <strong className="text-white">bold</strong>, so you absorb more in less time. Swipe
              through a personalized feed, save what matters, and watch your knowledge compound —
              five minutes at a time.
            </p>
          </div>
        </section>

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
        <section className="mt-14 relative overflow-hidden rounded-2xl border border-violet-500/25 p-7 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/15 to-cyan-500/10" />
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
            <img src="/plaxlabs_logo.png" alt="Plax" className="w-6 h-6 rounded" />
            <span className="text-sm font-medium">Explore all topics</span>
          </Link>
          <p className="text-dark-subtle text-xs">© {new Date().getFullYear()} Plax Labs</p>
        </div>
      </footer>
    </main>
  )
}
