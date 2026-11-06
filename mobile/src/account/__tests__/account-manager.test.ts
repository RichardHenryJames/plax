import AsyncStorage from '@react-native-async-storage/async-storage'
import { secrets as phoneSecrets } from '@/platform/storage'
import { CONFIG_TTL_MS, PENDING_MS, REFRESH_MARGIN_MS, STALE_MS, type AccountManager } from '../account-manager'
import { accountLabel, isSignedIn } from '../account-view'
import { AccountError, Rejected, StorageError, Unauthorized } from '../errors'
import { challenge } from '../pkce'
import { ACCOUNT_KEY } from '../token-store'
import { dumpSecrets, fixture, flush, ids, Landing, memorySecrets, MemoryStore, SCHEME, story, tokens, USER_A, USER_B } from './helpers'
import { setVariant } from '@/test/helpers'

type Fixture = ReturnType<typeof fixture>

const uniq = <T>(values: T[]): T[] => values.filter((value, index) => index === 0 || JSON.stringify(value) !== JSON.stringify(values[index - 1]))
const shape = (account: AccountManager) => {
  const { status, busy, message } = account.store.getState()
  return { status, busy, message }
}

describe('the account, as the native app\u2019s AccountManagerTest sets it', () => {
  let f: Fixture
  let account: AccountManager
  const state = () => account.store.getState()

  beforeEach(() => {
    f = fixture()
    account = f.create()
  })

  it('starts signed out and needs nothing', async () => {
    await account.restore()
    expect(state().status).toBe('signedOut')
    expect(isSignedIn(state())).toBe(false)
    // Nothing is contacted until the reader chooses to sign in.
    expect(f.auth.calls).toEqual([])
    expect(f.cloud.calls).toEqual([])
    account.cloud().saved(story('a'), true)
    account.cloud().interests(new Set(['space']))
    await account.idle()
    // Changes made while signed out go nowhere.
    expect(f.cloud.calls).toEqual([])
  })

  it('checks the service, then opens the browser with a proof key', async () => {
    await f.begin(account)
    expect(f.auth.calls).toEqual(['config', 'check'])
    expect(f.browser.opened).toHaveLength(1)
    const url = new URL(f.browser.opened[0].url)
    expect(url.host).toBe('abcdefghij.supabase.co')
    expect(url.pathname).toBe('/auth/v1/authorize')
    expect(url.searchParams.get('provider')).toBe('google')
    expect(url.searchParams.get('redirect_to')).toBe(`https://plax-rouge.vercel.app/news/auth/app?app=${SCHEME}`)
    expect(url.searchParams.get('code_challenge_method')).toBe('s256')
    const verifier = f.store.json?.v as string
    // The browser is given only the challenge; the verifier stays sealed in the store.
    expect(url.searchParams.get('code_challenge')).toBe(await challenge(verifier))
    expect(f.browser.opened[0].url).not.toContain(verifier)
    expect(state().status).toBe('signingIn')
    expect(f.browser.opened[0].redirect).toBe(`${SCHEME}://auth-callback`)
  })

  it('opens no browser when the service is unreachable, and says so', async () => {
    f.auth.checkFailure = new AccountError('down')
    await account.signIn()
    expect(f.browser.opened).toEqual([])
    expect(state().status).toBe('signedOut')
    expect(state().message).toBe('account_unavailable')
    f.auth.checkFailure = undefined
    f.auth.configFailure = new AccountError('no address')
    f.clock.advance(11 * 60_000)
    await account.signIn()
    expect(f.browser.opened).toEqual([])
    expect(state().message).toBe('account_unavailable')
  })

  it('exchanges the browser\u2019s code once, with the sealed verifier', async () => {
    await f.begin(account)
    const verifier = f.store.json?.v
    const code = 'd'.repeat(36)
    await account.complete(f.callback(code, '&extra=ignored'))
    expect(f.auth.lastCode).toBe(code)
    expect(f.auth.lastVerifier).toBe(verifier)
    expect(state().status).toBe('signedIn')
    expect(accountLabel(state())).toBe('Asha Rao')
    // The verifier is single use.
    expect(f.store.json?.v).toBeUndefined()
    f.auth.calls.length = 0
    await account.complete(f.callback(code))
    // Replaying the callback does nothing.
    expect(f.auth.calls).toEqual([])
  })

  it('ignores callbacks nobody asked for, or that are stale or foreign', async () => {
    await account.complete(f.callback('e'.repeat(36)))
    // No sign-in was started.
    expect(f.auth.calls).toEqual([])
    await f.begin(account)
    f.clock.advance(PENDING_MS + 1)
    await account.complete(f.callback('e'.repeat(36)))
    // An old sign-in attempt expired.
    expect(f.auth.calls).not.toContain('exchange')
    expect(account.ours('com.plaxlabs.news://auth-callback?code=abc')).toBe(false)
    expect(account.ours(`${SCHEME}://elsewhere?code=abc`)).toBe(false)
    expect(account.ours('https://example.com/auth-callback?code=abc')).toBe(false)
    expect(account.ours(`${SCHEME}://auth-callback?code=abc`)).toBe(true)
  })

  it('leaves a reader whose sign-in was denied or failed signed out, with a reason', async () => {
    await f.begin(account)
    await account.complete(`${SCHEME}://auth-callback?error=access_denied&error_description=nope`)
    expect(state().message).toBe('account_denied')
    await f.begin(account)
    f.auth.exchangeFailure = new Rejected(400)
    await account.complete(f.callback('f'.repeat(36)))
    expect(state().status).toBe('signedOut')
    expect(state().message).toBe('account_failed')
    // Nothing is kept from a failed sign-in.
    expect(f.store.text === null || !f.store.text.includes('access')).toBe(true)
  })

  it('does not sign the reader in when the session cannot be kept safely', async () => {
    await f.begin(account)
    f.store.writeFailure = new StorageError('keystore')
    await account.complete(f.callback('a'.repeat(36)))
    expect(state().status).toBe('signedOut')
    expect(state().message).toBe('account_storage')
    // The session that was just created is revoked.
    expect(f.auth.calls).toContain('logout:access-1')
    const failing = new MemoryStore()
    failing.writeFailure = new Error('keystore')
    const other = f.create(failing)
    const opened = f.browser.opened.length
    await other.signIn()
    // Sign-in is refused up front when nothing can be stored.
    expect(other.store.getState().message).toBe('account_storage')
    expect(f.browser.opened).toHaveLength(opened)
  })

  it('takes the account\u2019s topics on the first sign-in, and uploads what the phone has that the account lacks', async () => {
    f.phone.topics = new Set(['art'])
    f.phone.saved = [story('mine1'), story('mine2')]
    f.cloud.heldTopics = new Set(['science', 'space'])
    f.cloud.heldBookmarks = [story('theirs'), story('mine2')]
    await f.signIn(account)
    // The account's topics win when it has any.
    expect(f.landing.topics).toEqual([new Set(['science', 'space'])])
    expect(f.landing.saved).toEqual([['theirs', 'mine2']])
    // Only what the account lacks is uploaded, in one request.
    expect(f.cloud.calls).toContain('add:[mine1]')
    expect(f.cloud.calls.some((call) => call.startsWith('save:'))).toBe(false)
    expect(f.store.json?.s).toBe(USER_A)
    expect(state().message).toBeNull()
  })

  it('gives an account with no topics the phone\u2019s topics', async () => {
    f.phone.topics = new Set(['art', 'books'])
    await f.signIn(account)
    expect(f.cloud.calls).toContain('save:[art, books]')
    // Nothing is pushed back to the phone.
    expect(f.landing.topics).toEqual([])
  })

  it('never lets a different account inherit what another left on the phone', async () => {
    // The phone last synced account A. B signs in on it.
    await f.begin(account)
    await account.complete(f.callback('a'.repeat(36)))
    await account.signOut()
    f.phone.topics = new Set(['art'])
    f.phone.saved = [story('private')]
    f.auth.next = tokens('access-b', 'refresh-b', USER_B, f.clock() + 3_600_000)
    f.cloud.calls.length = 0
    account = f.create()
    await f.begin(account)
    await account.complete(f.callback('b'.repeat(36)))
    await account.idle()
    expect(state().status).toBe('signedIn')
    // A's topics are not uploaded to B, nor A's saved stories.
    expect(f.cloud.calls.some((call) => call.startsWith('save:'))).toBe(false)
    expect(f.cloud.calls.some((call) => call.startsWith('add:'))).toBe(false)
  })

  it('does not echo remote topics back', async () => {
    f.cloud.heldTopics = new Set(['space'])
    f.phone.topics = new Set(['space'])
    await f.signIn(account)
    // Identical topics need no transfer either way.
    expect(f.landing.topics).toEqual([])
    expect(f.cloud.calls.some((call) => call.startsWith('save:'))).toBe(false)
  })

  it('sends changes made while signed in right away', async () => {
    await f.signIn(account)
    f.cloud.calls.length = 0
    account.cloud().saved(story('x'), true)
    account.cloud().saved(story('y'), false)
    account.cloud().interests(new Set(['math', 'art']))
    await account.idle()
    expect(f.cloud.calls).toEqual(['add:[x]', 'remove:y', 'save:[art, math]'])
    // Nothing is left waiting.
    expect(f.store.queue).toEqual([])
  })

  it('keeps changes made offline and sends them later, in order', async () => {
    await f.signIn(account)
    f.cloud.calls.length = 0
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('x'), true)
    account.cloud().saved(story('x'), false)
    account.cloud().saved(story('z'), true)
    await account.idle()
    expect(state().message).toBe('account_sync_failed')
    expect(state().status).toBe('signedIn')
    expect(f.store.text).toContain('"z"')
    // Add then remove of one story collapses to the removal.
    expect(f.store.queue).toHaveLength(2)
    f.cloud.failure = undefined
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(f.cloud.calls.slice(0, 4)).toEqual(['remove:x', 'add:[z]', 'topics', 'bookmarks'])
    expect(f.store.queue).toEqual([])
  })

  it('drops a change the account will never accept, instead of retrying it forever', async () => {
    await f.signIn(account)
    f.cloud.addFailure = new Rejected(403)
    account.cloud().saved(story('blocked'), true)
    await account.idle()
    expect(f.store.queue).toEqual([])
    expect(state().message).toBeNull()
  })

  it('sends a topics change that could not be sent before anything overwrites it', async () => {
    await f.signIn(account)
    f.cloud.failure = new AccountError('offline')
    account.cloud().interests(new Set(['math']))
    await account.idle()
    expect(f.store.json?.d).toBe(true)
    f.cloud.failure = undefined
    f.cloud.heldTopics = new Set(['history'])
    f.cloud.calls.length = 0
    f.landing.topics.length = 0
    f.phone.topics = new Set(['math'])
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    // The phone's newer choice wins over the older one in the account.
    expect(f.cloud.calls).toContain('save:[math]')
    expect(f.landing.topics).toEqual([])
    expect(f.store.json?.d).toBe(false)
  })

  it('refreshes an access token that has run out before it is used', async () => {
    await f.signIn(account)
    f.clock.advance(3_600_000 - 30_000)
    f.cloud.calls.length = 0
    f.cloud.tokensSeen.length = 0
    account.cloud().saved(story('q'), true)
    await account.idle()
    expect(f.auth.calls).toContain('refresh:refresh-1')
    expect(f.cloud.tokensSeen).toEqual(['access-2'])
    // The rotated refresh token is stored.
    expect((f.store.json?.session as { r: string }).r).toBe('refresh-2')
  })

  it('refreshes a token the server refuses once, and retries the call', async () => {
    await f.signIn(account)
    f.cloud.calls.length = 0
    f.cloud.tokensSeen.length = 0
    f.cloud.failure = new Unauthorized()
    account.cloud().saved(story('q'), true)
    await account.idle()
    expect(f.cloud.calls).toEqual(['add:[q]', 'add:[q]'])
    expect(f.cloud.tokensSeen).toEqual(['access-1', 'access-2'])
    expect(state().status).toBe('signedIn')
  })

  it('ends the session when the refresh is refused, but keeps what was waiting', async () => {
    await f.signIn(account)
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('waiting'), true)
    await account.idle()
    f.cloud.failure = undefined
    f.auth.refreshFailure = new Rejected(400)
    f.clock.advance(3_600_000)
    account.cloud().saved(story('later'), true)
    await account.idle()
    expect(state().status).toBe('signedOut')
    expect(state().message).toBe('account_expired')
    // Changes waiting for the same account survive an expiry.
    expect(f.store.text).toContain('"waiting"')
    expect(f.store.json?.session).toBeUndefined()
  })

  it('does not sign the reader out when the service is only busy', async () => {
    await f.signIn(account)
    f.auth.refreshFailure = new AccountError('rate limited')
    f.clock.advance(3_600_000)
    account.cloud().saved(story('q'), true)
    await account.idle()
    expect(state().status).toBe('signedIn')
    expect(state().message).toBe('account_sync_failed')
  })

  it('forgets the session on signing out but leaves the reader\u2019s own data', async () => {
    f.phone.topics = new Set(['art'])
    f.phone.saved = [story('kept')]
    await f.signIn(account)
    await account.signOut()
    expect(state().status).toBe('signedOut')
    expect(state().message).toBe('account_signed_out')
    expect(f.auth.calls).toContain('logout:access-1')
    expect(f.store.text === null || !f.store.text.includes('access-1')).toBe(true)
    expect(f.phone.topics).toEqual(new Set(['art']))
    expect(ids(f.phone.saved)).toEqual(['kept'])
    account.cloud().saved(story('after'), true)
    await account.idle()
    // Signed out, nothing is sent.
    expect(f.cloud.calls).not.toContain('add:[after]')
  })

  it('deletes the account with the reader\u2019s own token and leaves like signing out', async () => {
    f.phone.topics = new Set(['art'])
    f.phone.saved = [story('kept')]
    await f.signIn(account)
    f.auth.calls.length = 0
    f.cloud.calls.length = 0
    const landed = f.landing.topics.length + f.landing.saved.length
    const before = f.statuses.length
    await account.deleteAccount()
    // Only the deletion, with the reader's own token; the account is gone, so there is nothing to log out of.
    expect(f.auth.calls).toEqual(['delete:access-1'])
    // The reader was shown that it was under way.
    expect(f.statuses.slice(before).some((s) => s.message === 'account_deleting' && s.busy && s.deleting)).toBe(true)
    expect(state().status).toBe('signedOut')
    expect(state().message).toBe('account_deleted')
    expect(isSignedIn(state())).toBe(false)
    // The session is no longer kept.
    expect(f.store.text === null || !f.store.text.includes('access-1')).toBe(true)
    // The phone's own data is left alone.
    expect(f.phone.topics).toEqual(new Set(['art']))
    expect(ids(f.phone.saved)).toEqual(['kept'])
    // Nothing was pushed to the phone's screens.
    expect(f.landing.topics.length + f.landing.saved.length).toBe(landed)
    account.cloud().saved(story('after'), true)
    account.cloud().interests(new Set(['math']))
    await account.idle()
    // Signed out, nothing is sent to an account that no longer exists.
    expect(f.cloud.calls).toEqual([])
  })

  it('refreshes an expired token before the account is deleted', async () => {
    await f.signIn(account)
    f.clock.advance(3_600_000 - 30_000)
    f.auth.calls.length = 0
    await account.deleteAccount()
    expect(f.auth.calls).toEqual(['config', 'refresh:refresh-1', 'delete:access-2'])
    expect(state().message).toBe('account_deleted')
  })

  it('refreshes a token that is refused while deleting, once, and retries the deletion', async () => {
    await f.signIn(account)
    f.auth.calls.length = 0
    f.auth.deleteFailure = new Unauthorized()
    await account.deleteAccount()
    expect(f.auth.calls).toEqual(['delete:access-1', 'refresh:refresh-1', 'delete:access-2'])
    expect(state().status).toBe('signedOut')
    expect(state().message).toBe('account_deleted')
  })

  it('keeps the account in place and says so when the deletion fails', async () => {
    await f.signIn(account)
    f.auth.deleteFailure = new AccountError('offline')
    await account.deleteAccount()
    expect(state().status).toBe('signedIn')
    expect(state().message).toBe('account_delete_failed')
    // Not stuck waiting.
    expect(state().busy).toBe(false)
    expect(state().deleting).toBe(false)
    // Still signed in, with the session kept.
    expect(isSignedIn(state()) && (f.store.text as string).includes('access-1')).toBe(true)
    f.auth.deleteFailure = undefined
    await account.deleteAccount()
    // The reader can simply try again.
    expect(state().message).toBe('account_deleted')
    expect(state().status).toBe('signedOut')
  })

  it('ends a session that cannot be refreshed instead of deleting it', async () => {
    await f.signIn(account)
    f.auth.calls.length = 0
    f.auth.deleteFailure = new Unauthorized()
    f.auth.refreshFailure = new Rejected(400)
    await account.deleteAccount()
    expect(f.auth.calls).toEqual(['delete:access-1', 'refresh:refresh-1'])
    expect(state().status).toBe('signedOut')
    // The reader is told the sign-in ended, not that the account was deleted.
    expect(state().message).toBe('account_expired')
  })

  it('does nothing when asked to delete an account while signed out', async () => {
    await account.deleteAccount()
    expect(f.auth.calls).toEqual([])
    expect(f.cloud.calls).toEqual([])
    expect(state().status).toBe('signedOut')
    expect(state().message).toBeNull()
  })

  it('keeps the session across a restart without the network', async () => {
    await f.signIn(account)
    f.auth.calls.length = 0
    f.cloud.calls.length = 0
    const restarted = f.create()
    await restarted.restore()
    expect(restarted.store.getState().status).toBe('signedIn')
    expect(accountLabel(restarted.store.getState())).toBe('Asha Rao')
    await restarted.idle()
    expect(f.auth.calls).toEqual([])
    expect(f.cloud.calls).toEqual([])
  })

  it('leaves a store that cannot be opened alone, and drops a damaged one', async () => {
    await f.signIn(account)
    const saved = f.store.text
    const locked = new MemoryStore()
    locked.text = saved
    locked.readFailure = new StorageError('keystore locked')
    const first = f.create(locked)
    await first.restore()
    expect(first.store.getState().status).toBe('signedOut')
    // A temporary failure must not destroy the session.
    expect(locked.cleared).toBe(false)
    expect(locked.text).toBe(saved)
    const damaged = new MemoryStore()
    damaged.text = '{not json'
    const second = f.create(damaged)
    await second.restore()
    expect(second.store.getState().status).toBe('signedOut')
    expect(damaged.cleared).toBe(true)
  })
})

describe('signing in through the browser', () => {
  let f: Fixture
  let account: AccountManager
  const state = () => account.store.getState()

  beforeEach(() => {
    f = fixture()
    account = f.create()
  })

  it('finishes with the address the browser returned, and syncs', async () => {
    f.cloud.heldTopics = new Set(['space'])
    f.browser.queue({ type: 'success', url: f.callback('s'.repeat(36)) })
    await account.signIn()
    await account.idle()
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: null })
    expect(state()).toMatchObject({ name: 'Asha Rao', email: 'reader@example.com', deleting: false })
    expect(f.auth.lastCode).toBe('s'.repeat(36))
    // The code was made for the challenge the browser was given.
    const asked = new URL(f.browser.opened[0].url)
    expect(await challenge(f.auth.lastVerifier)).toBe(asked.searchParams.get('code_challenge'))
    expect(f.landing.topics).toEqual([new Set(['space'])])
    expect(f.browser.opened[0].redirect).toBe(`${SCHEME}://auth-callback`)
  })

  it('goes through waiting, exchanging and syncing, in that order', async () => {
    await account.restore()
    f.browser.queue({ type: 'success', url: f.callback('s'.repeat(36)) })
    await account.signIn()
    await account.idle()
    expect(uniq(f.statuses.map((s) => ({ status: s.status, busy: s.busy, message: s.message })))).toEqual([
      { status: 'signedOut', busy: false, message: null },
      { status: 'signingIn', busy: false, message: null },
      { status: 'signingIn', busy: true, message: null },
      { status: 'signedIn', busy: true, message: null },
      { status: 'signedIn', busy: false, message: null },
    ])
  })

  it('treats a browser that was closed as a sign-in the reader gave up, without a word', async () => {
    for (const type of ['cancel', 'dismiss']) {
      const g = fixture()
      const one = g.create()
      g.browser.queue({ type })
      await one.signIn()
      expect(shape(one)).toEqual({ status: 'signedOut', busy: false, message: null })
      expect(g.auth.calls).not.toContain('exchange')
      // The secret is gone from the store as well as from memory.
      expect(g.store.json?.v).toBeUndefined()
      expect(g.store.text === null || !g.store.text.includes('"session"')).toBe(true)
    }
  })

  it('tells the reader when the browser did not bring back a sign-in', async () => {
    const outcomes: [{ type: string; url?: string }, string][] = [
      [{ type: 'locked' }, 'account_failed'],
      [{ type: 'opened' }, 'account_failed'],
      [{ type: 'failed' }, 'account_failed'],
      [{ type: 'success' }, 'account_failed'],
      [{ type: 'success', url: 'https://example.com/x' }, 'account_failed'],
      [{ type: 'success', url: 'com.plaxlabs.news://auth-callback?code=abcdefghijklmnop' }, 'account_failed'],
      [{ type: 'success', url: `${SCHEME}://auth-callback?code=bad` }, 'account_failed'],
      [{ type: 'success', url: `${SCHEME}://auth-callback?error=access_denied` }, 'account_denied'],
      [{ type: 'success', url: `${SCHEME}://auth-callback?error=server_error&error_description=x` }, 'account_failed'],
    ]
    for (const [result, message] of outcomes) {
      const g = fixture()
      const one = g.create()
      g.browser.queue(result)
      await one.signIn()
      expect({ result, ...shape(one) }).toEqual({ result, status: 'signedOut', busy: false, message })
      expect(g.auth.calls).not.toContain('exchange')
      expect(g.store.json?.v).toBeUndefined()
    }
  })

  it('says there is no browser when it cannot be opened', async () => {
    f.browser.queue(new Error('No browser'))
    await account.signIn()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'browser_unavailable' })
    expect(f.store.json?.v).toBeUndefined()
    // The reader can try again.
    f.browser.queue({ type: 'success', url: f.callback('t'.repeat(36)) })
    await account.signIn()
    expect(state().status).toBe('signedIn')
  })

  it('never opens the browser for an address that is not a web link', async () => {
    // The project address is checked before it gets here, so this is a part that is wrong, not a case that happens.
    f.auth.project = { url: 'http://abcdefghij.supabase.co', anonKey: 'k'.repeat(30) }
    await account.signIn()
    expect(f.browser.opened).toEqual([])
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: null })
    expect(f.store.json?.v).toBeUndefined()
  })

  it('uses the website and the scheme of its build unless it is told others', async () => {
    for (const [variant, scheme, site] of [
      ['play', 'com.plaxlabs.news', 'https://plax-rouge.vercel.app/news'],
      ['preview', 'com.plaxlabs.news.preview', 'https://plax-rouge.vercel.app/news'],
      ['e2e', 'com.plaxlabs.news.e2e', 'http://10.0.2.2:8787/news'],
    ] as const) {
      setVariant(variant)
      const g = fixture({ site: undefined, authScheme: undefined })
      const one = g.create()
      await g.begin(one)
      const asked = new URL(g.browser.opened[0].url)
      expect({ variant, redirect: asked.searchParams.get('redirect_to') }).toEqual({ variant, redirect: `${site}/auth/app?app=${scheme}` })
      expect(g.browser.opened[0].redirect).toBe(`${scheme}://auth-callback`)
      expect(one.ours(`${scheme}://auth-callback?code=abcdefgh`)).toBe(true)
      expect(one.ours(`com.other://auth-callback?code=abcdefgh`)).toBe(false)
    }
  })

  it('takes the website and the scheme as functions too, and asks them each time', async () => {
    let scheme = 'com.plaxlabs.news'
    const g = fixture({ site: () => 'https://one.example/news', authScheme: () => scheme })
    const one = g.create()
    await g.begin(one)
    expect(new URL(g.browser.opened[0].url).searchParams.get('redirect_to')).toBe('https://one.example/news/auth/app?app=com.plaxlabs.news')
    scheme = 'com.plaxlabs.news.preview'
    expect(one.ours('com.plaxlabs.news.preview://auth-callback?code=abcdefgh')).toBe(true)
    expect(one.ours('com.plaxlabs.news://auth-callback?code=abcdefgh')).toBe(false)
  })

  it('is not undone by the browser closing after the sign-in was finished by the deep link', async () => {
    await f.begin(account)
    await account.complete(f.callback('d'.repeat(36)))
    await account.idle()
    f.browser.answer({ type: 'dismiss' })
    await f.attempt
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: null })
    expect(f.store.json?.session).toBeDefined()
  })

  it('does not overwrite a failure with the browser closing afterwards', async () => {
    await f.begin(account)
    f.auth.exchangeFailure = new Rejected(400)
    await account.complete(f.callback('d'.repeat(36)))
    f.browser.answer({ type: 'cancel' })
    await f.attempt
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_failed' })
  })

  it('ignores the browser answering after the reader pressed Cancel', async () => {
    await f.begin(account)
    await account.cancel()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: null })
    f.browser.answer({ type: 'success', url: f.callback('d'.repeat(36)) })
    await f.attempt
    expect(f.auth.calls).not.toContain('exchange')
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: null })
  })

  it('does not open a second browser while one is waiting', async () => {
    await f.begin(account)
    const calls = [...f.auth.calls]
    await account.signIn()
    await account.signIn()
    expect(f.browser.opened).toHaveLength(1)
    expect(f.auth.calls).toEqual(calls)
    expect(state().status).toBe('signingIn')
  })

  it('does not even start twice when two taps come at once', async () => {
    const first = account.signIn()
    const second = account.signIn()
    await flush()
    expect(f.browser.opened).toHaveLength(1)
    f.browser.answer({ type: 'cancel' })
    await Promise.all([first, second])
    expect(f.auth.calls.filter((call) => call === 'check')).toHaveLength(1)
  })

  it('does nothing when it is already signed in', async () => {
    await f.signIn(account)
    const calls = [...f.auth.calls]
    const opened = f.browser.opened.length
    await account.signIn()
    expect(f.auth.calls).toEqual(calls)
    expect(f.browser.opened).toHaveLength(opened)
    expect(state().status).toBe('signedIn')
  })

  it('can start again after the reader gave up, with a new secret', async () => {
    f.browser.queue({ type: 'cancel' })
    await account.signIn()
    f.browser.queue({ type: 'success', url: f.callback('r'.repeat(36)) })
    await account.signIn()
    expect(state().status).toBe('signedIn')
    expect(f.browser.opened).toHaveLength(2)
    const challenges = f.browser.opened.map((opened) => new URL(opened.url).searchParams.get('code_challenge'))
    expect(new Set(challenges).size).toBe(2)
  })

  it('refuses an answer of the browser that arrives too late', async () => {
    await f.begin(account)
    f.clock.advance(PENDING_MS + 1)
    f.browser.answer({ type: 'success', url: f.callback('d'.repeat(36)) })
    await f.attempt
    expect(f.auth.calls).not.toContain('exchange')
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_failed' })
    expect(f.store.json?.v).toBeUndefined()
  })

  it('accepts a callback at the very end of its time, and not a moment later', async () => {
    await f.begin(account)
    f.clock.advance(PENDING_MS)
    await account.complete(f.callback('d'.repeat(36)))
    expect(state().status).toBe('signedIn')
    const g = fixture()
    const late = g.create()
    await g.begin(late)
    g.clock.advance(PENDING_MS + 1)
    await late.complete(g.callback('d'.repeat(36)))
    expect(late.store.getState().status).toBe('signingIn')
    expect(g.auth.calls).not.toContain('exchange')
  })

  it('exchanges once, however many times the address is delivered at the same moment', async () => {
    await f.begin(account)
    await Promise.all([account.complete(f.callback('d'.repeat(36))), account.complete(f.callback('d'.repeat(36))), account.complete(f.callback('d'.repeat(36)))])
    expect(f.auth.calls.filter((call) => call === 'exchange')).toHaveLength(1)
    expect(state().status).toBe('signedIn')
  })

  it('finishes a sign-in the app was killed during, with the secret it kept', async () => {
    await f.begin(account)
    const verifier = f.store.json?.v
    // The app is started again by the browser's return.
    const restarted = f.create()
    await restarted.restore()
    expect(shape(restarted)).toEqual({ status: 'signingIn', busy: false, message: null })
    await restarted.complete(f.callback('k'.repeat(36)))
    await restarted.idle()
    expect(f.auth.lastVerifier).toBe(verifier)
    expect(restarted.store.getState().status).toBe('signedIn')
  })

  it('forgets a sign-in that waited longer than it may across a restart', async () => {
    await f.begin(account)
    f.clock.advance(PENDING_MS + 1)
    const restarted = f.create()
    await restarted.restore()
    expect(shape(restarted)).toEqual({ status: 'signedOut', busy: false, message: null })
    await restarted.complete(f.callback('k'.repeat(36)))
    expect(f.auth.calls).not.toContain('exchange')
  })

  it('lets the reader give up on a sign-in that is waiting, and cancelling when signed in changes nothing', async () => {
    await f.begin(account)
    await account.cancel()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: null })
    expect(f.store.json?.v).toBeUndefined()
    // A callback that comes later is not used.
    await account.complete(f.callback('k'.repeat(36)))
    expect(f.auth.calls).not.toContain('exchange')
    await f.signIn(account)
    await account.cancel()
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: null })
  })

  it('is no longer waiting when the reader signs out during it', async () => {
    await f.begin(account)
    await account.signOut()
    expect(state().message).toBe('account_signed_out')
    await account.complete(f.callback('k'.repeat(36)))
    expect(f.auth.calls).not.toContain('exchange')
    expect(state().status).toBe('signedOut')
  })

  it('treats every way a code exchange can fail as a sign-in that did not finish', async () => {
    const failures: Error[] = [
      new Rejected(400),
      new Rejected(403),
      new Rejected(422),
      new Unauthorized(),
      new AccountError('Try again later'),
      new AccountError('Service unavailable'),
      new AccountError('Unexpected sign-in response'),
    ]
    for (const failure of failures) {
      const g = fixture()
      const one = g.create()
      await g.begin(one)
      g.auth.exchangeFailure = failure
      await one.complete(g.callback('x'.repeat(36)))
      await one.idle()
      expect({ failure: failure.name, ...shape(one) }).toEqual({ failure: failure.name, status: 'signedOut', busy: false, message: 'account_failed' })
      // The code is used once, and not asked again by itself.
      expect(g.auth.calls.filter((call) => call === 'exchange')).toHaveLength(1)
      // Nothing was signed in, so there is nothing to revoke, and nothing is kept.
      expect(g.auth.calls.some((call) => call.startsWith('logout'))).toBe(false)
      expect(g.store.json?.session).toBeUndefined()
      expect(g.store.json?.v).toBeUndefined()
      expect(g.cloud.calls).toEqual([])
    }
  })

  it('treats an error and a code that is no code the same: a sign-in that did not finish', async () => {
    for (const query of ['error=server_error', 'error=access_denied&code=abcdefghij', 'code=short', '', 'foo=bar']) {
      const g = fixture()
      const one = g.create()
      await g.begin(one)
      await one.complete(`${SCHEME}://auth-callback?${query}`)
      expect({ query, status: one.store.getState().status, message: one.store.getState().message }).toEqual({
        query,
        status: 'signedOut',
        message: query.startsWith('error=access_denied') ? 'account_denied' : 'account_failed',
      })
      expect(g.auth.calls).not.toContain('exchange')
    }
  })
})

describe('what the phone keeps, and where', () => {
  it('is the session in the secure store only, never in plain storage', async () => {
    await AsyncStorage.clear()
    const f = fixture()
    const account = f.onSecrets(phoneSecrets)
    await f.begin(account)
    const verifier = JSON.parse(dumpSecrets().get(ACCOUNT_KEY) as string).v as string
    expect(verifier).toBeTruthy()
    expect(await AsyncStorage.getAllKeys()).toEqual([])
    await account.complete(f.callback('a'.repeat(36)))
    await account.idle()
    const sealed = dumpSecrets().get(ACCOUNT_KEY) as string
    expect(sealed).toContain('access-1')
    expect(sealed).toContain('refresh-1')
    expect([...dumpSecrets().keys()]).toEqual([ACCOUNT_KEY])
    // Nothing of it is anywhere else.
    expect(await AsyncStorage.getAllKeys()).toEqual([])
    await account.signOut()
    expect(dumpSecrets().get(ACCOUNT_KEY) ?? '').not.toMatch(/access-1|refresh-1/)
    expect(await AsyncStorage.getAllKeys()).toEqual([])
  })

  it('is no session at all when the secure store fails: signed out, with a reason, nothing elsewhere', async () => {
    await AsyncStorage.clear()
    const secrets = memorySecrets()
    const f = fixture()
    const account = f.onSecrets(secrets)
    secrets.failWrites = true
    await account.signIn()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_storage' })
    expect(f.browser.opened).toEqual([])
    expect(secrets.values.size).toBe(0)
    // The Keystore comes back while the sign-in is under way, but fails when the session is to be kept.
    secrets.failWrites = false
    await f.begin(account)
    secrets.failWrites = true
    await account.complete(f.callback('a'.repeat(36)))
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_storage' })
    expect(f.auth.calls).toContain('logout:access-1')
    expect(await AsyncStorage.getAllKeys()).toEqual([])
    expect([...secrets.values.values()].join('')).not.toContain('access-1')
  })

  it('stays signed out for the run when the secure store cannot be read, without destroying what it holds', async () => {
    const secrets = memorySecrets()
    const f = fixture()
    const first = f.onSecrets(secrets)
    await f.begin(first)
    await first.complete(f.callback('a'.repeat(36)))
    await first.idle()
    const sealed = secrets.values.get(ACCOUNT_KEY)
    const removesBefore = secrets.removes
    secrets.failReads = true
    const locked = f.onSecrets(secrets)
    await locked.restore()
    expect(shape(locked)).toEqual({ status: 'signedOut', busy: false, message: null })
    expect(secrets.removes).toBe(removesBefore)
    expect(secrets.values.get(ACCOUNT_KEY)).toBe(sealed)
    secrets.failReads = false
    const next = f.onSecrets(secrets)
    await next.restore()
    expect(next.store.getState().status).toBe('signedIn')
  })

  it('does not erase a store it could not read, however the reader gives up on a sign-in', async () => {
    const f = fixture()
    const first = f.create()
    await f.signIn(first)
    const saved = f.store.text
    const locked = new MemoryStore()
    locked.text = saved
    locked.readFailure = new StorageError('keystore locked')
    // Cancelling with nothing to cancel, and a service that cannot be reached, each leave the sealed session where it is.
    const one = f.create(locked)
    await one.cancel()
    f.auth.checkFailure = new AccountError('down')
    await one.signIn()
    expect(one.store.getState().message).toBe('account_unavailable')
    expect(locked.cleared).toBe(false)
    expect(locked.text).toBe(saved)
    // Once the store works again for a new sign-in, that replaces it, and from then on an empty state is written as nothing as usual.
    f.auth.checkFailure = undefined
    locked.readFailure = undefined
    f.browser.queue({ type: 'cancel' })
    await one.signIn()
    expect(locked.cleared).toBe(true)
    expect(locked.text).toBeNull()
  })

  it('never signs in from a blob that is not its own', async () => {
    const f = fixture()
    for (const blob of ['{not json', '[]', '{"schema":2}', '{"schema":1,"session":{"a":"x"},"ls":0,"d":false,"queue":[]}', '""']) {
      const store = new MemoryStore()
      store.text = blob
      const one = f.create(store)
      await one.restore()
      expect({ blob, status: one.store.getState().status }).toEqual({ blob, status: 'signedOut' })
      expect(store.cleared).toBe(true)
      expect(store.text).toBeNull()
    }
  })

  it('drops the session from the store even when the rest cannot be written, as the reader leaves', async () => {
    const secrets = memorySecrets()
    const f = fixture()
    const account = f.onSecrets(secrets)
    await f.begin(account)
    await account.complete(f.callback('a'.repeat(36)))
    await account.idle()
    expect(secrets.values.get(ACCOUNT_KEY)).toContain('access-1')
    secrets.failWrites = true
    await account.signOut()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_signed_out' })
    // The write of what is left failed, so the whole entry was removed: the old session cannot come back.
    expect(secrets.values.has(ACCOUNT_KEY)).toBe(false)
  })

  it('is signed out in this run whatever the store does when the reader leaves', async () => {
    const secrets = memorySecrets()
    const f = fixture()
    const account = f.onSecrets(secrets)
    await f.begin(account)
    await account.complete(f.callback('a'.repeat(36)))
    await account.idle()
    secrets.failWrites = true
    secrets.failRemoves = true
    await account.signOut()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_signed_out' })
    expect(account.store.getState().email).toBe('')
    f.cloud.calls.length = 0
    account.cloud().saved(story('after'), true)
    await account.idle()
    expect(f.cloud.calls).toEqual([])
  })

  it('keeps changes in memory for the run when they cannot be written, and still sends them', async () => {
    const secrets = memorySecrets()
    const f = fixture()
    const account = f.onSecrets(secrets)
    await f.begin(account)
    await account.complete(f.callback('a'.repeat(36)))
    await account.idle()
    secrets.failWrites = true
    f.cloud.calls.length = 0
    account.cloud().saved(story('x'), true)
    await account.idle()
    expect(f.cloud.calls).toEqual(['add:[x]'])
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: null })
  })
})

describe('the access token and its refresh', () => {
  let f: Fixture
  let account: AccountManager

  beforeEach(async () => {
    f = fixture()
    account = f.create()
    await f.signIn(account)
    f.cloud.calls.length = 0
    f.cloud.tokensSeen.length = 0
    f.auth.calls.length = 0
  })

  it('is refreshed when it has a minute or less left, and not before', async () => {
    // Signed in with an hour; 60 001 ms are left.
    f.clock.advance(3_600_000 - REFRESH_MARGIN_MS - 1)
    account.cloud().saved(story('a'), true)
    await account.idle()
    expect(f.auth.calls.filter((call) => call.startsWith('refresh'))).toEqual([])
    expect(f.cloud.tokensSeen.at(-1)).toBe('access-1')
    // Exactly a minute is left: the token is on the edge, and is refreshed.
    f.clock.advance(1)
    account.cloud().saved(story('b'), true)
    await account.idle()
    expect(f.auth.calls.filter((call) => call.startsWith('refresh'))).toEqual(['refresh:refresh-1'])
    expect(f.cloud.tokensSeen.at(-1)).toBe('access-2')
    expect(REFRESH_MARGIN_MS).toBe(60_000)
  })

  it('is refreshed once, and the new one is used until it too runs out', async () => {
    f.auth.refreshed = tokens('access-2', 'refresh-2', USER_A, f.clock() + 7_200_000)
    f.clock.advance(3_600_000)
    account.cloud().saved(story('a'), true)
    account.cloud().saved(story('b'), true)
    await account.idle()
    expect(f.auth.calls.filter((call) => call.startsWith('refresh'))).toHaveLength(1)
    expect(f.cloud.tokensSeen).toEqual(['access-2', 'access-2'])
  })

  it('is replaced with the account\u2019s answer, including the name it now gives', async () => {
    f.auth.refreshed = { ...f.auth.refreshed, name: 'Asha R.' }
    f.clock.advance(3_600_000)
    account.cloud().saved(story('a'), true)
    await account.idle()
    expect(f.store.json?.session).toMatchObject({ a: 'access-2', r: 'refresh-2', n: 'Asha R.' })
  })

  it('ends the session for each answer that says the refresh token is dead, and for no other', async () => {
    for (const code of [400, 401, 403]) {
      const g = fixture()
      const one = g.create()
      await g.signIn(one)
      g.auth.refreshFailure = new Rejected(code)
      g.clock.advance(3_600_000)
      one.cloud().saved(story('a'), true)
      await one.idle()
      expect({ code, ...shape(one) }).toEqual({ code, status: 'signedOut', busy: false, message: 'account_expired' })
    }
    for (const failure of [new Rejected(404), new Rejected(422), new Rejected(500), new AccountError('Try again later'), new AccountError('Service unavailable')]) {
      const g = fixture()
      const one = g.create()
      await g.signIn(one)
      g.auth.refreshFailure = failure
      g.clock.advance(3_600_000)
      one.cloud().saved(story('a'), true)
      await one.idle()
      expect({ failure: failure.message, ...shape(one) }).toEqual({ failure: failure.message, status: 'signedIn', busy: false, message: 'account_sync_failed' })
    }
  })

  it('asks where the accounts live again after ten minutes, and not before', async () => {
    f.clock.advance(CONFIG_TTL_MS)
    account.cloud().saved(story('a'), true)
    await account.idle()
    expect(f.auth.calls).not.toContain('config')
    f.clock.advance(1)
    account.cloud().saved(story('b'), true)
    await account.idle()
    expect(f.auth.calls.filter((call) => call === 'config')).toHaveLength(1)
  })

  it('is not refreshed when a signed-out reader makes a change', async () => {
    await account.signOut()
    f.auth.calls.length = 0
    f.clock.advance(3_600_000)
    account.cloud().saved(story('a'), true)
    await account.idle()
    expect(f.auth.calls).toEqual([])
  })
})

describe('signing out and deleting, in what order and with what left', () => {
  let f: Fixture
  let account: AccountManager

  beforeEach(async () => {
    f = fixture()
    account = f.create()
    f.phone.topics = new Set(['art'])
    f.phone.saved = [story('kept')]
    await f.signIn(account)
    f.auth.calls.length = 0
    f.cloud.calls.length = 0
  })

  it('asks the service to delete while the session is still on the phone, and wipes it only afterwards', async () => {
    let heldWhenAsked: string | null = null
    let messageWhenAsked = ''
    f.auth.onDelete = () => {
      heldWhenAsked = f.store.text
      messageWhenAsked = account.store.getState().message ?? ''
    }
    await account.deleteAccount()
    expect(heldWhenAsked).toContain('access-1')
    // The reader is told it is under way while it happens.
    expect(messageWhenAsked).toBe('account_deleting')
    expect(f.store.text === null || !f.store.text.includes('access-1')).toBe(true)
    expect(f.store.text === null || !f.store.text.includes('refresh-1')).toBe(true)
  })

  it('wipes the session, the secret, what was waiting and what was last synced, but keeps who the phone last merged with', async () => {
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('waiting'), true)
    account.cloud().interests(new Set(['math']))
    await account.idle()
    expect(f.store.queue).toHaveLength(1)
    expect(f.store.json?.d).toBe(true)
    f.cloud.failure = undefined
    await account.deleteAccount()
    expect(f.store.json).toEqual({ schema: 1, s: USER_A, ls: 0, d: false, queue: [] })
    expect(account.store.getState()).toEqual({ status: 'signedOut', name: '', email: '', message: 'account_deleted', busy: false, deleting: false })
  })

  it('leaves everything in place when the service says no', async () => {
    f.auth.deleteFailure = new Rejected(400)
    const before = f.store.text
    await account.deleteAccount()
    expect(f.store.text).toBe(before)
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: 'account_delete_failed' })
  })

  it('leaves the reader\u2019s own data alone, whether the account was deleted or only left', async () => {
    await account.deleteAccount()
    expect(f.phone.topics).toEqual(new Set(['art']))
    expect(ids(f.phone.saved)).toEqual(['kept'])
    const g = fixture()
    g.phone.topics = new Set(['art'])
    const other = g.create()
    await g.signIn(other)
    await other.signOut()
    expect(g.phone.topics).toEqual(new Set(['art']))
  })

  it('clears the session on signing out even when the network is down', async () => {
    f.auth.configFailure = new AccountError('offline')
    f.clock.advance(11 * 60_000)
    await account.signOut()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_signed_out' })
    expect(f.store.json?.session).toBeUndefined()
    expect(f.store.text).not.toContain('access-1')
    // The service could not be told, and nobody waited for it.
    expect(f.auth.calls).toEqual(['config'])
  })

  it('clears the session on signing out even when telling the service fails', async () => {
    f.auth.logout = async () => {
      throw new AccountError('offline')
    }
    await account.signOut()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_signed_out' })
    expect(f.store.text).not.toContain('access-1')
  })

  it('tells the service the session is over after it has been forgotten here, with the token that was held', async () => {
    let held: string | null = 'unset'
    const logout = f.auth.logout.bind(f.auth)
    f.auth.logout = async (config, access) => {
      held = f.store.text
      return logout(config, access)
    }
    await account.signOut()
    expect(f.auth.calls).toEqual(['logout:access-1'])
    expect(held === null || !(held as string).includes('access-1')).toBe(true)
  })

  it('clears the queue and the marker of unsent topics on signing out, and keeps who the phone last merged with', async () => {
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('waiting'), true)
    account.cloud().interests(new Set(['math']))
    await account.idle()
    f.cloud.failure = undefined
    await account.signOut()
    expect(f.store.json).toEqual({ schema: 1, s: USER_A, ls: 0, d: false, queue: [] })
  })

  it('removes the entry altogether when nothing is left to keep', async () => {
    const g = fixture()
    const one = g.create()
    await g.begin(one)
    await one.cancel()
    expect(g.store.text).toBeNull()
    expect(g.store.cleared).toBe(true)
  })

  it('says it again when signing out while signed out, and keeps nothing', async () => {
    await account.signOut()
    f.auth.calls.length = 0
    await account.signOut()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_signed_out' })
    expect(f.auth.calls).toEqual([])
  })

  it('is not confused by a deletion while a change is on its way out', async () => {
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('late'), true)
    await account.deleteAccount()
    await account.idle()
    expect(shape(account)).toEqual({ status: 'signedOut', busy: false, message: 'account_deleted' })
  })
})

describe('what is synced, and what is never', () => {
  let f: Fixture
  let account: AccountManager

  beforeEach(() => {
    f = fixture()
    account = f.create()
  })

  const saves = () => f.cloud.calls.filter((call) => call.startsWith('save:'))
  const adds = () => f.cloud.calls.filter((call) => call.startsWith('add:'))

  it('lets topics changed on the phone win, then the account\u2019s, then the phone\u2019s', async () => {
    // Changed on the phone and not yet confirmed (dirty): the phone's win and are uploaded.
    await f.signIn(account)
    f.cloud.failure = new AccountError('offline')
    account.cloud().interests(new Set(['math']))
    await account.idle()
    f.cloud.failure = undefined
    f.cloud.heldTopics = new Set(['history'])
    f.phone.topics = new Set(['math'])
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(saves()).toEqual(['save:[math]'])
    expect(f.landing.topics).toEqual([])
    // Now nothing is waiting: the account's differ and come to the phone.
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(saves()).toEqual([])
    expect(f.landing.topics).toEqual([new Set(['history'])])
    // The account has none: the phone's are uploaded.
    f.cloud.heldTopics = new Set()
    f.landing.topics.length = 0
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(saves()).toEqual(['save:[math]'])
    expect(f.landing.topics).toEqual([])
    // Neither has any: nothing moves.
    f.phone.topics = new Set()
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(saves()).toEqual([])
    expect(f.landing.topics).toEqual([])
  })

  it('uploads only the stories the account does not hold, each once', async () => {
    f.phone.saved = [story('a'), story('b'), story('a'), story('c')]
    f.cloud.heldBookmarks = [story('b')]
    await f.signIn(account)
    expect(adds()).toEqual(['add:[a, c]'])
    expect(f.landing.saved).toEqual([['b']])
  })

  it('sends nothing when the account already holds everything the phone has', async () => {
    f.phone.saved = [story('a')]
    f.cloud.heldBookmarks = [story('a')]
    await f.signIn(account)
    expect(adds()).toEqual([])
  })

  it('brings the account\u2019s stories to the phone even when it uploads nothing', async () => {
    f.cloud.heldBookmarks = [story('x'), story('y')]
    await f.signIn(account)
    expect(f.landing.saved).toEqual([['x', 'y']])
  })

  it('holds a new account to the same rules as the old one after its first sync, as the native app did', async () => {
    await f.begin(account)
    await account.complete(f.callback('a'.repeat(36)))
    await account.signOut()
    f.phone.topics = new Set(['art'])
    f.phone.saved = [story('private')]
    f.auth.next = tokens('access-b', 'refresh-b', USER_B, f.clock() + 3_600_000)
    f.auth.refreshed = tokens('access-b2', 'refresh-b2', USER_B, f.clock() + 7_200_000)
    f.cloud.calls.length = 0
    account = f.create()
    await f.begin(account)
    await account.complete(f.callback('b'.repeat(36)))
    await account.idle()
    // The first sync of another account uploads nothing of the phone's...
    expect(saves()).toEqual([])
    expect(adds()).toEqual([])
    // ...and the phone is now merged with that account, so the next one treats the phone's data as its own.
    expect(f.store.json?.s).toBe(USER_B)
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(saves()).toEqual(['save:[art]'])
    expect(adds()).toEqual(['add:[private]'])
  })

  it('takes whoever signs in first as the one the phone is merged with', async () => {
    await f.signIn(account)
    expect(f.store.json?.s).toBe(USER_A)
  })

  it('syncs when the app comes to the front after a while, and not before', async () => {
    await f.signIn(account)
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS)
    await account.resume()
    expect(f.cloud.calls).toEqual([])
    f.clock.advance(1)
    await account.resume()
    expect(f.cloud.calls).toEqual(['topics', 'bookmarks'])
    // The sync was just done.
    f.cloud.calls.length = 0
    await account.resume()
    expect(f.cloud.calls).toEqual([])
    expect(STALE_MS).toBe(10 * 60_000)
  })

  it('does not sync a signed-out reader when the app comes to the front', async () => {
    f.clock.advance(STALE_MS * 10)
    await account.resume()
    expect(f.auth.calls).toEqual([])
    expect(f.cloud.calls).toEqual([])
  })

  it('remembers when it last synced across a restart, so that a restart does not sync again at once', async () => {
    await f.signIn(account)
    f.cloud.calls.length = 0
    const restarted = f.create()
    await restarted.restore()
    await restarted.resume()
    expect(f.cloud.calls).toEqual([])
    f.clock.advance(STALE_MS + 1)
    await restarted.resume()
    expect(f.cloud.calls).toEqual(['topics', 'bookmarks'])
  })

  it('shows the work while it is done and not after, and a failure until the next change', async () => {
    await f.signIn(account)
    f.cloud.failure = new AccountError('offline')
    f.clock.advance(STALE_MS + 1)
    const before = f.statuses.length
    await account.resume()
    expect(uniq(f.statuses.slice(before).map((s) => ({ busy: s.busy, message: s.message })))).toEqual([
      { busy: true, message: null },
      { busy: false, message: 'account_sync_failed' },
    ])
    f.cloud.failure = undefined
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: null })
  })

  it('stops delivering to the feed when it stops listening, and brings the account up to date when it starts', async () => {
    f.cloud.heldTopics = new Set(['space'])
    await f.signIn(account)
    expect(f.landing.topics).toHaveLength(1)
    account.cloud().listen(null)
    f.clock.advance(STALE_MS + 1)
    f.phone.topics = new Set(['art'])
    await account.resume()
    expect(f.landing.topics).toHaveLength(1)
    f.clock.advance(STALE_MS + 1)
    f.cloud.calls.length = 0
    account.cloud().listen(f.landing)
    await account.idle()
    // Listening again is a reason to sync, as the feed has not heard for a while.
    expect(f.cloud.calls).toEqual(['topics', 'bookmarks'])
    expect(f.landing.topics).toHaveLength(2)
  })

  it('serves one feed at a time: the sink that listens last is the one that hears', async () => {
    f.cloud.heldTopics = new Set(['space'])
    const second = new Landing()
    account.cloud().listen(second)
    await f.signIn(account)
    expect(f.landing.topics).toEqual([])
    expect(second.topics).toEqual([new Set(['space'])])
  })

  it('is the same Cloud every time it is asked for', () => {
    expect(account.cloud()).toBe(account.cloud())
  })

  it('stays consistent when the phone cannot tell what it has', async () => {
    const g = fixture({
      localTopics: () => {
        throw new Error('storage failed')
      },
    })
    const one = g.create()
    await g.signIn(one)
    // The first sync could not read the topics: the reader is signed in, told, and not stuck waiting.
    expect(shape(one)).toEqual({ status: 'signedIn', busy: false, message: 'account_sync_failed' })
    expect(g.store.json?.session).toBeDefined()
  })

  it('stays consistent when the feed throws as it is handed the account\u2019s data', async () => {
    f.cloud.heldTopics = new Set(['space'])
    account.cloud().listen({
      cloudInterests: () => {
        throw new Error('feed failed')
      },
      cloudSaved: () => undefined,
    })
    await f.signIn(account)
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: 'account_sync_failed' })
  })

  it('reads the phone\u2019s topics and stories asynchronously too', async () => {
    const g = fixture({ localTopics: async () => new Set(['art']), localSaved: async () => [story('mine')] })
    const one = g.create()
    await g.signIn(one)
    expect(g.cloud.calls).toContain('save:[art]')
    expect(g.cloud.calls).toContain('add:[mine]')
  })
})

describe('changes made while signed in', () => {
  let f: Fixture
  let account: AccountManager

  beforeEach(async () => {
    f = fixture()
    account = f.create()
    await f.signIn(account)
    f.cloud.calls.length = 0
    f.cloud.tokensSeen.length = 0
  })

  it('are sent one after the other, never two at once', async () => {
    let active = 0
    let most = 0
    const slow = async <T>(value: Promise<T>): Promise<T> => {
      active++
      most = Math.max(most, active)
      await flush()
      active--
      return value
    }
    const cloud = f.cloud
    const original = {
      topics: cloud.topics.bind(cloud),
      saveTopics: cloud.saveTopics.bind(cloud),
      bookmarks: cloud.bookmarks.bind(cloud),
      addBookmarks: cloud.addBookmarks.bind(cloud),
      removeBookmark: cloud.removeBookmark.bind(cloud),
    }
    cloud.topics = (c, t) => slow(original.topics(c, t))
    cloud.saveTopics = (c, t, s) => slow(original.saveTopics(c, t, s))
    cloud.bookmarks = (c, t) => slow(original.bookmarks(c, t))
    cloud.addBookmarks = (c, t, s) => slow(original.addBookmarks(c, t, s))
    cloud.removeBookmark = (c, t, i) => slow(original.removeBookmark(c, t, i))
    account.cloud().saved(story('a'), true)
    account.cloud().interests(new Set(['art']))
    account.cloud().saved(story('b'), true)
    account.cloud().saved(story('a'), false)
    f.clock.advance(STALE_MS + 1)
    void account.resume()
    await account.idle()
    expect(most).toBe(1)
    expect(cloud.calls.slice(0, 4)).toEqual(['add:[a]', 'save:[art]', 'add:[b]', 'remove:a'])
  })

  it('wait for the sync that is under way, and are not lost', async () => {
    f.clock.advance(STALE_MS + 1)
    const syncing = account.resume()
    account.cloud().saved(story('during'), true)
    await syncing
    await account.idle()
    expect(f.cloud.calls).toContain('add:[during]')
    expect(f.cloud.calls.indexOf('bookmarks')).toBeLessThan(f.cloud.calls.indexOf('add:[during]'))
  })

  it('keep the story as the account takes it: no link and no picture, in the sealed store', async () => {
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('a', { image: 'https://example.com/i.jpg', source: 'BBC', publishedAt: 5, sig: 'f'.repeat(32) }), true)
    await account.idle()
    expect(f.store.queue).toEqual([{ id: 'a', t: 'Headline a', c: 'Body of a with enough words.', g: 'news' }])
    expect(f.store.text).not.toMatch(/https:\/\/example\.com|BBC/)
  })

  it('stop at the first one that cannot be sent, keep it and the rest, and send them in order next time', async () => {
    const original = f.cloud.addBookmarks.bind(f.cloud)
    let failB = true
    f.cloud.addBookmarks = async (c, t, stories) => {
      if (failB && stories[0].id === 'b') {
        f.cloud.calls.push('add:[b]')
        throw new AccountError('offline')
      }
      return original(c, t, stories)
    }
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('a'), true)
    account.cloud().saved(story('b'), true)
    account.cloud().saved(story('c'), true)
    await account.idle()
    f.cloud.failure = undefined
    f.cloud.calls.length = 0
    account.cloud().saved(story('d'), true)
    await account.idle()
    // a went, b failed, and c and d are still waiting behind it.
    expect(f.cloud.calls).toEqual(['add:[a]', 'add:[b]'])
    expect(f.store.queue.map((op) => op.id)).toEqual(['b', 'c', 'd'])
    failB = false
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(f.cloud.calls.slice(0, 3)).toEqual(['add:[b]', 'add:[c]', 'add:[d]'])
    expect(f.store.queue).toEqual([])
  })

  it('drop the ones the account refuses for good and go on with the others', async () => {
    const original = f.cloud.addBookmarks.bind(f.cloud)
    f.cloud.addBookmarks = async (c, t, stories) => {
      await original(c, t, stories)
      if (stories[0].id === 'bad') throw new Rejected(422)
    }
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('bad'), true)
    account.cloud().saved(story('good'), true)
    await account.idle()
    f.cloud.failure = undefined
    f.cloud.calls.length = 0
    f.clock.advance(STALE_MS + 1)
    await account.resume()
    expect(f.cloud.calls.slice(0, 2)).toEqual(['add:[bad]', 'add:[good]'])
    expect(f.store.queue).toEqual([])
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: null })
  })

  it('keep the ones the service only asked to wait for: a busy service is not a refusal', async () => {
    for (const failure of [new AccountError('Try again later'), new AccountError('Service unavailable')]) {
      f.cloud.failure = failure
      account.cloud().saved(story('x'), true)
      await account.idle()
      expect(f.store.queue.map((op) => op.id)).toEqual(['x'])
      f.cloud.failure = undefined
      account.cloud().saved(story('x'), false)
      await account.idle()
      expect(f.store.queue).toEqual([])
    }
  })

  it('are tried again with a fresh token once, and kept when that is refused too', async () => {
    let tries = 0
    f.cloud.addBookmarks = async (_c, t, stories) => {
      tries++
      f.cloud.calls.push(`add:[${ids(stories).join(', ')}]`)
      f.cloud.tokensSeen.push(t.access)
      throw new Unauthorized()
    }
    account.cloud().saved(story('q'), true)
    await account.idle()
    // Once with the held token, once with the new one, and no more.
    expect(tries).toBe(2)
    expect(f.cloud.tokensSeen).toEqual(['access-1', 'access-2'])
    expect(f.store.queue.map((op) => op.id)).toEqual(['q'])
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: 'account_sync_failed' })
  })

  it('collapse by story: the last word about one story is the only one kept, and its place is the end', async () => {
    f.cloud.failure = new AccountError('offline')
    account.cloud().saved(story('a'), true)
    account.cloud().saved(story('b'), true)
    account.cloud().saved(story('a'), false)
    account.cloud().saved(story('b'), true)
    await account.idle()
    expect(f.store.queue.map((op) => `${op.t === undefined ? '-' : '+'}${op.id}`)).toEqual(['-a', '+b'])
  })

  it('are limited to 400, and the oldest go first', async () => {
    f.cloud.failure = new AccountError('offline')
    for (let index = 0; index < 405; index++) account.cloud().saved(story(`s${index}`), true)
    await account.idle()
    const queue = f.store.queue
    expect(queue).toHaveLength(400)
    expect(queue[0].id).toBe('s5')
    expect(queue[399].id).toBe('s404')
  })

  it('are about topics: unconfirmed until sent, and sent as the reader chose them', async () => {
    account.cloud().interests(new Set(['math', 'art']))
    await account.idle()
    expect(f.cloud.calls).toEqual(['save:[art, math]'])
    expect(f.store.json?.d).toBe(false)
    f.cloud.failure = new AccountError('offline')
    account.cloud().interests(new Set(['space']))
    await account.idle()
    expect(f.store.json?.d).toBe(true)
    expect(shape(account)).toEqual({ status: 'signedIn', busy: false, message: 'account_sync_failed' })
  })

  it('do not change when the reader\u2019s set is changed after it was handed over', async () => {
    const chosen = new Set(['art'])
    account.cloud().interests(chosen)
    chosen.add('math')
    await account.idle()
    expect(f.cloud.calls).toEqual(['save:[art]'])
  })

  it('wait out their turn and are then ignored if the reader has left in the meantime', async () => {
    const leaving = account.signOut()
    account.cloud().saved(story('late'), true)
    await leaving
    await account.idle()
    expect(f.cloud.calls).toEqual([])
    expect(f.store.queue).toEqual([])
  })
})

describe('nothing is said about the account anywhere but to the reader', () => {
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const

  it('writes nothing to the console, in any of its journeys', async () => {
    const spies = methods.map((method) => jest.spyOn(console, method).mockImplementation(() => undefined))
    const journey = async (setup: (g: Fixture) => void, run: (g: Fixture, account: AccountManager) => Promise<void>) => {
      const g = fixture()
      setup(g)
      await run(g, g.create())
    }
    await journey(
      () => undefined,
      async (g, account) => {
        await g.signIn(account)
        account.cloud().saved(story('a'), true)
        account.cloud().interests(new Set(['art']))
        await account.signOut()
      },
    )
    await journey(
      (g) => {
        g.auth.exchangeFailure = new Rejected(400)
      },
      async (g, account) => {
        await g.begin(account)
        await account.complete(g.callback('a'.repeat(36)))
      },
    )
    await journey(
      (g) => {
        g.auth.checkFailure = new AccountError('down')
      },
      async (_g, account) => account.signIn(),
    )
    await journey(
      (g) => {
        g.store.writeFailure = new StorageError()
      },
      async (g, account) => {
        await g.begin(account)
        await account.complete(g.callback('a'.repeat(36)))
      },
    )
    await journey(
      (g) => {
        g.store.text = '{broken'
      },
      async (_g, account) => account.restore(),
    )
    await journey(
      () => undefined,
      async (g, account) => {
        await g.signIn(account)
        g.auth.deleteFailure = new AccountError('offline')
        await account.deleteAccount()
        g.auth.deleteFailure = undefined
        await account.deleteAccount()
      },
    )
    await journey(
      (g) => {
        g.browser.queue(new Error('no browser'))
      },
      async (_g, account) => account.signIn(),
    )
    await journey(
      () => undefined,
      async (g, account) => {
        await g.signIn(account)
        g.cloud.failure = new AccountError('offline')
        g.clock.advance(STALE_MS + 1)
        await account.resume()
        g.auth.refreshFailure = new Rejected(400)
        g.clock.advance(3_600_000)
        account.cloud().saved(story('b'), true)
        await account.idle()
      },
    )
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    for (const spy of spies) spy.mockRestore()
  })
})
