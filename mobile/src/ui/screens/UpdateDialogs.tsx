import { useT } from '../i18n-context'
import { Dialog } from '../overlays'

export interface UpdateOfferDialogProps {
  visible: boolean
  /** The version on offer: "9.9.9". */
  versionName: string
  /** "Later", the back button and a tap outside: the offer is put off (UpdateManager.dismiss), whichever way it was closed. */
  onLater: () => void
  /** "Download": the host opens the file in the browser and puts the offer off. */
  onDownload: () => void
}

/** A newer APK on the website, offered to the website's build (MainActivity.offerUpdate): Later or Download. */
export function UpdateOfferDialog({ visible, versionName, onLater, onDownload }: UpdateOfferDialogProps) {
  const { t } = useT()
  return (
    <Dialog
      visible={visible}
      title={t('update_title')}
      message={t('update_message', versionName)}
      onClose={onLater}
      actions={[
        { label: t('update_later'), onPress: onLater },
        { label: t('update_download'), onPress: onDownload },
      ]}
      testID="update-dialog"
    />
  )
}

export interface StoreUpdateDialogProps {
  visible: boolean
  /** The version that is on Google Play: "9.9.9". */
  versionName: string
  /** This version is older than the least the website still supports: the words say it may stop working properly. */
  required: boolean
  /** "Later", the back button and a tap outside: the reader has not answered. */
  onLater: () => void
  /** "Update": the host opens Google Play. */
  onUpdate: () => void
}

/** The word, for the Google Play build, that a newer version is on Google Play (MainActivity.showPrompt): Later or Update. */
export function StoreUpdateDialog({ visible, versionName, required, onLater, onUpdate }: StoreUpdateDialogProps) {
  const { t } = useT()
  return (
    <Dialog
      visible={visible}
      title={t('update_title')}
      message={t(required ? 'update_play_required' : 'update_play_message', versionName)}
      onClose={onLater}
      actions={[
        { label: t('update_later'), onPress: onLater },
        { label: t('update_play_button'), onPress: onUpdate },
      ]}
      testID="store-update-dialog"
    />
  )
}
