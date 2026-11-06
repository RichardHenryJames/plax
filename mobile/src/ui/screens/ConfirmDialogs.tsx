import { useT } from '../i18n-context'
import { Dialog } from '../overlays'
import { DialogScroll, Paragraph } from './parts'

export interface ClearSavedDialogProps {
  visible: boolean
  /** Signed in: the saved stories are removed from the Plax account too, and the words say so. */
  signedIn: boolean
  /** Cancel, the back button and a tap outside: nothing is removed. */
  onCancel: () => void
  /** "Clear": the host removes every saved story. */
  onConfirm: () => void
}

/** Asks before every saved story is removed (MainActivity.confirmClearSaved). */
export function ClearSavedDialog({ visible, signedIn, onCancel, onConfirm }: ClearSavedDialogProps) {
  const { t } = useT()
  return (
    <Dialog
      visible={visible}
      title={t('clear_saved')}
      message={t(signedIn ? 'clear_confirm_account' : 'clear_confirm')}
      onClose={onCancel}
      actions={[
        { label: t('cancel'), onPress: onCancel },
        { label: t('clear'), onPress: onConfirm },
      ]}
      testID="clear-saved-dialog"
    />
  )
}

export interface DeleteAccountDialogProps {
  visible: boolean
  /** Cancel, the back button and a tap outside: nothing is deleted. */
  onCancel: () => void
  /** "Delete permanently": the host deletes the account; the account sheet shows the progress and the result. */
  onConfirm: () => void
}

/** Asks first: a deleted account cannot be brought back (MainActivity.confirmDeleteAccount). The warning scrolls on a short screen. */
export function DeleteAccountDialog({ visible, onCancel, onConfirm }: DeleteAccountDialogProps) {
  const { t } = useT()
  return (
    <Dialog
      visible={visible}
      title={t('account_delete_title')}
      onClose={onCancel}
      actions={[
        { label: t('cancel'), onPress: onCancel },
        { label: t('account_delete_confirm'), onPress: onConfirm },
      ]}
      testID="delete-account-dialog"
    >
      <DialogScroll testID="delete-account-scroll">
        <Paragraph size={15} multiplier={1.25} color="text2" testID="delete-account-message">
          {t('account_delete_message')}
        </Paragraph>
      </DialogScroll>
    </Dialog>
  )
}
