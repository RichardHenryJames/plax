import * as WebBrowser from 'expo-web-browser'
import * as account from '..'
import { openAuthSession } from '../auth-session'

const browser = require('expo-web-browser') as { __nextAuthResult: (result: { type: 'success'; url: string } | { type: 'cancel' } | { type: 'dismiss' } | { type: 'locked' }) => void; opened: { url: string; redirect?: string }[] }

describe('the system browser for the sign-in', () => {
  it('opens the address and waits for the return to the redirect, in the app\u2019s own task', async () => {
    browser.__nextAuthResult({ type: 'success', url: 'com.plaxlabs.news://auth-callback?code=abcdefgh' })
    const result = await openAuthSession('https://abcdefghij.supabase.co/auth/v1/authorize?x=1', 'com.plaxlabs.news://auth-callback')
    expect(result).toEqual({ type: 'success', url: 'com.plaxlabs.news://auth-callback?code=abcdefgh' })
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith('https://abcdefghij.supabase.co/auth/v1/authorize?x=1', 'com.plaxlabs.news://auth-callback', {
      showTitle: true,
      createTask: false,
    })
    expect(browser.opened).toEqual([{ url: 'https://abcdefghij.supabase.co/auth/v1/authorize?x=1', redirect: 'com.plaxlabs.news://auth-callback' }])
  })

  it('passes on a closed browser as it is', async () => {
    browser.__nextAuthResult({ type: 'dismiss' })
    expect(await openAuthSession('https://a.test/x', 'a://b')).toEqual({ type: 'dismiss' })
    expect(await openAuthSession('https://a.test/x', 'a://b')).toEqual({ type: 'cancel' })
  })
})

describe('what the account module offers', () => {
  it('is the manager, the words, the readers of the state and the errors', () => {
    expect(Object.keys(account).sort()).toEqual(
      [
        'ACCOUNT_MESSAGES',
        'AccountError',
        'CALLBACK_HOST',
        'CONFIG_TTL_MS',
        'PENDING_MS',
        'REFRESH_MARGIN_MS',
        'Rejected',
        'SIGNED_OUT',
        'STALE_MS',
        'StorageError',
        'Unauthorized',
        'accountLabel',
        'accountOccupied',
        'createAccountManager',
        'isSignedIn',
        'openAuthSession',
        'parseCallback',
        'sheetView',
        'toastFor',
      ].sort(),
    )
  })

  it('has the windows of the native app', () => {
    expect([account.PENDING_MS, account.REFRESH_MARGIN_MS, account.STALE_MS, account.CONFIG_TTL_MS]).toEqual([600_000, 60_000, 600_000, 600_000])
  })
})
