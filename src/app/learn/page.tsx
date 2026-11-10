import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, P } from '@/components/LegalPage'
import { GUIDES, LEARN_UPDATED, NEWS_TOPIC, guidesForTopic, longDate, readingMinutes } from '@/lib/guides'
import { SITE, SITE_URL, TOPIC_SEO } from '@/lib/seo'

const url = `${SITE_URL}/learn`

export const metadata: Metadata = {
  title: 'Learn: plain-language guides to the subjects behind the news',
  description:
    'Original guides from Plax Labs on the repo rate, the Sensex, IPOs, inflation, the monsoon, vaccines, AI, the Indus Valley and more, written for a general reader.',
  alternates: { canonical: '/learn' },
  openGraph: {
    title: 'Learn · Plax',
    description: 'Plain-language guides to the subjects behind the news: money, markets, science, technology, history and how to read the news.',
    url,
    type: 'website',
    images: [SITE.ogImage],
  },
}

// The groups, in the order the page shows them: the guides about reading the news first, then one group for each topic that has guides.
const GROUPS = [
  { id: NEWS_TOPIC, label: 'Reading the news', emoji: '📰' },
  ...TOPIC_SEO.map((topic) => ({ id: topic.id, label: topic.label, emoji: topic.emoji })),
]
  .map((group) => ({ ...group, guides: guidesForTopic(group.id) }))
  .filter((group) => group.guides.length > 0)

// What search engines read as the page's purpose: a collection, and the list of what is in it.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      url,
      name: 'Learn: plain-language guides to the subjects behind the news',
      description: 'Original guides from Plax Labs, written for a general reader.',
      inLanguage: 'en',
      dateModified: LEARN_UPDATED,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'ItemList',
      itemListElement: GUIDES.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.title,
        url: `${url}/${guide.slug}`,
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Learn', item: url },
      ],
    },
  ],
}

const link = 'text-[color:var(--signal-text)] underline'

export default function LearnPage() {
  return (
    <LegalPage title="Learn" updated={longDate(LEARN_UPDATED)}>
      {/* "<" is escaped so nothing in the data can close the script element. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <P>
        The Plax feed gives you the news in a few lines. These guides give you what stands behind it: plain-language explanations of
        the subjects that come up again and again in the headlines, from the repo rate and the Sensex to the monsoon, vaccines and
        artificial intelligence, and how to judge a claim when you read it.
      </P>
      <P>
        {GUIDES.length} guides are here so far, each written for a general reader, with Indian examples where there are Indian
        examples to give. Every guide shows when it was last updated.
      </P>

      <Section title="How these guides are made" id="how">
        <P>
          The guides are written and published by Plax Labs, who are responsible for them. They are drafted with the help of AI
          writing tools, and they explain general ideas: they are not financial, medical or legal advice. Where a guide gives a
          number or a date, it is one that can be checked in a standard reference, and we change the guide, and its date, when a fact
          changes. If you find a mistake, write to us from the <Link href="/contact" className={link}>contact page</Link>. The{' '}
          <Link href="/editorial-policy" className={link}>editorial policy</Link> says more about how we work.
        </P>
      </Section>

      {GROUPS.map((group) => (
        <Section key={group.id} title={`${group.emoji} ${group.label}`} id={group.id}>
          <ul className="space-y-3">
            {group.guides.map((guide) => (
              <li key={guide.slug} className="rounded-2xl border border-dark-border bg-dark-card px-5 py-4">
                <h3 className="text-[17px] sm:text-[19px] font-semibold leading-snug">
                  <Link href={`/learn/${guide.slug}`} className="focus-ring text-white hover:underline rounded">
                    {guide.title}
                  </Link>
                </h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-dark-muted">{guide.summary}</p>
                <p className="mt-2 text-xs text-dark-subtle">
                  {readingMinutes(guide)} min read · Updated {longDate(guide.updated)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </LegalPage>
  )
}
