import { ActivityIndicator, View } from 'react-native'
import type { StringKey } from '../../i18n'
import { useT } from '../i18n-context'
import { DangerButton, PrimaryButton, SecondaryButton, Txt } from '../primitives'
import { useTheme } from '../theme'
import { Paragraph, SheetFrame } from './parts'

/** Where the account is: not signed in, waiting for the browser's answer after Google sign-in, or signed in (AccountManager.Phase). */
export type AccountPhase = 'signed_out' | 'waiting' | 'signed_in'

/**
 * What the account sheet needs of the account (AccountManager.Status of the native app). The host makes it from its account manager.
 * The account is optional: Plax works fully without it.
 */
export interface AccountView {
  readonly phase: AccountPhase
  /** The name Google gave, or ''. */
  readonly name: string
  readonly email: string
  /**
   * What the account has to say: account_unavailable, account_failed, account_denied, account_storage, account_expired, account_sync_failed,
   * account_signed_in, account_signed_out, account_deleting, account_deleted or account_delete_failed; null for nothing.
   */
  readonly message: StringKey | null
  /** Something is being done (the sign-in is being finished, the topics and saved stories are syncing, the account is being deleted). */
  readonly busy: boolean
}

export interface AccountSheetProps {
  visible: boolean
  account: AccountView
  /** "Continue with Google": the host checks the account service first, then opens the browser. */
  onSignIn: () => void
  /** "Cancel sign-in", while waiting (not offered while the answer is being finished). */
  onCancelSignIn: () => void
  onSignOut: () => void
  /** "Your topics": the sheet asks to be closed (`onClose`) and this follows; the host opens the choice of topics. */
  onInterests: () => void
  /** "Manage account on the website". */
  onWebsite: () => void
  /** "Delete account": the host asks first (DeleteAccountDialog), then deletes; the sheet shows the progress and the result. */
  onDeleteAccount: () => void
  onPrivacy: () => void
  onClose: () => void
}

/** A spinner and what is being waited for, announced to a screen reader as it appears. */
function Progress({ label }: { label: string }) {
  const { palette } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ width: 24, height: 24 }}>
        <ActivityIndicator size={24} color={palette.accentText} />
      </View>
      <Txt font="sansMedium" size={15} accessibilityLiveRegion="polite" style={{ flex: 1, paddingLeft: 12 }}>
        {label}
      </Txt>
    </View>
  )
}

/** The note under the account's content: what happened, in a card of its own. */
function Note({ message }: { message: StringKey }) {
  const { t } = useT()
  const { palette } = useTheme()
  return (
    <View testID="account-note" style={{ marginTop: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: palette.surfaceAlt }}>
      <Paragraph size={13} multiplier={1.25} accessibilityLiveRegion="polite">
        {t(message)}
      </Paragraph>
    </View>
  )
}

const below = (gap: number) => ({ marginTop: gap })

/**
 * The optional account (AccountSheet of the native app): what signing in does and how to do it when signed out; the wait for the browser
 * with a way to cancel it; and, when signed in, who, the sync, and the ways to leave (sign out, or delete the account). While the account
 * is being deleted nothing else is offered, since nothing there could be pressed to any effect.
 */
export function AccountSheet({ visible, account, onSignIn, onCancelSignIn, onSignOut, onInterests, onWebsite, onDeleteAccount, onPrivacy, onClose }: AccountSheetProps) {
  const { t } = useT()
  const deleting = account.phase === 'signed_in' && account.message === 'account_deleting'
  const note = account.message !== null && account.message !== 'account_signed_out' ? account.message : null
  return (
    <SheetFrame visible={visible} onClose={onClose} icon="person" title={t('account_title')} testID="account-sheet">
      <View style={{ paddingTop: 8 }}>
        {deleting ? (
          <Progress label={t('account_deleting')} />
        ) : (
          <>
            {account.phase === 'signed_in' ? (
              <>
                <Txt font="sansMedium" size={16} accessibilityLiveRegion="polite">
                  {t('signed_in_as', account.name === '' ? account.email : account.name)}
                </Txt>
                <Paragraph size={14} color="text2" style={{ paddingTop: 6 }}>
                  {account.busy ? t('syncing') : t('signed_in_detail')}
                </Paragraph>
                <View style={below(20)}>
                  <SecondaryButton
                    label={t('interests_title')}
                    onPress={() => {
                      onClose()
                      onInterests()
                    }}
                    testID="account-interests"
                  />
                </View>
                <View style={below(10)}>
                  <SecondaryButton label={t('account_manage')} onPress={onWebsite} testID="account-website" />
                </View>
                <View style={below(10)}>
                  <SecondaryButton label={t('sign_out')} onPress={onSignOut} testID="account-sign-out" />
                </View>
                <View style={below(10)}>
                  <DangerButton label={t('account_delete')} onPress={onDeleteAccount} testID="account-delete" />
                </View>
              </>
            ) : account.phase === 'waiting' ? (
              <>
                <Progress label={t('signing_in')} />
                {account.busy ? null : (
                  <View style={below(20)}>
                    <SecondaryButton label={t('sign_in_cancel')} onPress={onCancelSignIn} testID="account-cancel" />
                  </View>
                )}
              </>
            ) : (
              <>
                <Paragraph size={15}>{t('account_intro')}</Paragraph>
                <Paragraph size={13} color="text2" style={{ paddingTop: 12 }}>
                  {t('account_upload_note')}
                </Paragraph>
                <View style={below(20)}>
                  <PrimaryButton label={t('sign_in_google')} onPress={onSignIn} testID="account-sign-in" />
                </View>
                <View style={below(10)}>
                  <SecondaryButton label={t('privacy_policy')} onPress={onPrivacy} testID="account-privacy" />
                </View>
              </>
            )}
            {note === null ? null : <Note message={note} />}
          </>
        )}
      </View>
    </SheetFrame>
  )
}
