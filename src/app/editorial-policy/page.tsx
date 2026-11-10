import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, P, List } from '@/components/LegalPage'
import { SOURCE_GROUPS } from '@/lib/editorial'
import { CONTACT_MAILTO, LEGAL } from '@/lib/legal'
import { SITE, SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Editorial policy',
  description:
    'How Plax chooses its stories, where they come from, how its AI summaries are written and checked, how we correct mistakes, and how the Learn guides are made.',
  alternates: { canonical: '/editorial-policy' },
  openGraph: {
    title: 'Editorial policy · Plax',
    description: 'Where Plax stories come from, how the summaries are written, and how we correct mistakes.',
    url: `${SITE_URL}/editorial-policy`,
    type: 'website',
    images: [SITE.ogImage],
  },
}

const link = 'text-[color:var(--signal-text)] underline'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/editorial-policy#page`,
      url: `${SITE_URL}/editorial-policy`,
      name: 'Plax editorial policy',
      inLanguage: 'en',
      dateModified: LEGAL.aboutUpdatedIso,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Editorial policy', item: `${SITE_URL}/editorial-policy` },
      ],
    },
  ],
}

export default function EditorialPolicyPage() {
  return (
    <LegalPage title="Editorial policy" updated={LEGAL.aboutUpdated}>
      {/* "<" is escaped so nothing in the data can close the script element. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <P>
        This page says how Plax decides what to show, where its stories come from, how its summaries are written, and what we do when
        we get something wrong. It applies to the Plax website and to the Plax app for Android.
      </P>

      <Section title="What Plax is, and what it is not" id="what">
        <P>
          Plax is a reader. It does not have reporters and it does not break news. Each story on Plax is a short summary of a story
          that a publisher has published, with a link to the original. The reporting belongs to the publisher, and if you want the full
          account, the evidence or the context, the publisher&apos;s page is the place to read it. The one part of Plax that is its own
          writing is the <Link href="/learn" className={link}>Learn</Link> section, described at the end of this page.
        </P>
      </Section>

      <Section title="Where our stories come from" id="sources">
        <P>
          Plax reads the public feeds of named publishers, and for some topics open reference sources. The publishers below are among
          the sources, and this is not a complete list: the Stocks feed, for example, reads market news from many more outlets, in
          several countries. The sources are feeds that the publishers themselves make public for others to read.
        </P>
        <ul className="reading-text space-y-2">
          {SOURCE_GROUPS.map((group) => (
            <li key={group.heading}>
              <strong>{group.heading}:</strong> {group.names.join(', ')}.
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How a story gets onto Plax" id="selection">
        <P>
          Plax reads the publishers&apos; feeds regularly, so that recent stories appear soon after they are published. The stories are
          put in an order that favours recent ones and mixes sources and subjects, so that one outlet or one event does not fill the
          feed, and stories that report the same event are shown once. A story needs a headline and some text from the publisher to
          work from. No publisher pays to be included or to be placed higher, and the order is not influenced by advertisers.
        </P>
      </Section>

      <Section title="How the summaries are written" id="summaries">
        <P>
          For each story Plax takes the headline and the description or opening that the publisher provides, and for some stories also
          reads the opening of the publisher&apos;s own page to give the summary more to work with. An AI model, a large language model
          from one of several providers, is then asked to write a short brief that sticks to the facts in that text, adds no opinion,
          leads with the most important point, and stays short when the source is short instead of being padded.
        </P>
        <P>
          AI summaries can be wrong. A summary can leave out a qualification, get a number or a name wrong, or lean differently from
          the original. That is why every story links to the original at its publisher, and why the headline is the link. Features
          that add background on request, such as Go deeper, are written by AI as well, are labelled as AI, and can contain
          mistakes. The AI and translation services that see the text of a story are named in the{' '}
          <Link href="/privacy" className={link}>privacy policy</Link>.
        </P>
        <P>
          The model works from the publisher&apos;s text and is told to stay close to it. For topics that explain rather than report,
          such as science and health, it is also asked to put a term or a mechanism in plain language, and that is where an AI can say
          something the source did not. We do not change what a publisher reported, and the original is always one click away.
        </P>
      </Section>

      <Section title="Headlines, pictures and links" id="headlines">
        <P>
          The headline of a story is its publisher&apos;s headline, and it is the link to the original. A picture comes from the
          publisher&apos;s feed or page and is shown with the story it belongs to. The stories, headlines and pictures belong to their
          publishers, and Plax is not affiliated with them.
        </P>
      </Section>

      <Section title="Hindi and translation" id="hindi">
        <P>
          Plax shows news from Hindi-language publishers in Hindi. Where a topic has stories only in English, the summary is
          translated into Hindi by machine through our servers, and a machine translation can contain errors, especially in names
          and numbers. If the Hindi seems to say something different from the English, trust the original.
        </P>
      </Section>

      <Section title="Corrections" id="corrections">
        <P>
          If a summary is wrong, or a story shows the wrong source, link or picture, tell us which story it is, by email at{' '}
          <a href={CONTACT_MAILTO} className={link}>{LEGAL.contactEmail}</a> or from the{' '}
          <Link href="/contact" className={link}>contact page</Link>. We read every correction request, and we fix errors that we can
          confirm and remove a story that should not be there. A mistake in the publisher&apos;s own article has to be raised with the
          publisher; if they correct it, the next summary reflects the change.
        </P>
      </Section>

      <Section title="Advertising and independence" id="ads">
        <P>
          Plax is paid for by advertising from Google, as described in <Link href="/about" className={link}>About Plax</Link>. Ads are
          labelled as advertising and are kept apart from stories, and an advertiser cannot choose, change or remove a story or a
          guide. We do not take payment to publish or promote a story, and Plax shows no sponsored stories.
        </P>
      </Section>

      <Section title="Publishers and rights holders" id="publishers">
        <P>
          If you publish a feed or pictures that Plax shows and want them changed or taken out, write to us from an address at your
          publication&apos;s own domain and name the feed or the story, and we will deal with the request promptly.
        </P>
      </Section>

      <Section title="The Learn guides" id="learn">
        <P>
          The guides in <Link href="/learn" className={link}>Learn</Link> are Plax&apos;s own explanations of the subjects behind the
          news. They are written and published by {LEGAL.operator}, who are responsible for them, with the help of AI writing tools.
          They are meant to be accurate, plain and useful to a general reader; each shows when it was last updated; numbers and dates in
          them are ones that can be checked in a standard reference; and we change a guide when a fact changes or a reader points out a
          mistake.
        </P>
        <List>
          <li>
            The guides explain how things work. They are not financial, medical or legal advice, and the ones that touch money or
            health say so.
          </li>
          <li>
            They are written for a general reader and cannot replace the advice of a qualified person about your own situation.
          </li>
          <li>
            If you are an expert and see something wrong or out of date, we would like to hear it.
          </li>
        </List>
      </Section>
    </LegalPage>
  )
}
