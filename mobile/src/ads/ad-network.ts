import type { NativeAd } from 'react-native-google-mobile-ads'

/** A request that can be abandoned when its result is no longer wanted. */
export interface Cancelable {
  cancel(): void
}

/** Wide, as most ad pictures are, when the ad does not say its shape. */
export const DEFAULT_MEDIA_ASPECT = 1.91

/**
 * What the card of a full-page ad shows of the ad, read once when the ad arrives. Everything but the headline may be missing: an ad is
 * something Google's library hands over at its own time and in its own shape.
 */
export interface NativeAdContent {
  /** What tells this ad from another (the library's response id). */
  readonly id: string
  readonly headline: string
  readonly body: string | null
  readonly callToAction: string | null
  readonly advertiser: string | null
  readonly icon: { readonly url: string } | null
  /** The picture or video, with its shape (width over height, a positive number); null when the ad has none. */
  readonly media: { readonly aspectRatio: number } | null
}

/** A full-page ad that has loaded, ready to be put in a page of the pager (see NativeAdPage). */
export interface AdPage {
  readonly content: NativeAdContent
  /** The ad as the library handed it over, which the card's NativeAdView binds (everything the card shows is also in `content`). */
  readonly ad: NativeAd
  /** The ad has been let go: nothing may be drawn from it any more. */
  readonly destroyed: boolean
  /** Lets the ad go. Safe to call twice. */
  destroy(): void
}

export interface PageListener {
  loaded(page: AdPage): void
  failed(): void
}

/**
 * What the app needs from an ad network: the consent that must come first, a banner for the foot of the screen, and a full-page ad that
 * stands between stories. Google's is GoogleAds; NO_ADS shows nothing; tests put a fake in setAdNetwork(), so that no test ever asks
 * Google for anything. A port of AdNetwork.java, except that the banner is not asked for here: the library's BannerAd component asks
 * for itself when it is put on the screen (see AdStrip), so this holds only its ad unit.
 */
export interface AdNetwork {
  /** Whether this network shows a banner at the foot of the screen (the build has a unit for it). */
  banner(): boolean

  /** Whether this network shows a full-page ad after every Nth story (the build has a unit for it). */
  page(): boolean

  /** The banner's ad unit, or '' where there is none. */
  bannerUnit(): string

  /**
   * Gets the reader's consent where it is needed (a message from Google's consent tool in the EEA, the UK and Switzerland) and starts
   * the ads library. Calls `ready` once, when ads may be asked for; never, if the reader does not allow them.
   */
  start(ready: () => void): void

  /** Whether the reader has a consent choice to change: the menu then offers it. Known once consent has been asked for. */
  privacyOptions(): boolean

  /** Tells `listener` when the answer of privacyOptions() has changed. Returns the function that stops it. */
  watchPrivacyOptions(listener: () => void): () => void

  /** Shows that choice; resolves when the reader has finished with it (never rejects). */
  showPrivacyOptions(): Promise<void>

  /**
   * Asks for a full-page ad. The listener is called once with an ad or with none; after cancelling it is not called, and an ad that was
   * already on its way is let go.
   */
  loadPage(listener: PageListener): Cancelable
}
