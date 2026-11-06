import { systemClock, type Clock } from '../platform/clock'
import { createStore, type Store } from '../state/store'
import type { AdNetwork } from './ad-network'
import { keepsRoom } from './ad-room'
import { DEFAULT_BANNER_DP, NEVER_SERVED, isPlausibleHeight, storedServedMemory, type BannerServed, type ServedMemory } from './served'
import { systemTimers, type Timers } from './timers'

/** A screen shorter than this (a phone on its side, a window split in two) gets no strip: the story needs the height. */
export const MIN_SCREEN_HEIGHT_DP = 500
/** The strip is no wider than the reading column. */
export const MAX_WIDTH_DP = 640
export const RETRY_MS = 60_000
export const MAX_RETRIES = 3
/** How long to wait for the pager to stop before looking again. */
export const SETTLE_MS = 250
/** The hairline at the top of the strip, in dp. */
export const STRIP_LINE_DP = 1

export interface BannerSize {
  readonly width: number
  readonly height: number
}

/** What the strip (see AdStrip) draws. */
export interface AdBarState {
  /** The strip is on the screen and takes room. */
  readonly visible: boolean
  /** A banner is on its way or has arrived: the library's BannerAd is on the screen, with no room taken until `visible`. */
  readonly requested: boolean
  /** The number of the banner asked for, a new one each time, so that each is a new view. 0 before the first. */
  readonly request: number
  /** The width the banner is asked for, in dp. */
  readonly widthDp: number
  /** The height of the banner, in dp: what is kept from the start for a strip served lately, then what the ad says. */
  readonly heightDp: number
}

export interface AdBarOptions {
  readonly network: AdNetwork
  readonly clock?: Clock
  readonly timers?: Timers
  /** Where the time of the last ad is kept (default: the phone's storage). */
  readonly memory?: ServedMemory
  /** Whether the pager is at rest, so that the screen is not made smaller under a swipe (default: always). */
  readonly still?: () => boolean
  /** The screen's size in dp (use screen() when it changes). Until it is known the strip is off. */
  readonly screen?: { readonly widthDp: number; readonly heightDp: number }
}

/**
 * The ad strip at the foot of the screen, under the story: when it is asked for, when it takes room, and when it asks again. It is shown
 * only where a story is, and only on a screen tall enough to spare the room. A port of AdBar.java without its views: AdStrip draws what
 * its state says.
 *
 * Room. The strip takes room for an ad that has arrived, and keeps its room from the start only where an ad was served in it within the
 * last week (ad-room.ts), so that the story does not jump as that ad arrives. Anywhere else (a first run, or an AdMob app that has not
 * been approved yet, which is never served an ad) the ad is asked for with no room taken and nothing on the screen: no empty bar, and no
 * story that shrinks for a second and grows back. If no ad comes the strip asks again a minute later (up to MAX_RETRIES times, then it
 * leaves the reader alone), and a retry takes no room either. The strip is never made to appear while the pager is moving: the screen is
 * not made smaller under a swipe.
 */
export class AdBar {
  readonly store: Store<AdBarState>
  private readonly network: AdNetwork
  private readonly clock: Clock
  private readonly timers: Timers
  private readonly memory: ServedMemory
  private stillAtRest: () => boolean
  private screenWidth: number
  private screenHeight: number
  private served: BannerServed = NEVER_SERVED
  private loadingMemory: Promise<void> | null = null
  /** An ad was served in the strip lately: its room is kept from the start. */
  private keeps = false
  private readySignalled = false
  private isReadyNow = false
  private wanted = false
  /** An ad has arrived in this strip. */
  private filled = false
  private destroyed = false
  private retries = 0
  /** A retry is on its way: nothing is asked for before it comes. */
  private waiting = false
  private requested = false
  private request = 0
  private visible = false
  private height = DEFAULT_BANNER_DP
  private retryTimer: unknown = null
  private settleTimer: unknown = null

  constructor(options: AdBarOptions) {
    this.network = options.network
    this.clock = options.clock ?? systemClock
    this.timers = options.timers ?? systemTimers
    this.memory = options.memory ?? storedServedMemory()
    this.stillAtRest = options.still ?? (() => true)
    this.screenWidth = options.screen?.widthDp ?? 0
    this.screenHeight = options.screen?.heightDp ?? 0
    this.store = createStore<AdBarState>({ visible: false, requested: false, request: 0, widthDp: this.width(), heightDp: this.height })
  }

  /** Whether this build and this screen have a strip at all. */
  enabled(): boolean {
    return this.network.banner() && this.screenHeight >= MIN_SCREEN_HEIGHT_DP
  }

  /** The screen is this big (in dp): a phone turned on its side has no strip until it is upright again. */
  screen(widthDp: number, heightDp: number): void {
    if (this.destroyed || (widthDp === this.screenWidth && heightDp === this.screenHeight)) return
    this.screenWidth = widthDp
    this.screenHeight = heightDp
    this.update()
  }

  /** `still` says whether the pager is at rest. */
  setStill(still: () => boolean): void {
    this.stillAtRest = still
  }

  /** Consent is settled and the ads library is started. What the phone remembers of the strip is read first, to know its room. */
  ready(): void {
    if (this.destroyed || this.readySignalled) return
    this.readySignalled = true
    void this.memorized().then(() => {
      if (this.destroyed) return
      this.isReadyNow = true
      this.update()
    })
  }

  /** Whether a story is on the screen, so the strip belongs there. */
  show(wanted: boolean): void {
    if (this.wanted === wanted) return
    this.wanted = wanted
    this.update()
  }

  /** The banner `request` has an ad (the library's onAdLoaded), of this size when it says. */
  loaded(request: number, size?: BannerSize): void {
    if (!this.current(request)) return
    if (size) this.measure(size)
    // Remembered once for the session: the next start keeps the room from the start (see ad-room.ts).
    if (!this.filled) this.remember()
    this.filled = true
    this.retries = 0
    this.update()
  }

  /** The banner `request` has a size (the library's onSizeChange, which an adaptive banner reports as soon as it is on the screen). */
  sized(request: number, size: BannerSize): void {
    if (!this.current(request)) return
    this.measure(size)
    this.publish()
  }

  /** The banner `request` will have no ad (the library's onAdFailedToLoad). */
  failed(request: number): void {
    // A banner that has shown an ad keeps it when a refresh finds none; only one that never had an ad gives its room back.
    if (!this.current(request) || this.filled) return
    this.requested = false
    this.visible = false
    this.publish()
    if (++this.retries <= MAX_RETRIES) {
      this.waiting = true
      this.retryTimer = this.timers.set(() => {
        this.retryTimer = null
        this.waiting = false
        this.update()
      }, RETRY_MS)
    }
  }

  destroy(): void {
    this.destroyed = true
    this.clearTimer('retryTimer')
    this.clearTimer('settleTimer')
    this.requested = false
    this.visible = false
    this.publish()
  }

  private width(): number {
    return Math.min(Math.max(0, Math.floor(this.screenWidth)), MAX_WIDTH_DP)
  }

  private current(request: number): boolean {
    return !this.destroyed && this.requested && request === this.request
  }

  /** The strip may be on the screen: ads may be asked for, a story is shown and the screen has the height. */
  private live(): boolean {
    return this.isReadyNow && this.wanted && !this.destroyed && this.enabled()
  }

  private memorized(): Promise<void> {
    this.loadingMemory ??= Promise.resolve()
      .then(() => this.memory.read())
      .then(
        (record) => {
          this.served = record
        },
        () => undefined,
      )
      .then(() => {
        this.keeps = keepsRoom(this.served.at, this.clock())
        this.height = this.served.heightDp
        this.publish()
      })
    return this.loadingMemory
  }

  private remember(): void {
    const record: BannerServed = { at: this.clock(), heightDp: this.height }
    this.served = record
    // Only a convenience for the next start: a write that fails costs that start the kept room, nothing more.
    void Promise.resolve()
      .then(() => this.memory.write(record))
      .catch(() => undefined)
  }

  private measure(size: BannerSize): void {
    const height = Math.ceil(size.height)
    if (isPlausibleHeight(height)) this.height = height
  }

  private update(): void {
    this.clearTimer('settleTimer')
    if (!this.live()) {
      this.visible = false
      this.publish()
      return
    }
    if (!this.requested && !this.waiting && this.retries <= MAX_RETRIES) this.load()
    // Room for an ad that has come, or from the start where one was served here lately, and not on a retry: an ad that did not come this
    // time is no reason to show an empty bar again. Otherwise the ad is asked for with nothing shown and no room taken.
    const room = this.requested && (this.filled || (this.keeps && this.retries === 0))
    if (room && !this.visible && !this.stillAtRest()) {
      this.settleTimer = this.timers.set(() => {
        this.settleTimer = null
        this.update()
      }, SETTLE_MS)
      this.publish()
      return
    }
    this.visible = room
    this.publish()
  }

  private load(): void {
    this.requested = true
    this.request += 1
  }

  private clearTimer(which: 'retryTimer' | 'settleTimer'): void {
    if (this[which] === null) return
    this.timers.clear(this[which])
    this[which] = null
  }

  private publish(): void {
    const now = this.store.getState()
    const next: AdBarState = { visible: this.visible, requested: this.requested, request: this.request, widthDp: this.width(), heightDp: this.height }
    if (now.visible === next.visible && now.requested === next.requested && now.request === next.request && now.widthDp === next.widthDp && now.heightDp === next.heightDp) return
    this.store.replaceState(next)
  }
}
