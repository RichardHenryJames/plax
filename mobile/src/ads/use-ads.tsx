import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dimensions, useWindowDimensions } from 'react-native'
import { useStore } from '../state/store'
import type { AdBar } from './ad-bar'
import type { AdController } from './ad-controller'
import type { AdNetwork } from './ad-network'
import { pageFits } from './ad-slots'
import { cleanSettings, createAdsSession, type AdSettings, type AdsSession } from './ads-session'

const AdsContext = createContext<AdsSession | null>(null)

/** Gives the screens under it this session of the ads instead of the app's own: for a test, or for an app that keeps its own. */
export function AdsProvider(props: { session: AdsSession; children?: ReactNode }) {
  return createElement(AdsContext.Provider, { value: props.session }, props.children)
}

let shared: AdsSession | null = null

/** The one session of the app, made the first time it is asked for (the settings of that first call decide how many stories an ad stands for). */
export function sharedAdsSession(settings?: AdSettings): AdsSession {
  if (!shared) {
    const { width, height } = Dimensions.get('window')
    shared = createAdsSession({ settings, screen: { widthDp: width, heightDp: height } })
  }
  return shared
}

/** Lets the app's session go, so that a test can start from nothing. */
export function resetSharedAdsSession(): void {
  shared?.destroy()
  shared = null
}

/** The ads, as a screen sees them. */
export interface Ads {
  readonly session: AdsSession
  readonly network: AdNetwork
  readonly controller: AdController
  readonly bar: AdBar
  /** The settings in force. */
  readonly settings: AdSettings
  /** This build has ads at all (a banner or a full page): About says so, and says there are none otherwise. */
  readonly hasAds: boolean
  /**
   * Full-page ads belong between the stories: the build has a unit for them and the website's switches are on. The feed adds its own
   * conditions (it has stories, and the screen has the room: useRoomForPages()).
   */
  readonly pagesOn: boolean
  /** How many stories one full-page ad stands for. */
  readonly every: number
  /** The slots (each is the number of items before the ad) that hold an ad page now, ascending. A new array whenever it changes. */
  readonly shown: readonly number[]
  /** The reader has a consent choice to change: the menu offers "Privacy and ad choices" (ad_choices), which calls showPrivacyOptions. */
  readonly privacyOptions: boolean
  showPrivacyOptions(): Promise<void>
}

/**
 * The ads of the app. Every caller gets the same session. Call it with the website's settings where the feed is (they are read from the
 * config); a caller that only needs to look (the menu, About) calls it with none, and leaves the settings as they are. Nothing is started
 * until the settings say ads are on. The feed then
 *  - tells the controller where the reader is: `ads.controller.reader(item, stories.length, slotAt(pagerPosition, slots))`, whenever the
 *    reader moves or the list changes (only while ads.pagesOn and the feed shows stories on a screen with room for them);
 *  - makes the pager's list with `interleave(stories, slots, ads.every, adStory)`, where `slots` is `useSettledSlots(ads.shown, moving)`
 *    (or NO_SLOTS when the feed does not show ad pages), and draws an ad item with `<NativeAdPage page={ads.controller.page(adOrdinal(item))} />`;
 *  - puts an <AdStrip ads={ads} /> under the pager, and offers the menu entry when ads.privacyOptions.
 */
export function useAds(settings?: AdSettings): Ads {
  const provided = useContext(AdsContext)
  const session = provided ?? sharedAdsSession(settings)
  const given = settings ? cleanSettings(settings) : null
  const givenAds = given?.ads
  const givenPages = given?.pages
  const givenEvery = given?.every
  useEffect(() => {
    if (givenAds !== undefined && givenPages !== undefined && givenEvery !== undefined) session.configure({ ads: givenAds, pages: givenPages, every: givenEvery })
  }, [session, givenAds, givenPages, givenEvery])
  const inForce = useStore(session.store, (state) => state.settings)
  const shown = useStore(session.controller.store, (state) => state.shown)
  const privacyOptions = useStore(session.store, (state) => state.privacyOptions)
  // Not the number asked for: the controller takes the website's number only until the reader is first seen.
  const every = useStore(session.store, (state) => state.every)
  const now = given ?? inForce
  const { ads: on, pages, every: asked } = now
  return useMemo<Ads>(
    () => ({
      session,
      network: session.network,
      controller: session.controller,
      bar: session.bar,
      settings: { ads: on, pages, every: asked },
      hasAds: session.network.banner() || session.network.page(),
      pagesOn: on && pages && session.controller.enabled(),
      every,
      shown,
      privacyOptions,
      showPrivacyOptions: () => session.showPrivacyOptions(),
    }),
    [session, on, pages, asked, every, shown, privacyOptions],
  )
}

/**
 * The slots to make the pager's list with. While the pager moves, the slots drawn last stay, so that nothing moves under a swipe (the
 * pages are put in, and taken out, only while it is still); as soon as it stops, the slots of now are drawn.
 */
export function useSettledSlots(slots: readonly number[], moving: boolean): readonly number[] {
  const [drawn, setDrawn] = useState(slots)
  useEffect(() => {
    if (!moving) setDrawn(slots)
  }, [slots, moving])
  return moving ? drawn : slots
}

/** Whether this screen, at its text size, has the room for a full-page ad (pageFits): a phone on its side has not. */
export function useRoomForPages(): boolean {
  const { height, fontScale } = useWindowDimensions()
  return pageFits(height, fontScale)
}
