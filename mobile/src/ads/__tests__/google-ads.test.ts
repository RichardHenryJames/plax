import type { MockNativeAdProps } from '../../../__mocks__/react-native-google-mobile-ads'
import type { AdPage } from '../ad-network'
import { GoogleAds, PAGE_TIMEOUT_MS, contentOf, googleAds, resetGoogleAds } from '../google-ads'
import { LIVE_UNITS } from '../units'
import { library, mockLibrary, settle } from './helpers'

const lib = () => library()
const REQUIRED = () => mockLibrary().AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
const NOT_REQUIRED = () => mockLibrary().AdsConsentPrivacyOptionsRequirementStatus.NOT_REQUIRED
const OBTAINED = () => mockLibrary().AdsConsentStatus.OBTAINED

/** The reader may be asked for nothing, as a reader outside the EEA, or has chosen before. */
const allowedBefore = () => {
  lib().consent.info = { ...lib().consent.info, canRequestAds: true, status: OBTAINED() }
}

/** What Google's consent tool does for a reader who is asked and says yes. */
const readerSaysYes = () => {
  lib().consent.afterUpdate = { privacyOptionsRequirementStatus: REQUIRED(), isConsentFormAvailable: true }
  lib().consent.afterForm = { canRequestAds: true, status: OBTAINED() }
}

const network = (options: Partial<ConstructorParameters<typeof GoogleAds>[0]> = {}) => new GoogleAds({ units: LIVE_UNITS, ...options })

beforeEach(() => {
  lib().reset()
  resetGoogleAds()
})

describe('Google as the ad network', () => {
  it('has a banner and a page where the build has the units, and says which', () => {
    const both = network()
    expect([both.banner(), both.page(), both.bannerUnit()]).toEqual([true, true, LIVE_UNITS.banner])
    const bannerOnly = network({ units: { banner: LIVE_UNITS.banner, page: '' } })
    expect([bannerOnly.banner(), bannerOnly.page()]).toEqual([true, false])
    const pageOnly = network({ units: { banner: '', page: LIVE_UNITS.page } })
    expect([pageOnly.banner(), pageOnly.page(), pageOnly.bannerUnit()]).toEqual([false, true, ''])
  })

  it('asks nothing of Google until it is told to start', async () => {
    network()
    await settle()
    expect(mockLibrary().AdsConsent.requestInfoUpdate).not.toHaveBeenCalled()
    expect(mockLibrary().AdsConsent.getConsentInfo).not.toHaveBeenCalled()
    expect(mockLibrary().MobileAds).not.toHaveBeenCalled()
    expect(mockLibrary().NativeAd.createForAdRequest).not.toHaveBeenCalled()
  })
})

describe('consent comes first', () => {
  it('starts the library and tells the screen only after the reader has answered the consent tool', async () => {
    readerSaysYes()
    lib().consent.update.mode = 'hold'
    const ready = jest.fn()
    network().start(ready)
    await settle()
    // The tool was asked, and has not answered: nothing else may happen.
    expect(mockLibrary().AdsConsent.requestInfoUpdate).toHaveBeenCalledTimes(1)
    expect(mockLibrary().AdsConsent.requestInfoUpdate).toHaveBeenCalledWith({})
    expect(mockLibrary().AdsConsent.loadAndShowConsentFormIfRequired).not.toHaveBeenCalled()
    expect(lib().initializeCall).not.toHaveBeenCalled()
    expect(ready).not.toHaveBeenCalled()

    lib().consent.update.release()
    await settle()
    expect(mockLibrary().AdsConsent.loadAndShowConsentFormIfRequired).toHaveBeenCalledTimes(1)
    expect(lib().initializeCall).toHaveBeenCalledTimes(1)
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('waits for the form the reader is shown before it starts the library', async () => {
    readerSaysYes()
    lib().consent.form.mode = 'hold'
    const ready = jest.fn()
    network().start(ready)
    await settle()
    expect(mockLibrary().AdsConsent.loadAndShowConsentFormIfRequired).toHaveBeenCalledTimes(1)
    expect(lib().initializeCall).not.toHaveBeenCalled()
    expect(ready).not.toHaveBeenCalled()
    lib().consent.form.release()
    await settle()
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('lets the first ad go without waiting for the answer when consent from an earlier session is enough', async () => {
    allowedBefore()
    lib().consent.update.mode = 'hold'
    const ready = jest.fn()
    network().start(ready)
    await settle()
    expect(lib().consent.update.pending).toBe(1)
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('tells the screen only once the library has started', async () => {
    allowedBefore()
    lib().initialize.mode = 'hold'
    const ready = jest.fn()
    network().start(ready)
    await settle()
    expect(lib().initializeCall).toHaveBeenCalledTimes(1)
    expect(ready).not.toHaveBeenCalled()
    lib().initialize.release()
    await settle()
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('never starts the library nor tells the screen when the reader does not allow ads', async () => {
    lib().consent.afterUpdate = { privacyOptionsRequirementStatus: REQUIRED(), isConsentFormAvailable: true }
    lib().consent.afterForm = { canRequestAds: false, status: mockLibrary().AdsConsentStatus.REQUIRED }
    const ready = jest.fn()
    const ads = network()
    ads.start(ready)
    await settle()
    expect(mockLibrary().AdsConsent.loadAndShowConsentFormIfRequired).toHaveBeenCalledTimes(1)
    expect(mockLibrary().MobileAds).not.toHaveBeenCalled()
    expect(ready).not.toHaveBeenCalled()
    // But the reader may change their mind: the choices are offered.
    expect(ads.privacyOptions()).toBe(true)
  })

  it('lets the earlier choices of the reader decide when the consent tool cannot be reached', async () => {
    lib().consent.update.mode = 'fail'
    const refused = jest.fn()
    network().start(refused)
    await settle()
    expect(mockLibrary().AdsConsent.loadAndShowConsentFormIfRequired).not.toHaveBeenCalled()
    expect(refused).not.toHaveBeenCalled()
    expect(mockLibrary().MobileAds).not.toHaveBeenCalled()

    resetGoogleAds()
    lib().reset()
    allowedBefore()
    lib().consent.update.mode = 'fail'
    const allowed = jest.fn()
    network().start(allowed)
    await settle()
    expect(allowed).toHaveBeenCalledTimes(1)
  })

  it('lets the earlier choices decide when the form fails', async () => {
    allowedBefore()
    lib().consent.form.mode = 'fail'
    const ready = jest.fn()
    network().start(ready)
    await settle()
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the state of consent cannot be read', async () => {
    allowedBefore()
    lib().consent.read.mode = 'fail'
    const ready = jest.fn()
    network().start(ready)
    await settle()
    expect(mockLibrary().MobileAds).not.toHaveBeenCalled()
    expect(ready).not.toHaveBeenCalled()
  })

  it('tells every screen that waited, once each, and a screen that comes later at once', async () => {
    readerSaysYes()
    const ads = network()
    const first = jest.fn()
    const second = jest.fn()
    ads.start(first)
    ads.start(second)
    await settle()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    const asked = mockLibrary().AdsConsent.requestInfoUpdate.mock.calls.length
    const late = jest.fn()
    ads.start(late)
    expect(late).toHaveBeenCalledTimes(1)
    await settle()
    expect(mockLibrary().AdsConsent.requestInfoUpdate.mock.calls.length).toBe(asked)
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('does not ask the consent tool twice while it is being asked', async () => {
    readerSaysYes()
    lib().consent.update.mode = 'hold'
    const ads = network()
    ads.start(jest.fn())
    ads.start(jest.fn())
    await settle()
    expect(mockLibrary().AdsConsent.requestInfoUpdate).toHaveBeenCalledTimes(1)
  })

  it('asks the consent tool again at each start of a screen that was left waiting', async () => {
    lib().consent.afterForm = { canRequestAds: false }
    const ads = network()
    ads.start(jest.fn())
    await settle()
    ads.start(jest.fn())
    await settle()
    expect(mockLibrary().AdsConsent.requestInfoUpdate).toHaveBeenCalledTimes(2)
  })

  it('starts the library once however often consent says yes', async () => {
    allowedBefore()
    const ads = network()
    ads.start(jest.fn())
    ads.start(jest.fn())
    ads.start(jest.fn())
    await settle()
    expect(lib().initializeCall).toHaveBeenCalledTimes(1)
  })

  it('tells nobody when the library does not start, and tries again at the next answer', async () => {
    allowedBefore()
    lib().initialize.mode = 'fail'
    const ads = network()
    const ready = jest.fn()
    ads.start(ready)
    await settle()
    expect(ready).not.toHaveBeenCalled()
    lib().initialize.mode = 'auto'
    ads.start(jest.fn())
    await settle()
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('tells nobody when the library cannot even be reached', async () => {
    allowedBefore()
    mockLibrary().MobileAds.mockImplementation(() => {
      throw new Error('no module')
    })
    const ready = jest.fn()
    const ads = network()
    ads.start(ready)
    await settle()
    expect(ready).not.toHaveBeenCalled()
    // It can be reached again, and the screen that waited is told at the next answer.
    lib().reset()
    allowedBefore()
    ads.start(jest.fn())
    await settle()
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('does not let a screen that fails keep the others from being told', async () => {
    allowedBefore()
    const ads = network()
    const after = jest.fn()
    ads.start(() => {
      throw new Error('broken screen')
    })
    ads.start(after)
    await settle()
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('can pretend the reader is in the EEA, or elsewhere, in a test build', async () => {
    const eea = network({ consentTest: 'eea' })
    eea.start(jest.fn())
    await settle()
    expect(mockLibrary().AdsConsent.requestInfoUpdate).toHaveBeenLastCalledWith({ debugGeography: mockLibrary().AdsConsentDebugGeography.EEA })
    resetGoogleAds()
    const other = network({ consentTest: 'other' })
    other.start(jest.fn())
    await settle()
    expect(mockLibrary().AdsConsent.requestInfoUpdate).toHaveBeenLastCalledWith({ debugGeography: mockLibrary().AdsConsentDebugGeography.OTHER })
  })
})

describe('the consent choices in the menu', () => {
  it('are offered only where the consent tool says they apply', async () => {
    lib().consent.afterUpdate = { privacyOptionsRequirementStatus: NOT_REQUIRED() }
    const ads = network()
    expect(ads.privacyOptions()).toBe(false)
    ads.start(jest.fn())
    await settle()
    expect(ads.privacyOptions()).toBe(false)

    resetGoogleAds()
    lib().reset()
    lib().consent.afterUpdate = { privacyOptionsRequirementStatus: REQUIRED() }
    const required = network()
    required.start(jest.fn())
    await settle()
    expect(required.privacyOptions()).toBe(true)
  })

  it('tell the menu when they become known, and not again while they stay the same', async () => {
    lib().consent.afterUpdate = { privacyOptionsRequirementStatus: REQUIRED() }
    const ads = network()
    const watcher = jest.fn()
    ads.watchPrivacyOptions(watcher)
    ads.start(jest.fn())
    await settle()
    expect(watcher).toHaveBeenCalledTimes(1)
    ads.start(jest.fn())
    await settle()
    expect(watcher).toHaveBeenCalledTimes(1)
    // The tool takes them back.
    lib().consent.afterOptions = { privacyOptionsRequirementStatus: NOT_REQUIRED() }
    await ads.showPrivacyOptions()
    expect(ads.privacyOptions()).toBe(false)
    expect(watcher).toHaveBeenCalledTimes(2)
  })

  it('stop telling the menu once it has stopped listening', async () => {
    lib().consent.afterUpdate = { privacyOptionsRequirementStatus: REQUIRED() }
    const ads = network()
    const watcher = jest.fn()
    const stop = ads.watchPrivacyOptions(watcher)
    stop()
    ads.start(jest.fn())
    await settle()
    expect(watcher).not.toHaveBeenCalled()
    expect(ads.privacyOptions()).toBe(true)
  })

  it('open the choices of the consent tool and resolve when the reader has finished with them', async () => {
    const ads = network()
    lib().consent.options.mode = 'hold'
    let done = false
    const shown = ads.showPrivacyOptions().then(() => {
      done = true
    })
    await settle()
    expect(mockLibrary().AdsConsent.showPrivacyOptionsForm).toHaveBeenCalledTimes(1)
    expect(done).toBe(false)
    lib().consent.options.release()
    await shown
    expect(done).toBe(true)
  })

  it('resolve even when the tool cannot show them', async () => {
    const ads = network()
    lib().consent.options.mode = 'fail'
    await expect(ads.showPrivacyOptions()).resolves.toBeUndefined()
  })

  it('start the ads of a reader who allows them just now, after having refused', async () => {
    lib().consent.afterForm = { canRequestAds: false }
    lib().consent.afterUpdate = { privacyOptionsRequirementStatus: REQUIRED() }
    const ads = network()
    const ready = jest.fn()
    ads.start(ready)
    await settle()
    expect(ready).not.toHaveBeenCalled()
    lib().consent.afterOptions = { canRequestAds: true, status: OBTAINED() }
    await ads.showPrivacyOptions()
    await settle()
    expect(ready).toHaveBeenCalledTimes(1)
  })
})

describe('asking for a full-page ad', () => {
  const listener = () => ({ loaded: jest.fn<void, [AdPage]>(), failed: jest.fn<void, []>() })

  beforeEach(() => {
    jest.useFakeTimers()
  })

  it("asks Google's native ad unit for a page, with the AdChoices corner and a muted start", () => {
    network().loadPage(listener())
    expect(mockLibrary().NativeAd.createForAdRequest).toHaveBeenCalledTimes(1)
    expect(mockLibrary().NativeAd.createForAdRequest).toHaveBeenCalledWith(LIVE_UNITS.page, {
      adChoicesPlacement: mockLibrary().NativeAdChoicesPlacement.TOP_RIGHT,
      startVideoMuted: true,
    })
  })

  it('hands over a page made of the ad, once', async () => {
    const answer = listener()
    network().loadPage(answer)
    const ad = lib().native.requests[0].resolve({ headline: 'A headline', body: 'A body', callToAction: 'Go', advertiser: 'Acme' })
    await settle()
    expect(answer.failed).not.toHaveBeenCalled()
    expect(answer.loaded).toHaveBeenCalledTimes(1)
    const page = answer.loaded.mock.calls[0][0]
    expect(page.ad).toBe(ad)
    expect(page.content).toMatchObject({ id: ad.responseId, headline: 'A headline', body: 'A body', callToAction: 'Go', advertiser: 'Acme' })
    expect(page.destroyed).toBe(false)
    // The wait for the answer is over: no timer is left to fire.
    expect(jest.getTimerCount()).toBe(0)
  })

  it('says so when the ad does not come', async () => {
    const answer = listener()
    network().loadPage(answer)
    lib().native.requests[0].reject()
    await settle()
    expect(answer.failed).toHaveBeenCalledTimes(1)
    expect(answer.loaded).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('says so when the library never answers, as the Android side of it does for an ad that cannot be had', async () => {
    const answer = listener()
    network().loadPage(answer)
    await jest.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS - 1)
    expect(answer.failed).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(answer.failed).toHaveBeenCalledTimes(1)
    // And an ad that comes after all is let go, never handed over.
    const late = lib().native.requests[0].resolve()
    await settle()
    expect(late.destroy).toHaveBeenCalledTimes(1)
    expect(answer.loaded).not.toHaveBeenCalled()
    expect(answer.failed).toHaveBeenCalledTimes(1)
  })

  it('waits as long as it is told to', async () => {
    const answer = listener()
    network({ pageTimeoutMs: 5000 }).loadPage(answer)
    await jest.advanceTimersByTimeAsync(4999)
    expect(answer.failed).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(answer.failed).toHaveBeenCalledTimes(1)
    expect(PAGE_TIMEOUT_MS).toBe(30_000)
  })

  it('does not call the listener after it was cancelled, and lets go of an ad that was already on its way', async () => {
    const answer = listener()
    const request = network().loadPage(answer)
    request.cancel()
    expect(jest.getTimerCount()).toBe(0)
    const ad = lib().native.requests[0].resolve()
    await settle()
    expect(ad.destroy).toHaveBeenCalledTimes(1)
    expect(answer.loaded).not.toHaveBeenCalled()
    expect(answer.failed).not.toHaveBeenCalled()
  })

  it('says nothing, after it was cancelled, of an ad that does not come', async () => {
    const answer = listener()
    const request = network().loadPage(answer)
    request.cancel()
    lib().native.requests[0].reject()
    await jest.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS * 2)
    expect(answer.failed).not.toHaveBeenCalled()
  })

  it('does not call the listener again when the request is cancelled after the answer', async () => {
    const answer = listener()
    const request = network().loadPage(answer)
    lib().native.requests[0].resolve()
    await settle()
    request.cancel()
    expect(answer.loaded).toHaveBeenCalledTimes(1)
    expect(answer.failed).not.toHaveBeenCalled()
  })

  it('lets a page go once, and says it is gone', async () => {
    const answer = listener()
    network().loadPage(answer)
    const ad = lib().native.requests[0].resolve()
    await settle()
    const page = answer.loaded.mock.calls[0][0]
    page.destroy()
    page.destroy()
    expect(page.destroyed).toBe(true)
    expect(ad.destroy).toHaveBeenCalledTimes(1)
  })

  it('does not mind an ad that cannot be let go', async () => {
    const answer = listener()
    network().loadPage(answer)
    const ad = lib().native.requests[0].resolve()
    ad.destroy.mockImplementation(() => {
      throw new Error('already gone')
    })
    await settle()
    expect(() => answer.loaded.mock.calls[0][0].destroy()).not.toThrow()
  })

  it('counts an ad it cannot read as an ad that did not come, and lets it go', async () => {
    const answer = listener()
    network().loadPage(answer)
    const ad = lib().native.requests[0].resolve({
      mediaContent: {
        get aspectRatio(): number {
          throw new Error('unreadable')
        },
        hasVideoContent: false,
        duration: 0,
      },
    })
    await settle()
    expect(answer.failed).toHaveBeenCalledTimes(1)
    expect(answer.loaded).not.toHaveBeenCalled()
    expect(ad.destroy).toHaveBeenCalledTimes(1)
  })

  it('counts a request that cannot even be made as an ad that did not come', () => {
    ;(mockLibrary().NativeAd.createForAdRequest as jest.Mock).mockImplementationOnce(() => {
      throw new Error('no module')
    })
    const answer = listener()
    const request = network().loadPage(answer)
    expect(answer.failed).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
    expect(() => request.cancel()).not.toThrow()
  })
})

describe('what the card shows of an ad', () => {
  const adOf = async (override: Partial<MockNativeAdProps> = {}) => {
    jest.useFakeTimers()
    let page: AdPage | null = null
    network().loadPage({ loaded: (loaded) => (page = loaded), failed: () => undefined })
    lib().native.requests[0].resolve(override)
    await settle()
    if (!page) throw new Error('no page')
    return (page as AdPage).content
  }

  it('is the headline, text, button, advertiser, icon and the shape of the picture', async () => {
    expect(await adOf({ mediaContent: { aspectRatio: 1.5, hasVideoContent: true, duration: 12 } })).toEqual({
      id: 'response-1',
      headline: 'Save big on everything this season',
      body: 'Hundreds of offers from the shops you already use, on one screen.',
      callToAction: 'Install now',
      advertiser: 'Plax Test Advertiser',
      icon: { url: 'file:///ad/icon.png' },
      media: { aspectRatio: 1.5 },
    })
  })

  it('leaves out what the ad has not, or has blank', async () => {
    const content = await adOf({ body: '   ', callToAction: '', advertiser: null, icon: null, mediaContent: null })
    expect(content).toMatchObject({ body: null, callToAction: null, advertiser: null, icon: null, media: null })
    expect(content.headline).not.toBe('')
  })

  it('takes an icon with no address as no icon', async () => {
    expect((await adOf({ icon: { url: '', scale: 1 } })).icon).toBeNull()
  })

  it('draws a picture of a shape it does not know as a wide one', async () => {
    for (const aspectRatio of [0, -1, Number.NaN]) {
      expect((await adOf({ mediaContent: { aspectRatio, hasVideoContent: false, duration: 0 } })).media).toEqual({ aspectRatio: 1.91 })
      lib().reset()
    }
  })

  it('survives what the library may hand over in its own shape', () => {
    const odd = { responseId: 7, headline: undefined, body: 5, callToAction: null, advertiser: undefined, icon: { url: 3 }, mediaContent: undefined } as unknown
    expect(contentOf(odd as Parameters<typeof contentOf>[0])).toEqual({
      id: '7',
      headline: '',
      body: null,
      callToAction: null,
      advertiser: null,
      icon: null,
      media: null,
    })
  })
})

describe('the one Google of the process', () => {
  it('is made by the first call, which decides its units, and is the same after', () => {
    const first = googleAds({ units: LIVE_UNITS })
    const second = googleAds({ units: { banner: '', page: '' } })
    expect(second).toBe(first)
    expect(second.bannerUnit()).toBe(LIVE_UNITS.banner)
  })

  it('is forgotten when told to, so that a test starts from nothing', () => {
    const first = googleAds({ units: LIVE_UNITS })
    resetGoogleAds()
    expect(googleAds({ units: LIVE_UNITS })).not.toBe(first)
  })
})
