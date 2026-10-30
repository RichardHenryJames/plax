import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, P, List } from '@/components/LegalPage'
import { CONTACT_MAILTO, LEGAL } from '@/lib/legal'
import { SITE, SITE_URL } from '@/lib/seo'
import { SITE_DISPLAY } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact us',
  description:
    'How to contact Plax Labs, the maker of Plax: questions, corrections, publisher requests, privacy and account deletion. Write to us by email.',
  alternates: { canonical: LEGAL.contactPath },
}

const link = 'text-[color:var(--signal-text)] underline'

// What Google and other search engines read as the page's purpose. The address is the one shown on the page.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  '@id': `${SITE_URL}${LEGAL.contactPath}#page`,
  url: `${SITE_URL}${LEGAL.contactPath}`,
  name: 'Contact Plax',
  inLanguage: 'en',
  mainEntity: {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE.name,
    alternateName: LEGAL.operator,
    url: SITE_URL,
    email: LEGAL.contactEmail,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: LEGAL.contactEmail,
        availableLanguage: ['English', 'Hindi'],
      },
    ],
  },
}

export default function ContactPage() {
  return (
    <LegalPage title="Contact us" updated={LEGAL.contactUpdated}>
      {/* "<" is escaped so nothing in the data can close the script element. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <P>
        Plax is made by {LEGAL.operator}. Write to us about the Plax app for Android or the Plax website at {SITE_DISPLAY}, in
        English or Hindi, and we will answer by email.
      </P>

      <Section title="Email us" id="email">
        <div className="rounded-2xl border border-dark-border bg-dark-card px-5 py-4">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-dark-subtle mb-1.5">Email</p>
          <p className="text-[20px] sm:text-[24px] font-semibold break-all">
            <a href={CONTACT_MAILTO} className={link}>{LEGAL.contactEmail}</a>
          </p>
          <p className="mt-2 text-sm text-dark-muted">{LEGAL.operator}</p>
        </div>
        <P>
          Say what it is about in the subject line, for example &ldquo;Correction&rdquo; or &ldquo;Delete my Plax account&rdquo;.
          Please do not send passwords or sign-in links.
        </P>
      </Section>

      <Section title="What to write to us about">
        <List>
          <li>
            <strong>A problem with the app or the website.</strong> Tell us what you were doing and what happened. For the app,
            add your phone model and Android version.
          </li>
          <li>
            <strong>A correction.</strong> Each story is a short summary of what its publisher published, with a link to the
            original. If a summary is wrong, or a story shows the wrong source or picture, tell us which story. A mistake in the
            publisher&apos;s own article has to be raised with the publisher.
          </li>
          <li>
            <strong>Publishers and rights holders.</strong> If you publish a feed or pictures that Plax shows and want them changed
            or taken out, write from an address at your publication&apos;s own domain and name the feed or the story.
          </li>
          <li>
            <strong>Privacy and your data.</strong> Questions about the <Link href="/privacy" className={link}>privacy policy</Link>,
            or a request to see, correct or delete what we hold about you. To delete your account at once, use{' '}
            <Link href="/delete-account" className={link}>Delete your account</Link>, or Menu, then Account, then Delete account in
            the app.
          </li>
          <li>
            <strong>Ideas and feedback.</strong> What you would like Plax to do, or to do better.
          </li>
        </List>
      </Section>

      <Section title="Replies">
        <P>
          We reply by email, to the address you write from. A request to delete an account that arrives by email is done within{' '}
          {LEGAL.emailDeletionDays} days, usually much sooner.
        </P>
      </Section>

      <Section title="About Plax and where its stories come from">
        <P>
          Plax is a news reader by {LEGAL.operator} for the Android app and the website. It shows short summaries of stories from
          publishers such as The Hindu, NDTV, BBC and Al Jazeera, in English and Hindi. Every story names its publisher and links to
          the original. The stories, headlines and pictures belong to their publishers, and Plax is not affiliated with them. An AI
          brief is written by AI on request, is labelled as AI and can contain mistakes.
        </P>
      </Section>

      <Section title="In the Android app">
        <P>Open the menu (the three dots), then Contact us. It shows this address and opens your email app.</P>
      </Section>
    </LegalPage>
  )
}
