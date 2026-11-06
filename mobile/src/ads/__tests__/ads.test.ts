import type { AdPage } from '../ad-network'
import { GoogleAds, resetGoogleAds } from '../google-ads'
import { adsNetwork, setAdNetwork } from '../ads'
import { NO_ADS } from '../no-ads'
import { LIVE_UNITS } from '../units'
import { setVariant } from '../../test/helpers'
import { FakeNetwork, library, mockLibrary, settle } from './helpers'

beforeEach(() => {
  library().reset()
  resetGoogleAds()
  setAdNetwork(null)
})

afterAll(() => {
  setAdNetwork(null)
  resetGoogleAds()
})

describe('the network of a build with no ads', () => {
  it('has nothing to show and asks for nothing', async () => {
    expect(NO_ADS.banner()).toBe(false)
    expect(NO_ADS.page()).toBe(false)
    expect(NO_ADS.bannerUnit()).toBe('')
    expect(NO_ADS.privacyOptions()).toBe(false)
    const ready = jest.fn()
    NO_ADS.start(ready)
    await settle()
    expect(ready).not.toHaveBeenCalled()
  })

  it('answers a request for a page at once with no ad, and has nothing to cancel', () => {
    const listener = { loaded: jest.fn<void, [AdPage]>(), failed: jest.fn<void, []>() }
    const request = NO_ADS.loadPage(listener)
    expect(listener.failed).toHaveBeenCalledTimes(1)
    expect(listener.loaded).not.toHaveBeenCalled()
    expect(() => request.cancel()).not.toThrow()
  })

  it('has no consent choice to show, and says it has finished with it at once', async () => {
    await expect(NO_ADS.showPrivacyOptions()).resolves.toBeUndefined()
    const watcher = jest.fn()
    const stop = NO_ADS.watchPrivacyOptions(watcher)
    expect(() => stop()).not.toThrow()
    expect(watcher).not.toHaveBeenCalled()
  })

  it('never touches the library', async () => {
    NO_ADS.start(jest.fn())
    NO_ADS.loadPage({ loaded: jest.fn(), failed: jest.fn() })
    await NO_ADS.showPrivacyOptions()
    await settle()
    expectLibraryUntouched()
  })
})

function expectLibraryUntouched(): void {
  const { AdsConsent, MobileAds, NativeAd } = mockLibrary()
  expect(AdsConsent.requestInfoUpdate).not.toHaveBeenCalled()
  expect(AdsConsent.loadAndShowConsentFormIfRequired).not.toHaveBeenCalled()
  expect(AdsConsent.showPrivacyOptionsForm).not.toHaveBeenCalled()
  expect(AdsConsent.getConsentInfo).not.toHaveBeenCalled()
  expect(MobileAds).not.toHaveBeenCalled()
  expect(NativeAd.createForAdRequest).not.toHaveBeenCalled()
  expect(library().banners.mounts).toBe(0)
}

describe('which ad network the app uses', () => {
  it('is none in the website\u2019s build', () => {
    setVariant('preview')
    expect(adsNetwork()).toBe(NO_ADS)
  })

  it('is Google, with the owner\u2019s units, in the Google Play build', () => {
    setVariant('play')
    const network = adsNetwork()
    expect(network).toBeInstanceOf(GoogleAds)
    expect([network.banner(), network.page(), network.bannerUnit()]).toEqual([true, true, LIVE_UNITS.banner])
    // One for the whole process: consent is the process's.
    expect(adsNetwork()).toBe(network)
  })

  it('is Google, with Google\u2019s sample units, in the test build', () => {
    setVariant('e2e')
    const network = adsNetwork()
    expect(network).toBeInstanceOf(GoogleAds)
    expect(network.bannerUnit()).toBe(mockLibrary().TestIds.ADAPTIVE_BANNER)
  })

  it('is read when asked, so a change of build is seen', () => {
    setVariant('play')
    const live = adsNetwork()
    setVariant('preview')
    expect(adsNetwork()).toBe(NO_ADS)
    setVariant('play')
    expect(adsNetwork()).toBe(live)
  })

  it('can be replaced by a fake for a test, and put back', () => {
    const fake = new FakeNetwork()
    setAdNetwork(fake)
    setVariant('preview')
    expect(adsNetwork()).toBe(fake)
    setVariant('play')
    expect(adsNetwork()).toBe(fake)
    setAdNetwork(null)
    expect(adsNetwork()).toBeInstanceOf(GoogleAds)
  })

  it('asks nothing of the library to choose', () => {
    setVariant('play')
    adsNetwork()
    setVariant('e2e')
    adsNetwork()
    setVariant('preview')
    adsNetwork()
    expectLibraryUntouched()
  })
})
