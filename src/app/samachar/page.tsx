import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { SITE_URL } from '@/lib/seo'
import { fetchHindiNews } from '@/lib/sources'
import type { RawContent } from '@/lib/types'

// Server-rendered Hindi news so Google can index Plax for Hindi news queries
// (आज की ताज़ा खबरें) — the client feed alone is not crawlable.
export const revalidate = 900

const getCachedHindiNews = unstable_cache(
  async () => fetchHindiNews(15),
  ['seo-hindi-news'],
  { revalidate: 900, tags: ['news'] }
)

function cleanText(s: string, max = 240): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max).trim() + '…' : t
}

export async function generateMetadata(): Promise<Metadata> {
  const url = `${SITE_URL}/samachar`
  return {
    title: 'आज की ताज़ा खबरें — भारत और दुनिया | समाचार',
    description:
      'आज की ताज़ा खबरें — भारत और दुनिया की प्रमुख सुर्खियाँ, आसान भाषा में। तकनीक, व्यापार, विज्ञान और देश-विदेश की खबरें Plax पर लगातार अपडेट।',
    keywords: [
      'ताज़ा खबरें', 'आज की खबरें', 'हिंदी समाचार', 'भारत समाचार', 'ब्रेकिंग न्यूज़',
      'हिंदी न्यूज़', 'दुनिया की खबरें', 'Plax समाचार', 'latest hindi news',
    ],
    alternates: { canonical: '/samachar', languages: { 'hi-IN': '/samachar', 'en-IN': '/news' } },
    openGraph: {
      title: 'आज की ताज़ा खबरें — भारत और दुनिया | Plax',
      description: 'भारत और दुनिया की प्रमुख सुर्खियाँ, आसान भाषा में — लगातार अपडेट।',
      url,
      type: 'website',
      locale: 'hi_IN',
    },
  }
}

export default async function SamacharPage() {
  const raw = await getCachedHindiNews().catch(() => [] as RawContent[])
  const seen = new Set<string>()
  const items = raw
    .filter((i) => i.title)
    .filter((i) => { const k = i.title.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, 30)

  const url = `${SITE_URL}/samachar`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}/#page`,
        url,
        name: 'आज की ताज़ा खबरें — Plax समाचार',
        description: 'भारत और दुनिया की प्रमुख हिंदी सुर्खियाँ, लगातार अपडेट।',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        inLanguage: 'hi',
      },
      {
        '@type': 'ItemList',
        itemListElement: items.slice(0, 20).map((it, i) => ({
          '@type': 'ListItem', position: i + 1, url: it.url || url, name: it.title,
        })),
      },
    ],
  }

  return (
    <main className="min-h-screen bg-dark-bg text-dark-text px-5 sm:px-8 py-10 max-w-4xl mx-auto lang-hi">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-sm text-dark-subtle mb-6">
        <Link href="/" className="hover:text-white">होम</Link> <span className="mx-1">/</span> समाचार
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">आज की ताज़ा खबरें — भारत और दुनिया</h1>
        <p className="text-dark-muted leading-relaxed max-w-2xl">
          भारत और दुनिया की प्रमुख सुर्खियाँ, आसान भाषा में और लगातार अपडेट।{' '}
          <Link href="/?topic=news&lang=hi" className="text-[color:var(--signal)] hover:underline">लाइव समाचार फ़ीड खोलें</Link>.
          {' '}Read in English? <Link href="/news" className="text-[color:var(--signal)] hover:underline">Latest news today</Link>.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-dark-subtle">खबरें अपडेट हो रही हैं — कृपया थोड़ी देर में देखें।</p>
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
                {it.publishedAt ? ` · ${new Date(it.publishedAt).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-12 pt-8 border-t border-white/[0.06] text-sm text-dark-subtle">
        <Link href="/?topic=news&lang=hi" className="text-[color:var(--signal)] hover:underline">लाइव समाचार फ़ीड खोलें →</Link>
      </footer>
    </main>
  )
}
