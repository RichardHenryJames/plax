import { fireEvent, screen, within } from '@testing-library/react-native'
import { ScrollView, StyleSheet } from 'react-native'
import { translate, type StringKey } from '../../../i18n'
import { en } from '../../../i18n/en'
import { hi } from '../../../i18n/hi'
import { DARK_PALETTE, LIGHT_PALETTE } from '../../theme'
import { AccountSheet, type AccountSheetProps, type AccountView } from '../AccountSheet'
import { LONG_HINDI, backButton, fixedHeightOffenders, limitedLines, show, styleOf } from './helpers'

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>

let calls: string[] = []

const SIGNED_OUT: AccountView = { phase: 'signed_out', name: '', email: '', message: null, busy: false }
const WAITING: AccountView = { phase: 'waiting', name: '', email: '', message: null, busy: false }
const SIGNED_IN: AccountView = { phase: 'signed_in', name: 'Asha Rao', email: 'asha@example.com', message: null, busy: false }

function account(view: AccountView, overrides: Partial<AccountSheetProps> = {}) {
  const log = (name: string) => () => {
    calls.push(name)
  }
  return (
    <AccountSheet
      visible
      account={view}
      onSignIn={log('signIn')}
      onCancelSignIn={log('cancel')}
      onSignOut={log('signOut')}
      onInterests={log('interests')}
      onWebsite={log('website')}
      onDeleteAccount={log('delete')}
      onPrivacy={log('privacy')}
      onClose={log('close')}
      {...overrides}
    />
  )
}

beforeEach(() => {
  calls = []
})

describe('the account sheet when signed out', () => {
  it('says what signing in does and that Plax works without it', () => {
    show(account(SIGNED_OUT))
    expect(screen.getByRole('header', { name: en.account_title })).toBeTruthy()
    expect(screen.getByText(en.account_intro)).toBeTruthy()
    expect(screen.getByText(en.account_upload_note)).toBeTruthy()
    expect(screen.getByLabelText(en.sign_in_google)).toBeTruthy()
    expect(screen.getByLabelText(en.privacy_policy)).toBeTruthy()
    expect(en.account_intro).toContain('Plax works without an account')
  })

  it('has nothing to delete, sign out of or sync', () => {
    show(account(SIGNED_OUT))
    for (const label of [en.account_delete, en.sign_out, en.account_manage, en.interests_title, en.sign_in_cancel, en.syncing]) expect(screen.queryByText(label)).toBeNull()
    expect(screen.queryByTestId('account-note')).toBeNull()
  })

  it('signs in with Google, and has the privacy policy one tap away', () => {
    show(account(SIGNED_OUT))
    fireEvent.press(screen.getByLabelText(en.sign_in_google))
    fireEvent.press(screen.getByLabelText(en.privacy_policy))
    expect(calls).toEqual(['signIn', 'privacy'])
  })

  it('tells why sign-in did not work, and still offers it again', () => {
    for (const message of ['account_unavailable', 'account_failed', 'account_denied', 'account_storage', 'account_expired'] as StringKey[]) {
      const { unmount } = show(account({ ...SIGNED_OUT, message }))
      expect(within(screen.getByTestId('account-note')).getByText(en[message])).toBeTruthy()
      expect(screen.getByLabelText(en.sign_in_google)).toBeTruthy()
      unmount()
    }
    const { unmount } = show(account({ ...SIGNED_OUT, message: 'account_unavailable' }))
    expect(screen.getByText('Sign-in is temporarily unavailable. Plax keeps working without it; try again later.')).toBeTruthy()
    unmount()
  })

  it('says nothing about having signed out: the reader has just done it', () => {
    show(account({ ...SIGNED_OUT, message: 'account_signed_out' }))
    expect(screen.queryByTestId('account-note')).toBeNull()
  })

  it('says that the account was deleted, and that the topics and saved stories stay', () => {
    show(account({ ...SIGNED_OUT, message: 'account_deleted' }))
    expect(screen.getByText('Your account was deleted. Your topics and saved stories stay on this phone.')).toBeTruthy()
    expect(screen.getByLabelText(en.sign_in_google)).toBeTruthy()
  })
})

describe('the account sheet while it waits for the browser', () => {
  it('shows a spinner and "Waiting for Google sign-in…", with a way to cancel', () => {
    show(account(WAITING))
    expect(screen.getByRole('progressbar', { name: en.signing_in })).toBeBusy()
    expect(screen.getByText(en.signing_in).props.accessibilityLiveRegion).toBe('polite')
    expect(screen.queryByLabelText(en.sign_in_google)).toBeNull()
    fireEvent.press(screen.getByLabelText(en.sign_in_cancel))
    expect(calls).toEqual(['cancel'])
  })

  it('offers no cancel while the answer is being finished', () => {
    show(account({ ...WAITING, busy: true }))
    expect(screen.getByText(en.signing_in)).toBeTruthy()
    expect(screen.queryByLabelText(en.sign_in_cancel)).toBeNull()
  })
})

describe('the account sheet when signed in', () => {
  it('says who, and that the topics and saved stories sync', () => {
    show(account(SIGNED_IN))
    expect(screen.getByText('Signed in as Asha Rao')).toBeTruthy()
    expect(screen.getByText('Signed in as Asha Rao').props.accessibilityLiveRegion).toBe('polite')
    expect(screen.getByText(en.signed_in_detail)).toBeTruthy()
    expect(screen.queryByText(en.account_intro)).toBeNull()
    expect(screen.queryByLabelText(en.sign_in_google)).toBeNull()
  })

  it('names the account by its email when Google gave no name', () => {
    show(account({ ...SIGNED_IN, name: '' }))
    expect(screen.getByText('Signed in as asha@example.com')).toBeTruthy()
  })

  it('says "Syncing…" while it syncs', () => {
    show(account({ ...SIGNED_IN, busy: true }))
    expect(screen.getByText(en.syncing)).toBeTruthy()
    expect(screen.queryByText(en.signed_in_detail)).toBeNull()
  })

  it('has the four ways on: your topics, the website, sign out and delete', () => {
    show(account(SIGNED_IN))
    fireEvent.press(screen.getByLabelText(en.account_manage))
    fireEvent.press(screen.getByLabelText(en.sign_out))
    fireEvent.press(screen.getByLabelText(en.account_delete))
    expect(calls).toEqual(['website', 'signOut', 'delete'])
  })

  it('closes the sheet before it opens the choice of topics', () => {
    show(account(SIGNED_IN))
    fireEvent.press(screen.getByLabelText(en.interests_title))
    expect(calls).toEqual(['close', 'interests'])
  })

  it('draws the deletion as a warning: an outline in the danger colour, never the accent', () => {
    show(account(SIGNED_IN))
    expect(flat(screen.getByTestId('account-delete').props.style)).toMatchObject({ borderColor: LIGHT_PALETTE.danger, backgroundColor: 'transparent', borderWidth: 1 })
    expect(flat(screen.getByTestId('account-sign-out').props.style)).toMatchObject({ backgroundColor: LIGHT_PALETTE.accentSoft })
  })

  it('tells that the sync did not work, and that the changes are kept', () => {
    show(account({ ...SIGNED_IN, message: 'account_sync_failed' }))
    expect(screen.getByText('Could not sync right now. Your changes are kept and will be sent later.')).toBeTruthy()
    expect(screen.getByLabelText(en.account_delete)).toBeTruthy()
  })

  it('tells that the account could not be deleted, and that nothing changed, and offers to try again', () => {
    show(account({ ...SIGNED_IN, message: 'account_delete_failed' }))
    expect(screen.getByText(/Could not delete your account right now/)).toBeTruthy()
    expect(screen.getByLabelText(en.account_delete)).toBeTruthy()
  })

  it('tells that the reader has just signed in', () => {
    show(account({ ...SIGNED_IN, message: 'account_signed_in' }))
    expect(within(screen.getByTestId('account-note')).getByText(en.account_signed_in)).toBeTruthy()
  })
})

describe('the account sheet while the account is deleted', () => {
  const deleting: AccountView = { ...SIGNED_IN, message: 'account_deleting', busy: true }

  it('shows the progress and nothing else, since nothing there could be pressed to any effect', () => {
    show(account(deleting))
    expect(screen.getByRole('progressbar', { name: en.account_deleting })).toBeBusy()
    expect(screen.getByText(en.account_deleting)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.sign_out })).toBeNull()
    for (const label of [en.account_delete, en.sign_out, en.account_manage, en.interests_title, 'Signed in as Asha Rao']) expect(screen.queryByText(label)).toBeNull()
    expect(screen.queryByTestId('account-note')).toBeNull()
  })
})

describe('the account sheet as a sheet', () => {
  it('closes from its cross and from a tap outside', () => {
    show(account(SIGNED_OUT))
    fireEvent.press(screen.getByTestId('sheet-close'))
    fireEvent.press(screen.getByTestId('scrim'))
    expect(calls).toEqual(['close', 'close'])
  })

  it('closes from the back button', () => {
    const back = backButton()
    show(account(SIGNED_IN))
    expect(back.press()).toBe(true)
    expect(calls).toEqual(['close'])
    back.restore()
  })

  it('does not draw when it is not visible', () => {
    show(account(SIGNED_IN, { visible: false }))
    expect(screen.queryByTestId('account-sheet')).toBeNull()
    expect(screen.queryByText(en.account_title)).toBeNull()
  })

  it('keeps its title bar still and scrolls what is under it', () => {
    show(account(SIGNED_IN))
    const inside = within(screen.UNSAFE_getByType(ScrollView))
    expect(inside.getByText('Signed in as Asha Rao')).toBeTruthy()
    expect(inside.queryByText(en.account_title)).toBeNull()
    expect(inside.queryByTestId('sheet-close')).toBeNull()
  })

  it('keeps clear of a navigation bar at the side of the screen', () => {
    show(account(SIGNED_IN), { insets: { left: 7, right: 9 } })
    expect(styleOf('account-sheet-frame')).toMatchObject({ paddingLeft: 27, paddingRight: 29, paddingBottom: 24 })
  })
})

describe('the account sheet in Hindi and in the dark', () => {
  it('has every text in Hindi, signed out', () => {
    show(account({ ...SIGNED_OUT, message: 'account_unavailable' }), { lang: 'hi' })
    expect(screen.getByRole('header', { name: hi.account_title })).toBeTruthy()
    expect(screen.getByText(hi.account_intro)).toBeTruthy()
    expect(screen.getByText(hi.account_upload_note)).toBeTruthy()
    expect(screen.getByLabelText(hi.sign_in_google)).toBeTruthy()
    expect(screen.getByLabelText(hi.privacy_policy)).toBeTruthy()
    expect(screen.getByText(hi.account_unavailable)).toBeTruthy()
  })

  it('has every text in Hindi, waiting and signed in', () => {
    const { unmount } = show(account(WAITING), { lang: 'hi' })
    expect(screen.getByText(hi.signing_in)).toBeTruthy()
    expect(screen.getByLabelText(hi.sign_in_cancel)).toBeTruthy()
    unmount()
    show(account({ ...SIGNED_IN, message: 'account_sync_failed' }), { lang: 'hi' })
    expect(screen.getByText(translate('hi', 'signed_in_as', 'Asha Rao'))).toBeTruthy()
    for (const label of [hi.interests_title, hi.account_manage, hi.sign_out, hi.account_delete]) expect(screen.getByLabelText(label)).toBeTruthy()
    expect(screen.getByText(hi.account_sync_failed)).toBeTruthy()
  })

  it('has no text in a box of a fixed height, whatever the language and the size of the text', () => {
    show(account({ ...SIGNED_IN, message: 'account_delete_failed' }), { lang: 'hi' })
    expect(fixedHeightOffenders()).toEqual([])
  })

  it('shows a long Hindi name whole', () => {
    show(account({ ...SIGNED_IN, name: LONG_HINDI }), { lang: 'hi' })
    expect(screen.getByText(translate('hi', 'signed_in_as', LONG_HINDI))).toBeTruthy()
    expect(limitedLines()).toEqual([])
    expect(fixedHeightOffenders()).toEqual([])
  })

  it('draws in the dark colours', () => {
    show(account({ ...SIGNED_IN, message: 'account_sync_failed' }), { mode: 'dark' })
    expect(styleOf('account-note')).toMatchObject({ backgroundColor: DARK_PALETTE.surfaceAlt })
    expect(flat(screen.getByTestId('account-delete').props.style)).toMatchObject({ borderColor: DARK_PALETTE.danger })
  })
})
