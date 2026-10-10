import type { Metadata } from 'next'
import Link from 'next/link'
import { cache } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import { SITE, SITE_URL, getTopicSeo } from '@/lib/seo'
import { NEWS_SECTIONS } from '@/lib/types'
import { bodyWithoutHeadline } from '@/lib/story-body'
import { excerpt, isHindi, parseShareSegment, sharePath, slugify } from '@/lib/share'
import { loadShare } from '@/lib/share-store'
import StoryActions from './StoryActions'
import StoryImage from './StoryImage'
import { BrandMark } from '@/components/BrandMark'

// A story page is the same for everyone and never changes once stored, so it is kept for a couple of minutes at a
// time: a link that goes viral reads the database once, not once per tap. If the store is unreachable the error is
// not cached (and an already-cached page keeps being served), and a story that is missing is cached only briefly.
export const revalidate = 120
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

type Params = { params: Promise<{ slug: string }> }

// The page and its metadata both need the story; one read serves both.
const story = cache(async (segment: string) => {
  const parsed = parseShareSegment(segment)
  if (!parsed) return null
  const record = await loadShare(parsed.id)
  return record ? { record, slug: parsed.slug } : null
})

const COPY = {
  en: {
    from: 'Source', read: 'Read the full story at', share: 'Share', copy: 'Copy link', copied: 'Link copied',
    open: 'Open the Plax feed', more: 'More on Plax', all: (label: string) => `More ${label} news`, topic: (label: string) => `${label} stories`,
    note: 'Plax shows a short summary of the story. The full report belongs to the publisher.',
  },
  hi: {
    from: 'स्रोत', read: 'पूरी खबर पढ़ें:', share: 'शेयर करें', copy: 'लिंक कॉपी करें', copied: 'लिंक कॉपी हो गया',
    open: 'Plax फ़ीड खोलें', more: 'Plax पर और', all: (label: string) => `और ${label} खबरें`, topic: (label: string) => `${label} की कहानियाँ`,
    note: 'Plax खबर का छोटा सार दिखाता है। पूरी रिपोर्ट प्रकाशक की है।',
  },
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

// Only a web address may become a link, whatever the stored record holds.
function webLink(url: string | undefined): string {
  try {
    const parsed = url ? new URL(url) : null
    return parsed && (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function label(record: { section?: string; category: string }, hindi: boolean): { text: string; section?: string; topic?: string } {
  const section = NEWS_SECTIONS.find((s) => s.id === record.section)
  if (section) return { text: hindi ? section.labelHi : section.label, section: section.id }
  const topic = getTopicSeo(record.category)
  if (topic) return { text: topic.label, topic: topic.id }
  return { text: hindi ? 'खबर' : 'News' }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const found = await story(slug)
  if (!found) return { title: 'Story not found', robots: { index: false, follow: true } }
  const { record } = found
  const hindi = isHindi(record.title, record.content)
  const headline = record.title || excerpt(record.content, 110)
  const description = excerpt(bodyWithoutHeadline(record.title, record.content) || headline, 160)
  const url = `${SITE_URL}${sharePath(record.title, record.sid)}`
  const published = record.publishedAt && record.publishedAt > 0 ? new Date(record.publishedAt).toISOString() : undefined
  return {
    title: excerpt(headline, 100),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      siteName: SITE.name,
      title: headline,
      description,
      locale: hindi ? 'hi_IN' : SITE.locale,
      section: label(record, hindi).text,
      ...(published ? { publishedTime: published } : {}),
    },
    twitter: { card: 'summary_large_image', title: headline, description, creator: SITE.twitter },
  }
}

export default async function StoryPage({ params }: Params) {
  const { slug } = await params
  const found = await story(slug)
  if (!found) notFound()
  const { record } = found
  // One story, one address: an old or hand-typed headline part points at the real one.
  if (found.slug !== slugify(record.title)) permanentRedirect(sharePath(record.title, record.sid))

  const hindi = isHindi(record.title, record.content)
  const t = COPY[hindi ? 'hi' : 'en']
  const headline = record.title || excerpt(record.content, 110)
  const body = bodyWithoutHeadline(record.title, record.content)
  const tag = label(record, hindi)
  const link = webLink(record.sourceUrl)
  const host = hostOf(link)
  const image = record.image && record.image.startsWith('https://') ? record.image : ''
  const pageUrl = `${SITE_URL}${sharePath(record.title, record.sid)}`
  const published = record.publishedAt && record.publishedAt > 0 ? new Date(record.publishedAt) : null
  const when = published
    ? published.toLocaleString(hindi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : ''

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#page`,
        url: pageUrl,
        name: headline,
        description: excerpt(body || headline, 160),
        inLanguage: hindi ? 'hi' : 'en',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
        ...(published ? { datePublished: published.toISOString() } : {}),
        // The report is the publisher's; this page is a summary that points back to it.
        ...(link ? { isBasedOn: { '@type': 'CreativeWork', name: headline, url: link, ...(record.source ? { publisher: { '@type': 'Organization', name: record.source } } : {}) } } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Plax', item: `${SITE_URL}/` },
          ...(tag.section ? [{ '@type': 'ListItem', position: 2, name: tag.text, item: `${SITE_URL}/headlines/${tag.section}` }] : []),
          { '@type': 'ListItem', position: tag.section ? 3 : 2, name: headline, item: pageUrl },
        ],
      },
    ],
  }

  return (
    <main className="min-h-screen bg-dark-bg text-dark-text">
      {/* "<" is escaped so no headline can close the script element. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-5 pb-16">
        <header className="flex items-center justify-between mb-8">
          <BrandMark />
          <span className={hindi ? 'lang-hi' : ''}>
            <Link href="/" className="focus-ring text-sm font-semibold text-[color:var(--signal-text)] hover:underline rounded">{t.open} →</Link>
          </span>
        </header>

        {/* Hindi gets its own fonts and line height, for the story and what follows it only. */}
        <div lang={hindi ? 'hi' : undefined} className={hindi ? 'lang-hi' : ''}>
        <article>
          {image && <StoryImage src={image} alt={headline} />}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3.5 text-[13px] font-semibold">
            <span className="px-2.5 py-1 rounded-full bg-[color:var(--signal)]/15 text-[color:var(--signal-text)] text-[11px] font-bold uppercase tracking-wider">{tag.text}</span>
            {record.source && <span className="text-dark-muted font-medium">{record.source}</span>}
            {published && <time dateTime={published.toISOString()} className="text-dark-subtle font-medium">{when}</time>}
          </div>

          <h1 className="headline text-[28px] sm:text-[38px] text-white mb-5">{headline}</h1>

          {body !== '' && (
            <div className="space-y-4 mb-7">
              {body.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i} className="reading-text">{paragraph}</p>
              ))}
            </div>
          )}

          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-flat focus-ring px-5 h-14 text-[15px] w-full sm:w-auto"
            >
              {t.read} {host || link} ↗
            </a>
          )}

          <StoryActions url={pageUrl} title={headline} labels={{ share: t.share, copy: t.copy, copied: t.copied }} />

          <p className="mt-6 text-xs text-dark-subtle leading-relaxed">
            {record.source ? `${t.from}: ${record.source}${host ? ` (${host})` : ''}. ` : ''}{t.note}
          </p>
        </article>

        <nav aria-label={t.more} className="mt-10 pt-6 border-t border-white/[0.08]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dark-subtle mb-3">{t.more}</p>
          <ul className="flex flex-wrap gap-2.5">
            <li><Link href="/" className="btn-secondary focus-ring inline-flex px-4 py-2 text-sm">{t.open}</Link></li>
            {tag.section && <li><Link href={`/headlines/${tag.section}`} className="btn-secondary focus-ring inline-flex px-4 py-2 text-sm">{t.all(tag.text)}</Link></li>}
            {tag.topic && <li><Link href={`/topics/${tag.topic}`} className="btn-secondary focus-ring inline-flex px-4 py-2 text-sm">{t.topic(tag.text)}</Link></li>}
          </ul>
        </nav>
        </div>
      </div>
    </main>
  )
}
