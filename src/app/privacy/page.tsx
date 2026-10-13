import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, P, List } from '@/components/LegalPage'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What Plax keeps on your device, what its servers receive, what an optional Plax account stores, and how to delete it. No ads and no analytics.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  const mail = <a href={`mailto:${LEGAL.contactEmail}`} className="text-[color:var(--signal-text)] underline">{LEGAL.contactEmail}</a>
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL.updated}>
      <P>
        This policy covers the Plax app for Android and the Plax website at plaxlabs.com/news, both made by {LEGAL.operator}. Plax
        shows short summaries of news stories from publishers, in English and Hindi, with a link to the full story. Questions about
        this policy, the app or your data: {mail}.
      </P>

      <Section title="The short version">
        <List>
          <li>Plax works without an account. You can read, choose topics and save stories without giving us anything.</li>
          <li>There are no ads, no advertising ID, and no analytics or tracking tools in the app or on the website.</li>
          <li>
            Your topics, saved stories and reading history stay on your device unless you choose to sign in with Google. Then a small
            account keeps your topics and saved stories so they follow you to another device.
          </li>
          <li>
            You can delete the account, and everything stored in it, at any time: in the app, on <Link href="/delete-account" className="text-[color:var(--signal-text)] underline">this page</Link>, or by email.
          </li>
          <li>We do not sell personal data.</li>
        </List>
      </Section>

      <Section title="Using Plax without an account">
        <P>
          <strong>Kept on your device.</strong> The topics you pick, the stories you save, the list of stories you have already seen
          (so they do not come back), your language and your theme. On Android this is in the app&apos;s private storage and is left out of
          Android backups. On the website it is in your browser&apos;s local storage. Clearing the app&apos;s data or your browser&apos;s
          data removes it.
        </P>
        <P>
          <strong>Sent to Plax when you read.</strong> To load stories, the app and website ask Plax&apos;s servers for a page of
          stories, sending the topics and language you chose and the ids of stories you have already seen, so they are not sent
          again. None of this includes your name, email or any identifier of you or your device. Like any web service, our hosting
          provider (Vercel) handles ordinary connection details such as your IP address, browser or app type and the time, to deliver
          the service and keep it secure. We do not use them to build a profile of you.
        </P>
        <P>
          <strong>AI briefs, translations and quizzes.</strong> When you open an AI brief, ask Plax to go deeper, take a quiz or read
          a story in Hindi on the website, the text of that story (its headline and summary) is sent to Plax&apos;s servers and from
          there to the AI and translation services that write the result. Depending on availability these can be Google (Gemini),
          Groq, OpenRouter, Microsoft (Azure Translator) and MyMemory. The request does not carry your name, email or account. The
          result may be kept and shown to other readers of the same story, so that it is only written once. AI text can contain
          mistakes, which is why the app labels it.
        </P>
        <P>
          <strong>Sharing a story.</strong> Share and Copy link send the story&apos;s public details (headline, summary, source and
          picture address) to Plax to make a public page for it, so the people you send the link to can open it. The page does not say
          who shared it.
        </P>
        <P>
          <strong>Publishers&apos; pictures and links.</strong> Pictures load straight from the publishers&apos; servers, which can see
          your IP address when they do. Links to full stories open in your browser and are covered by each publisher&apos;s own policy.
          The stories belong to their publishers.
        </P>
        <P>
          The Android version downloaded from plaxlabs.com (not Google Play) also asks plaxlabs.com once a day whether a newer version
          exists. Nothing about you is sent. Versions from Google Play are updated by Google Play.
        </P>
      </Section>

      <Section title="If you sign in with Google (optional)">
        <P>
          Signing in happens on Google&apos;s own page, so Plax never sees your Google password. Plax&apos;s account provider, Supabase,
          receives your email address, name, profile picture address and a Google account identifier from Google, and Plax stores
          these with the account.
        </P>
        <P>
          <strong>What the account stores:</strong>
        </P>
        <List>
          <li>your email address, name and profile picture address, and a random account id;</li>
          <li>the topics you chose and the stories you saved (headline, short text and category);</li>
          <li>
            on the website only: which stories you read (their category, how long you spent, and whether you saved, shared or finished
            them), how many you have read and your reading streak, used to order your For you feed. The Android app sends only
            your topics and saved stories.
          </li>
        </List>
        <P>
          <strong>Why:</strong> to show your topics and saved stories on every device you sign in on, and to keep the account secure.
          They are not used for advertising and not shared with anyone except the providers that run the service: Supabase (accounts
          and database), Vercel (hosting) and Google (sign-in).
        </P>
        <P>
          <strong>How it is protected:</strong> everything travels over HTTPS. The database only lets a signed-in person read or change
          their own rows. On Android the sign-in session is sealed with the Android Keystore and left out of backups. On the website,
          signing in sets a cookie that keeps you signed in; there are no advertising or tracking cookies.
        </P>
      </Section>

      <Section title="Deleting your account">
        <P>You can delete your Plax account in any of these ways. The first two are immediate and need nothing from us.</P>
        <List>
          <li>In the Android app: menu, then Account, then Delete account.</li>
          <li>On the website: <Link href="/delete-account" className="text-[color:var(--signal-text)] underline">Delete your account</Link>. Sign in with Google and confirm. You do not need the app.</li>
          <li>
            By email to {mail}, from the address of the account, with &ldquo;Delete my Plax account&rdquo; as the subject. We delete it
            within {LEGAL.emailDeletionDays} days, usually much sooner.
          </li>
        </List>
        <P>
          Deleting removes the account and everything stored in it: email, name, picture address, topics, saved stories, reading activity and
          sign-in sessions. It cannot be undone. Copies in the database provider&apos;s routine backups, if any, expire on its normal
          schedule. Topics and saved stories already on your device stay there until you remove them or clear the app&apos;s data. Story
          pages that were shared stay available so that links keep working; they contain no personal information.
        </P>
      </Section>

      <Section title="How long we keep things">
        <List>
          <li>Account data: until you delete the account.</li>
          <li>Data on your device: until you clear it.</li>
          <li>Hosting connection details: for the short period our hosting provider keeps them under its own policy.</li>
          <li>AI results and shared story pages: kept so that other readers get the same result or link. They contain no personal data.</li>
        </List>
      </Section>

      <Section title="Children">
        <P>
          Plax is meant for people aged 13 and over and is not directed at children under 13. We do not knowingly collect personal
          information from children under 13. If you think a child has made an account, write to {mail} and we will delete it.
        </P>
      </Section>

      <Section title="Your choices and rights">
        <P>
          You can use Plax without an account, sign out at any time, and delete the account as described above. Depending on where you
          live, for example under India&apos;s Digital Personal Data Protection Act or the EU&apos;s GDPR, you may also have the right to
          ask what we hold about you, to have it corrected, or to withdraw consent. Write to {mail} and we will answer.
        </P>
      </Section>

      <Section title="Changes to this policy">
        <P>
          If we change this policy we will update the date at the top. If a change affects what we collect, we will say so in the app or
          on the website.
        </P>
      </Section>

      <Section title="Contact" id="contact">
        <P>
          {LEGAL.operator}, {mail}.
        </P>
      </Section>
    </LegalPage>
  )
}
