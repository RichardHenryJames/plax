import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { SITE_URL } from '@/lib/seo'
import { fetchGeneralNews } from '@/lib/sources'
import { NEWS_SECTIONS } from '@/lib/types'
import type { RawContent } from '@/lib/types'

export const revalidate = 900
export const dynamicParams = false

export function generateStaticParams() {
  return NEWS_SECTIONS.map((s) => ({ section: s.id }))
}

const getCachedNews = unstable_cache(
  async () => fetchGeneralNews(12),
  ['seo-general-news'],
  { revalidate: 900, tags: ['news'] }
)

const SECTION_COPY: Record<string, { title: string; desc: string; kw: string[] }> = {
  india: {
    title: 'India News Today — Latest Headlines',
    desc: 'The latest India news today — top national headlines, politics, and current affairs, summarized clearly and updated continuously on Plax.',
    kw: ['India news', 'India news today', 'national news', 'latest India headlines', 'current affairs India'],
  },
  world: {
    title: 'World News Today — Global Headlines',
    desc: 'The latest world news today — global headlines and international affairs, summarized clearly and updated continuously on Plax.',
    kw: ['world news', 'international news', 'global headlines', 'world news today'],
  },
  tech: {
    title: 'Technology News Today — Latest Tech Headlines',
    desc: 'The latest technology news today — AI, gadgets, startups and the companies shaping the future, summarized clearly on Plax.',
    kw: ['technology news', 'tech news today', 'AI news', 'gadget news', 'startup news'],
  },
  business: {
    title: 'Business News Today — Markets & Economy',
    desc: 'The latest business news today — markets, economy, companies and finance, summarized clearly and updated continuously on Plax.',
    kw: ['business news', 'market news', 'economy news', 'finance news today'],
  },
  science: {
    title: 'Science News Today — Latest Discoveries',
    desc: 'The latest science news today — research, discoveries and breakthroughs, explained simply and updated continuously on Plax.',
    kw: ['science news', 'science news today', 'research news', 'scientific discoveries'],
  },
}

function cleanText(s: string, max = 240): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max).trim() + '…' : t
}

type Params = { params: Promise<{ section: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section } = await params
  const meta = SECTION_COPY[section]
  const s = NEWS_SECTIONS.find((x) => x.id === section)
  if (!meta || !s) return {}
  const url = `${SITE_URL}/news/${section}`
  return {
    title: meta.title,
    description: meta.desc,
    keywords: [...meta.kw, 'Plax', 'news today'],
    alternates: { canonical: `/news/${section}` },
    openGraph: { title: `${meta.title} | Plax`, description: meta.desc, url, type: 'website' },
    twitter: { card: 'summary_large_image', title: `${meta.title} | Plax` },
  }
}

export default async function NewsSectionPage({ params }: Params) {
  const { section } = await params
  const s = NEWS_SECTIONS.find((x) => x.id === section)
  const meta = SECTION_COPY[section]
  if (!s || !meta) notFound()

  const raw = await getCachedNews().catch(() => [] as RawContent[])
  const seen = new Set<string>()
  const items = raw
    .filter((i) => i.section === section && i.title)
    .filter((i) => { const k = i.title.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, 25)

  const url = `${SITE_URL}/news/${section}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}/#page`,
        url,
        name: meta.title,
        description: meta.desc,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        inLanguage: 'en',
      },
      {
        '@type': 'ItemList',
        itemListElement: items.map((it, i) => ({
          '@type': 'ListItem', position: i + 1, url: it.url || url, name: it.title,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'News', item: `${SITE_URL}/news` },
          { '@type': 'ListItem', position: 3, name: s.label, item: url },
        ],
      },
    ],
  }

  return (
    <main className="min-h-screen bg-dark-bg text-dark-text px-5 sm:px-8 py-10 max-w-4xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-sm text-dark-subtle mb-6">
        <Link href="/" className="hover:text-white">Home</Link> <span className="mx-1">/</span>{' '}
        <Link href="/news" className="hover:text-white">News</Link> <span className="mx-1">/</span> {s.label}
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 font-display">{meta.title}</h1>
        <p className="text-dark-muted leading-relaxed max-w-2xl">{meta.desc}</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-10">
        <Link href="/news" className="px-3.5 py-1.5 rounded-full text-sm font-semibold bg-white/[0.04] border border-white/[0.08] hover:border-[color:var(--signal)] transition">All News</Link>
        {NEWS_SECTIONS.map((x) => (
          <Link
            key={x.id}
            href={`/news/${x.id}`}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition ${
              x.id === section ? 'bg-[color:var(--signal)] text-black border-transparent' : 'bg-white/[0.04] border-white/[0.08] hover:border-[color:var(--signal)]'
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-dark-subtle">Headlines are refreshing — please check back in a moment.</p>
      ) : (
        <ul className="space-y-6">
          {items.map((it, i) => (
            <li key={i} className="border-b border-white/[0.06] pb-6">
              <h2 className="text-lg font-semibold text-white leading-snug mb-1.5">
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--signal)] transition-colors">{it.title}</a>
              </h2>
              <p className="text-sm text-dark-muted leading-relaxed mb-2">{cleanText(it.content)}</p>
              <div className="text-xs text-dark-subtle">
                {it.source}
                {it.publishedAt ? ` · ${new Date(it.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-12 pt-8 border-t border-white/[0.06] text-sm text-dark-subtle">
        <Link href="/?topic=news" className="text-[color:var(--signal)] hover:underline">Open the live news feed →</Link>
      </footer>
    </main>
  )
}
