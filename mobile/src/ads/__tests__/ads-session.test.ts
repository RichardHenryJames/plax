import { LIVE_UNITS } from '../units'
import { setAdNetwork } from '../ads'
import { DEFAULT_AD_SETTINGS, cleanSettings, createAdsSession, type AdSettings, type AdsSession } from '../ads-session'
import { resetGoogleAds } from '../google-ads'
import { setVariant } from '../../test/helpers'
import { fakeClock } from '../../platform/clock'
import { FakeNetwork, library, memoryServed, mockLibrary, settle } from './helpers'

const ON: AdSettings = { ads: true, pages: true, every: 5 }
const LIST = 40

beforeEach(() => {
  jest.useFakeTimers()
  library().reset()
  resetGoogleAds()
  setAdNetwork(null)
})

afterAll(() => {
  setAdNetwork(null)
  resetGoogleAds()
})

describe('the settings the website gives the ads', () => {
  it('are on, with a full page after every fifth story, until the website says otherwise', () => {
    expect(DEFAULT_AD_SETTINGS).toEqual({ ads: true, pages: true, every: 5 })
  })

  it('are made usable: a switch is on only when it says so, and a number of stories is a whole number of at least one', () => {
    expect(cleanSettings({ ads: true, pages: false, every: 7 })).toEqual({ ads: true, pages: false, every: 7 })
    for (const every of [0, -4, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(cleanSettings({ ads: true, pages: true, every }).every).toBe(5)
    expect(cleanSettings({ ads: undefined, pages: null, every: 5 } as unknown as AdSettings)).toEqual({ ads: false, pages: false, every: 5 })
  })
})

describe('the ads of the app', () => {
  let network: FakeNetwork
  let sessions: AdsSession[]

  beforeEach(() => {
    network = new FakeNetwork()
    network.bannerOn = true
    sessions = []
  })

  afterEach(() => {
    for (const session of sessions) session.destroy()
  })

  const make = (settings: AdSettings = ON, options: Partial<Parameters<typeof createAdsSession>[0]> = {}) => {
    const session = createAdsSession({ network, settings, clock: fakeClock(1_800_000_000_000), memory: memoryServed(), screen: { widthDp: 411, heightDp: 891 }, ...options })
    sessions.push(session)
    return session
  }

  it('start nothing when they are made: the settings have not been read yet', () => {
    make()
    expect(network.starts).toHaveLength(0)
  })

  it('ask for consent once, when the settings say ads are on, however often they are given', () => {
    const session = make()
    session.configure(ON)
    session.configure(ON)
    session.configure({ ...ON, pages: false })
    expect(network.starts).toHaveLength(1)
  })

  it('tell the controller of the full pages and the strip when consent is settled, and not before', async () => {
    const session = make()
    session.configure(ON)
    session.controller.reader(2, LIST, -1)
    session.bar.show(true)
    await settle()
    expect(session.controller.isReady()).toBe(false)
    expect(network.requests).toHaveLength(0)
    expect(session.bar.store.getState().requested).toBe(false)
    network.consent()
    await settle()
    expect(session.controller.isReady()).toBe(true)
    // The reader was already on a story: the ad ahead of them is asked for now, not at their next swipe.
    expect(network.requests).toHaveLength(1)
    expect(session.bar.store.getState().requested).toBe(true)
  })

  it('start nothing when the website has ads off, and start them when it turns them on', () => {
    const session = make({ ...ON, ads: false })
    session.configure({ ...ON, ads: false })
    expect(network.starts).toHaveLength(0)
    session.configure(ON)
    expect(network.starts).toHaveLength(1)
  })

  it('start nothing in a build that has neither a banner nor a full page', () => {
    network.bannerOn = false
    network.pages = false
    const session = make()
    session.configure(ON)
    expect(network.starts).toHaveLength(0)
  })

  it('start in a build that has only a banner, or only full pages', () => {
    network.pages = false
    make().configure(ON)
    expect(network.starts).toHaveLength(1)
    const pagesOnly = new FakeNetwork()
    createAdsSession({ network: pagesOnly, settings: ON, memory: memoryServed() }).configure(ON)
    expect(pagesOnly.starts).toHaveLength(1)
  })

  it('ignore the answer of consent when they have been let go before it came', async () => {
    const session = make()
    session.configure(ON)
    session.destroy()
    network.consent()
    await settle()
    expect(session.controller.isReady()).toBe(false)
    expect(session.bar.store.getState().requested).toBe(false)
  })

  it('ignore the settings once they have been let go', () => {
    const session = make({ ...ON, ads: false })
    session.destroy()
    session.destroy()
    session.configure(ON)
    expect(network.starts).toHaveLength(0)
  })

  it('keep the settings in force, and tell nobody when they are the same', () => {
    const session = make()
    let told = 0
    session.store.subscribe(() => told++)
    session.configure(ON)
    expect(told).toBe(0)
    session.configure({ ads: true, pages: false, every: 7 })
    expect(told).toBe(1)
    expect(session.store.getState().settings).toEqual({ ads: true, pages: false, every: 7 })
    session.configure({ ads: true, pages: false, every: 7 })
    expect(told).toBe(1)
  })

  it('stand for the number of stories of the first reading of the settings, and then for the website\u2019s once it is read, until the reader is first seen', () => {
    const session = make()
    expect(session.controller.every()).toBe(5)
    session.configure({ ads: true, pages: true, every: 8 })
    expect(session.controller.every()).toBe(8)
    session.controller.reader(5, LIST, -1)
    session.configure({ ads: true, pages: true, every: 4 })
    // No ad has changed its slot.
    expect(session.controller.every()).toBe(8)
  })

  it('take the number of stories from the settings they were made with', () => {
    expect(make({ ads: true, pages: true, every: 3 }).controller.every()).toBe(3)
    expect(make({ ads: true, pages: true, every: 0 }).controller.every()).toBe(5)
  })

  it('follow whether the consent tool has a choice for the reader to change', () => {
    network.privacy = true
    const session = make()
    expect(session.store.getState().privacyOptions).toBe(true)
    network.setPrivacyOptions(false)
    expect(session.store.getState().privacyOptions).toBe(false)
    let told = 0
    session.store.subscribe(() => told++)
    network.setPrivacyOptions(false)
    expect(told).toBe(0)
    network.setPrivacyOptions(true)
    expect(session.store.getState().privacyOptions).toBe(true)
    session.destroy()
    network.setPrivacyOptions(false)
    expect(session.store.getState().privacyOptions).toBe(true)
  })

  it('open the consent tool\u2019s choices', async () => {
    const session = make()
    await session.showPrivacyOptions()
    expect(network.optionsShown).toBe(1)
  })

  it('let everything go together', async () => {
    const session = make()
    session.configure(ON)
    network.consent()
    await settle()
    session.controller.reader(2, LIST, -1)
    const page = network.arrive(network.last())
    session.destroy()
    expect(page.destroyed).toBe(true)
    expect(session.bar.store.getState().requested).toBe(false)
  })

  it('use the build\u2019s own network when none is given', () => {
    setVariant('preview')
    const session = createAdsSession()
    sessions.push(session)
    expect(session.network.banner()).toBe(false)
    setVariant('play')
    const live = createAdsSession()
    sessions.push(live)
    expect(live.network.bannerUnit()).toBe(LIVE_UNITS.banner)
  })
})

describe('a build with no ads', () => {
  it('never touches the library: no consent, no start, no banner, no ad', async () => {
    setVariant('preview')
    const session = createAdsSession({ settings: ON, memory: memoryServed(), screen: { widthDp: 411, heightDp: 891 } })
    session.configure(ON)
    session.controller.ready()
    session.controller.reader(2, LIST, -1)
    session.bar.show(true)
    session.bar.ready()
    await session.showPrivacyOptions()
    await settle()
    const { AdsConsent, MobileAds, NativeAd } = mockLibrary()
    expect(AdsConsent.requestInfoUpdate).not.toHaveBeenCalled()
    expect(AdsConsent.loadAndShowConsentFormIfRequired).not.toHaveBeenCalled()
    expect(AdsConsent.showPrivacyOptionsForm).not.toHaveBeenCalled()
    expect(AdsConsent.getConsentInfo).not.toHaveBeenCalled()
    expect(MobileAds).not.toHaveBeenCalled()
    expect(NativeAd.createForAdRequest).not.toHaveBeenCalled()
    expect(library().banners.mounts).toBe(0)
    expect(session.controller.shown()).toEqual([])
    expect(session.bar.store.getState()).toMatchObject({ requested: false, visible: false })
    session.destroy()
  })
})

describe('the ads of the Google Play build', () => {
  it('ask for nothing before the reader has given consent, and everything they need after', async () => {
    setVariant('play')
    library().consent.afterUpdate = { privacyOptionsRequirementStatus: mockLibrary().AdsConsentPrivacyOptionsRequirementStatus.REQUIRED }
    library().consent.afterForm = { canRequestAds: true, status: mockLibrary().AdsConsentStatus.OBTAINED }
    library().consent.update.mode = 'hold'
    const session = createAdsSession({ settings: ON, memory: memoryServed(), screen: { widthDp: 411, heightDp: 891 } })
    session.configure(ON)
    session.controller.reader(2, LIST, -1)
    session.bar.show(true)
    await settle()
    // Google's consent tool has been asked, and has not answered.
    expect(mockLibrary().AdsConsent.requestInfoUpdate).toHaveBeenCalledTimes(1)
    expect(mockLibrary().MobileAds).not.toHaveBeenCalled()
    expect(mockLibrary().NativeAd.createForAdRequest).not.toHaveBeenCalled()
    expect(library().banners.mounts).toBe(0)
    expect(session.bar.store.getState().requested).toBe(false)

    library().consent.update.release()
    await settle()
    expect(mockLibrary().NativeAd.createForAdRequest).toHaveBeenCalledTimes(1)
    expect((mockLibrary().NativeAd.createForAdRequest as jest.Mock).mock.calls[0][0]).toBe(LIVE_UNITS.page)
    expect(session.bar.store.getState().requested).toBe(true)
    expect(session.store.getState().privacyOptions).toBe(true)
    session.destroy()
  })

  it('stay silent for a reader who does not allow ads, and offer them their choices', async () => {
    setVariant('play')
    library().consent.afterUpdate = { privacyOptionsRequirementStatus: mockLibrary().AdsConsentPrivacyOptionsRequirementStatus.REQUIRED }
    library().consent.afterForm = { canRequestAds: false }
    const session = createAdsSession({ settings: ON, memory: memoryServed(), screen: { widthDp: 411, heightDp: 891 } })
    session.configure(ON)
    session.controller.reader(2, LIST, -1)
    session.bar.show(true)
    await settle()
    expect(mockLibrary().MobileAds).not.toHaveBeenCalled()
    expect(mockLibrary().NativeAd.createForAdRequest).not.toHaveBeenCalled()
    expect(session.bar.store.getState().requested).toBe(false)
    expect(session.store.getState().privacyOptions).toBe(true)
    session.destroy()
  })

  it('start for a reader who allows ads from the choices of the menu', async () => {
    setVariant('play')
    library().consent.afterUpdate = { privacyOptionsRequirementStatus: mockLibrary().AdsConsentPrivacyOptionsRequirementStatus.REQUIRED }
    library().consent.afterForm = { canRequestAds: false }
    library().consent.afterOptions = { canRequestAds: true, status: mockLibrary().AdsConsentStatus.OBTAINED }
    const session = createAdsSession({ settings: ON, memory: memoryServed(), screen: { widthDp: 411, heightDp: 891 } })
    session.configure(ON)
    session.controller.reader(2, LIST, -1)
    await settle()
    expect(mockLibrary().NativeAd.createForAdRequest).not.toHaveBeenCalled()
    await session.showPrivacyOptions()
    await settle()
    expect(mockLibrary().NativeAd.createForAdRequest).toHaveBeenCalledTimes(1)
    session.destroy()
  })
})
