import { looksForApkUpdates } from '@/build'
import { remembered } from '@/config/remember'
import type { StringKey } from '@/i18n'
import type { Clock } from '@/platform/clock'
import type { KeyValueStore } from '@/platform/storage'
import { createStore, type Store } from '@/state/store'
import { apkCheckDue, shouldPrompt, type Feed, type Release } from './apk-updates'

/** What the manager says out loud: the strings the screen shows (in a toast, say). */
export type UpdateMessage = Extract<StringKey, 'update_current' | 'update_failed' | 'update_no_browser'>

/**
 * What a check ended in: `current` (nothing newer: for the menu's ask, "Plax is up to date"), `available` (a newer release is known;
 * it is offered unless the reader put it off or something is open), `failed` (the website could not be asked: "cannot check"), or
 * `skipped` (nothing was looked for: this build never looks, no screen is in front, or an automatic check and it is not time yet).
 */
export type UpdateOutcome = 'skipped' | 'current' | 'available' | 'failed'

/** The screen the offer appears on. Every call comes from the manager, at the moment the thing it asks for is to happen. */
export interface UpdateHost {
  /** True when nothing is open that an offer would cover (a sheet, a dialog, sign-in in progress). */
  idle(): boolean
  /** Shows "Update available" with Later and Download. Later, or closing it, is dismiss(release); Download is download(release). */
  offer(release: Release): void
  /** Says something short. */
  say(message: UpdateMessage): void
  /** Opens the store listing: asking from the menu of a build that Google Play updates opens the listing instead of looking. */
  openListing(): void
}

export interface UpdateState {
  /** The newer release the website advertises that the reader has not put off or downloaded, or null. Kept when the screen is recreated. */
  available: Release | null
  /** A look at the website is running. */
  checking: boolean
}

export interface UpdateManagerDeps {
  storage: KeyValueStore
  clock: Clock
  /** Asks the website for the newest release (createUpdateFeed). */
  feed: Feed
  /** The version code installed. */
  installed: number
  /** This phone's Android API level. */
  sdk: number
  /** Opens an address in the phone's browser. Resolves false, or rejects, when there is no browser to open it. */
  openUrl: (url: string) => Promise<boolean | void>
  /** Whether this build looks for APK updates at all: the website's build does, the Google Play build never (default: build.ts). */
  looksForUpdates?: () => boolean
}

export interface UpdateManager {
  /** The state of the offer, for the screens. */
  readonly store: Store<UpdateState>
  /** Reads what was remembered from the last starts. Safe to call more than once; a check waits for it by itself. */
  load(): Promise<void>
  /** The screen is in front: look for an update if a day has passed, or offer one that is already known. Resolves when that is done. */
  attach(host: UpdateHost): Promise<UpdateOutcome>
  /** The screen left the front. A check still running finishes and is remembered, but says nothing. */
  detach(host: UpdateHost): void
  /** True when asking would open the store listing rather than look for an update. */
  storeBuild(): boolean
  /**
   * Looks for an update. `manual` is the reader asking from the menu: it ignores the daily limit, always ends in something visible (the
   * offer, "up to date" or "cannot check"), and offers a release that was put off. Asking while a check is running makes that check
   * report back instead of being ignored; the promise then resolves, with the same outcome, when that check is done. A website that
   * cannot be asked is the outcome `failed`, never a rejection.
   */
  check(manual?: boolean): Promise<UpdateOutcome>
  /** The reader answered the offer by choosing Later or closing it: it is not offered again for a day. */
  dismiss(release: Release): Promise<void>
  /** The reader chose Download: the browser opens the file (true), or the reader is told there is no browser (false). */
  download(release: Release): Promise<boolean>
}

/**
 * Tells the reader when the Plax website advertises a newer APK of the app: by itself at most once a day while the app is on screen,
 * and whenever they ask from the menu. For the website's build only; Google Play updates the other one. A port of UpdateManager.java.
 *
 * - A check is counted when it starts, so a failed one is not retried before the day is up.
 * - A release the reader put off with Later, or downloaded, is not offered again for a day; a newer release is offered at once, and
 *   asking from the menu always offers it.
 * - Nothing is offered over a sheet or dialog that is open, or while sign-in is in progress; it waits for the next time the app comes
 *   to the front.
 */
export function createUpdateManager(deps: UpdateManagerDeps): UpdateManager {
  const { clock, feed, installed, sdk, openUrl } = deps
  const looks = deps.looksForUpdates ?? looksForApkUpdates
  const memory = remembered(deps.storage, 'plax.updates', { lastCheck: 0, dismissedVersion: 0, dismissedAt: 0 })
  const store = createStore<UpdateState>({ available: null, checking: false })
  let host: UpdateHost | null = null
  /** The check that is running, and the token only that check may end it with. */
  let running: { turn: object; outcome: Promise<UpdateOutcome> } | null = null
  /** The reader asked from the menu, while this check was running or about to start. */
  let report = false

  const available = () => store.getState().available

  function offer(asked: boolean): void {
    const release = available()
    if (!looks() || release === null || host === null || !host.idle()) return
    if (!asked && !shouldPrompt(release, memory.value.dismissedVersion, memory.value.dismissedAt, clock())) return
    host.offer(release)
  }

  /** Ends the check of this turn, once: whoever asks from now on starts another, and an ask is never added to one that is over. */
  function end(turn: object): void {
    if (running?.turn !== turn) return
    running = null
    report = false
  }

  async function look(turn: object): Promise<UpdateOutcome> {
    try {
      await memory.load()
      // A reader's ask that came in while this waited counts: it is in `report`.
      const now = clock()
      if (!report && !apkCheckDue(now, memory.value.lastCheck)) {
        end(turn)
        offer(false)
        return 'skipped'
      }
      store.setState({ checking: true })
      void memory.set({ lastCheck: now })
      let found: Release | null = null
      let failed = false
      try {
        found = await feed(installed, sdk)
      } catch {
        failed = true
      }
      const asked = report
      end(turn)
      store.setState({ checking: false })
      if (failed) {
        if (asked) host?.say('update_failed')
        return 'failed'
      }
      store.setState({ available: found })
      if (asked && found === null && host !== null) host.say('update_current')
      else offer(asked)
      return found === null ? 'current' : 'available'
    } finally {
      // Only an unexpected failure gets here with the check still running: the manager must not wait for a check that is over.
      if (running?.turn === turn) {
        end(turn)
        store.setState({ checking: false })
      }
    }
  }

  function check(manual = false): Promise<UpdateOutcome> {
    if (!looks()) {
      if (manual) host?.openListing()
      return Promise.resolve('skipped')
    }
    if (host === null) return Promise.resolve('skipped')
    if (running !== null) {
      report = report || manual
      return running.outcome
    }
    report = manual
    const turn = {}
    const outcome = look(turn)
    running = { turn, outcome }
    return outcome
  }

  async function dismiss(release: Release): Promise<void> {
    if (available()?.versionCode === release.versionCode) store.setState({ available: null })
    await memory.set({ dismissedVersion: release.versionCode, dismissedAt: clock() })
  }

  async function download(release: Release): Promise<boolean> {
    let opened: boolean
    try {
      opened = (await openUrl(release.apkUrl)) !== false
    } catch {
      opened = false
    }
    if (!opened) {
      host?.say('update_no_browser')
      return false
    }
    await dismiss(release)
    return true
  }

  return {
    store,
    load: () => memory.load(),
    attach(next) {
      host = next
      return check(false)
    },
    detach(previous) {
      if (host === previous) host = null
    },
    storeBuild: () => !looks(),
    check,
    dismiss,
    download,
  }
}
