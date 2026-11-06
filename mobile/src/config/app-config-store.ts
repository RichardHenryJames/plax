import type { Clock } from '@/platform/clock'
import type { KeyValueStore } from '@/platform/storage'
import { createStore, type Store } from '@/state/store'
import { DEFAULT_APP_CONFIG, MAX_CONFIG_BYTES, parseAppConfig, type AppConfig } from './app-config'
import { HOUR, MINUTE, dueAfter } from './limits'
import { remembered } from './remember'
import { defaultRequest, fetchSiteFile, type RequestFn } from './site-file'

/** The website is asked at most this often... */
export const CONFIG_CHECK_INTERVAL = 3 * HOUR
/** ...and not again for this long after an ask that failed. */
export const CONFIG_RETRY_INTERVAL = 30 * MINUTE
/** The whole request: the native app allowed 4 seconds to connect, 4 to read and 8 in all. */
const CONFIG_TIMEOUT_MS = 8_000

/** Where the file taken last is kept, as it was received. */
export const CONFIG_FILE_KEY = 'plax.config.file'
const MEMORY_PREFIX = 'plax.config'

/** True when asking is allowed: a few hours have passed since the website last answered, and half an hour since it was last asked. */
export function configDue(now: number, attempted: number, succeeded: number): boolean {
  return dueAfter(now, succeeded, CONFIG_CHECK_INTERVAL) && dueAfter(now, attempted, CONFIG_RETRY_INTERVAL)
}

export interface AppConfigState {
  /** What is in force: the built-in values until a good file has been taken. */
  config: AppConfig
  /** Where `config` comes from: the built-in values, the file kept from last time, or the website's answer in this run. */
  origin: 'built-in' | 'kept' | 'website'
}

export interface AppConfigDeps {
  /** One request to the website (default: platform/http.ts). */
  request?: RequestFn
  /** Where the last good file and the times of asking are kept. Public content only. */
  storage: KeyValueStore
  clock: Clock
  /** The address of the website this build talks to (build.ts site()), read at each ask. */
  site: () => string
}

/** What `refresh` did: it was not time, an ask was already running, the file changed what is in force, said nothing new, or failed. */
export type RefreshResult = 'skipped' | 'busy' | 'changed' | 'unchanged' | 'failed'

export interface AppConfigStore {
  /** The configuration in force, for the screens (useStore) and the engines. It changes only when a file with something new in it is taken. */
  readonly store: Store<AppConfigState>
  /** What is in force now. */
  active(): AppConfig
  /**
   * Takes the file kept from the last time, if there is a good one; one that is not is deleted. Call it once, when the app starts, before
   * anything is drawn, so that what the website last said is in force from the first screen. Safe to call again.
   */
  load(): Promise<void>
  /**
   * Asks the website for its file if it is time, or at once with `force`. A file the app cannot read, or an answer that does not come,
   * changes nothing: the file taken before stays. Never rejects, and never runs twice at the same time.
   */
  refresh(options?: { force?: boolean }): Promise<RefreshResult>
  /**
   * Told when what is in force changes: a file with something new in it has been taken from the website, or (to a listener that is
   * already there) the file kept from last time has been read. Not told when the website says what it said before. Returns how to stop.
   */
  subscribe(listener: (config: AppConfig) => void): () => void
  /** Puts a configuration in force, or the built-in one for null, without asking anyone: for tests. */
  force(config: AppConfig | null): void
}

/**
 * Keeps the website's configuration of the app: the one in force, the file it was read from (kept on the phone, so that the next start
 * has it at once), and the asking. The app asks when it comes to the front, at most every few hours. A port of AppConfigStore.java.
 */
export function createAppConfigStore(deps: AppConfigDeps): AppConfigStore {
  const { storage, clock, site } = deps
  const send = deps.request ?? defaultRequest
  const memory = remembered(storage, MEMORY_PREFIX, { attempted: 0, succeeded: 0 })
  const store = createStore<AppConfigState>({ config: DEFAULT_APP_CONFIG, origin: 'built-in' })
  /** The file in force, as it was received; null while the built-in values are. */
  let taken: string | null = null
  let fetching = false
  let loading: Promise<void> | null = null

  const put = (config: AppConfig, text: string | null, origin: AppConfigState['origin']) => {
    taken = text
    store.setState({ config, origin })
  }

  async function readKept(): Promise<void> {
    await memory.load()
    let text: string | null
    try {
      text = await storage.getItem(CONFIG_FILE_KEY)
    } catch {
      // A file that cannot be read is not known to be a bad one: it stays, and the built-in values are in force.
      return
    }
    if (text === null) return
    const parsed = parseAppConfig(text)
    if (parsed !== null) {
      put(parsed.config, text, 'kept')
      return
    }
    try {
      await storage.removeItem(CONFIG_FILE_KEY)
    } catch {
      // Refused again at the next start.
    }
  }

  function load(): Promise<void> {
    if (loading === null) loading = readKept().catch(() => undefined)
    return loading
  }

  async function keep(text: string): Promise<void> {
    try {
      await storage.setItem(CONFIG_FILE_KEY, text)
    } catch {
      // Still in force for this run; the next start asks again.
    }
  }

  async function ask(options: { force?: boolean }): Promise<RefreshResult> {
    await load()
    const now = clock()
    if (options.force !== true && !configDue(now, memory.value.attempted, memory.value.succeeded)) return 'skipped'
    void memory.set({ attempted: now })
    const text = await fetchSiteFile(send, `${site()}/app-config.json`, { maxBytes: MAX_CONFIG_BYTES, timeoutMs: CONFIG_TIMEOUT_MS })
    const parsed = text === null ? null : parseAppConfig(text)
    if (text === null || parsed === null) return 'failed'
    // Kept before it is announced, so that a start right after finds it; a file that says nothing new is not written again.
    if (text !== taken) await keep(text)
    void memory.set({ succeeded: clock() })
    if (text === taken) return 'unchanged'
    put(parsed.config, text, 'website')
    return 'changed'
  }

  async function refresh(options: { force?: boolean } = {}): Promise<RefreshResult> {
    if (fetching) return 'busy'
    fetching = true
    try {
      return await ask(options)
    } catch {
      return 'failed'
    } finally {
      fetching = false
    }
  }

  return {
    store,
    active: () => store.getState().config,
    load,
    refresh,
    subscribe(listener) {
      let last = store.getState().config
      return store.subscribe(() => {
        const next = store.getState().config
        if (next === last) return
        last = next
        listener(next)
      })
    },
    force(config) {
      put(config ?? DEFAULT_APP_CONFIG, null, config === null ? 'built-in' : 'website')
    },
  }
}
