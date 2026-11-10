import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LegalPage, Section, P, List } from '@/components/LegalPage'
import { GUIDES, NEWS_TOPIC, getGuide, guideWordCount, longDate, readingMinutes, relatedGuides, type Disclaimer } from '@/lib/guides'
import { SITE, SITE_URL, TOPIC_SEO } from '@/lib/seo'

// One static page for each guide, built with the site.
export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }))
}

export const dynamicParams = false

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) return {}
  return {
    title: guide.title,
    description: guide.summary,
    alternates: { canonical: `/learn/${guide.slug}` },
    openGraph: {
      title: `${guide.title} · Plax`,
      description: guide.summary,
      url: `${SITE_URL}/learn/${guide.slug}`,
      type: 'article',
      publishedTime: guide.published,
      modifiedTime: guide.updated,
      authors: ['Plax Labs'],
      images: [SITE.ogImage],
    },
    twitter: { card: 'summary_large_image', title: guide.title, description: guide.summary },
  }
}

const NOTES: Record<Disclaimer, string> = {
  money:
    'This guide is general information about how money and markets work. It is not financial advice and it does not recommend any investment, product or course of action. Numbers are illustrations unless a source is named, and rates, rules and limits change, so check the current position with the institution concerned before you decide anything.',
  health:
    'This guide explains in general how something works. It is not medical advice, and it cannot replace a conversation with a doctor or a trusted public-health source about your own situation.',
}

const anchorOf = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const link = 'text-[color:var(--signal-text)] underline'

export default async function GuidePage({ params }: Params) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) notFound()

  const url = `${SITE_URL}/learn/${guide.slug}`
  const topic = guide.topic === NEWS_TOPIC ? undefined : TOPIC_SEO.find((item) => item.id === guide.topic)
  const topicLabel = topic?.label ?? 'Reading the news'
  const minutes = readingMinutes(guide)
  const more = relatedGuides(guide)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: guide.title,
        description: guide.summary,
        url,
        mainEntityOfPage: url,
        datePublished: guide.published,
        dateModified: guide.updated,
        inLanguage: 'en',
        wordCount: guideWordCount(guide),
        articleSection: topicLabel,
        image: SITE.ogImage,
        author: { '@type': 'Organization', name: 'Plax Labs', url: SITE_URL },
        publisher: { '@id': `${SITE_URL}/#organization` },
        isPartOf: { '@id': `${SITE_URL}/#website` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Learn', item: `${SITE_URL}/learn` },
          { '@type': 'ListItem', position: 3, name: guide.title, item: url },
        ],
      },
    ],
  }

  return (
    <LegalPage
      title={guide.title}
      updated={longDate(guide.updated)}
      eyebrow={
        <nav aria-label="Breadcrumb" className="text-sm text-dark-muted">
          <Link href="/learn" className="focus-ring hover:text-white rounded">Learn</Link>
          <span className="mx-2 text-dark-subtle">/</span>
          <span>{topicLabel}</span>
        </nav>
      }
    >
      {/* "<" is escaped so nothing in the data can close the script element. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <p className="mb-7 text-sm text-dark-subtle">
        By Plax Labs · {minutes} min read · Published {longDate(guide.published)}
      </p>

      <div className="space-y-3.5">
        {guide.intro.map((paragraph) => (
          <P key={paragraph}>{paragraph}</P>
        ))}
      </div>

      <aside aria-label="In short" className="mt-7 rounded-2xl border border-dark-border bg-dark-card px-5 py-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-dark-subtle mb-2.5">In short</h2>
        <List>
          {guide.keyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </List>
      </aside>

      <nav aria-label="In this guide" className="mt-7 text-sm">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-dark-subtle mb-2">In this guide</h2>
        <ol className="list-decimal pl-5 space-y-1 marker:text-dark-subtle">
          {guide.sections.map((section) => (
            <li key={section.heading}>
              <a href={`#${anchorOf(section.heading)}`} className="focus-ring text-[color:var(--signal-text)] hover:underline rounded">
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {guide.sections.map((section) => (
        <Section key={section.heading} title={section.heading} id={anchorOf(section.heading)}>
          {section.paragraphs.map((paragraph) => (
            <P key={paragraph}>{paragraph}</P>
          ))}
          {section.bullets && (
            <List>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </List>
          )}
          {section.example && (
            <pre className="overflow-x-auto rounded-xl border border-dark-border bg-dark-card px-4 py-3 text-[13px] leading-relaxed text-dark-text/90 whitespace-pre font-mono">
              {section.example}
            </pre>
          )}
        </Section>
      ))}

      {guide.disclaimer && (
        <aside aria-label="A note" className="mt-10 rounded-2xl border border-dark-border px-5 py-4 text-sm leading-relaxed text-dark-muted">
          <strong className="text-dark-text">A note. </strong>
          {NOTES[guide.disclaimer]}
        </aside>
      )}

      {more.length > 0 && (
        <Section title="Keep reading" id="keep-reading">
          <ul className="space-y-3">
            {more.map((other) => (
              <li key={other.slug}>
                <Link href={`/learn/${other.slug}`} className="focus-ring font-semibold text-white hover:underline rounded">
                  {other.title}
                </Link>
                <p className="mt-0.5 text-[15px] leading-relaxed text-dark-muted">{other.summary}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="mt-10 text-sm leading-relaxed text-dark-muted">
        Written by Plax Labs with the help of AI writing tools, and updated {longDate(guide.updated)}. Found a mistake or something
        out of date? <Link href="/contact" className={link}>Tell us</Link>, and read our{' '}
        <Link href="/editorial-policy" className={link}>editorial policy</Link>.{' '}
        <Link href={topic ? `/?topic=${topic.id}` : '/'} className={link}>
          {topic ? `Read ${topic.label} stories on Plax` : 'Read the news on Plax'}
        </Link>
        .
      </p>
    </LegalPage>
  )
}
