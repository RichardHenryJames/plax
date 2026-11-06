import { act, render, screen } from '@testing-library/react-native'
import { DeviceEventEmitter, Dimensions } from 'react-native'
import { AdStrip, type StripTheme } from '../AdStrip'
import { RETRY_MS, SETTLE_MS } from '../ad-bar'
import { createAdsSession, type AdSettings, type AdsSession } from '../ads-session'
import { AdsProvider, useAds } from '../use-ads'
import { fakeClock } from '../../platform/clock'
import { FakeNetwork, library, memoryServed, mockLibrary, settle } from './helpers'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000
const ON: AdSettings = { ads: true, pages: true, every: 5 }
const PHONE = Dimensions.get('window')
const STRIP: StripTheme = { bg: '#101010', border: '#303030' }

// The strip as a reader sees it, with the ads library replaced by the mock: a banner that the test fills or fails.
describe('the strip at the foot of the screen', () => {
  let network: FakeNetwork
  let memory: ReturnType<typeof memoryServed>
  let session: AdsSession

  beforeEach(() => {
    jest.useFakeTimers()
    library().reset()
    network = new FakeNetwork()
    network.bannerOn = true
    memory = memoryServed()
    session = createAdsSession({ network, settings: ON, clock: fakeClock(NOW), memory, screen: { widthDp: PHONE.width, heightDp: PHONE.height } })
  })

  afterEach(() => {
    // The tree is taken off the screen by the library's own clean-up afterwards; calling it here too would overlap its act().
    act(() => {
      session.destroy()
    })
    resize(PHONE)
  })

  function Harness(props: { settings?: AdSettings; wanted?: boolean; still?: () => boolean; theme?: StripTheme }) {
    const ads = useAds(props.settings ?? ON)
    return <AdStrip ads={ads} wanted={props.wanted ?? true} still={props.still} theme={props.theme ?? STRIP} />
  }

  const mount = (props: Parameters<typeof Harness>[0] = {}) =>
    render(
      <AdsProvider session={session}>
        <Harness {...props} />
      </AdsProvider>,
    )

  const consent = async () => {
    await act(async () => {
      network.consent()
      await settle()
    })
  }

  const strip = () => screen.queryByTestId('ad-strip', { includeHiddenElements: true })
  const banners = () => library().banners
  const banner = () => screen.getByTestId('mock-banner-ad', { includeHiddenElements: true })
  /** The phone is turned, or a window is resized: the way React Native tells the app. */
  const resize = (window: { width: number; height: number; scale: number; fontScale: number }) =>
    act(() => {
      DeviceEventEmitter.emit('didUpdateDimensions', { window, screen: PHONE })
    })

  it('shows nothing, and asks for nothing, before the reader has given consent', async () => {
    mount()
    await act(async () => settle())
    expect(strip()).toBeNull()
    expect(banners().mounts).toBe(0)
    expect(network.starts).toHaveLength(1)
  })

  it('asks for the banner once consent is given, with no room taken and nothing shown while it is on the way', async () => {
    mount()
    await consent()
    expect(banners().mounts).toBe(1)
    expect(strip()).toHaveStyle({ height: 0, overflow: 'hidden' })
    expect(strip()?.props.pointerEvents).toBe('none')
    expect(strip()?.props.accessibilityElementsHidden).toBe(true)
    expect(strip()?.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('asks for an anchored adaptive banner as wide as the screen, at most 640 dp, with the build\u2019s unit', async () => {
    mount()
    await consent()
    expect(banner().props.unitId).toBe(network.unit)
    expect(banner().props.bannerSize).toBe('ANCHORED_ADAPTIVE_BANNER')
    expect(banner().props.bannerWidth).toBe(Math.min(PHONE.width, 640))
  })

  it('makes room for the ad when it arrives, as tall as the ad and its hairline', async () => {
    mount()
    await consent()
    act(() => banners().last().loaded({ width: 360, height: 56 }))
    expect(strip()).toHaveStyle({ height: 57 })
    expect(strip()?.props.pointerEvents).toBe('auto')
    expect(strip()?.props.importantForAccessibility).toBe('auto')
    expect(strip()?.props.accessibilityElementsHidden).toBe(false)
  })

  it('is drawn in the colours it is given', async () => {
    mount({ theme: { bg: '#112233', border: '#445566' } })
    await consent()
    act(() => banners().last().loaded())
    expect(strip()).toHaveStyle({ backgroundColor: '#112233' })
    const children = (strip()?.children ?? []) as unknown as { props: { style?: { height?: number; backgroundColor?: string } } }[]
    const hairline = children.find((child) => child.props?.style?.height === 1)
    expect(hairline?.props.style?.backgroundColor).toBe('#445566')
  })

  it('takes the height of an adaptive banner from what the library says before the ad', async () => {
    banners().autoSize = { width: 411, height: 60 }
    mount()
    await consent()
    expect(strip()).toHaveStyle({ height: 0 })
    act(() => banners().last().loaded({ width: 411, height: 60 }))
    expect(strip()).toHaveStyle({ height: 61 })
  })

  it('shows nothing for an ad that failed, and takes the banner away', async () => {
    mount()
    await consent()
    act(() => banners().last().failed())
    expect(strip()).toBeNull()
    expect(banners().instances).toHaveLength(0)
  })

  it('asks again a minute later with a new banner, which takes no room until its ad comes', async () => {
    mount()
    await consent()
    act(() => banners().last().failed())
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RETRY_MS - 1)
    })
    expect(banners().mounts).toBe(1)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1)
    })
    expect(banners().mounts).toBe(2)
    expect(banners().instances).toHaveLength(1)
    expect(strip()).toHaveStyle({ height: 0 })
    act(() => banners().last().loaded())
    expect(strip()).toHaveStyle({ height: 57 })
  })

  it('asks at most three times again, then leaves the reader alone', async () => {
    mount()
    await consent()
    for (let attempt = 0; attempt < 4; attempt++) {
      act(() => banners().last().failed())
      await act(async () => {
        await jest.advanceTimersByTimeAsync(RETRY_MS)
      })
    }
    expect(banners().mounts).toBe(4)
    expect(strip()).toBeNull()
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10 * RETRY_MS)
    })
    expect(banners().mounts).toBe(4)
  })

  it('keeps its room from the start where an ad was served in it lately, so the story does not jump', async () => {
    memory.record = { at: NOW - HOUR, heightDp: 56 }
    mount()
    await consent()
    // Its room is there before its ad has come, as tall as the last ad.
    expect(strip()).toHaveStyle({ height: 57 })
    act(() => banners().last().loaded({ width: 360, height: 56 }))
    expect(strip()).toHaveStyle({ height: 57 })
  })

  it('gives the room back when the ad of a strip that kept its room does not come, and takes none for the retry', async () => {
    memory.record = { at: NOW - HOUR, heightDp: 56 }
    mount()
    await consent()
    expect(strip()).toHaveStyle({ height: 57 })
    act(() => banners().last().failed())
    expect(strip()).toBeNull()
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RETRY_MS)
    })
    expect(strip()).toHaveStyle({ height: 0 })
  })

  it('waits for its ad again when none was served in it for a week', async () => {
    memory.record = { at: NOW - 8 * 24 * HOUR, heightDp: 56 }
    mount()
    await consent()
    expect(strip()).toHaveStyle({ height: 0 })
  })

  it('remembers an ad that arrives, so that the next start keeps its room', async () => {
    mount()
    await consent()
    act(() => banners().last().loaded({ width: 360, height: 58 }))
    await act(async () => settle())
    expect(memory.writes).toEqual([{ at: NOW, heightDp: 58 }])
  })

  it('goes with the stories and comes back with them, without asking for another banner', async () => {
    const view = mount()
    await consent()
    act(() => banners().last().loaded())
    expect(strip()).toHaveStyle({ height: 57 })
    view.rerender(
      <AdsProvider session={session}>
        <Harness wanted={false} />
      </AdsProvider>,
    )
    expect(strip()).toHaveStyle({ height: 0 })
    view.rerender(
      <AdsProvider session={session}>
        <Harness wanted />
      </AdsProvider>,
    )
    expect(strip()).toHaveStyle({ height: 57 })
    expect(banners().mounts).toBe(1)
  })

  it('shows nothing while the website has the ads switched off', async () => {
    const view = mount()
    await consent()
    act(() => banners().last().loaded())
    expect(strip()).toHaveStyle({ height: 57 })
    view.rerender(
      <AdsProvider session={session}>
        <Harness settings={{ ...ON, ads: false }} />
      </AdsProvider>,
    )
    expect(strip()).toHaveStyle({ height: 0 })
  })

  it('is never made to appear while the pager moves', async () => {
    let moving = true
    mount({ still: () => !moving })
    await consent()
    act(() => banners().last().loaded())
    expect(strip()).toHaveStyle({ height: 0 })
    await act(async () => {
      await jest.advanceTimersByTimeAsync(SETTLE_MS * 3)
    })
    expect(strip()).toHaveStyle({ height: 0 })
    moving = false
    await act(async () => {
      await jest.advanceTimersByTimeAsync(SETTLE_MS)
    })
    expect(strip()).toHaveStyle({ height: 57 })
  })

  it('has none on a phone on its side, and has it again when the phone is upright', async () => {
    mount()
    await consent()
    act(() => banners().last().loaded())
    expect(strip()).toHaveStyle({ height: 57 })
    resize({ ...PHONE, width: 891, height: 411 })
    expect(strip()).toHaveStyle({ height: 0 })
    resize(PHONE)
    expect(strip()).toHaveStyle({ height: 57 })
    expect(banners().mounts).toBe(1)
  })

  it('is as wide as a narrower screen', async () => {
    resize({ ...PHONE, width: 360, height: 780 })
    session.destroy()
    session = createAdsSession({ network, settings: ON, clock: fakeClock(NOW), memory, screen: { widthDp: 360, heightDp: 780 } })
    mount()
    await consent()
    expect(banner().props.bannerWidth).toBe(360)
  })

  it('renders nothing, and never asks, in a build without a banner', async () => {
    network.bannerOn = false
    mount()
    await consent()
    expect(strip()).toBeNull()
    expect(banners().mounts).toBe(0)
  })

  it('renders nothing for a build with ads when the website has them off, and asks for no consent', async () => {
    mount({ settings: { ...ON, ads: false } })
    await act(async () => settle())
    expect(strip()).toBeNull()
    expect(network.starts).toHaveLength(0)
    expect(banners().mounts).toBe(0)
  })

  it('has no ads library call of its own: the banner is the library\u2019s own component', async () => {
    mount()
    await consent()
    const { AdsConsent, MobileAds } = mockLibrary()
    expect(AdsConsent.requestInfoUpdate).not.toHaveBeenCalled()
    expect(MobileAds).not.toHaveBeenCalled()
  })

  it('has a new banner for each ask, and no press handler of its own', async () => {
    mount()
    await consent()
    const first = banners().last()
    act(() => first.failed())
    await act(async () => {
      await jest.advanceTimersByTimeAsync(RETRY_MS)
    })
    expect(banners().last()).not.toBe(first)
    expect(strip()?.props.onPress).toBeUndefined()
  })
})
