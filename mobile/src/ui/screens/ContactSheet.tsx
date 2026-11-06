import { View } from 'react-native'
import { site } from '../../build'
import { useT } from '../i18n-context'
import { PrimaryButton, SecondaryButton, Txt } from '../primitives'
import { useTheme } from '../theme'
import { Paragraph, SheetFrame } from './parts'

/**
 * How to reach the people who make Plax (Contact.java of the native app). Google Play's news policy wants contact details that are easy
 * to find in the app and on the website, so the address and the website's contact page are written down once, here. They are the ones the
 * website publishes (LEGAL in src/lib/legal.ts); contact-sheet.test.tsx checks that.
 */
export const Contact = {
  OPERATOR: 'Plax Labs',
  EMAIL: 'richardhenryjames64@gmail.com',
  /** The contact page on the website: it shows the same address, and it is the contact URL given to Google Play. */
  pageUrl: (): string => `${site()}/contact`,
  /** Where a mail app opens a new message to. The subject goes in on its own, which mail apps read more reliably. */
  mailto: (): string => `mailto:${Contact.EMAIL}`,
  /** Names the app and its version, so that a reply knows what the message is about. */
  subject: (appName: string, versionName: string): string => `${appName} ${versionName} feedback`,
} as const

export interface ContactSheetProps {
  visible: boolean
  /** "Email us": the host opens a new message to Contact.EMAIL in the reader's mail app (and copies the address when there is none). */
  onEmail: () => void
  /** "Copy address": the host puts Contact.EMAIL on the clipboard and says so. */
  onCopy: () => void
  /** "Open the contact page": the host opens Contact.pageUrl() in the browser. */
  onPage: () => void
  onClose: () => void
}

/**
 * Contact us (ContactSheet of the native app): the address to write to, who makes Plax and its contact page, one tap from the menu, with
 * no account needed. The address and the page are shown in words as well as behind the buttons: they can be read, selected and copied.
 */
export function ContactSheet({ visible, onEmail, onCopy, onPage, onClose }: ContactSheetProps) {
  const { t } = useT()
  const { palette } = useTheme()
  return (
    <SheetFrame visible={visible} onClose={onClose} icon="mail" title={t('contact_us')} testID="contact-sheet">
      <View style={{ paddingTop: 8 }}>
        <Paragraph size={15}>{t('contact_intro')}</Paragraph>
        <View testID="contact-card" style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: palette.surfaceAlt }}>
          <Txt font="sansMedium" size={12} color="text2">
            {t('contact_email_label')}
          </Txt>
          <Txt font="sansMedium" size={18} color="accentText" selectable style={{ paddingTop: 4, paddingBottom: 2 }}>
            {Contact.EMAIL}
          </Txt>
          <Txt size={13} color="text2">
            {Contact.OPERATOR}
          </Txt>
        </View>
        <View style={{ marginTop: 16 }}>
          <PrimaryButton label={t('contact_send')} onPress={onEmail} testID="contact-email" />
        </View>
        <View style={{ marginTop: 10 }}>
          <SecondaryButton label={t('contact_copy')} onPress={onCopy} testID="contact-copy" />
        </View>
        <View style={{ marginTop: 10 }}>
          <SecondaryButton label={t('contact_page')} onPress={onPage} testID="contact-page" />
        </View>
        <Paragraph size={13} color="text2" selectable style={{ paddingTop: 14 }}>
          {t('contact_page_line', Contact.pageUrl())}
        </Paragraph>
        <Paragraph size={13} color="text2" style={{ paddingTop: 10 }}>
          {t('contact_about', Contact.OPERATOR)}
        </Paragraph>
      </View>
    </SheetFrame>
  )
}
