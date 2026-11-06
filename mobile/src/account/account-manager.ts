import { authScheme as buildScheme, site as buildSite } from '@/build'
import type { Cloud, CloudSink } from '@/data/cloud'
import { isWebLink, type Story } from '@/data/story'
import { systemClock, type Clock } from '@/platform/clock'
import { secrets as phoneSecrets, type SecretStore } from '@/platform/storage'
import { createStore, type Store } from '@/state/store'
import { addOp, emptyData, fromJson, isEmpty, QUEUE_LIMIT, removeOp, toJson, type AccountData } from './account-data'
import { SIGNED_OUT, type AccountMessage, type AccountState, type AccountStatus } from './account-state'
import type { AuthApi, Tokens } from './auth-api'
import type { AuthConfig } from './auth-config'
import { CALLBACK_HOST, parseCallback, type Callback } from './callback'
import type { CloudApi } from './cloud-api'
import { Rejected, StorageError, Unauthorized } from './errors'
import { challenge, verifier as newVerifier, type RandomBytes } from './pkce'
import { createSupabase } from './supabase'
import { createTokenStore, type TokenStore } from './token-store'
import { sameTopics, type TopicId } from './topics'
import type { RequestFn } from './transport'

/** How long a sign-in may wait for the browser: a callback after this is ignored, and so is its secret after a restart. */
export const PENDING_MS = 10 * 60_000
/** An access token that expires within this is refreshed before it is used. */
export const REFRESH_MARGIN_MS = 60_000
/** The account is brought up to date when the app comes to the front and the last sync is older than this. */
export const STALE_MS = 10 * 60_000
/** Where the accounts live is asked again after this. */
export const CONFIG_TTL_MS = 10 * 60_000

/** What the browser returned from the sign-in. The type is expo-web-browser's: only "success" carries an address. */
export interface AuthSessionResult {
  readonly type: string
  readonly url?: string
}

/** Opens the sign-in page in the system browser and gives back what it returned to `redirectUrl` (expo-web-browser's openAuthSessionAsync). */
export type OpenAuthSession = (url: string, redirectUrl: string) => Promise<AuthSessionResult>

export interface AccountOptions {
  openAuthSession: OpenAuthSession
  /** The topics the reader has chosen on the phone (they stay there whether or not there is an account). */
  localTopics: () => ReadonlySet<string> | Promise<ReadonlySet<string>>
  /** The stories saved on the phone. */
  localSaved: () => readonly Story[] | Promise<readonly Story[]>
  request?: RequestFn
  secrets?: SecretStore
  clock?: Clock
  /** The random bytes of the sign-in's secret (default: the phone's secure random source). */
  random?: RandomBytes
  /** The Plax website, as an address or a function that gives it (default: the website of this build). */
  site?: string | (() => string)
  /** The scheme the browser returns to (default: the one of this build, its application id). */
  authScheme?: string | (() => string)
  /** The topics on offer now (default: the built-in ones). */
  topics?: () => readonly TopicId[]
  /** These replace the parts that are made from the options above; for tests. */
  auth?: AuthApi
  cloudApi?: CloudApi
  tokenStore?: TokenStore
}

export interface AccountManager {
  /** What the screens show; read it with useStore. */
  readonly store: Store<AccountState>
  /** Reads what the phone remembers of the account. Call it once at start; it never touches the network. Safe to call again. */
  restore(): Promise<void>
  /** Checks the account service, then sends the reader to Google in the browser and finishes the sign-in with what comes back. */
  signIn(): Promise<void>
  /** Gives up on a sign-in that is waiting for the browser. */
  cancel(): Promise<void>
  /**
   * The browser returned to the app through its address (a deep link, also when the app was started by it). Finishes the sign-in that is
   * waiting for it; an address that is not this app's callback, one nobody asked for, and one that comes twice are ignored.
   */
  complete(address: string): Promise<void>
  /** Whether the address is this app's sign-in callback. */
  ours(address: string): boolean
  /** Signs out. The topics and saved stories stay on the phone; nothing else is kept. */
  signOut(): Promise<void>
  /** Deletes the account and everything in it, then leaves as signing out does. If that cannot be done the reader stays signed in, told. */
  deleteAccount(): Promise<void>
  /** The app came to the front: brings the account up to date when it has been a while. */
  resume(): Promise<void>
  /** What the feed holds to meet the account: what the reader changes goes out, what the account holds comes in. */
  cloud(): Cloud
  /** Resolves when everything asked of the account so far is done (the sync after a sign-in, a change on its way out...). */
  idle(): Promise<void>
}

const resolved = (value: string | (() => string) | undefined, fallback: () => string): string =>
  value === undefined ? fallback() : typeof value === 'function' ? value() : value

/** One piece of work at a time, in the order it was asked for, so that no two syncs ever overlap. */
function createWorker() {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      const result = tail.then(job)
      tail = result.catch(() => undefined)
      return result
    },
    async idle(): Promise<void> {
      let seen: Promise<unknown>
      do {
        seen = tail
        await seen
      } while (seen !== tail)
    },
  }
}

/** The session is gone and the reader has been told, so the work in hand stops without a word. */
class Ended extends Error {}

type BrowserOutcome = AuthSessionResult | 'failed'

/** What the reader is told when the browser did not bring back a sign-in. */
function browserMessage(outcome: BrowserOutcome): AccountMessage | null {
  if (outcome === 'failed') return 'browser_unavailable'
  // The reader closed the browser themselves, so they know. Anything else is a sign-in that did not happen.
  return outcome.type === 'cancel' || outcome.type === 'dismiss' ? null : 'account_failed'
}

/**
 * The optional Plax account. Everything in the app works without it; signing in with Google only keeps a copy of the reader's topics and
 * saved stories in their account so that they follow them to another phone. Sign-in is the OAuth code flow with PKCE in the system browser.
 * The session is kept sealed in the phone's secure store; if that is not possible the reader is simply not signed in. All work runs one
 * task at a time. A port of AccountManager.java of the native app (1.7.1).
 */
export function createAccountManager(options: AccountOptions): AccountManager {
  const clock = options.clock ?? systemClock
  const api = createSupabase({ request: options.request, site: options.site, clock, topics: options.topics })
  const auth = options.auth ?? api
  const cloudApi = options.cloudApi ?? api
  const tokenStore = options.tokenStore ?? createTokenStore(options.secrets ?? phoneSecrets)
  const scheme = () => resolved(options.authScheme, buildScheme)
  const website = () => resolved(options.site, buildSite)

  const store = createStore<AccountState>(SIGNED_OUT)
  const worker = createWorker()
  let sink: CloudSink | null = null

  // The rest is touched only by the task that is running.
  let data: AccountData = emptyData()
  let config: AuthConfig | null = null
  let configAt = 0
  let loading: Promise<void> | null = null
  // The store refused to be read this run: what is in it may be a session, so having nothing to keep must not erase it.
  let unreadable = false

  function publish(status: AccountStatus, message: AccountMessage | null, busy: boolean): void {
    const session = data.session
    store.replaceState({
      status,
      name: session?.name ?? '',
      email: session?.email ?? '',
      message,
      busy,
      deleting: status === 'signedIn' && message === 'account_deleting',
    })
  }

  // What the phone remembers

  async function wipeStore(): Promise<void> {
    try {
      await tokenStore.clear()
    } catch {
      // Nothing more can be done: the entry cannot be reached, so nobody else can read it either.
    }
  }

  async function save(): Promise<void> {
    try {
      if (isEmpty(data)) {
        if (!unreadable) await tokenStore.clear()
      } else {
        await tokenStore.write(toJson(data))
        unreadable = false
      }
    } catch {
      throw new StorageError()
    }
  }

  /** For changes whose loss is harmless: the next successful sync repeats them. */
  async function quietly(): Promise<void> {
    try {
      await save()
    } catch {
      // Kept in memory for this run.
    }
  }

  /** After the session was dropped: if what is left cannot be written, the whole entry goes, so that the old session never survives. */
  async function forget(): Promise<void> {
    try {
      await save()
    } catch {
      await wipeStore()
    }
  }

  function dropSession(): void {
    data.session = null
    data.verifier = null
    data.queue = []
    data.dirty = false
    data.lastSync = 0
  }

  async function load(): Promise<void> {
    let text: string | null = null
    try {
      text = await tokenStore.read()
    } catch {
      // A store that cannot be opened right now is left alone: the next launch may read it. The reader is signed out for this run only.
      unreadable = true
    }
    if (text !== null) {
      try {
        data = fromJson(text)
      } catch {
        data = emptyData()
        await wipeStore()
      }
    }
    if (data.session !== null) publish('signedIn', null, false)
    else if (data.verifier !== null && clock() - data.verifierAt <= PENDING_MS) publish('signingIn', null, false)
    else {
      data.verifier = null
      publish('signedOut', null, false)
    }
  }

  const ensureLoaded = (): Promise<void> => {
    if (loading === null) loading = load()
    return loading
  }

  /** Work that waits its turn, and for what the phone remembers to be read. Tasks never wait for each other. */
  const task = <T>(job: () => Promise<T>): Promise<T> =>
    worker.run(async () => {
      await ensureLoaded()
      return job()
    })

  /** Work nobody waits for: what goes wrong in it has been dealt with where it happened. */
  const background = (job: () => Promise<void>): void => {
    task(job).catch(() => undefined)
  }

  // Where the accounts live, and a token that is good

  async function currentConfig(): Promise<AuthConfig> {
    const now = clock()
    if (config === null || now - configAt > CONFIG_TTL_MS) {
      config = await auth.config()
      configAt = now
    }
    return config
  }

  /** The service is told the session is over; the phone has forgotten it either way. */
  async function revoke(current: AuthConfig, access: string): Promise<void> {
    try {
      await auth.logout(current, access)
    } catch {
      // Best effort.
    }
  }

  /** A token that is good for another minute, refreshed when it is not. A refused refresh ends the session. */
  async function fresh(current: AuthConfig): Promise<Tokens> {
    const held = data.session
    if (held === null) throw new Ended()
    if (held.expiresAt - clock() > REFRESH_MARGIN_MS) return held
    try {
      const next = await auth.refresh(current, held.refresh)
      data.session = next
      await quietly()
      return next
    } catch (refused) {
      if (!(refused instanceof Rejected) || (refused.status !== 400 && refused.status !== 401 && refused.status !== 403)) throw refused
      data.session = null
      await forget()
      publish('signedOut', 'account_expired', false)
      throw new Ended()
    }
  }

  /** The access token is taken as run out, so that the next use refreshes it. */
  function expire(): void {
    if (data.session === null) throw new Ended()
    data.session = { ...data.session, expiresAt: 0 }
  }

  // Sign-in

  function authorizeUrl(current: AuthConfig, code: string): string {
    const parameters: [string, string][] = [
      ['provider', 'google'],
      ['redirect_to', `${website()}/auth/app?app=${scheme()}`],
      ['code_challenge', code],
      ['code_challenge_method', 's256'],
    ]
    return `${current.url}/auth/v1/authorize?${parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')}`
  }

  /** Checks the service and makes the sign-in's secret; gives the address for the browser, or null when there is nothing to open. */
  async function start(): Promise<{ url: string; verifier: string } | null> {
    // Already signed in, or a sign-in is already waiting for the browser.
    if (data.session !== null || (data.verifier !== null && clock() - data.verifierAt <= PENDING_MS)) return null
    try {
      const current = await currentConfig()
      await auth.check(current)
      const secret = newVerifier(options.random)
      const code = await challenge(secret)
      data.verifier = secret
      data.verifierAt = clock()
      await save()
      publish('signingIn', null, false)
      return { url: authorizeUrl(current, code), verifier: secret }
    } catch (failure) {
      data.verifier = null
      if (failure instanceof StorageError) publish('signedOut', 'account_storage', false)
      else {
        await quietly()
        publish('signedOut', 'account_unavailable', false)
      }
      return null
    }
  }

  /** Exchanges the code for a session. Returns false when the callback was ignored: nobody asked for it, or it came too late. */
  async function finish(callback: Callback): Promise<boolean> {
    const secret = data.verifier
    if (secret === null || clock() - data.verifierAt > PENDING_MS) return false
    // The secret is good once.
    data.verifier = null
    await quietly()
    if (callback.error !== null || callback.code === null) {
      publish('signedOut', callback.error === 'access_denied' ? 'account_denied' : 'account_failed', false)
      return true
    }
    publish('signingIn', null, true)
    let current: AuthConfig
    let tokens: Tokens
    try {
      current = await currentConfig()
      tokens = await auth.exchange(current, callback.code, secret)
    } catch {
      publish('signedOut', 'account_failed', false)
      return true
    }
    data.session = tokens
    try {
      await save()
    } catch {
      // The session could not be kept safely, so it is not used: the service is told it is over.
      data.session = null
      await revoke(current, tokens.access)
      publish('signedOut', 'account_storage', false)
      return true
    }
    publish('signedIn', null, true)
    await sync()
    return true
  }

  /** What the browser said about the sign-in that was started with this secret. */
  async function settle(secret: string, outcome: BrowserOutcome): Promise<void> {
    // It was settled already: by the callback arriving as a deep link, by Cancel, or by a newer sign-in.
    if (data.verifier !== secret) return
    if (outcome !== 'failed' && outcome.type === 'success' && typeof outcome.url === 'string') {
      const callback = parseCallback(outcome.url, scheme())
      if (callback !== null && (await finish(callback))) return
      data.verifier = null
      await quietly()
      publish('signedOut', 'account_failed', false)
      return
    }
    data.verifier = null
    await quietly()
    publish('signedOut', browserMessage(outcome), false)
  }

  async function signIn(): Promise<void> {
    const attempt = await task(start)
    if (attempt === null) return
    // The address is made from a checked project address, so this holds; the browser is never opened for anything else.
    if (!isWebLink(attempt.url)) {
      await task(() => settle(attempt.verifier, { type: 'cancel' }))
      return
    }
    let outcome: BrowserOutcome
    try {
      outcome = await options.openAuthSession(attempt.url, `${scheme()}://${CALLBACK_HOST}`)
    } catch {
      outcome = 'failed'
    }
    await task(() => settle(attempt.verifier, outcome))
  }

  const cancel = () =>
    task(async () => {
      if (data.session !== null) return
      data.verifier = null
      await quietly()
      publish('signedOut', null, false)
    })

  function complete(address: string): Promise<void> {
    const callback = parseCallback(address, scheme())
    if (callback === null) return Promise.resolve()
    return task(async () => {
      await finish(callback)
    })
  }

  const ours = (address: string): boolean => parseCallback(address, scheme()) !== null

  // Leaving

  const signOut = () =>
    task(async () => {
      const old = data.session
      dropSession()
      await forget()
      publish('signedOut', 'account_signed_out', false)
      if (old !== null) {
        try {
          await revoke(await currentConfig(), old.access)
        } catch {
          // Already forgotten here.
        }
      }
    })

  const deleteAccount = () =>
    task(async () => {
      if (data.session === null) return
      publish('signedIn', 'account_deleting', true)
      try {
        const current = await currentConfig()
        try {
          await auth.deleteAccount((await fresh(current)).access)
        } catch (refused) {
          if (!(refused instanceof Unauthorized)) throw refused
          // The token looked good but was refused: once more, with a new one.
          expire()
          await auth.deleteAccount((await fresh(current)).access)
        }
      } catch (failure) {
        // Either the session is gone and the reader has been told, or the account is still there and the reader is told so.
        if (!(failure instanceof Ended)) publish('signedIn', 'account_delete_failed', false)
        return
      }
      dropSession()
      await forget()
      publish('signedOut', 'account_deleted', false)
    })

  // Synchronisation

  /** Runs one piece of work, retrying once with a fresh token, and reports a failure without losing anything. */
  async function attempt(step: () => Promise<void>): Promise<void> {
    try {
      try {
        await step()
      } catch (refused) {
        if (!(refused instanceof Unauthorized)) throw refused
        expire()
        await step()
      }
      publish('signedIn', null, false)
    } catch (failure) {
      if (!(failure instanceof Ended) && data.session !== null) publish('signedIn', 'account_sync_failed', false)
    }
  }

  /** Sends the changes made while signed in; one the account will never accept is dropped, not retried forever. */
  async function flush(current: AuthConfig, tokens: Tokens): Promise<void> {
    let changed = false
    try {
      while (data.queue.length > 0) {
        const op = data.queue[0]
        try {
          if (op.story !== null) await cloudApi.addBookmarks(current, tokens, [op.story])
          else await cloudApi.removeBookmark(current, tokens, op.id)
        } catch (failure) {
          // A refusal for good is dropped. Anything else (the token, the connection) stops here and keeps the rest.
          if (!(failure instanceof Rejected) || failure instanceof Unauthorized) throw failure
        }
        data.queue.shift()
        changed = true
      }
    } finally {
      if (changed) await quietly()
    }
  }

  /** Merges the phone and the account: topics first (what was changed here last wins, else the account's, else the phone's), then stories. */
  async function sync(): Promise<void> {
    if (data.session === null) return
    publish('signedIn', null, true)
    await attempt(async () => {
      const current = await currentConfig()
      const tokens = await fresh(current)
      await flush(current, tokens)
      const mayUpload = data.synced === null || data.synced === tokens.userId
      const local = await options.localTopics()
      const remote = await cloudApi.topics(current, tokens)
      const target = sink
      if (data.dirty && mayUpload) {
        await cloudApi.saveTopics(current, tokens, local)
        data.dirty = false
      } else if (remote.size > 0) {
        if (!sameTopics(remote, local) && target !== null) target.cloudInterests(remote)
      } else if (local.size > 0 && mayUpload) {
        await cloudApi.saveTopics(current, tokens, local)
      }
      const held = await cloudApi.bookmarks(current, tokens)
      if (target !== null) target.cloudSaved(held)
      if (mayUpload) {
        const known = new Set(held.map((story) => story.id))
        const missing: Story[] = []
        for (const story of await options.localSaved()) {
          if (!known.has(story.id)) {
            known.add(story.id)
            missing.push(story)
          }
        }
        if (missing.length > 0) await cloudApi.addBookmarks(current, tokens, missing)
      }
      data.synced = tokens.userId
      data.lastSync = clock()
      await quietly()
    })
  }

  async function bringUpToDate(): Promise<void> {
    if (data.session !== null && clock() - data.lastSync > STALE_MS) await sync()
  }

  const cloud: Cloud = {
    saved(story, added) {
      background(async () => {
        if (data.session === null) return
        data.queue = data.queue.filter((op) => op.id !== story.id)
        data.queue.push(added ? addOp(story) : removeOp(story.id))
        while (data.queue.length > QUEUE_LIMIT) data.queue.shift()
        await quietly()
        await attempt(async () => {
          const current = await currentConfig()
          await flush(current, await fresh(current))
        })
      })
    },
    interests(topics) {
      const chosen = new Set(topics)
      background(async () => {
        if (data.session === null) return
        data.dirty = true
        await quietly()
        await attempt(async () => {
          const current = await currentConfig()
          await cloudApi.saveTopics(current, await fresh(current), chosen)
          data.dirty = false
          await quietly()
        })
      })
    },
    listen(next) {
      sink = next
      if (next !== null) background(bringUpToDate)
    },
  }

  return {
    store,
    restore: () => task(async () => undefined),
    signIn,
    cancel,
    complete,
    ours,
    signOut,
    deleteAccount,
    resume: () => task(bringUpToDate),
    cloud: () => cloud,
    idle: () => worker.idle(),
  }
}
