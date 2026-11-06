import type { CloudSink } from '@/data/cloud'
import { makeStory, type Story } from '@/data/story'
import { fakeClock } from '@/platform/clock'
import type { SecretStore } from '@/platform/storage'
import { createAccountManager, type AccountManager, type AccountOptions, type AuthSessionResult } from '../account-manager'
import type { AccountState } from '../account-state'
import type { AuthApi, Tokens } from '../auth-api'
import type { AuthConfig } from '../auth-config'
import type { CloudApi } from '../cloud-api'
import { Unauthorized } from '../errors'
import type { TokenStore } from '../token-store'

export const USER_A = '11111111-1111-4111-8111-111111111111'
export const USER_B = '22222222-2222-4222-8222-222222222222'
export const SCHEME = 'com.plaxlabs.news.preview'
export const SITE = 'https://plax-rouge.vercel.app/news'
export const PROJECT = 'https://abcdefghij.supabase.co'
export const ANON_KEY = 'anon-key-0123456789abcdef'

export const story = (id: string, fields: Partial<Story> = {}): Story =>
  makeStory({
    id,
    title: `Headline ${id}`,
    content: `Body of ${id} with enough words.`,
    category: 'news',
    source: 'Publisher',
    sourceUrl: `https://example.com/${id}`,
    ...fields,
  })

export const ids = (stories: readonly Story[]): string[] => stories.map((item) => item.id)

/** Java's Set.toString of a sorted set: "[a, b]". */
export const listed = (values: Iterable<string>): string => `[${[...values].sort().join(', ')}]`

/** The stand-in of the account service the native app's tests used: it answers what it is told to and remembers what it was asked. */
export class FakeAuth implements AuthApi {
  project: AuthConfig = { url: PROJECT, anonKey: 'k'.repeat(30) }
  configFailure?: Error
  checkFailure?: Error
  exchangeFailure?: Error
  refreshFailure?: Error
  deleteFailure?: Error
  readonly calls: string[] = []
  next!: Tokens
  refreshed!: Tokens
  lastCode = ''
  lastVerifier = ''
  /** Called as the deletion is asked for, so that a test can look at what the phone holds at that moment. */
  onDelete?: () => void

  async config(): Promise<AuthConfig> {
    this.calls.push('config')
    if (this.configFailure) throw this.configFailure
    return this.project
  }
  async check(): Promise<void> {
    this.calls.push('check')
    if (this.checkFailure) throw this.checkFailure
  }
  async exchange(_config: AuthConfig, code: string, verifier: string): Promise<Tokens> {
    this.calls.push('exchange')
    this.lastCode = code
    this.lastVerifier = verifier
    if (this.exchangeFailure) throw this.exchangeFailure
    return this.next
  }
  async refresh(_config: AuthConfig, refresh: string): Promise<Tokens> {
    this.calls.push(`refresh:${refresh}`)
    if (this.refreshFailure) throw this.refreshFailure
    return this.refreshed
  }
  async logout(_config: AuthConfig, access: string): Promise<void> {
    this.calls.push(`logout:${access}`)
  }
  async deleteAccount(access: string): Promise<void> {
    this.calls.push(`delete:${access}`)
    this.onDelete?.()
    if (this.deleteFailure) {
      const thrown = this.deleteFailure
      // A refused token is refused once.
      if (thrown instanceof Unauthorized) this.deleteFailure = undefined
      throw thrown
    }
  }
}

export class FakeCloud implements CloudApi {
  heldTopics: ReadonlySet<string> = new Set()
  heldBookmarks: Story[] = []
  failure?: Error
  addFailure?: Error
  readonly calls: string[] = []
  readonly tokensSeen: string[] = []

  private begin(call: string, tokens: Tokens): void {
    this.calls.push(call)
    this.tokensSeen.push(tokens.access)
    if (this.failure) {
      const thrown = this.failure
      if (thrown instanceof Unauthorized) this.failure = undefined
      throw thrown
    }
  }
  async topics(_config: AuthConfig, tokens: Tokens): Promise<ReadonlySet<string>> {
    this.begin('topics', tokens)
    return this.heldTopics
  }
  async saveTopics(_config: AuthConfig, tokens: Tokens, chosen: ReadonlySet<string>): Promise<void> {
    this.begin(`save:${listed(chosen)}`, tokens)
  }
  async bookmarks(_config: AuthConfig, tokens: Tokens): Promise<Story[]> {
    this.begin('bookmarks', tokens)
    return this.heldBookmarks
  }
  async addBookmarks(_config: AuthConfig, tokens: Tokens, stories: readonly Story[]): Promise<void> {
    this.begin(`add:[${ids(stories).join(', ')}]`, tokens)
    if (this.addFailure) throw this.addFailure
  }
  async removeBookmark(_config: AuthConfig, tokens: Tokens, id: string): Promise<void> {
    this.begin(`remove:${id}`, tokens)
  }
}

/** The sealed store, in memory, with the failures a phone can have. */
export class MemoryStore implements TokenStore {
  text: string | null = null
  readFailure?: Error
  writeFailure?: Error
  cleared = false
  async read(): Promise<string | null> {
    if (this.readFailure) throw this.readFailure
    return this.text
  }
  async write(value: string): Promise<void> {
    if (this.writeFailure) throw this.writeFailure
    this.text = value
  }
  async clear(): Promise<void> {
    this.text = null
    this.cleared = true
  }
  /** What is stored, read as JSON; null when nothing is. */
  get json(): Record<string, unknown> | null {
    return this.text === null ? null : (JSON.parse(this.text) as Record<string, unknown>)
  }
  get queue(): { id: string; t?: string }[] {
    return ((this.json?.queue ?? []) as { id: string; t?: string }[]).slice()
  }
}

export class Landing implements CloudSink {
  readonly topics: ReadonlySet<string>[] = []
  readonly saved: string[][] = []
  cloudInterests(value: ReadonlySet<string>): void {
    this.topics.push(value)
  }
  cloudSaved(stories: readonly Story[]): void {
    this.saved.push(ids(stories))
  }
}

/** The system browser: it records what was opened and answers when a test says so (or at once, with a queued answer). */
export function fakeBrowser() {
  const opened: { url: string; redirect: string }[] = []
  const waiting: ((result: AuthSessionResult) => void)[] = []
  const queued: (AuthSessionResult | Error)[] = []
  return {
    opened,
    queue(result: AuthSessionResult | Error) {
      queued.push(result)
    },
    /** What the browser returns when it is closed or redirects: answers every sign-in that is waiting on it. */
    answer(result: AuthSessionResult) {
      for (const resolve of waiting.splice(0)) resolve(result)
    },
    get pending(): number {
      return waiting.length
    },
    open(url: string, redirect: string): Promise<AuthSessionResult> {
      opened.push({ url, redirect })
      const next = queued.shift()
      if (next instanceof Error) return Promise.reject(next)
      if (next) return Promise.resolve(next)
      return new Promise((resolve) => waiting.push(resolve))
    },
  }
}

/** The Keystore in memory, with the failures it can have. */
export function memorySecrets() {
  const values = new Map<string, string>()
  const secrets = {
    values,
    failReads: false,
    failWrites: false,
    failRemoves: false,
    reads: 0,
    writes: 0,
    removes: 0,
    async get(key: string) {
      secrets.reads++
      if (secrets.failReads) throw new Error('keystore locked')
      return values.get(key) ?? null
    },
    async set(key: string, value: string) {
      secrets.writes++
      if (secrets.failWrites) throw new Error('keystore broken')
      values.set(key, value)
    },
    async remove(key: string) {
      secrets.removes++
      if (secrets.failRemoves) throw new Error('keystore broken')
      values.delete(key)
    },
  } satisfies SecretStore & Record<string, unknown>
  return secrets
}

export const tokens = (access: string, refresh: string, user: string, expiresAt: number): Tokens => ({
  access,
  refresh,
  expiresAt,
  userId: user,
  email: 'reader@example.com',
  name: 'Asha Rao',
})

/** A phone with an account manager on fakes, as the native app's AccountManagerTest sets one up. */
export function fixture(overrides: Partial<AccountOptions> = {}) {
  const auth = new FakeAuth()
  const cloud = new FakeCloud()
  const store = new MemoryStore()
  const landing = new Landing()
  const browser = fakeBrowser()
  const clock = fakeClock()
  const phone = { topics: new Set<string>(), saved: [] as Story[] }
  const statuses: AccountState[] = []
  auth.next = tokens('access-1', 'refresh-1', USER_A, clock() + 3_600_000)
  auth.refreshed = tokens('access-2', 'refresh-2', USER_A, clock() + 3_600_000)

  /** A manager (a new one is a restart of the app on the same store). */
  function create(tokenStore: TokenStore = store): AccountManager {
    const created = createAccountManager({
      auth,
      cloudApi: cloud,
      tokenStore,
      clock,
      site: SITE,
      authScheme: SCHEME,
      openAuthSession: (url, redirect) => browser.open(url, redirect),
      localTopics: () => phone.topics,
      localSaved: () => phone.saved,
      ...overrides,
    })
    created.store.subscribe(() => statuses.push(created.store.getState()))
    created.cloud().listen(landing)
    return created
  }

  const callback = (code: string, extra = '') => `${SCHEME}://auth-callback?code=${code}${extra}`
  const attempts: Promise<void>[] = []

  return {
    auth,
    cloud,
    store,
    landing,
    browser,
    clock,
    phone,
    statuses,
    create,
    callback,
    /** A manager that keeps its session in this secure store (the real sealed store, not the fake one). */
    onSecrets(secrets: SecretStore, extra: Partial<AccountOptions> = {}): AccountManager {
      return createAccountManager({
        auth,
        cloudApi: cloud,
        secrets,
        clock,
        site: SITE,
        authScheme: SCHEME,
        openAuthSession: (url, redirect) => browser.open(url, redirect),
        localTopics: () => phone.topics,
        localSaved: () => phone.saved,
        ...extra,
      })
    },
    /** Starts a sign-in and waits until the reader is away in the browser; `attempt` is the sign-in still under way. */
    async begin(account: AccountManager): Promise<void> {
      attempts.push(account.signIn())
      await flush()
    },
    /** The sign-in that was started last (it ends when the browser answers). */
    get attempt(): Promise<void> {
      return attempts[attempts.length - 1]
    },
    /** Signs in through the whole flow, the way the native tests did: the browser's callback arrives as a deep link. */
    async signIn(account: AccountManager, code = 'c'.repeat(36)): Promise<void> {
      const attempt = account.signIn()
      await flush()
      await account.complete(callback(code))
      await account.idle()
      browser.answer({ type: 'dismiss' })
      await attempt
    },
  }
}

export const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

/** What the phone's Keystore (the expo-secure-store of the tests) holds, by key. */
export const dumpSecrets = (): Map<string, string> => (require('expo-secure-store') as { __dump: () => Map<string, string> }).__dump()
