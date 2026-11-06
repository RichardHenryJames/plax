import {
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus,
  MobileAds,
  NativeAd,
  NativeAdChoicesPlacement,
  type AdsConsentInfo,
  type AdsConsentInfoOptions,
} from 'react-native-google-mobile-ads'
import { DEFAULT_MEDIA_ASPECT, type AdNetwork, type AdPage, type Cancelable, type NativeAdContent, type PageListener } from './ad-network'
import { systemTimers, type Timers } from './timers'
import type { AdUnits } from './units'

/**
 * How long a request for a full-page ad is waited for. The Android side of the library never reports a native ad that failed to load
 * (its promise stays open), while the native app's AdListener did say so; so that a miss still counts, the wait ends here.
 */
export const PAGE_TIMEOUT_MS = 30_000

export interface GoogleAdsOptions {
  readonly units: AdUnits
  /** A test build can pretend the reader is in the EEA ('eea') or elsewhere ('other'), to see the consent message. */
  readonly consentTest?: 'eea' | 'other'
  readonly timers?: Timers
  readonly pageTimeoutMs?: number
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** What the card shows of an ad, made from whatever the library handed over. Never throws for a missing or odd asset. */
export function contentOf(ad: NativeAd): NativeAdContent {
  const media = ad.mediaContent
  const aspect = media && typeof media.aspectRatio === 'number' && Number.isFinite(media.aspectRatio) && media.aspectRatio > 0 ? media.aspectRatio : DEFAULT_MEDIA_ASPECT
  const icon = ad.icon && typeof ad.icon.url === 'string' && ad.icon.url !== '' ? { url: ad.icon.url } : null
  return {
    id: String(ad.responseId),
    headline: typeof ad.headline === 'string' ? ad.headline : '',
    body: text(ad.body),
    callToAction: text(ad.callToAction),
    advertiser: text(ad.advertiser),
    icon,
    media: media ? { aspectRatio: aspect } : null,
  }
}

function destroyQuietly(ad: NativeAd): void {
  try {
    ad.destroy()
  } catch {
    // An ad that cannot be let go is not worth more than that.
  }
}

class GooglePage implements AdPage {
  readonly content: NativeAdContent
  private gone = false

  constructor(readonly ad: NativeAd) {
    this.content = contentOf(ad)
  }

  get destroyed(): boolean {
    return this.gone
  }

  destroy(): void {
    if (this.gone) return
    this.gone = true
    destroyQuietly(this.ad)
  }
}

/**
 * Google AdMob. Consent comes first, through Google's consent tool: it shows its message to readers in the EEA, the UK and Switzerland
 * (and wherever the account's message is set to appear) and stores the answer; no ad is asked for, and the ads library is not started,
 * until the tool says ads may be requested. A port of GoogleAds.java.
 *
 * One instance serves the whole process (see googleAds()), because consent is the process's, however many times a screen is made again.
 */
export class GoogleAds implements AdNetwork {
  /** Screens waiting for the library to start; each is told once. */
  private readonly waiting: (() => void)[] = []
  private readonly watchers = new Set<() => void>()
  private readonly timers: Timers
  private started = false
  private starting = false
  private asking = false
  private privacy = false

  constructor(private readonly options: GoogleAdsOptions) {
    this.timers = options.timers ?? systemTimers
  }

  banner(): boolean {
    return this.options.units.banner !== ''
  }

  page(): boolean {
    return this.options.units.page !== ''
  }

  bannerUnit(): string {
    return this.options.units.banner
  }

  start(ready: () => void): void {
    if (this.started) {
      ready()
      return
    }
    this.waiting.push(ready)
    if (!this.asking) {
      this.asking = true
      void this.ask()
    }
    // Consent given in an earlier session may be enough already: then the first ad does not wait for the answer.
    void this.afterConsent()
  }

  privacyOptions(): boolean {
    return this.privacy
  }

  watchPrivacyOptions(listener: () => void): () => void {
    this.watchers.add(listener)
    return () => {
      this.watchers.delete(listener)
    }
  }

  async showPrivacyOptions(): Promise<void> {
    try {
      this.remember(await AdsConsent.showPrivacyOptionsForm())
    } catch {
      // The form could not be shown or failed: the reader's choices are what they were.
    }
    // The reader may have allowed ads just now.
    await this.afterConsent()
  }

  loadPage(listener: PageListener): Cancelable {
    // 'waiting' until the request has an answer; 'over' once it has been answered, timed out or abandoned (each of which stops the timer).
    let state: 'waiting' | 'over' = 'waiting'
    const timer = this.timers.set(() => {
      state = 'over'
      listener.failed()
    }, this.options.pageTimeoutMs ?? PAGE_TIMEOUT_MS)
    let request: Promise<NativeAd>
    try {
      request = NativeAd.createForAdRequest(this.options.units.page, {
        // The corner is ours to choose; the card keeps it free.
        adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT,
        startVideoMuted: true,
      })
    } catch {
      this.timers.clear(timer)
      state = 'over'
      listener.failed()
      return { cancel: () => undefined }
    }
    request.then(
      (ad) => {
        this.timers.clear(timer)
        // An ad that arrives after it was given up on, or timed out, is let go.
        if (state !== 'waiting') {
          destroyQuietly(ad)
          return
        }
        state = 'over'
        let page: GooglePage
        try {
          page = new GooglePage(ad)
        } catch {
          destroyQuietly(ad)
          listener.failed()
          return
        }
        listener.loaded(page)
      },
      () => {
        this.timers.clear(timer)
        if (state !== 'waiting') return
        state = 'over'
        listener.failed()
      },
    )
    return {
      cancel: () => {
        state = 'over'
        this.timers.clear(timer)
      },
    }
  }

  /** The question put to Google's consent tool: nothing more than the geography a test build pretends to be in. */
  private consentOptions(): AdsConsentInfoOptions {
    const test = this.options.consentTest
    if (!test) return {}
    return { debugGeography: test === 'eea' ? AdsConsentDebugGeography.EEA : AdsConsentDebugGeography.OTHER }
  }

  /** Every launch asks again whether consent is needed; the form shows only when it is. */
  private async ask(): Promise<void> {
    try {
      this.remember(await AdsConsent.requestInfoUpdate(this.consentOptions()))
      this.remember(await AdsConsent.loadAndShowConsentFormIfRequired())
    } catch {
      // The tool could not be reached or its form failed: the reader's earlier choices decide, below.
    }
    this.asking = false
    await this.afterConsent()
  }

  /** The tool has answered, or could not: ads may go ahead if the reader's choices (earlier ones, after an error) allow them. */
  private async afterConsent(): Promise<void> {
    let info: AdsConsentInfo | null
    try {
      info = await AdsConsent.getConsentInfo()
    } catch {
      info = null
    }
    this.remember(info)
    if (info?.canRequestAds === true) this.begin()
  }

  private remember(info: AdsConsentInfo | null): void {
    if (!info) return
    const applies = info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
    if (applies === this.privacy) return
    this.privacy = applies
    for (const watcher of [...this.watchers]) watcher()
  }

  private begin(): void {
    if (this.started || this.starting) return
    this.starting = true
    let initialized: Promise<unknown>
    try {
      initialized = MobileAds().initialize()
    } catch {
      this.starting = false
      return
    }
    initialized.then(
      () => {
        this.started = true
        this.starting = false
        for (const screen of this.waiting.splice(0)) {
          try {
            screen()
          } catch {
            // One screen failing must not keep the others from being told.
          }
        }
      },
      () => {
        // The library did not start: nothing is asked for, and the next consent answer tries again.
        this.starting = false
      },
    )
  }
}

let instance: GoogleAds | null = null

/** The one GoogleAds of the process: the first call decides its units. */
export function googleAds(options: GoogleAdsOptions): GoogleAds {
  instance ??= new GoogleAds(options)
  return instance
}

/** Forgets the instance, so that a test can start from nothing. */
export function resetGoogleAds(): void {
  instance = null
}
