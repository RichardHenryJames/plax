import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, P, List } from '@/components/LegalPage'
import { CONTACT_MAILTO, LEGAL } from '@/lib/legal'
import { GUIDES } from '@/lib/guides'
import { SITE, SITE_URL } from '@/lib/seo'
import { SITE_DISPLAY } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About Plax',
  description:
    'About Plax: a news reader and a library of plain-language guides, made by Plax Labs for the web and Android. What it does, where its stories come from, who makes it and how it is paid for.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Plax',
    description: 'A news reader and a library of plain-language guides, made by Plax Labs for the web and Android.',
    url: `${SITE_URL}/about`,
    type: 'website',
    images: [SITE.ogImage],
  },
}

const link = 'text-[color:var(--signal-text)] underline'

// What search engines read as the page's purpose.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AboutPage',
      '@id': `${SITE_URL}/about#page`,
      url: `${SITE_URL}/about`,
      name: 'About Plax',
      inLanguage: 'en',
      dateModified: LEGAL.aboutUpdatedIso,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      mainEntity: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'About Plax', item: `${SITE_URL}/about` },
      ],
    },
  ],
}

export default function AboutPage() {
  return (
    <LegalPage title="About Plax" updated={LEGAL.aboutUpdated}>
      {/* "<" is escaped so nothing in the data can close the script element. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <P>
        Plax is a news reader and a place to learn, made by {LEGAL.operator} for the web and for Android. It gives you the day&apos;s
        stories in a few lines each, in English and in Hindi, and links every story to the full report at its publisher. Around the
        news there is a library of plain-language guides to the subjects behind the headlines.
      </P>

      <Section title="What Plax does" id="what">
        <List>
          <li>
            <strong>The news in short.</strong> Short summaries of stories from named publishers in India and around the world, in
            English and Hindi. Every story links to the original, and the headline is the link.
          </li>
          <li>
            <strong>Topics to follow.</strong> Science, technology, space, health, finance, stocks, business, history, philosophy,
            psychology, books, mathematics, nature, art, physics and language, so that the feed can follow your interests.
          </li>
          <li>
            <strong>Go deeper and Test yourself.</strong> Go deeper adds background to a story on request, and on the website Test
            yourself asks quick questions on a topic. Both are written by AI, are labelled as AI, and can contain mistakes.
          </li>
          <li>
            <strong>Saved stories, themes and search.</strong> Keep the stories you want to read later, choose a light or a dark look,
            and on the website search for a story or a topic.
          </li>
          <li>
            <strong>No account needed.</strong> Signing in with Google is optional, and only lets your chosen topics and saved
            stories follow you to another device. See the <Link href="/privacy" className={link}>privacy policy</Link>.
          </li>
        </List>
      </Section>

      <Section title="Where the stories come from" id="sources">
        <P>
          Plax has no reporters of its own. Its stories come from the public feeds of named publishers, such as The Hindu, NDTV, India
          Today, the BBC, Al Jazeera and NPR, and for some topics from open reference sources such as Wikipedia. The stories,
          headlines and pictures belong to their publishers, and Plax is not affiliated with them. The{' '}
          <Link href="/editorial-policy" className={link}>editorial policy</Link> lists the sources and explains how a story gets onto
          Plax and how the summaries are written.
        </P>
      </Section>

      <Section title="Plax's own writing: the Learn guides" id="learn">
        <P>
          The <Link href="/learn" className={link}>Learn</Link> section is the part of Plax that is its own. It holds {GUIDES.length} guides
          that explain, in plain language, the subjects that come up in the news: how the repo rate reaches a loan, what the Sensex
          measures, how the monsoon works, how vaccines work, how an AI chatbot can be wrong, and how to read the news with care.
          They are written and published by {LEGAL.operator} with the help of AI writing tools, carry the date they were last
          updated, and are corrected when a reader or we find a mistake.
        </P>
      </Section>

      <Section title="How Plax is paid for" id="funding">
        <P>
          Plax is free to read. It is paid for by advertising from Google: Google AdMob in the Android app and, where it is available,
          Google AdSense on the website. Advertising is labelled as advertising, and advertisers do not choose, rank or change the
          stories or the guides. You can read about the choices you have in the{' '}
          <Link href="/privacy" className={link}>privacy policy</Link>.
        </P>
      </Section>

      <Section title="Who makes Plax" id="who">
        <P>
          Plax is made by {LEGAL.operator}. The Android app and the website at {SITE_DISPLAY} share the same topics and the same stories;
          the Learn guides are on the website. To tell us about a mistake, a story that should not be there, a problem with the app,
          or an idea, write to <a href={CONTACT_MAILTO} className={link}>{LEGAL.contactEmail}</a>, or use the{' '}
          <Link href="/contact" className={link}>contact page</Link>.
        </P>
      </Section>
    </LegalPage>
  )
}
