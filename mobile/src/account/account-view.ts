import type { StringKey } from '@/i18n'
import type { AccountMessage, AccountState, AccountStatus } from './account-state'

/** The name to greet the reader with: the name Google gave, or the e-mail address when there is none. */
export const accountLabel = (state: AccountState): string => (state.name === '' ? state.email : state.name)

export const isSignedIn = (state: AccountState): boolean => state.status === 'signedIn'

/** The account is waiting for the browser or working: nothing else should be put in front of the reader (an update offer, say). */
export const accountOccupied = (state: AccountState): boolean => state.status === 'signingIn' || state.busy

/** What the account sheet shows (AccountSheet.render of the native app), without saying how. */
export type SheetView =
  /** Only the progress "Deleting your account…": there is nothing to tap that would not be ignored. */
  | { readonly kind: 'deleting' }
  /** "Signed in as <label>", the detail, and the buttons Your topics, Manage account on the website, Sign out and Delete account. */
  | { readonly kind: 'signedIn'; readonly label: string; readonly detail: 'syncing' | 'signed_in_detail'; readonly note: AccountMessage | null }
  /** The progress "Waiting for Google sign-in…", with Cancel sign-in unless the code is being exchanged. */
  | { readonly kind: 'waiting'; readonly canCancel: boolean; readonly note: AccountMessage | null }
  /** The introduction, the upload note, Continue with Google and the privacy policy. */
  | { readonly kind: 'signedOut'; readonly note: AccountMessage | null }

/** A note is shown for every message but "Signed out", which is told once instead (see toastFor). */
const noteOf = (state: AccountState): AccountMessage | null => (state.message !== null && state.message !== 'account_signed_out' ? state.message : null)

export function sheetView(state: AccountState): SheetView {
  if (state.status === 'signedIn' && state.message === 'account_deleting') return { kind: 'deleting' }
  const note = noteOf(state)
  if (state.status === 'signedIn') return { kind: 'signedIn', label: accountLabel(state), detail: state.busy ? 'syncing' : 'signed_in_detail', note }
  if (state.status === 'signingIn') return { kind: 'waiting', canCancel: !state.busy, note }
  return { kind: 'signedOut', note }
}

/**
 * What to tell the reader once, as a toast, when the state changes from `before` (the status the screen saw last, null at the start):
 * "Signed in" when the sign-in finishes, and the outcome of signing out or deleting the account.
 */
export function toastFor(before: AccountStatus | null, after: AccountState): StringKey | null {
  if (before === after.status) return null
  if (before === 'signingIn' && after.status === 'signedIn') return 'account_signed_in'
  if (after.message === 'account_signed_out' || after.message === 'account_deleted') return after.message
  return null
}
