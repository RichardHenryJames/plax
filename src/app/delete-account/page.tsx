import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, P, List } from '@/components/LegalPage'
import { DeleteAccountPanel } from '@/components/DeleteAccountPanel'
import { DELETION_MAILTO, LEGAL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Delete your Plax account',
  description: 'How to delete your Plax account and the data stored in it, from the Android app, from this page or by email.',
  alternates: { canonical: '/delete-account' },
}

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your Plax account">
      <P>
        This page is for the Plax app for Android and the Plax website (plaxlabs.com/news), made by {LEGAL.operator}. You can delete your
        Plax account and the data stored in it without installing the app again.
      </P>

      <Section title="Delete it here">
        <P>Sign in with the Google account you used for Plax, then confirm. The deletion is immediate.</P>
        <DeleteAccountPanel />
      </Section>

      <Section title="Other ways">
        <List>
          <li>
            <strong>In the Android app:</strong> open the menu, then Account, then Delete account, and confirm.
          </li>
          <li>
            <strong>By email:</strong> write to{' '}
            <a href={DELETION_MAILTO} className="text-[color:var(--signal-text)] underline">{LEGAL.contactEmail}</a> from the email address
            of the account, with &ldquo;Delete my Plax account&rdquo; as the subject. We delete the account within{' '}
            {LEGAL.emailDeletionDays} days, usually much sooner, and reply to confirm.
          </li>
        </List>
      </Section>

      <Section title="What is deleted">
        <List>
          <li>The account itself: email address, name, profile picture address and sign-in sessions.</li>
          <li>The topics you chose and the stories you saved to the account.</li>
          <li>Your reading activity on the website: stories read, time spent, reading streak.</li>
        </List>
        <P>
          Deleting is permanent. Copies in the database provider&apos;s routine backups, if any, expire on its normal schedule.
        </P>
      </Section>

      <Section title="What is not deleted">
        <List>
          <li>
            Topics and saved stories already on your phone or in your browser. They never needed an account; remove saved stories in the
            app, or clear the app&apos;s data or your browser&apos;s data.
          </li>
          <li>Story pages that were shared. They stay available so links keep working and contain no personal information.</li>
        </List>
      </Section>

      <Section title="If you never signed in">
        <P>
          Then there is no account and nothing about you to delete on our servers. Plax works without one, and the details of what it
          keeps are in the <Link href="/privacy" className="text-[color:var(--signal-text)] underline">privacy policy</Link>.
        </P>
      </Section>
    </LegalPage>
  )
}
