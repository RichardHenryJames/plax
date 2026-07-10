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
  const year = new Date().getFullYear()
  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-dark-bg text-dark-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, itemListJsonLd]) }}
      />

      {/* ── Masthead: asymmetric, left-weighted, no centered hero / no gradient wash ── */}
      <header className="border-b border-[color:var(--hair)]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          {/* Top bar */}
          <div className="flex items-center justify-between py-5 border-b border-[color:var(--hair)]">
            <Link href="/" className="flex items-center gap-2.5 group">
              <img src="/plaxlabs_logo.png" alt="Plax" className="w-7 h-7 rounded-md" />
              <span className="text-[15px] font-bold tracking-tight text-white">Plax</span>
            </Link>
            <nav aria-label="Breadcrumb" className="eyebrow eyebrow--bare">
              <Link href="/" className="link-ed hover:text-white">Home</Link>
              <span className="text-dark-subtle">/</span>
              <span className="text-white">Topics</span>
            </nav>
          </div>

          {/* Editorial headline — 12-col grid, deliberately unbalanced (7 / 5) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-8 lg:gap-x-10 pt-12 pb-14">
            <div className="lg:col-span-8">
              <span className="eyebrow">Plax · Topic Index · {year}</span>
              <h1 className="display-serif text-white mt-6 text-[clamp(2.9rem,8vw,6.2rem)]">
                Read the world,<br /><em>one idea at a time.</em>
              </h1>
            </div>
            <div className="lg:col-span-4 lg:pt-3 flex flex-col justify-end">
              <p className="text-dark-muted text-[15px] leading-relaxed max-w-sm">
                Plax distills the internet&apos;s best writing into sharp, one-minute reads.
                Choose the subjects that pull you in — the feed builds itself around them.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/" className="btn-signal focus-ring">Start reading — free</Link>
                <span className="eyebrow eyebrow--bare text-dark-subtle">
                  {TOPIC_SEO.length} subjects
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── The Index: numbered editorial rows, not a grid of identical cards ── */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-14 pb-8">
        <div className="flex items-baseline justify-between mb-2">
          <span className="eyebrow">The Index</span>
          <span className="eyebrow eyebrow--bare text-dark-subtle hidden sm:inline">Follow to build your feed →</span>
        </div>
        <ol>
          {TOPIC_SEO.map((t, i) => (
            <TopicHubCard
              key={t.id}
              id={t.id}
              index={i + 1}
              emoji={t.emoji}
              label={t.label}
              description={t.description}
            />
          ))}
        </ol>
      </section>

      {/* ── Paper interlude: a light surface break so the page isn't endless dark ── */}
      <section className="surface-paper border-y border-black/10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <blockquote className="lg:col-span-8">
            <p className="display-serif text-[color:var(--paper-ink)] text-[clamp(1.7rem,3.6vw,2.7rem)] leading-[1.12]">
              &ldquo;Five focused minutes beat an hour of doomscrolling. Plax is the
              difference between <span className="italic" style={{ color: 'var(--signal-deep)' }}>consuming</span> and
              actually <span className="italic" style={{ color: 'var(--signal-deep)' }}>learning</span>.&rdquo;
            </p>
          </blockquote>
          <div className="lg:col-span-4 lg:justify-self-end">
            <div className="flex items-center gap-4">
              <div className="text-[clamp(3rem,7vw,5rem)] font-bold leading-none tracking-tighter" style={{ color: 'var(--signal-deep)' }}>5m</div>
              <div className="text-sm text-muted-on-paper leading-snug">
                a day is all it takes.<br />No account needed to start.
              </div>
            </div>
            <Link href="/" className="btn-ghost-ed focus-ring mt-6" style={{ color: 'var(--paper-ink)', borderColor: 'rgba(26,23,18,0.25)' }}>
              Open the feed
            </Link>
          </div>
        </div>
      </section>

      {/* ── Ticker footer: a moving marquee of topic names — a memorable close ── */}
      <div className="ticker-mask overflow-hidden border-b border-[color:var(--hair)] py-4 select-none">
        <div className="ticker-track">
          {[...TOPIC_SEO, ...TOPIC_SEO].map((t, i) => (
            <span key={i} className="inline-flex items-center gap-3 px-6 text-dark-subtle">
              <span className="text-base">{t.emoji}</span>
              <span className="text-sm font-medium tracking-tight">{t.label}</span>
              <span style={{ color: 'var(--signal)' }}>·</span>
            </span>
          ))}
        </div>
      </div>

      <footer className="mx-auto max-w-6xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 text-dark-muted hover:text-white transition-colors">
          <img src="/plaxlabs_logo.png" alt="Plax" className="w-6 h-6 rounded" />
          <span className="text-sm font-medium">Plax — get smarter every day</span>
        </Link>
        <p className="eyebrow eyebrow--bare text-dark-subtle">© {year} Plax Labs</p>
      </footer>
    </main>
  )
}
