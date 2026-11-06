import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { bearerToken, deleteOwnAccount } from '@shared/account-delete'
import { makeStory, type Story } from '@/data/story'
import { fakeClock } from '@/platform/clock'
import type { HttpResult, RequestOptions } from '@/platform/http'
import { createAccountManager, type AccountManager } from '../account-manager'
import type { Tokens } from '../auth-api'
import { Rejected, Unauthorized } from '../errors'
import { challenge, verifier } from '../pkce'
import { createSupabase } from '../supabase'
import { ACCOUNT_KEY } from '../token-store'
import { Landing, memorySecrets } from './helpers'

/**
 * The app's real account code against a real GoTrue, PostgREST, Kong and Postgres, loaded with supabase-schema.sql, instead of fakes.
 * It is opt-in: set PLAX_LOCAL_STACK to the .env written by scripts/auth-stack/up.ps1, with the stack running (see android/README.md,
 * "Testing sign-in against a real Supabase stack"). Without it every test here is skipped, so the normal run needs no Docker.
 *
 * The only things replaced are the ones that cannot run on a developer machine: the website's address lookup (answered in place) and
 * Google's consent screen. The one-time code Google would return is obtained from the stack, for the very code challenge the app made,
 * by e-mail, so the app's PKCE exchange, token handling, refresh, sync and sign-out all run against the real services. Deleting an
 * account is the one website call that needs the website: it runs against a local build of the website that uses this same stack when
 * PLAX_LOCAL_SITE is set (for example http://127.0.0.1:3128/news), and otherwise against the website's own code for it
 * (src/lib/account-delete.ts, which its route calls), run in this process.
 *
 * A port of AccountLocalStackTest.java of the native app.
 */
const stackFile = process.env.PLAX_LOCAL_STACK
const localSite = (process.env.PLAX_LOCAL_SITE ?? '').trim()
const describeStack = stackFile && stackFile.trim() !== '' ? describe : describe.skip

const PROJECT_HOST = 'plaxlocaltest.supabase.co'
const GATEWAY = 'http://127.0.0.1:54321'
const MAIL = 'http://127.0.0.1:54324'
const SCHEME = 'com.plaxlabs.news.preview'
const SITE = 'https://plax-rouge.vercel.app/news'
const VERIFY_LINK = /https?:\/\/[^\s"<>]+\/auth\/v1\/verify[^\s"<>]*/

interface Answer {
  status: number
  text: string
  location: string | null
}

const settings = (path: string): Record<string, string> => {
  const values: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const equals = line.indexOf('=')
    if (equals > 0) values[line.slice(0, equals).trim()] = line.slice(equals + 1).trim()
  }
  return values
}

/** One call made as a browser or the stack's owner would make it: redirects are never followed. */
async function raw(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Answer> {
  const response = await fetch(url, { ...init, redirect: 'manual' })
  return { status: response.status, text: await response.text(), location: response.headers.get('location') }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const enc = encodeURIComponent
const email = () => `reader-${randomUUID()}@example.test`
const story = (id: string) =>
  makeStory({ id, title: `Headline ${id}`, content: `Body of ${id} with enough words.`, category: 'science', source: 'Publisher', sourceUrl: `https://example.com/${id}` })
const idsOf = (stories: readonly Story[]) => new Set(stories.map((item) => item.id))
const setOf = (values: Iterable<string>) => new Set(values)

describeStack('against a real account stack', () => {
  jest.setTimeout(60_000)
  let anon = ''
  let service = ''
  let jwtSecret = ''
  const clock = fakeClock(Date.now())

  /** What the app's network code is given: everything it asks is answered by the stack, and nothing else is ever contacted. */
  async function appRequest(url: string, options: RequestOptions = {}): Promise<HttpResult> {
    const address = new URL(url)
    let target: string
    if (url === `${SITE}/api/auth-config`) {
      const text = JSON.stringify({ url: `https://${PROJECT_HOST}`, anonKey: anon })
      return { status: 200, ok: true, headers: { get: () => null }, text }
    }
    if (url === `${SITE}/api/account/delete`) {
      if (localSite === '') {
        // The website's own code for it, as its route runs it.
        const token = bearerToken(options.headers?.Authorization ?? null)
        const outcome = token ? await deleteOwnAccount(token, { url: GATEWAY, anonKey: anon, serviceKey: service }) : { status: 401, body: { error: 'unauthorized' } }
        return { status: outcome.status, ok: outcome.status === 200, headers: { get: () => null }, text: JSON.stringify(outcome.body) }
      }
      target = `${localSite}/api/account/delete`
    } else if (address.host === PROJECT_HOST) target = `${GATEWAY}${address.pathname}${address.search}`
    else throw new Error(`The account code contacted ${address.host}`)
    const response = await fetch(target, { method: options.method ?? 'GET', headers: options.headers, body: options.body, redirect: 'manual' })
    return { status: response.status, ok: response.ok, headers: response.headers, text: await response.text() }
  }

  const supabase = createSupabase({ request: appRequest, site: SITE, clock })

  /** What Google would return after consent: a one-time code bound to the challenge, delivered through the stack. */
  async function codeFor(mail: string, code: string): Promise<string> {
    await raw(`${MAIL}/api/v1/messages`, { method: 'DELETE' })
    const sent = await raw(`${GATEWAY}/auth/v1/otp?redirect_to=${enc(`${SITE}/auth/app?app=${SCHEME}`)}`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, create_user: true, code_challenge: code, code_challenge_method: 's256' }),
    })
    expect(sent.status).toBe(200)
    let link: string | null = null
    for (let attempt = 0; attempt < 80 && link === null; attempt++) {
      const found = JSON.parse((await raw(`${MAIL}/api/v1/search?query=${enc(`to:${mail}`)}`)).text) as { messages: { ID: string }[] }
      if (found.messages.length === 0) {
        await sleep(250)
        continue
      }
      const message = JSON.parse((await raw(`${MAIL}/api/v1/message/${found.messages[0].ID}`)).text) as { Text: string }
      const match = VERIFY_LINK.exec(message.Text)
      expect(match).not.toBeNull()
      link = (match as RegExpExecArray)[0].replace(/&amp;/g, '&').replace('http://localhost:54321', GATEWAY)
    }
    expect(link).not.toBeNull()
    const back = await raw(link as string)
    // The link answers with a redirect back to the website, which sends the browser on into the app.
    expect(back.status).toBe(303)
    const location = new URL(back.location as string)
    expect(location.host).toBe('plax-rouge.vercel.app')
    expect(location.pathname).toBe('/news/auth/app')
    expect(location.searchParams.get('app')).toBe(SCHEME)
    const result = location.searchParams.get('code')
    expect(result).not.toBeNull()
    return result as string
  }

  const rows = async (path: string): Promise<Record<string, unknown>[]> => {
    const answer = await raw(`${GATEWAY}/rest/v1/${path}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })
    expect(answer.status).toBe(200)
    return JSON.parse(answer.text) as Record<string, unknown>[]
  }
  const userId = async (mail: string): Promise<string> => {
    const profile = await rows(`user_profiles?email=eq.${enc(mail)}&select=id`)
    // One profile row was created by the database trigger.
    expect(profile).toHaveLength(1)
    return profile[0].id as string
  }
  const bookmarkIds = async (id: string) => setOf((await rows(`bookmarks?user_id=eq.${id}&select=card_id`)).map((row) => row.card_id as string))
  const storedTopics = async (id: string) => setOf(((await rows(`user_profiles?id=eq.${id}&select=selected_topics`))[0].selected_topics as string[]) ?? [])

  function expiredAccessToken(id: string): string {
    const part = (text: string) => Buffer.from(text).toString('base64url')
    const signed = `${part('{"alg":"HS256","typ":"JWT"}')}.${part(JSON.stringify({ sub: id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) - 3600 }))}`
    return `${signed}.${createHmac('sha256', jwtSecret).update(signed).digest('base64url')}`
  }

  /** One phone: its own sealed store, its own topics and saved stories, and the real account code. */
  class Phone {
    readonly secrets = memorySecrets()
    readonly landing = new Landing()
    readonly opened: string[] = []
    readonly account: AccountManager
    topics: Set<string>
    saved: Story[]
    readonly saves: Story[][] = []

    constructor(topics: string[], saved: Story[]) {
      this.topics = new Set(topics)
      this.saved = [...saved]
      this.account = createAccountManager({
        request: appRequest,
        secrets: this.secrets,
        clock,
        site: SITE,
        authScheme: SCHEME,
        openAuthSession: async (url) => {
          this.opened.push(url)
          const asked = new URL(url)
          expect(asked.host).toBe(PROJECT_HOST)
          // The address the app builds must be one the real service accepts and sends on to Google.
          const authorize = await raw(`${GATEWAY}${asked.pathname}${asked.search}`)
          expect(authorize.status).toBe(302)
          expect(authorize.location?.startsWith('https://accounts.google.com/')).toBe(true)
          // Google's consent screen cannot be driven here; the code it would hand back is issued for the same challenge.
          const code = await codeFor(this.next, asked.searchParams.get('code_challenge') as string)
          return { type: 'success', url: `${SCHEME}://auth-callback/?code=${code}` }
        },
        localTopics: () => this.topics,
        localSaved: () => this.saved,
      })
      this.account.cloud().listen(this.landing)
    }

    next = ''

    async signInAs(mail: string): Promise<void> {
      this.next = mail
      await this.account.signIn()
      await this.account.idle()
      expect(this.opened.length).toBeGreaterThan(0)
    }

    /** The session the phone is holding, read from its sealed store the way the app does after a restart. */
    held(): Tokens {
      const session = (JSON.parse(this.secrets.values.get(ACCOUNT_KEY) as string) as { session: { a: string; r: string; e: number; u: string; m: string; n: string } }).session
      return { access: session.a, refresh: session.r, expiresAt: session.e, userId: session.u, email: session.m, name: session.n }
    }
  }

  beforeAll(() => {
    const values = settings(stackFile as string)
    anon = values.ANON_KEY
    service = values.SERVICE_KEY
    jwtSecret = values.JWT_SECRET
    expect([anon, service, jwtSecret].every((value) => typeof value === 'string' && value !== '')).toBe(true)
  })

  it('offers Google, and the key is required', async () => {
    await supabase.check(await supabase.config())
    // The gateway must refuse a call without the project key.
    expect((await raw(`${GATEWAY}/auth/v1/settings`)).status).toBe(401)
  })

  it('creates the account on signing in and uploads what is on the phone', async () => {
    const mail = email()
    const phone = new Phone(['science', 'space'], [story('story-a'), story('story-b')])
    await phone.signInAs(mail)
    const state = phone.account.store.getState()
    expect(state.status).toBe('signedIn')
    expect(state.email).toBe(mail)
    // No sign-in problem is reported.
    expect(state.message).toBeNull()
    const id = await userId(mail)
    expect(await storedTopics(id)).toEqual(setOf(['science', 'space']))
    expect(await bookmarkIds(id)).toEqual(setOf(['story-a', 'story-b']))
    // The profile row says the reader has chosen topics.
    expect((await rows(`user_profiles?id=eq.${id}&select=has_onboarded`))[0].has_onboarded).toBe(true)
    // The sealed store holds a session and no verifier is left behind.
    const sealed = phone.secrets.values.get(ACCOUNT_KEY) as string
    expect(sealed).toContain('"session"')
    expect(sealed).not.toContain('"v":')
  })

  it('gives the same account on another phone its topics and stories', async () => {
    const mail = email()
    await new Phone(['science', 'space'], [story('story-a'), story('story-b')]).signInAs(mail)
    const second = new Phone([], [])
    await second.signInAs(mail)
    expect(second.account.store.getState().status).toBe('signedIn')
    expect(second.landing.topics.at(-1)).toEqual(setOf(['science', 'space']))
    expect(new Set(second.landing.saved.at(-1))).toEqual(setOf(['story-a', 'story-b']))
    const restored: Story[] = []
    const third = new Phone([], [])
    third.account.cloud().listen({ cloudInterests: () => undefined, cloudSaved: (held) => restored.push(...held) })
    await third.signInAs(mail)
    for (const held of restored) {
      expect(held.title).toBe(`Headline ${held.id}`)
      // A restored story keeps its text and category, and has no link or picture, as documented.
      expect(held.category).toBe('science')
      expect(held.sourceUrl === '' && held.image === '').toBe(true)
    }
  })

  it('sends the changes made while signed in to the account', async () => {
    const mail = email()
    const phone = new Phone(['science'], [story('story-a')])
    await phone.signInAs(mail)
    const id = await userId(mail)
    phone.account.cloud().saved(story('story-c'), true)
    await phone.account.idle()
    expect(await bookmarkIds(id)).toEqual(setOf(['story-a', 'story-c']))
    phone.account.cloud().saved(story('story-a'), false)
    await phone.account.idle()
    expect(await bookmarkIds(id)).toEqual(setOf(['story-c']))
    phone.account.cloud().interests(new Set(['technology', 'math']))
    await phone.account.idle()
    expect(await storedTopics(id)).toEqual(setOf(['math', 'technology']))
    expect(phone.account.store.getState().message).toBeNull()
  })

  it('does not mind a story being saved twice', async () => {
    const phone = new Phone([], [])
    const mail = email()
    await phone.signInAs(mail)
    const config = await supabase.config()
    const tokens = phone.held()
    await supabase.addBookmarks(config, tokens, [story('story-a')])
    await supabase.addBookmarks(config, tokens, [story('story-a'), story('story-b')])
    // The repeat is ignored: not refused and not duplicated.
    expect(await bookmarkIds(await userId(mail))).toEqual(setOf(['story-a', 'story-b']))
    expect(idsOf(await supabase.bookmarks(config, tokens))).toEqual(setOf(['story-a', 'story-b']))
  })

  it('never shows or changes one account\u2019s data to another', async () => {
    const first = email()
    const second = email()
    const owner = new Phone(['science'], [story('story-a')])
    await owner.signInAs(first)
    const other = new Phone(['art'], [story('story-z')])
    await other.signInAs(second)
    const ownerId = await userId(first)
    const otherId = await userId(second)
    expect(otherId).not.toBe(ownerId)
    const config = await supabase.config()
    const otherTokens = other.held()
    // A reader sees only their own saved stories.
    expect(idsOf(await supabase.bookmarks(config, otherTokens))).toEqual(setOf(['story-z']))
    expect(await supabase.topics(config, otherTokens)).toEqual(setOf(['art']))
    await supabase.removeBookmark(config, otherTokens, 'story-a')
    // Removing someone else's story removes nothing.
    expect(await bookmarkIds(ownerId)).toEqual(setOf(['story-a']))
    // The database itself refuses a row that names another reader, whatever the app sends.
    const forged = await raw(`${GATEWAY}/rest/v1/bookmarks`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${otherTokens.access}`, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify([{ user_id: ownerId, card_id: 'story-forged', card_title: 'x' }]),
    })
    expect(forged.status).toBe(403)
    expect(await bookmarkIds(ownerId)).toEqual(setOf(['story-a']))
    // And without signing in at all nothing can be read.
    const anonymous = await raw(`${GATEWAY}/rest/v1/bookmarks?select=card_id`, { headers: { apikey: anon } })
    expect(JSON.parse(anonymous.text)).toHaveLength(0)
  })

  it('exchanges a code only once and only with its verifier', async () => {
    const config = await supabase.config()
    const wrong = verifier()
    const right = verifier()
    const code = await codeFor(email(), await challenge(right))
    const refused = await supabase.exchange(config, code, wrong).catch((error: Error) => error)
    // A code must not be exchanged with another verifier.
    expect(refused).toBeInstanceOf(Rejected)
    expect((refused as Rejected).status).toBeGreaterThanOrEqual(400)
    expect((refused as Rejected).status).toBeLessThan(500)
    const second = await codeFor(email(), await challenge(right))
    const tokens = await supabase.exchange(config, second, right)
    expect(tokens.userId).toMatch(/^[0-9a-f-]{36}$/)
    expect(tokens.expiresAt).toBeGreaterThan(clock() + 30 * 60_000)
    // A code must not be used twice.
    const again = await supabase.exchange(config, second, right).catch((error: Error) => error)
    expect(again).toBeInstanceOf(Rejected)
    expect((again as Rejected).status).toBeGreaterThanOrEqual(400)
    expect((again as Rejected).status).toBeLessThan(500)
  })

  it('tells an expired access token apart from a refused change', async () => {
    const mail = email()
    const phone = new Phone(['science'], [story('story-a')])
    await phone.signInAs(mail)
    const id = await userId(mail)
    const config = await supabase.config()
    const expired = { ...phone.held(), access: expiredAccessToken(id), userId: id }
    const refused = await supabase.topics(config, expired).catch((error: Error) => error)
    expect(refused).toBeInstanceOf(Unauthorized)
    expect((refused as Unauthorized).status).toBe(401)
    const malformed = await supabase.bookmarks(config, { ...phone.held(), access: 'not-a-token' }).catch((error: Error) => error)
    expect(malformed).toBeInstanceOf(Rejected)
    expect([400, 401]).toContain((malformed as Rejected).status)
  })

  it('refreshes a session that has run out', async () => {
    const mail = email()
    const phone = new Phone(['science'], [])
    await phone.signInAs(mail)
    const before = phone.secrets.values.get(ACCOUNT_KEY)
    clock.advance(2 * 3_600_000)
    phone.account.cloud().saved(story('story-late'), true)
    await phone.account.idle()
    // The change was sent with a freshly issued token.
    expect(await bookmarkIds(await userId(mail))).toEqual(setOf(['story-late']))
    // The sealed session was replaced.
    expect(phone.secrets.values.get(ACCOUNT_KEY)).not.toBe(before)
    const state = phone.account.store.getState()
    expect(state.status).toBe('signedIn')
    expect(state.message).toBeNull()
  })

  it('ends cleanly when the session was revoked elsewhere, and tells the reader to sign in again', async () => {
    const mail = email()
    const phone = new Phone(['science'], [story('story-a')])
    await phone.signInAs(mail)
    // Signing out everywhere (as the website's account page would) makes every refresh token stop working.
    const out = await raw(`${GATEWAY}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${phone.held().access}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(out.status).toBe(204)
    clock.advance(2 * 3_600_000)
    phone.account.cloud().saved(story('story-b'), true)
    await phone.account.idle()
    const state = phone.account.store.getState()
    expect(state.status).toBe('signedOut')
    expect(state.message).toBe('account_expired')
    // The dead session is no longer kept.
    expect(phone.secrets.values.get(ACCOUNT_KEY) ?? '').not.toContain('"session"')
    // Nothing reached the account.
    expect(await bookmarkIds(await userId(mail))).toEqual(setOf(['story-a']))
  })

  it('revokes this phone\u2019s session on signing out and forgets it', async () => {
    const phone = new Phone(['science'], [])
    await phone.signInAs(email())
    const held = phone.held()
    await phone.account.signOut()
    expect(phone.account.store.getState().status).toBe('signedOut')
    // No token is kept on the phone.
    const text = phone.secrets.values.get(ACCOUNT_KEY) ?? ''
    expect(text.includes(held.access) || text.includes(held.refresh) || text.includes('"session"')).toBe(false)
    const refused = await supabase.refresh(await supabase.config(), held.refresh).catch((error: Error) => error)
    // The old refresh token must be dead.
    expect(refused).toBeInstanceOf(Rejected)
    expect([400, 401, 403]).toContain((refused as Rejected).status)
  })

  it('deletes the account through the website, with its data and nobody else\u2019s', async () => {
    const first = email()
    const second = email()
    const leaving = new Phone(['science', 'space'], [story('story-a'), story('story-b')])
    await leaving.signInAs(first)
    const staying = new Phone(['art'], [story('story-z')])
    await staying.signInAs(second)
    const leavingId = await userId(first)
    const stayingId = await userId(second)
    const held = leaving.held()
    // The account holds what the phone uploaded.
    expect(await bookmarkIds(leavingId)).toEqual(setOf(['story-a', 'story-b']))
    await leaving.account.deleteAccount()
    const state = leaving.account.store.getState()
    expect(state.status).toBe('signedOut')
    // The reader is told it is done.
    expect(state.message).toBe('account_deleted')
    const text = leaving.secrets.values.get(ACCOUNT_KEY) ?? ''
    expect(text.includes(held.access) || text.includes(held.refresh) || text.includes('"session"')).toBe(false)
    // The account's profile row, its saved stories and its reading activity are gone.
    expect(await rows(`user_profiles?id=eq.${leavingId}&select=id`)).toHaveLength(0)
    expect(await bookmarkIds(leavingId)).toEqual(setOf([]))
    expect(await rows(`engagements?user_id=eq.${leavingId}&select=id`)).toHaveLength(0)
    expect((await raw(`${GATEWAY}/auth/v1/admin/users/${leavingId}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).status).toBe(404)
    // The phone's own topics are left alone.
    expect(leaving.topics).toEqual(setOf(['science', 'space']))
    const refused = await supabase.refresh(await supabase.config(), held.refresh).catch((error: Error) => error)
    expect(refused).toBeInstanceOf(Rejected)
    expect([400, 401, 403]).toContain((refused as Rejected).status)
    // Another reader's topics and saved story are untouched.
    expect(await storedTopics(stayingId)).toEqual(setOf(['art']))
    expect(await bookmarkIds(stayingId)).toEqual(setOf(['story-z']))
    expect(staying.account.store.getState().status).toBe('signedIn')
  })

  it('lets a signed-in reader change their own streak only', async () => {
    const first = email()
    const second = email()
    const reader = new Phone([], [])
    await reader.signInAs(first)
    const other = new Phone([], [])
    await other.signInAs(second)
    const readerId = await userId(first)
    const otherId = await userId(second)
    const call = (target: string, headers: Record<string, string>) =>
      raw(`${GATEWAY}/rest/v1/rpc/update_reading_streak`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ p_user_id: target }) })
    // A signed-in reader may update their own streak, which is what the website does.
    expect([200, 204]).toContain((await call(readerId, { apikey: anon, Authorization: `Bearer ${reader.held().access}` })).status)
    expect((await rows(`user_profiles?id=eq.${readerId}&select=reading_streak`))[0].reading_streak).toBe(1)
    // Neither a signed-in reader nor an anonymous caller may update someone else's.
    expect((await call(otherId, { apikey: anon, Authorization: `Bearer ${reader.held().access}` })).status).toBe(403)
    expect((await call(otherId, { apikey: anon })).status).toBe(401)
    // The other reader's streak is untouched.
    expect((await rows(`user_profiles?id=eq.${otherId}&select=reading_streak`))[0].reading_streak).toBe(0)
  })

  it('leaves a reader who denied Google, or whose code failed, signed out with a message', async () => {
    const phone = new Phone([], [])
    const real = phone.account
    // Google answers "access_denied", then a code the service never issued.
    const results = [`${SCHEME}://auth-callback/?error=access_denied`, `${SCHEME}://auth-callback/?code=${'0'.repeat(36)}`]
    const denied = createAccountManager({
      request: appRequest,
      secrets: memorySecrets(),
      clock,
      site: SITE,
      authScheme: SCHEME,
      openAuthSession: async () => ({ type: 'success', url: results.shift() as string }),
      localTopics: () => new Set(),
      localSaved: () => [],
    })
    await denied.signIn()
    expect(denied.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_denied' })
    await denied.signIn()
    // A code the service never issued is refused.
    expect(denied.store.getState()).toMatchObject({ status: 'signedOut', message: 'account_failed' })
    expect(real.store.getState().status).toBe('signedOut')
  })
})
