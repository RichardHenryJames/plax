import type { StringKey } from '@/i18n'

/**
 * The words the account may leave for the reader, as keys of the dictionary (the screen translates them). Most are problems; three are
 * events the screen tells once (account_signed_out, account_deleted and the sign-in that finished), and account_deleting says that the
 * account is being deleted right now.
 */
export const ACCOUNT_MESSAGES = [
  'account_unavailable',
  'account_failed',
  'account_denied',
  'account_storage',
  'account_expired',
  'account_sync_failed',
  'account_deleting',
  'account_deleted',
  'account_delete_failed',
  'account_signed_out',
  'browser_unavailable',
] as const satisfies readonly StringKey[]

export type AccountMessage = (typeof ACCOUNT_MESSAGES)[number]

/** signedOut: nobody is signed in. signingIn: waiting for the browser (or exchanging what it brought back). signedIn: there is a session. */
export type AccountStatus = 'signedOut' | 'signingIn' | 'signedIn'

/** What the screens show of the account: the whole of it, nothing secret. A port of AccountManager.Status of the native app. */
export interface AccountState {
  readonly status: AccountStatus
  /** The name Google gave, or '' (also when nobody is signed in). */
  readonly name: string
  readonly email: string
  /** The latest problem or event, or null. It stays until the next change of state. */
  readonly message: AccountMessage | null
  /** Something is being done that the reader can only wait for: the exchange of the code, a sync, the deletion. */
  readonly busy: boolean
  /** The account is being deleted: the screen offers nothing else but the progress. */
  readonly deleting: boolean
}

export const SIGNED_OUT: AccountState = { status: 'signedOut', name: '', email: '', message: null, busy: false, deleting: false }
