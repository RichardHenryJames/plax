import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { SITE_URL } from '@/lib/seo'
import { fetchGeneralNews } from '@/lib/sources'
import { NEWS_SECTIONS } from '@/lib/types'
import type { RawContent } from '@/lib/types'

// Regenerate the crawlable news HTML every 15 min so Google always sees fresh,
// server-rendered headlines (the client feed is not indexable on its own).
export const revalidate = 900

// Cache the RSS pull across requests so the page is fast even under crawl load.
const getCachedNews = unstable_cache(
  async () => fetchGeneralNews(12),
  ['seo-general-news'],
  { revalidate: 900, tags: ['news'] }
)

function cleanText(s: string, max = 220): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max).trim() + '…' : t
}

// De-duplicate by title and keep a healthy, section-diverse set.
function prepare(items: RawContent[]): RawContent[] {
  const seen = new Set<string>()
  const out: RawContent[] = []
  for (const it of items) {
    const key = (it.title || '').toLowerCase().trim()
    if (!it.title || seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
}

export async function generateMetadata(): Promise<Metadata> {
  const url = `${SITE_URL}/news`
  return {
    title: 'Latest News Today — India & World Headlines',
    description:
      'The latest news today from India and around the world — top headlines in technology, business, science and world affairs, summarized clearly. Updated continuously on Plax.',
    keywords: [
      'latest news', 'news today', 'India news', 'world news', 'breaking news',
      'top headlines', 'technology news', 'business news', 'science news', 'Plax news',
    ],
    alternates: { canonical: '/news', languages: { 'en-IN': '/news', 'hi-IN': '/samachar' } },
    openGraph: {
      title: 'Latest News Today — India & World Headlines | Plax',
      description:
        'Top headlines from India and the world — tech, business, science and world affairs, summarized. Updated continuously.',
      url,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: 'Latest News Today | Plax' },
  }
}

export default async function NewsHubPage() {
  const raw = await getCachedNews().catch(() => [] as RawContent[])
  const items = prepare(raw)
  const url = `${SITE_URL}/news`
  const bySection = (id: string) => items.filter((i) => i.section === id).slice(0, 8)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}/#page`,
        url,
        name: 'Latest News Today — India & World | Plax',
        description:
          'Top news headlines from India and the world, summarized and updated continuously.',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        inLanguage: 'en',
      },
      {
        '@type': 'ItemList',
        itemListElement: items.slice(0, 20).map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: it.url || url,
          name: it.title,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'News', item: url },
        ],
      },
    ],
  }

  return (
    <main className="min-h-screen bg-dark-bg text-dark-text px-5 sm:px-8 py-10 max-w-4xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-sm text-dark-subtle mb-6">
        <Link href="/" className="hover:text-white">Home</Link> <span className="mx-1">/</span> News
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 font-display">Latest News Today — India &amp; World</h1>
        <p className="text-dark-muted leading-relaxed max-w-2xl">
          Top headlines from India and across the world, summarized clearly and updated continuously.
          Browse the latest in technology, business, science and world affairs — or{' '}
          <Link href="/?topic=news" className="text-[color:var(--signal)] hover:underline">open the live news feed</Link>.
          Prefer Hindi? <Link href="/samachar" className="text-[color:var(--signal)] hover:underline">आज की ताज़ा खबरें पढ़ें</Link>.
        </p>
      </header>

      {/* Section quick-links */}
      <div className="flex flex-wrap gap-2 mb-10">
        {NEWS_SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={`/news/${s.id}`}
            className="px-3.5 py-1.5 rounded-full text-sm font-semibold bg-white/[0.04] border border-white/[0.08] hover:border-[color:var(--signal)] transition"
          >
            {s.label}
          </Link>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-dark-subtle">Headlines are refreshing — please check back in a moment.</p>
      )}

      {NEWS_SECTIONS.map((s) => {
        const sectionItems = bySection(s.id)
        if (sectionItems.length === 0) return null
        return (
          <section key={s.id} className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{s.label} News</h2>
              <Link href={`/news/${s.id}`} className="text-sm text-[color:var(--signal)] hover:underline">More {s.label} →</Link>
            </div>
            <ul className="space-y-5">
              {sectionItems.map((it, i) => (
                <li key={i} className="border-b border-white/[0.06] pb-5">
                  <h3 className="text-lg font-semibold text-white leading-snug mb-1.5">
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--signal)] transition-colors">
                      {it.title}
                    </a>
                  </h3>
                  <p className="text-sm text-dark-muted leading-relaxed mb-2">{cleanText(it.content)}</p>
                  <div className="text-xs text-dark-subtle">
                    {it.source}
                    {it.publishedAt ? ` · ${new Date(it.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <footer className="mt-12 pt-8 border-t border-white/[0.06] text-sm text-dark-subtle">
        <p>
          Plax summarizes headlines from reputable publishers and links to the original sources.
          For the full swipeable experience, <Link href="/?topic=news" className="text-[color:var(--signal)] hover:underline">open the news feed</Link>.
        </p>
      </footer>
    </main>
  )
}
