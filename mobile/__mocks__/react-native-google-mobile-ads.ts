// The ads library as the tests see it: nothing is ever asked of Google, and a test decides what the library "answers" and when.
// Used automatically by every test (it stands beside node_modules). The controls are in `__mock`; call `__mock.reset()` before each
// test that uses them, because jest.after-env.ts does not know this module.
//
//   consent.update / consent.form / consent.options   the three calls of Google's consent tool: 'auto' answers at once, 'hold' waits
//                                                     for release(), 'fail' refuses. What the reader's choice does to the consent
//                                                     information is set in afterUpdate / afterForm / afterOptions.
//   initialize                                        MobileAds().initialize(), the same three modes.
//   native.requests                                   every NativeAd.createForAdRequest, each with resolve() and reject().
//   banners.instances                                 the BannerAd components on the screen now, each with loaded() and failed().
//   assets.registered                                 the NativeAsset views a native ad card has registered with its NativeAdView.
import * as React from 'react'
import { View, type ViewProps } from 'react-native'

/** A plain view that carries what a test wants to read of the real component's props. */
const host = (props: Record<string, unknown>, children?: React.ReactNode) => React.createElement(View, props as unknown as ViewProps, children)

export enum BannerAdSize {
  BANNER = 'BANNER',
  FULL_BANNER = 'FULL_BANNER',
  LARGE_BANNER = 'LARGE_BANNER',
  LEADERBOARD = 'LEADERBOARD',
  MEDIUM_RECTANGLE = 'MEDIUM_RECTANGLE',
  ANCHORED_ADAPTIVE_BANNER = 'ANCHORED_ADAPTIVE_BANNER',
  LARGE_ANCHORED_ADAPTIVE_BANNER = 'LARGE_ANCHORED_ADAPTIVE_BANNER',
  INLINE_ADAPTIVE_BANNER = 'INLINE_ADAPTIVE_BANNER',
  WIDE_SKYSCRAPER = 'WIDE_SKYSCRAPER',
}

/** Google's test units, as the library has them on Android. */
export const TestIds = {
  APP_OPEN: 'ca-app-pub-3940256099942544/9257395921',
  ADAPTIVE_BANNER: 'ca-app-pub-3940256099942544/9214589741',
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
  REWARDED_INTERSTITIAL: 'ca-app-pub-3940256099942544/5354046379',
  NATIVE: 'ca-app-pub-3940256099942544/2247696110',
  NATIVE_VIDEO: 'ca-app-pub-3940256099942544/1044960115',
}

export enum AdsConsentStatus {
  UNKNOWN = 'UNKNOWN',
  REQUIRED = 'REQUIRED',
  NOT_REQUIRED = 'NOT_REQUIRED',
  OBTAINED = 'OBTAINED',
}

export enum AdsConsentPrivacyOptionsRequirementStatus {
  UNKNOWN = 'UNKNOWN',
  REQUIRED = 'REQUIRED',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum AdsConsentDebugGeography {
  DISABLED = 0,
  EEA = 1,
  NOT_EEA = 2,
  REGULATED_US_STATE = 3,
  OTHER = 4,
}

export enum NativeAdChoicesPlacement {
  TOP_LEFT = 0,
  TOP_RIGHT = 1,
  BOTTOM_RIGHT = 2,
  BOTTOM_LEFT = 3,
}

export enum NativeMediaAspectRatio {
  ANY = 1,
  LANDSCAPE = 2,
  PORTRAIT = 3,
  SQUARE = 4,
}

export enum NativeAssetType {
  ADVERTISER = 'advertiser',
  BODY = 'body',
  CALL_TO_ACTION = 'callToAction',
  HEADLINE = 'headline',
  PRICE = 'price',
  STORE = 'store',
  STAR_RATING = 'starRating',
  ICON = 'icon',
  IMAGE = 'image',
}

/** A call of the library that a test can answer when it likes. */
class Gate<T> {
  /** 'auto' answers at once, 'hold' waits for release() or fail(), 'fail' refuses at once. */
  mode: 'auto' | 'hold' | 'fail' = 'auto'
  private waiting: { answer: () => void; refuse: () => void }[] = []

  call(answer: () => T): Promise<T> {
    if (this.mode === 'fail') return Promise.reject(new Error('refused by the test'))
    if (this.mode === 'auto') return Promise.resolve().then(answer)
    return new Promise<T>((resolve, reject) => {
      this.waiting.push({ answer: () => resolve(answer()), refuse: () => reject(new Error('refused by the test')) })
    })
  }

  /** How many calls are waiting for an answer. */
  get pending(): number {
    return this.waiting.length
  }

  /** Answers the oldest waiting call, or all of them. */
  release(all = false): void {
    for (const call of all ? this.waiting.splice(0) : this.waiting.splice(0, 1)) call.answer()
  }

  /** Refuses the oldest waiting call, or all of them. */
  fail(all = false): void {
    for (const call of all ? this.waiting.splice(0) : this.waiting.splice(0, 1)) call.refuse()
  }

  reset(): void {
    this.mode = 'auto'
    this.waiting = []
  }
}

export interface MockConsentInfo {
  status: AdsConsentStatus
  canRequestAds: boolean
  privacyOptionsRequirementStatus: AdsConsentPrivacyOptionsRequirementStatus
  isConsentFormAvailable: boolean
}

const noConsentYet = (): MockConsentInfo => ({
  status: AdsConsentStatus.UNKNOWN,
  canRequestAds: false,
  privacyOptionsRequirementStatus: AdsConsentPrivacyOptionsRequirementStatus.UNKNOWN,
  isConsentFormAvailable: false,
})

const consent = {
  /** What the tool knows now (what getConsentInfo returns). */
  info: noConsentYet(),
  /** What each answered call changes in `info`: the reader's choice. */
  afterUpdate: {} as Partial<MockConsentInfo>,
  afterForm: {} as Partial<MockConsentInfo>,
  afterOptions: {} as Partial<MockConsentInfo>,
  update: new Gate<MockConsentInfo>(),
  form: new Gate<MockConsentInfo>(),
  options: new Gate<MockConsentInfo>(),
  read: new Gate<MockConsentInfo>(),
}

const answered = (change: Partial<MockConsentInfo>): MockConsentInfo => {
  consent.info = { ...consent.info, ...change }
  return { ...consent.info }
}

const consentImplementations = {
  requestInfoUpdate: (_options?: unknown) => consent.update.call(() => answered(consent.afterUpdate)),
  loadAndShowConsentFormIfRequired: () => consent.form.call(() => answered(consent.afterForm)),
  showPrivacyOptionsForm: () => consent.options.call(() => answered(consent.afterOptions)),
  getConsentInfo: () => consent.read.call(() => ({ ...consent.info })),
}

export const AdsConsent = {
  requestInfoUpdate: jest.fn(consentImplementations.requestInfoUpdate),
  loadAndShowConsentFormIfRequired: jest.fn(consentImplementations.loadAndShowConsentFormIfRequired),
  showPrivacyOptionsForm: jest.fn(consentImplementations.showPrivacyOptionsForm),
  getConsentInfo: jest.fn(consentImplementations.getConsentInfo),
}

const initialize = new Gate<unknown[]>()
const initializeImplementation = () => initialize.call(() => [])
const initializeCall = jest.fn(initializeImplementation)
const mobileAdsInstance = { initialize: initializeCall }
const mobileAdsImplementation = () => mobileAdsInstance
export const MobileAds = jest.fn(mobileAdsImplementation)
export default MobileAds

export interface MockNativeAdProps {
  responseId: string
  advertiser: string | null
  body: string
  callToAction: string
  headline: string
  price: string | null
  store: string | null
  starRating: number | null
  icon: { url: string; scale: number } | null
  images: { url: string; scale: number }[] | null
  mediaContent: { aspectRatio: number; hasVideoContent: boolean; duration: number } | null
  extras: Record<string, unknown> | null
}

let adNumber = 0

export const nativeAdProps = (override: Partial<MockNativeAdProps> = {}): MockNativeAdProps => {
  adNumber += 1
  return {
    responseId: `response-${adNumber}`,
    advertiser: 'Plax Test Advertiser',
    body: 'Hundreds of offers from the shops you already use, on one screen.',
    callToAction: 'Install now',
    headline: 'Save big on everything this season',
    price: null,
    store: null,
    starRating: null,
    icon: { url: 'file:///ad/icon.png', scale: 1 },
    images: null,
    mediaContent: { aspectRatio: 1.91, hasVideoContent: false, duration: 0 },
    extras: null,
    ...override,
  }
}

export class NativeAd {
  readonly adUnitId: string
  readonly responseId: string
  readonly advertiser: string | null
  readonly body: string
  readonly callToAction: string
  readonly headline: string
  readonly price: string | null
  readonly store: string | null
  readonly starRating: number | null
  readonly icon: { url: string; scale: number } | null
  readonly images: { url: string; scale: number }[] | null
  readonly mediaContent: { aspectRatio: number; hasVideoContent: boolean; duration: number } | null
  readonly extras: Record<string, unknown> | null
  readonly destroy = jest.fn()

  constructor(adUnitId: string, props: MockNativeAdProps) {
    this.adUnitId = adUnitId
    this.responseId = props.responseId
    this.advertiser = props.advertiser
    this.body = props.body
    this.callToAction = props.callToAction
    this.headline = props.headline
    this.price = props.price
    this.store = props.store
    this.starRating = props.starRating
    this.icon = props.icon
    this.images = props.images
    this.mediaContent = props.mediaContent
    this.extras = props.extras
  }

  static createForAdRequest: (unitId: string, options?: unknown) => Promise<NativeAd>
}

export interface NativeRequest {
  readonly unitId: string
  readonly options: unknown
  settled: boolean
  /** Hands the ad over (the library's promise resolves with it). */
  resolve(override?: Partial<MockNativeAdProps>): NativeAd
  /** The request fails (the library's promise rejects). */
  reject(): void
}

const native = {
  /** 'auto' answers every request at once with `ad`, 'hold' waits for resolve() or reject(), 'fail' refuses. */
  mode: 'hold' as 'auto' | 'hold' | 'fail',
  /** The ad that an automatic answer hands over. */
  ad: {} as Partial<MockNativeAdProps>,
  requests: [] as NativeRequest[],
  /** Every ad handed over, in order. */
  made: [] as NativeAd[],
}

const createForAdRequest = (unitId: string, options?: unknown): Promise<NativeAd> => {
  return new Promise<NativeAd>((resolve, reject) => {
    const request: NativeRequest = {
      unitId,
      options,
      settled: false,
      resolve(override = {}) {
        request.settled = true
        const ad = new NativeAd(unitId, nativeAdProps({ ...native.ad, ...override }))
        native.made.push(ad)
        resolve(ad)
        return ad
      },
      reject() {
        request.settled = true
        reject(new Error('refused by the test'))
      },
    }
    native.requests.push(request)
    if (native.mode === 'auto') request.resolve()
    else if (native.mode === 'fail') request.reject()
  })
}

NativeAd.createForAdRequest = jest.fn(createForAdRequest)

export interface BannerProps {
  unitId: string
  size: string
  width?: number
  maxHeight?: number
  requestOptions?: unknown
  onAdLoaded?: (size: { width: number; height: number }) => void
  onAdFailedToLoad?: (error: Error) => void
  onSizeChange?: (size: { width: number; height: number }) => void
}

const banners = {
  /** The banners on the screen now. */
  instances: [] as BannerAd[],
  /** How many banners were ever put on the screen. */
  mounts: 0,
  /** What a banner does when it is put on the screen: wait for the test, or at once have an ad or none. */
  mode: 'hold' as 'hold' | 'fill' | 'nofill',
  /** When set, a banner reports this size as soon as it is on the screen, as the real library does for an adaptive banner. */
  autoSize: null as { width: number; height: number } | null,
  /** The size of an ad that arrives without one being given. */
  size: { width: 360, height: 56 },
  last(): BannerAd {
    const banner = banners.instances[banners.instances.length - 1]
    if (!banner) throw new Error('no banner is on the screen')
    return banner
  },
}

export class BannerAd extends React.Component<BannerProps> {
  componentDidMount() {
    banners.instances.push(this)
    banners.mounts += 1
    if (banners.autoSize) this.props.onSizeChange?.(banners.autoSize)
    if (banners.mode === 'fill') this.loaded()
    else if (banners.mode === 'nofill') this.failed()
  }

  componentWillUnmount() {
    banners.instances = banners.instances.filter((banner) => banner !== this)
  }

  /** An ad has arrived. */
  loaded(size: { width: number; height: number } = banners.size): void {
    this.props.onAdLoaded?.(size)
  }

  /** No ad will come. */
  failed(message = 'no fill'): void {
    this.props.onAdFailedToLoad?.(new Error(message))
  }

  sized(size: { width: number; height: number }): void {
    this.props.onSizeChange?.(size)
  }

  render() {
    return host({ testID: 'mock-banner-ad', unitId: this.props.unitId, bannerSize: this.props.size, bannerWidth: this.props.width })
  }
}

const assets = {
  /** The views registered with a native ad view, in the order they were put on the screen. */
  registered: [] as { assetType: string }[],
}

export function NativeAdView(props: { nativeAd: NativeAd; style?: unknown; children?: React.ReactNode }) {
  return host({ testID: 'mock-native-ad-view', style: props.style, nativeAd: props.nativeAd }, props.children)
}

export function NativeAsset(props: { assetType: NativeAssetType | string; children: React.ReactElement }) {
  const { assetType } = props
  React.useEffect(() => {
    assets.registered.push({ assetType })
  }, [assetType])
  return props.children
}

export function NativeMediaView(props: { resizeMode?: string; style?: unknown }) {
  return React.createElement(NativeAsset, { assetType: 'media', children: host({ testID: 'mock-native-media-view', resizeMode: props.resizeMode, style: props.style }) })
}

const reset = (): void => {
  consent.info = noConsentYet()
  consent.afterUpdate = {}
  consent.afterForm = {}
  consent.afterOptions = {}
  for (const gate of [consent.update, consent.form, consent.options, consent.read, initialize]) gate.reset()
  // A test may have replaced what a call does: every call is what it was made as, with its history gone.
  AdsConsent.requestInfoUpdate.mockReset().mockImplementation(consentImplementations.requestInfoUpdate)
  AdsConsent.loadAndShowConsentFormIfRequired.mockReset().mockImplementation(consentImplementations.loadAndShowConsentFormIfRequired)
  AdsConsent.showPrivacyOptionsForm.mockReset().mockImplementation(consentImplementations.showPrivacyOptionsForm)
  AdsConsent.getConsentInfo.mockReset().mockImplementation(consentImplementations.getConsentInfo)
  MobileAds.mockReset().mockImplementation(mobileAdsImplementation)
  initializeCall.mockReset().mockImplementation(initializeImplementation)
  ;(NativeAd.createForAdRequest as jest.Mock).mockReset().mockImplementation(createForAdRequest)
  native.mode = 'hold'
  native.ad = {}
  native.requests = []
  native.made = []
  banners.instances = []
  banners.mounts = 0
  banners.mode = 'hold'
  banners.autoSize = null
  banners.size = { width: 360, height: 56 }
  assets.registered = []
  adNumber = 0
}

export const __mock = { consent, initialize, initializeCall, native, banners, assets, reset }
export type MockControls = typeof __mock
