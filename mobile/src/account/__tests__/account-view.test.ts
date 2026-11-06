import { translate } from '@/i18n'
import { ACCOUNT_MESSAGES, SIGNED_OUT, type AccountMessage, type AccountState } from '../account-state'
import { accountLabel, accountOccupied, isSignedIn, sheetView, toastFor } from '../account-view'

const state = (patch: Partial<AccountState> = {}): AccountState => ({ ...SIGNED_OUT, ...patch })
const signedIn = (patch: Partial<AccountState> = {}) => state({ status: 'signedIn', name: 'Asha Rao', email: 'asha@example.com', ...patch })

describe('who is signed in', () => {
  it('is greeted by name, or by e-mail address when Google gave no name', () => {
    expect(accountLabel(signedIn())).toBe('Asha Rao')
    expect(accountLabel(signedIn({ name: '' }))).toBe('asha@example.com')
    expect(accountLabel(SIGNED_OUT)).toBe('')
  })

  it('is told by the status alone', () => {
    expect(isSignedIn(signedIn())).toBe(true)
    expect(isSignedIn(state({ status: 'signingIn' }))).toBe(false)
    expect(isSignedIn(SIGNED_OUT)).toBe(false)
  })

  it('is busy while waiting for the browser or working, and otherwise not', () => {
    expect(accountOccupied(SIGNED_OUT)).toBe(false)
    expect(accountOccupied(signedIn())).toBe(false)
    expect(accountOccupied(signedIn({ busy: true }))).toBe(true)
    expect(accountOccupied(state({ status: 'signingIn' }))).toBe(true)
    expect(accountOccupied(state({ status: 'signingIn', busy: true }))).toBe(true)
    expect(accountOccupied(state({ message: 'account_failed' }))).toBe(false)
  })
})

describe('what the account sheet shows', () => {
  it('offers to sign in when nobody is signed in', () => {
    expect(sheetView(SIGNED_OUT)).toEqual({ kind: 'signedOut', note: null })
  })

  it('adds a note for a problem or for what happened, but not for "Signed out", which is told once instead', () => {
    for (const message of ACCOUNT_MESSAGES) {
      const shown = sheetView(state({ message }))
      expect({ message, kind: shown.kind, note: 'note' in shown ? shown.note : undefined }).toEqual({
        message,
        kind: 'signedOut',
        note: message === 'account_signed_out' ? null : message,
      })
    }
    expect(sheetView(state({ message: 'account_deleted' }))).toEqual({ kind: 'signedOut', note: 'account_deleted' })
    expect(sheetView(state({ message: 'account_denied' }))).toEqual({ kind: 'signedOut', note: 'account_denied' })
  })

  it('waits for the browser with a way out, and without one once the code is being exchanged', () => {
    expect(sheetView(state({ status: 'signingIn' }))).toEqual({ kind: 'waiting', canCancel: true, note: null })
    expect(sheetView(state({ status: 'signingIn', busy: true }))).toEqual({ kind: 'waiting', canCancel: false, note: null })
  })

  it('greets the signed-in reader and says whether it is syncing', () => {
    expect(sheetView(signedIn())).toEqual({ kind: 'signedIn', label: 'Asha Rao', detail: 'signed_in_detail', note: null })
    expect(sheetView(signedIn({ busy: true }))).toEqual({ kind: 'signedIn', label: 'Asha Rao', detail: 'syncing', note: null })
    expect(sheetView(signedIn({ name: '' }))).toMatchObject({ label: 'asha@example.com' })
  })

  it('adds the note of a failed sync or deletion under the signed-in view', () => {
    expect(sheetView(signedIn({ message: 'account_sync_failed' }))).toEqual({ kind: 'signedIn', label: 'Asha Rao', detail: 'signed_in_detail', note: 'account_sync_failed' })
    expect(sheetView(signedIn({ message: 'account_delete_failed' }))).toMatchObject({ kind: 'signedIn', note: 'account_delete_failed' })
  })

  it('shows nothing but the progress while the account is being deleted', () => {
    expect(sheetView(signedIn({ message: 'account_deleting', busy: true, deleting: true }))).toEqual({ kind: 'deleting' })
    expect(sheetView(signedIn({ message: 'account_deleting' }))).toEqual({ kind: 'deleting' })
  })
})

describe('what the reader is told once', () => {
  it('is "Signed in" when the sign-in finishes', () => {
    expect(toastFor('signingIn', signedIn({ busy: true }))).toBe('account_signed_in')
    expect(toastFor('signingIn', signedIn())).toBe('account_signed_in')
  })

  it('is not told when the app starts with a session, or when nothing changed', () => {
    expect(toastFor(null, signedIn())).toBeNull()
    expect(toastFor(null, SIGNED_OUT)).toBeNull()
    expect(toastFor('signedOut', signedIn())).toBeNull()
    expect(toastFor('signedIn', signedIn({ busy: true }))).toBeNull()
  })

  it('is the outcome of signing out or deleting the account', () => {
    expect(toastFor('signedIn', state({ message: 'account_signed_out' }))).toBe('account_signed_out')
    expect(toastFor('signedIn', state({ message: 'account_deleted' }))).toBe('account_deleted')
    expect(toastFor('signingIn', state({ message: 'account_signed_out' }))).toBe('account_signed_out')
  })

  it('is told once: the same status again says nothing', () => {
    expect(toastFor('signedOut', state({ message: 'account_signed_out' }))).toBeNull()
    expect(toastFor('signedOut', state({ message: 'account_deleted' }))).toBeNull()
  })

  it('is not told for a sign-in that ended with a problem: the sheet shows that', () => {
    for (const message of ['account_expired', 'account_failed', 'account_denied', 'account_storage', 'account_unavailable'] as AccountMessage[]) {
      expect(toastFor('signedIn', state({ message }))).toBeNull()
      expect(toastFor('signingIn', state({ message }))).toBeNull()
    }
  })
})

describe('the words the account may use', () => {
  it('all exist, in English and in Hindi', () => {
    for (const key of [...ACCOUNT_MESSAGES, 'account_signed_in' as const]) {
      for (const lang of ['en', 'hi'] as const) expect({ key, lang, text: translate(lang, key).length > 0 }).toEqual({ key, lang, text: true })
    }
  })
})
