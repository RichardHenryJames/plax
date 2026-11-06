import { systemClock, type Clock } from '../platform/clock'
import { createStore, type Store } from '../state/store'
import type { AdNetwork, AdPage, Cancelable } from './ad-network'
import { STORIES_PER_AD, slotsAfter } from './ad-slots'

/** A slot is asked for when the reader is this many stories, or fewer, before it. */
export const LOOKAHEAD = 3
/** Requests in a row that bring no ad before the asking stops for a while. */
export const MAX_FAILURES = 2
export const PAUSE_MS = 5 * 60_000
/** Google's native ads expire after an hour; one held this long without being shown is let go. */
export const STALE_MS = 50 * 60_000

/** A slot with no entry is idle. */
type SlotState = 'loading' | 'ready' | 'seen' | 'failed'

interface Slot {
  readonly after: number
  state: SlotState
  page: AdPage | null
  request: Cancelable | null
  loadedAt: number
}

const holdsAd = (slot: Slot): boolean => slot.state === 'ready' || slot.state === 'seen'

const sameSlots = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((slot, index) => slot === b[index])

/** What a screen reacts to: the slots that hold an ad page now (and have a story after them). A new array each time it changes. */
export interface AdControllerState {
  readonly shown: readonly number[]
}

export interface AdControllerOptions {
  readonly network: AdNetwork
  readonly clock?: Clock
  /** How many stories one full-page ad stands for: the website's setting when the screen was made (default 5). */
  readonly every?: number
}

/**
 * Decides when a full-page ad is asked for, when it joins the pager and when it is let go. It knows nothing of views: it is told where
 * the reader is, it asks the network for ads, and it says (through its store) when the set of ad pages changes. ad-slots.ts says where
 * the slots are; this says which of them hold an ad. A port of AdController.java, with the same rules and the same numbers.
 *
 * The rules, each of which exists so that the pager never moves under the reader and a reader never sees an ad twice in a row:
 * - A slot is asked for when the reader is LOOKAHEAD stories or fewer before it, so the ad has had the time of a few swipes to arrive.
 *   A slot nearer than that, or already passed, is not asked for.
 * - An ad that arrives joins the pager only if its slot is still ahead of the reader, so a page is never inserted at or before the one on
 *   the screen. An ad that arrives after its slot has been passed is let go.
 * - An ad the reader has been shown stays while the reader is within a story of it (so a swipe back and forth shows the same page) and is
 *   let go when the reader is further away, so the same ad is never kept for a second visit and memory stays small. A new visit to the
 *   slot asks for a new ad.
 * - An ad held for longer than STALE_MS without being shown is let go: Google's native ads expire after an hour.
 * - MAX_FAILURES requests in a row that bring no ad stop the asking for PAUSE_MS: on a bad connection, or while an account is new and has
 *   nothing to serve, the app does not ask at every swipe.
 */
export class AdController {
  readonly store: Store<AdControllerState> = createStore<AdControllerState>({ shown: [] })
  private readonly network: AdNetwork
  private readonly clock: Clock
  private stories: number
  private readonly slots = new Map<number, Slot>()
  /** The reader's consent is settled and the ads library is started. */
  private isReadyNow = false
  private destroyed = false
  /** Where the reader is: the item of the model's list, and how long that list is. -1 until the reader has been seen. */
  private item = -1
  private count = 0
  private failures = 0
  private pausedUntil = 0

  constructor(options: AdControllerOptions) {
    this.network = options.network
    this.clock = options.clock ?? systemClock
    this.stories = Number.isInteger(options.every) && (options.every as number) >= 1 ? (options.every as number) : STORIES_PER_AD
  }

  /** How many stories one full-page ad stands for. */
  every(): number {
    return this.stories
  }

  /**
   * Sets how many stories one ad stands for while no reader has been seen yet (the website's settings may be read after the screen is
   * made). From then on the number is kept, so that no ad changes its slot; a value that is not a whole number of at least 1 is ignored.
   */
  setEvery(every: number): void {
    if (this.destroyed || this.item >= 0 || !Number.isInteger(every) || every < 1) return
    this.stories = every
  }

  /** Whether full-page ads are shown at all in this build. */
  enabled(): boolean {
    return this.network.page()
  }

  /** Consent is settled and the library is started: ads may be asked for. */
  ready(): void {
    if (this.destroyed || this.isReadyNow) return
    this.isReadyNow = true
    if (this.item >= 0) this.request()
  }

  isReady(): boolean {
    return this.isReadyNow
  }

  /**
   * The reader is on this item of the model's list, which is `count` long. `onSlot` is the slot of the ad page the reader is on, or -1 on
   * a story. Call it whenever the reader moves, and whenever the list changes.
   */
  reader(item: number, count: number, onSlot: number): void {
    if (this.destroyed || !this.network.page()) return
    this.item = item
    this.count = count
    if (onSlot >= 0) {
      const slot = this.slots.get(onSlot)
      if (slot && slot.state === 'ready') slot.state = 'seen'
    }
    const changed = this.sweep()
    if (this.isReadyNow) this.request()
    // A list that has shrunk or grown can take a slot's page out of the pager or bring it back with no ad having come or gone.
    if (changed || !sameSlots(this.store.getState().shown, this.shown())) this.notify()
  }

  /** The slots, ascending, that hold an ad now and have a story after them: the ones the pager shows a page for. */
  shown(): readonly number[] {
    const held: number[] = []
    for (const slot of this.slots.values()) if (holdsAd(slot) && slot.after < this.count) held.push(slot.after)
    return held.sort((a, b) => a - b)
  }

  /** The ad of the slot with this number (see slotOrdinal), or null when it has none or has been let go. */
  page(ordinal: number): AdPage | null {
    const slot = this.slots.get(ordinal * this.stories)
    return slot && holdsAd(slot) ? slot.page : null
  }

  /** Lets everything go: the screen is closing for good. Nothing is announced any more. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const slot of this.slots.values()) this.release(slot)
    this.slots.clear()
  }

  /** Lets go of what is behind the reader or has gone stale. True when a page that was shown is gone. */
  private sweep(): boolean {
    let changed = false
    const now = this.clock()
    for (const slot of [...this.slots.values()].sort((a, b) => a.after - b.after)) {
      const distance = slot.after - this.item
      let letGo = false
      switch (slot.state) {
        case 'seen':
          letGo = distance >= 2 || distance <= -1
          break
        case 'ready':
          letGo = distance <= 0 || now - slot.loadedAt > STALE_MS
          break
        case 'loading':
          letGo = distance <= 0 || distance > LOOKAHEAD + 2
          break
        case 'failed':
          letGo = distance <= 0 || distance > LOOKAHEAD
          break
      }
      if (!letGo) continue
      this.slots.delete(slot.after)
      changed ||= holdsAd(slot) && slot.after < this.count
      this.release(slot)
    }
    return changed
  }

  private request(): void {
    if (this.destroyed || this.item < 0 || this.clock() < this.pausedUntil) return
    for (const after of slotsAfter(this.count, this.stories)) {
      const distance = after - this.item
      if (distance < 1 || distance > LOOKAHEAD || this.slots.has(after)) continue
      this.load(after)
    }
  }

  private load(after: number): void {
    const slot: Slot = { after, state: 'loading', page: null, request: null, loadedAt: 0 }
    this.slots.set(after, slot)
    const request = this.network.loadPage({
      loaded: (page) => this.arrived(slot, page),
      failed: () => this.missed(slot),
    })
    // A network that answers at once has settled the slot already; there is nothing left to cancel then.
    if (this.slots.get(after) === slot && slot.state === 'loading') slot.request = request
  }

  private arrived(slot: Slot, page: AdPage): void {
    if (this.destroyed || this.slots.get(slot.after) !== slot || slot.state !== 'loading') {
      page.destroy()
      return
    }
    this.failures = 0
    // A slot the reader has reached while it loaded is no longer here: reader() lets go of it, and so of its request.
    slot.page = page
    slot.state = 'ready'
    slot.request = null
    slot.loadedAt = this.clock()
    this.notify()
  }

  private missed(slot: Slot): void {
    if (this.destroyed || this.slots.get(slot.after) !== slot || slot.state !== 'loading') return
    slot.state = 'failed'
    slot.request = null
    if (++this.failures >= MAX_FAILURES) {
      this.failures = 0
      this.pausedUntil = this.clock() + PAUSE_MS
    }
  }

  private release(slot: Slot): void {
    slot.request?.cancel()
    slot.request = null
    slot.page?.destroy()
    slot.page = null
  }

  private notify(): void {
    this.store.setState({ shown: this.shown() })
  }
}
