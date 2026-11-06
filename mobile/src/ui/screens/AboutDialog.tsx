import { Dialog } from '../overlays'
import { useT } from '../i18n-context'
import { Contact } from './ContactSheet'
import { DialogScroll, Paragraph } from './parts'

export interface AboutDialogProps {
  visible: boolean
  /** The version as the reader sees it: 2.0.0, and 2.0.0-preview for the website's build (versionLabel() of src/build.ts). */
  versionName: string
  /** The build shows ads (a banner or a full page): the text then tells of them and of the choices the reader has. */
  withAds: boolean
  /** The Google Play build is updated by Google Play and never looks for an APK, so it does not describe the update check. */
  storeBuild: boolean
  /** "Privacy policy": the host opens the policy in the browser. */
  onPrivacy: () => void
  /** "Done", the back button and a tap outside. */
  onDone: () => void
}

/**
 * About Plax (MainActivity.about): what Plax is and what it does with the reader's data, who to write to (the address stands on a line of
 * its own, so that it is never split in two), the version, and, for the website's build, how updates work. Two buttons: Privacy policy
 * and Done. The text scrolls inside the dialog, so that the buttons stay in reach.
 */
export function AboutDialog({ visible, versionName, withAds, storeBuild, onPrivacy, onDone }: AboutDialogProps) {
  const { t } = useT()
  let text = t(withAds ? 'about_text_ads' : 'about_text', versionName, Contact.EMAIL)
  if (!storeBuild) text += `\n\n${t('about_updates')}`
  // Both builds read the website's settings (topics, sections, notices) and ask the update service for newer JavaScript, and say so.
  text += `\n\n${t('about_settings')}\n\n${t('about_code')}`
  return (
    <Dialog
      visible={visible}
      title={t('about')}
      onClose={onDone}
      actions={[
        { label: t('privacy_policy'), onPress: onPrivacy },
        { label: t('done'), onPress: onDone },
      ]}
      testID="about-dialog"
    >
      <DialogScroll testID="about-scroll">
        <Paragraph size={15} multiplier={1.25} color="text2" testID="about-text">
          {text}
        </Paragraph>
      </DialogScroll>
    </Dialog>
  )
}
