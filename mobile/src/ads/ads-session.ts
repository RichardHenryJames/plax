import type { Clock } from '../platform/clock'
import { createStore, type Store } from '../state/store'
import { AdBar } from './ad-bar'
import { AdController } from './ad-controller'
import type { AdNetwork } from './ad-network'
import { STORIES_PER_AD } from './ad-slots'
import { adsNetwork } from './ads'
import type { ServedMemory } from './served'
import type { Timers } from './timers'

/**
 * The website's settings that decide what ads there are (the settings file of the app: `features.ads`, `features.adPages` and
 * `ads.pageEvery`, which the config module reads).
 */
export interface AdSettings {
  /** All ads: off, and nothing is asked of Google (not even for consent), and no strip or page is shown. */
  readonly ads: boolean
  /** The full-page ad between the stories. */
  readonly pages: boolean
  /** How many stories one full-page ad stands for (the website allows 3 to 20; the default is 5). */
  readonly every: number
}

export const DEFAULT_AD_SETTINGS: AdSettings = Object.freeze({ ads: true, pages: true, every: STORIES_PER_AD })

/** The settings with a number of stories that can be used (a whole number of at least 1), else the default. */
export function cleanSettings(settings: AdSettings): AdSettings {
  const every = Number.isInteger(settings.every) && settings.every >= 1 ? settings.every : STORIES_PER_AD
  return { ads: settings.ads === true, pages: settings.pages === true, every }
}

const sameSettings = (a: AdSettings, b: AdSettings): boolean => a.ads === b.ads && a.pages === b.pages && a.every === b.every

export interface AdsSessionState {
  readonly settings: AdSettings
  /** How many stories one full-page ad stands for: the website's number until the reader is first seen, then fixed (see AdController.setEvery). */
  readonly every: number
  /** The reader has a consent choice to change: the menu offers "Privacy and ad choices". */
  readonly privacyOptions: boolean
}

export interface AdsSessionOptions {
  /** The ad network (default: the build's own, see adsNetwork()). */
  readonly network?: AdNetwork
  readonly settings?: AdSettings
  readonly clock?: Clock
  readonly timers?: Timers
  readonly memory?: ServedMemory
  /** The screen's size in dp, for the strip (see AdBar.screen()). */
  readonly screen?: { readonly widthDp: number; readonly heightDp: number }
}

/**
 * Everything of the ads that lives as long as the app: the network, the controller of the full-page ads, the strip's logic and the
 * consent. It holds what the native app's AdsViewModel and MainActivity held. It has no views and no React, so it is tested without them.
 */
export interface AdsSession {
  readonly network: AdNetwork
  readonly controller: AdController
  readonly bar: AdBar
  readonly store: Store<AdsSessionState>
  /**
   * The website's settings are known or have changed. The first time they say ads are on, in a build that has any, the consent is asked
   * for and the library started; the controller and the strip are told when ads may be asked for. Safe to call again and again.
   */
  configure(settings: AdSettings): void
  /** Opens the consent tool's choices (offered only where privacyOptions is set); resolves when the reader has finished with them. */
  showPrivacyOptions(): Promise<void>
  /** Lets everything go. */
  destroy(): void
}

export function createAdsSession(options: AdsSessionOptions = {}): AdsSession {
  const network = options.network ?? adsNetwork()
  const first = cleanSettings(options.settings ?? DEFAULT_AD_SETTINGS)
  const controller = new AdController({ network, clock: options.clock, every: first.every })
  const bar = new AdBar({ network, clock: options.clock, timers: options.timers, memory: options.memory, screen: options.screen })
  const store = createStore<AdsSessionState>({ settings: first, every: controller.every(), privacyOptions: network.privacyOptions() })
  let started = false
  let destroyed = false

  const stopWatching = network.watchPrivacyOptions(() => {
    const applies = network.privacyOptions()
    if (store.getState().privacyOptions !== applies) store.setState({ privacyOptions: applies })
  })

  /** Asks the library to start (after the reader's consent, where the law asks for it), once, if the build has ads and the website has them on. */
  const start = (): void => {
    if (started || destroyed || !(network.banner() || network.page()) || !store.getState().settings.ads) return
    started = true
    network.start(() => {
      if (destroyed) return
      controller.ready()
      bar.ready()
    })
  }

  return {
    network,
    controller,
    bar,
    store,
    configure(next) {
      if (destroyed) return
      const settings = cleanSettings(next)
      controller.setEvery(settings.every)
      const now = store.getState()
      if (!sameSettings(now.settings, settings) || now.every !== controller.every()) store.setState({ settings, every: controller.every() })
      start()
    },
    showPrivacyOptions: () => network.showPrivacyOptions(),
    destroy() {
      if (destroyed) return
      destroyed = true
      stopWatching()
      controller.destroy()
      bar.destroy()
    },
  }
}
