import { HOUR, dueAfter } from '@/config/limits'
import { remembered } from '@/config/remember'
import type { Clock } from '@/platform/clock'
import type { KeyValueStore } from '@/platform/storage'
import { createStore, type Store } from '@/state/store'

/** The app asks for a new bundle at most this often, whatever brings it to the front. */
export const OTA_CHECK_INTERVAL = 3 * HOUR

/**
 * - idle: nothing to do (the bundle running is the newest the server has, or no look has been made yet).
 * - checking, downloading: a look is running.
 * - ready: a newer bundle is on the phone; it runs from the next cold start, or from reloadNow().
 * - error: the last look failed. Nothing changed: the bundle running is the one that was.
 * - disabled: updates are off in this build (a development build, Expo Go), so nothing is ever asked.
 */
export type OtaStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error' | 'disabled'

/**
 * The part of the expo-updates module the policy uses, so that the policy can be tested without native code: `import * as Updates from
 * 'expo-updates'` is one of these. A rollback to the embedded bundle (the owner's rollback on the server) is also something to download.
 */
export interface UpdatesModule {
  readonly isEnabled: boolean
  readonly channel: string | null
  readonly runtimeVersion: string | null
  /** The id of the update running, or null for the one embedded in the build's own bundle. */
  readonly updateId: string | null
  readonly isEmbeddedLaunch: boolean
  checkForUpdateAsync(): Promise<{ readonly isAvailable: boolean; readonly isRollBackToEmbedded?: boolean }>
  fetchUpdateAsync(): Promise<{ readonly isNew: boolean; readonly isRollBackToEmbedded?: boolean }>
  reloadAsync(): Promise<void>
}

/** Which bundle is running, for the About screen. */
export interface RuntimeInfo {
  /** Whether over-the-air updates are on in this build. */
  enabled: boolean
  /** The id of the update running, or null when it is the build's own bundle (or updates are off). */
  updateId: string | null
  /** True when the bundle running is the one embedded in the build, and not one downloaded from the server. */
  isEmbedded: boolean
  /** The channel this build asks (production), or null when it has none. */
  channel: string | null
  /** The native layer's version: an update reaches only builds that have the same one. */
  runtimeVersion: string | null
}

export interface OtaState {
  status: OtaStatus
  updateId: string | null
  isEmbedded: boolean
  channel: string | null
  runtimeVersion: string | null
}

export interface OtaDeps {
  /** The expo-updates module. */
  updates: UpdatesModule
  clock: Clock
  /** Where the time of the last look is kept. Public content only. */
  storage: KeyValueStore
}

/** The part of React Native's AppState that the policy listens to. */
export interface AppStateSource {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void }
}

export interface OtaManager {
  readonly store: Store<OtaState>
  /** Reads when the last look was made. Safe to call more than once; a check waits for it by itself. */
  load(): Promise<void>
  /**
   * Looks for a newer bundle and downloads it, if it is time (at most once every OTA_CHECK_INTERVAL, or at once with `force`) and no
   * look is running. expo-updates runs the new bundle at the next cold start: nothing restarts by itself. Never rejects, and a failed
   * look changes nothing. Resolves with the status it ends in.
   */
  check(options?: { force?: boolean }): Promise<OtaStatus>
  /** Looks now (the app has just opened) and each time the app comes to the front. Returns how to stop. */
  watch(appState: AppStateSource): () => void
  /** Restarts the app on the newest bundle on the phone, now. False when it cannot (updates are off, or a look is running). Never rejects. */
  reloadNow(): Promise<boolean>
  /** Which bundle is running, read from the module as it is now. */
  getRuntimeInfo(): RuntimeInfo
}

export function runtimeInfo(updates: UpdatesModule): RuntimeInfo {
  return {
    enabled: updates.isEnabled,
    updateId: updates.updateId,
    isEmbedded: updates.isEmbeddedLaunch,
    channel: updates.channel,
    runtimeVersion: updates.runtimeVersion,
  }
}

/**
 * The policy for the updates of the app's own bundle (the JavaScript and its assets) over the air, for both builds: ask when the app
 * opens and when it comes to the front, at most once every three hours and never twice at the same time; download what is new in the
 * background; and let expo-updates run it at the next cold start. A look is counted when it starts, so a failed one is not repeated
 * within the three hours (the next cold start asks again by itself). Nothing about the reader is sent: expo-updates asks for the
 * channel and the runtime version of the build, and nothing else.
 */
export function createOtaManager(deps: OtaDeps): OtaManager {
  const { updates, clock } = deps
  const memory = remembered(deps.storage, 'plax.ota', { lastCheck: 0 })
  const stateFor = (status: OtaStatus): OtaState => {
    const info = runtimeInfo(updates)
    return { status, updateId: info.updateId, isEmbedded: info.isEmbedded, channel: info.channel, runtimeVersion: info.runtimeVersion }
  }
  const store = createStore<OtaState>(stateFor(updates.isEnabled ? 'idle' : 'disabled'))
  let running: Promise<OtaStatus> | null = null

  const settle = (status: OtaStatus): OtaStatus => {
    store.replaceState(stateFor(status))
    return status
  }

  async function look(force: boolean): Promise<OtaStatus> {
    const before = store.getState().status
    // A bundle downloaded by an earlier look is still waiting for the restart, whatever this look finds.
    const waiting = before === 'ready'
    try {
      await memory.load()
      const now = clock()
      if (!force && !dueAfter(now, memory.value.lastCheck, OTA_CHECK_INTERVAL)) return before
      void memory.set({ lastCheck: now })
      settle('checking')
      const found = await updates.checkForUpdateAsync()
      if (!found.isAvailable && found.isRollBackToEmbedded !== true) return settle(waiting ? 'ready' : 'idle')
      settle('downloading')
      const fetched = await updates.fetchUpdateAsync()
      if (fetched.isNew || fetched.isRollBackToEmbedded === true) return settle('ready')
      return settle(waiting ? 'ready' : 'error')
    } catch {
      return settle(waiting ? 'ready' : 'error')
    }
  }

  function check(options: { force?: boolean } = {}): Promise<OtaStatus> {
    if (!updates.isEnabled) return Promise.resolve(settle('disabled'))
    if (running !== null) return running
    running = look(options.force === true).finally(() => {
      running = null
    })
    return running
  }

  async function reloadNow(): Promise<boolean> {
    const { status } = store.getState()
    if (!updates.isEnabled || status === 'checking' || status === 'downloading') return false
    try {
      await updates.reloadAsync()
      return true
    } catch {
      return false
    }
  }

  return {
    store,
    load: () => memory.load(),
    check,
    watch(appState) {
      void check()
      const subscription = appState.addEventListener('change', (state) => {
        if (state === 'active') void check()
      })
      return () => subscription.remove()
    },
    reloadNow,
    getRuntimeInfo: () => runtimeInfo(updates),
  }
}
