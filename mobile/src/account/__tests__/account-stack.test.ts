import { makeStory, type Story } from '@/data/story'
import { fakeClock } from '@/platform/clock'
import { request as realRequest } from '@/platform/http'
import { fakeFetch, setVariant } from '@/test/helpers'
import { createAccountManager, STALE_MS, type AuthSessionResult } from '../account-manager'
import type { Tokens } from '../auth-api'
import { Rejected, Unauthorized } from '../errors'
import { challenge, verifier } from '../pkce'
import { createSupabase } from '../supabase'
import { ACCOUNT_KEY } from '../token-store'
import { createStack } from './fake-stack'
import { ANON_KEY, ids, Landing, memorySecrets, PROJECT, SCHEME, SITE, story } from './helpers'

/**
 * The journeys of the native app's AccountLocalStackTest, against an account service in memory instead of a real GoTrue, PostgREST and
 * Postgres. Everything of the app runs for real: the manager, the client, the transport (platform/http) and the sealed store; only the
 * far end of the network is a fake. (account-local-stack.test.ts runs the same journeys against the real stack when there is one.)
 */
function world() {
  setVariant('preview')
  const clock = fakeClock()
  const stack = createStack({ project: PROJECT, site: SITE, anonKey: ANON_KEY, clock })
  const network = fakeFetch(stack.routes)

  function phone(topics: string[] = [], saved: Story[] = []) {
    const mine = { topics: new Set(topics), saved: [...saved] }
    const landing = new Landing()
    const secrets = memorySecrets()
    const script: AuthSessionResult[] = []
    const opened: string[] = []
    let email = ''
    const account = createAccountManager({
      secrets,
      clock,
      openAuthSession: async (url) => {
        opened.push(url)
        const scripted = script.shift()
        if (scripted) return scripted
        // Google says yes, and its code, made for the challenge in the address, comes back through the website.
        const code = stack.codeFor(email, new URL(url).searchParams.get('code_challenge') as string)
        return { type: 'success', url: stack.callbackFor(code, SCHEME) }
      },
      localTopics: () => mine.topics,
      localSaved: () => mine.saved,
    })
    account.cloud().listen(landing)
    const sealed = (): Record<string, unknown> | null => {
      const text = secrets.values.get(ACCOUNT_KEY)
      return text === undefined ? null : (JSON.parse(text) as Record<string, unknown>)
    }
    return {
      account,
      mine,
      landing,
      secrets,
      opened,
      script,
      sealed,
      async signInAs(next: string) {
        email = next
        await account.signIn()
        await account.idle()
      },
      /** The session the phone holds, read from its sealed store the way the app does after a restart. */
      held(): Tokens {
        const session = sealed()?.session as { a: string; r: string; e: number; u: string; m: string; n: string }
        return { access: session.a, refresh: session.r, expiresAt: session.e, userId: session.u, email: session.m, name: session.n }
      },
    }
  }
  return { clock, stack, network, phone }
}

const email = (() => {
  let count = 0
  return () => `reader-${++count}@example.test`
})()

const sorted = (values: Iterable<string>) => [...values].sort()
const bookmarkIds = (user: { bookmarks: { card_id: string }[] } | undefined) => sorted((user?.bookmarks ?? []).map((row) => row.card_id))
const saved = (id: string) => story(id, { category: 'science' })

describe('the service offers Google, and the key is required', () => {
  it('answers the settings call for the project key and refuses it without', async () => {
    const w = world()
    const supabase = createSupabase({ clock: w.clock })
    const config = await supabase.config()
    expect(config).toEqual({ url: PROJECT, anonKey: ANON_KEY })
    await expect(supabase.check(config)).resolves.toBeUndefined()
    expect((await realRequest(`${PROJECT}/auth/v1/settings`)).status).toBe(401)
    w.stack.google = false
    await expect(supabase.check(config)).rejects.toThrow('Google sign-in is not enabled')
  })
})

describe('signing in, with the real code of the account, client and transport', () => {
  it('creates the account and uploads what is on the phone', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science', 'space'], [saved('story-a'), saved('story-b')])
    await phone.signInAs(mail)
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedIn', email: mail, message: null, busy: false })
    // The address the reader was sent to is one the service accepts and sends on to Google.
    const asked = new URL(phone.opened[0])
    expect(asked.origin).toBe(PROJECT)
    expect(asked.pathname).toBe('/auth/v1/authorize')
    expect(asked.searchParams.get('provider')).toBe('google')
    expect(asked.searchParams.get('code_challenge_method')).toBe('s256')
    expect(asked.searchParams.get('redirect_to')).toBe(`${SITE}/auth/app?app=${SCHEME}`)
    const user = w.stack.user(mail)
    expect(user?.topics).toEqual(['science', 'space'])
    expect(bookmarkIds(user)).toEqual(['story-a', 'story-b'])
    // The profile row says the reader has chosen topics.
    expect(user?.hasOnboarded).toBe(true)
    // The sealed store holds a session, and no verifier is left behind.
    expect(phone.sealed()).toMatchObject({ session: { u: user?.id, m: mail } })
    expect(phone.sealed()?.v).toBeUndefined()
  })

  it('gives the same account on another phone its topics and stories', async () => {
    const w = world()
    const mail = email()
    await w.phone(['science', 'space'], [saved('story-a'), saved('story-b')]).signInAs(mail)
    const second = w.phone()
    await second.signInAs(mail)
    expect(second.account.store.getState().status).toBe('signedIn')
    expect(second.landing.topics).toEqual([new Set(['science', 'space'])])
    expect(second.landing.saved).toEqual([['story-b', 'story-a']])
    // The account kept no link or picture, so a restored story reads as text only.
    const [restored] = [makeStory({ id: 'story-a', title: 'Headline story-a', content: 'Body of story-a with enough words.', category: 'science' })]
    expect(restored.sourceUrl).toBe('')
    expect(second.landing.saved[0]).toHaveLength(2)
  })

  it('restores each saved story with its text and category and nothing more', async () => {
    const w = world()
    const mail = email()
    await w.phone([], [saved('story-a')]).signInAs(mail)
    const stories: Story[] = []
    const second = w.phone()
    second.account.cloud().listen({ cloudInterests: () => undefined, cloudSaved: (held) => stories.push(...held) })
    await second.signInAs(mail)
    expect(stories).toEqual([makeStory({ id: 'story-a', title: 'Headline story-a', content: 'Body of story-a with enough words.', category: 'science' })])
  })

  it('sends the changes made while signed in to the account', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [saved('story-a')])
    await phone.signInAs(mail)
    const user = w.stack.user(mail)
    phone.account.cloud().saved(saved('story-c'), true)
    await phone.account.idle()
    expect(bookmarkIds(user)).toEqual(['story-a', 'story-c'])
    phone.account.cloud().saved(saved('story-a'), false)
    await phone.account.idle()
    expect(bookmarkIds(user)).toEqual(['story-c'])
    phone.account.cloud().interests(new Set(['technology', 'math']))
    await phone.account.idle()
    expect(user?.topics).toEqual(['math', 'technology'])
    // Nothing is reported as failed.
    expect(phone.account.store.getState().message).toBeNull()
  })

  it('keeps changes made while the network is down, and sends them when it is back', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [])
    await phone.signInAs(mail)
    w.stack.down = true
    phone.account.cloud().saved(saved('offline-1'), true)
    // The reader chose new topics: the phone keeps them, and the account is told.
    phone.mine.topics = new Set(['art'])
    phone.account.cloud().interests(new Set(['art']))
    await phone.account.idle()
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedIn', message: 'account_sync_failed' })
    expect(bookmarkIds(w.stack.user(mail))).toEqual([])
    w.stack.down = false
    w.clock.advance(STALE_MS + 1)
    await phone.account.resume()
    expect(bookmarkIds(w.stack.user(mail))).toEqual(['offline-1'])
    expect(w.stack.user(mail)?.topics).toEqual(['art'])
    expect(phone.account.store.getState().message).toBeNull()
  })

  it('does not mind a story being saved twice', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone()
    await phone.signInAs(mail)
    const supabase = createSupabase({ clock: w.clock })
    const config = await supabase.config()
    const tokens = phone.held()
    await supabase.addBookmarks(config, tokens, [saved('story-a')])
    await supabase.addBookmarks(config, tokens, [saved('story-a'), saved('story-b')])
    // The repeat is ignored: not refused, and not duplicated.
    expect(bookmarkIds(w.stack.user(mail))).toEqual(['story-a', 'story-b'])
    expect(ids(await supabase.bookmarks(config, tokens)).sort()).toEqual(['story-a', 'story-b'])
  })

  it('never shows or changes one account\u2019s data to another', async () => {
    const w = world()
    const first = email()
    const second = email()
    const owner = w.phone(['science'], [saved('story-a')])
    await owner.signInAs(first)
    const other = w.phone(['art'], [saved('story-z')])
    await other.signInAs(second)
    const ownerId = w.stack.user(first)?.id as string
    expect(w.stack.user(second)?.id).not.toBe(ownerId)
    const supabase = createSupabase({ clock: w.clock })
    const config = await supabase.config()
    const otherTokens = other.held()
    // A reader sees only their own saved stories and topics.
    expect(ids(await supabase.bookmarks(config, otherTokens))).toEqual(['story-z'])
    expect([...(await supabase.topics(config, otherTokens))]).toEqual(['art'])
    await supabase.removeBookmark(config, otherTokens, 'story-a')
    // Removing someone else's story removes nothing.
    expect(bookmarkIds(w.stack.user(first))).toEqual(['story-a'])
    // The database itself refuses a row that names another reader, whatever the app sends.
    const forged = await realRequest(`${PROJECT}/rest/v1/bookmarks`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${otherTokens.access}`, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify([{ user_id: ownerId, card_id: 'story-forged', card_title: 'x' }]),
    })
    expect(forged.status).toBe(403)
    expect(bookmarkIds(w.stack.user(first))).toEqual(['story-a'])
    // And without signing in at all nothing can be read.
    const anonymous = await realRequest(`${PROJECT}/rest/v1/bookmarks?select=card_id`, { headers: { apikey: ANON_KEY } })
    expect(JSON.parse(anonymous.text)).toEqual([])
  })

  it('exchanges a code only once and only with its verifier', async () => {
    const w = world()
    const supabase = createSupabase({ clock: w.clock })
    const config = await supabase.config()
    const wrong = verifier()
    const right = verifier()
    const code = w.stack.codeFor(email(), await challenge(right))
    const refused = await supabase.exchange(config, code, wrong).catch((error: Error) => error)
    // A code must not be exchanged with another verifier.
    expect(refused).toBeInstanceOf(Rejected)
    expect((refused as Rejected).status).toBeGreaterThanOrEqual(400)
    expect((refused as Rejected).status).toBeLessThan(500)
    const second = w.stack.codeFor(email(), await challenge(right))
    const tokens = await supabase.exchange(config, second, right)
    expect(tokens.userId).toMatch(/^[0-9a-f-]{36}$/)
    expect(tokens.expiresAt).toBeGreaterThan(w.clock() + 30 * 60_000)
    // A code must not be used twice.
    await expect(supabase.exchange(config, second, right)).rejects.toBeInstanceOf(Rejected)
  })

  it('tells an expired access token apart from a refused change', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [saved('story-a')])
    await phone.signInAs(mail)
    const userId = w.stack.user(mail)?.id as string
    const supabase = createSupabase({ clock: w.clock })
    const config = await supabase.config()
    const expired = { ...phone.held(), access: w.stack.expiredToken(userId) }
    const refused = await supabase.topics(config, expired).catch((error: Error) => error)
    expect(refused).toBeInstanceOf(Unauthorized)
    expect((refused as Unauthorized).status).toBe(401)
    const malformed = await supabase.bookmarks(config, { ...phone.held(), access: 'not-a-token' }).catch((error: Error) => error)
    expect(malformed).toBeInstanceOf(Rejected)
    expect([400, 401]).toContain((malformed as Rejected).status)
  })

  it('refreshes a session that has run out, and sends the change with the new token', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [])
    await phone.signInAs(mail)
    const before = phone.secrets.values.get(ACCOUNT_KEY)
    w.clock.advance(2 * 3_600_000)
    phone.account.cloud().saved(saved('story-late'), true)
    await phone.account.idle()
    // The change was sent with a freshly issued token.
    expect(bookmarkIds(w.stack.user(mail))).toEqual(['story-late'])
    // The sealed session was replaced.
    expect(phone.secrets.values.get(ACCOUNT_KEY)).not.toBe(before)
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedIn', message: null })
  })

  it('ends cleanly when the session was revoked elsewhere, and tells the reader to sign in again', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [saved('story-a')])
    await phone.signInAs(mail)
    // Signing out everywhere (as the website's account page would) makes every refresh token stop working.
    const out = await realRequest(`${PROJECT}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${phone.held().access}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(out.status).toBe(204)
    w.clock.advance(2 * 3_600_000)
    phone.account.cloud().saved(saved('story-b'), true)
    await phone.account.idle()
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_expired' })
    // The dead session is no longer kept.
    expect(phone.sealed()?.session).toBeUndefined()
    // Nothing reached the account.
    expect(bookmarkIds(w.stack.user(mail))).toEqual(['story-a'])
  })

  it('revokes this phone\u2019s session on signing out and forgets it', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [])
    await phone.signInAs(mail)
    const held = phone.held()
    await phone.account.signOut()
    expect(phone.account.store.getState().status).toBe('signedOut')
    // No token is kept on the phone.
    const text = phone.secrets.values.get(ACCOUNT_KEY) ?? ''
    expect(text).not.toContain(held.access)
    expect(text).not.toContain(held.refresh)
    expect(text).not.toContain('"session"')
    // The old refresh token is dead.
    const supabase = createSupabase({ clock: w.clock })
    const refused = await supabase.refresh(await supabase.config(), held.refresh).catch((error: Error) => error)
    expect(refused).toBeInstanceOf(Rejected)
    expect([400, 401, 403]).toContain((refused as Rejected).status)
  })

  it('deletes the account through the website, with its data and nobody else\u2019s', async () => {
    const w = world()
    const first = email()
    const second = email()
    const leaving = w.phone(['science', 'space'], [saved('story-a'), saved('story-b')])
    await leaving.signInAs(first)
    const staying = w.phone(['art'], [saved('story-z')])
    await staying.signInAs(second)
    const held = leaving.held()
    expect(bookmarkIds(w.stack.user(first))).toEqual(['story-a', 'story-b'])
    await leaving.account.deleteAccount()
    expect(leaving.account.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_deleted' })
    // No token is kept on the phone.
    const text = leaving.secrets.values.get(ACCOUNT_KEY) ?? ''
    expect(text).not.toContain(held.access)
    expect(text).not.toContain(held.refresh)
    expect(text).not.toContain('"session"')
    // The account, its profile and its saved stories are gone.
    expect(w.stack.user(first)).toBeUndefined()
    // The phone's own topics are left alone.
    expect([...leaving.mine.topics]).toEqual(['science', 'space'])
    const supabase = createSupabase({ clock: w.clock })
    const refused = await supabase.refresh(await supabase.config(), held.refresh).catch((error: Error) => error)
    expect(refused).toBeInstanceOf(Rejected)
    // Another reader's topics and saved story are untouched, and they are still signed in.
    expect(w.stack.user(second)?.topics).toEqual(['art'])
    expect(bookmarkIds(w.stack.user(second))).toEqual(['story-z'])
    expect(staying.account.store.getState().status).toBe('signedIn')
    // The call to the website carried the reader's own token, and neither the project key nor an account id.
    const call = w.network.calls.find((made) => made.url === `${SITE}/api/account/delete`)
    expect(call?.headers.Authorization).toBe(`Bearer ${held.access}`)
    expect(call?.headers.apikey).toBeUndefined()
    expect(call?.body).toBe('{}')
  })

  it('stays signed in, and says so, when the account cannot be deleted right now', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [])
    await phone.signInAs(mail)
    w.stack.down = true
    await phone.account.deleteAccount()
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedIn', message: 'account_delete_failed', busy: false })
    expect(w.stack.user(mail)).toBeDefined()
    w.stack.down = false
    await phone.account.deleteAccount()
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_deleted' })
    expect(w.stack.user(mail)).toBeUndefined()
  })

  it('refreshes the session once when the website refuses the token of a deletion', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [])
    await phone.signInAs(mail)
    // The token runs out between the app's check and the website's.
    w.clock.advance(3_600_000 - 30_000)
    await phone.account.deleteAccount()
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_deleted' })
    expect(w.stack.user(mail)).toBeUndefined()
    expect(w.stack.log.filter((line) => line === 'POST /auth/v1/token')).toHaveLength(2)
  })

  it('leaves a reader who denied Google, or whose code failed, signed out with a message', async () => {
    const w = world()
    const phone = w.phone()
    phone.script.push({ type: 'success', url: `${SCHEME}://auth-callback/?error=access_denied` })
    await phone.account.signIn()
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_denied' })
    phone.script.push({ type: 'success', url: `${SCHEME}://auth-callback/?code=${'0'.repeat(36)}` })
    await phone.account.signIn()
    // A code the service never issued is refused.
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_failed' })
    phone.script.push({ type: 'cancel' })
    await phone.account.signIn()
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedOut', message: null })
  })

  it('does not sign in when the project has Google switched off, and does not open the browser', async () => {
    const w = world()
    w.stack.google = false
    const phone = w.phone()
    await phone.signInAs(email())
    expect(phone.account.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_unavailable' })
    expect(phone.opened).toEqual([])
  })
})

describe('what crosses the network', () => {
  it('goes to the website and the account project only, over https, and carries the tokens in headers only', async () => {
    const w = world()
    const mail = email()
    const phone = w.phone(['science'], [saved('story-a')])
    await phone.signInAs(mail)
    phone.account.cloud().saved(saved('story-b'), true)
    phone.account.cloud().interests(new Set(['art']))
    await phone.account.signOut()
    await phone.account.idle()
    expect(w.network.calls.length).toBeGreaterThan(8)
    const held = JSON.stringify(phone.secrets.values.get(ACCOUNT_KEY) ?? '')
    for (const call of w.network.calls) {
      const url = new URL(call.url)
      expect({ url: call.url, https: url.protocol }).toEqual({ url: call.url, https: 'https:' })
      expect([PROJECT, new URL(SITE).origin]).toContain(url.origin)
      // No token, verifier or code in an address.
      expect(call.url).not.toMatch(/access|refresh|verifier|bearer/i)
    }
    // The project key goes to the project, and the website never gets it.
    for (const call of w.network.calls.filter((made) => made.url.startsWith(SITE))) expect(call.headers.apikey).toBeUndefined()
    expect(held).not.toContain('Bearer')
  })

  it('never asks for what it does not use: no reading activity, no streak, no profile fields but the topics', async () => {
    const w = world()
    const phone = w.phone(['science'], [saved('story-a')])
    await phone.signInAs(email())
    phone.account.cloud().saved(saved('story-b'), true)
    await phone.account.idle()
    const paths = new Set(w.stack.log.map((line) => line.replace(/^\w+ /, '')))
    expect([...paths].filter((path) => path.startsWith('/rest/v1/')).sort()).toEqual(['/rest/v1/bookmarks', '/rest/v1/user_profiles'])
    expect([...paths].some((path) => /engagements|rpc|streak/.test(path))).toBe(false)
    const profileReads = w.network.calls.filter((call) => call.method === 'GET' && call.url.includes('/rest/v1/user_profiles'))
    for (const call of profileReads) expect(new URL(call.url).searchParams.get('select')).toBe('selected_topics')
  })
})
