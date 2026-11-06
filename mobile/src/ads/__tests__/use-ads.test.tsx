import { act, render, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import { DeviceEventEmitter, Dimensions, Text } from 'react-native'
import { adOrdinal, adStory, isAd, makeStory } from '../../data/story'
import { fakeClock } from '../../platform/clock'
import { interleave, slotAt } from '../ad-slots'
import { setAdNetwork } from '../ads'
import { createAdsSession, type AdSettings, type AdsSession } from '../ads-session'
import { AdsProvider, resetSharedAdsSession, sharedAdsSession, useAds, useRoomForPages, useSettledSlots, type Ads } from '../use-ads'
import { FakeNetwork, library, memoryServed, settle } from './helpers'

const NOW = 1_800_000_000_000
const ON: AdSettings = { ads: true, pages: true, every: 5 }
const PHONE = Dimensions.get('window')
const STORIES = Array.from({ length: 40 }, (_, index) => makeStory({ id: `story-${index + 1}` }))

describe('useAds', () => {
  let network: FakeNetwork
  let session: AdsSession
  let seen: Ads | null

  beforeEach(() => {
    jest.useFakeTimers()
    library().reset()
    network = new FakeNetwork()
    network.bannerOn = true
    seen = null
    session = createAdsSession({ network, settings: ON, clock: fakeClock(NOW), memory: memoryServed(), screen: { widthDp: PHONE.width, heightDp: PHONE.height } })
  })

  afterEach(() => {
    act(() => {
      session.destroy()
    })
    resetSharedAdsSession()
    setAdNetwork(null)
  })

  function Probe(props: { settings?: AdSettings }) {
    seen = useAds(props.settings ?? ON)
    return null
  }

  const mount = (settings?: AdSettings) =>
    render(
      <AdsProvider session={session}>
        <Probe settings={settings} />
      </AdsProvider>,
    )

  const ads = (): Ads => {
    if (!seen) throw new Error('the probe has not rendered')
    return seen
  }

  it('hands the screen the session of the app, its controller, its strip and its network', () => {
    mount()
    expect(ads().session).toBe(session)
    expect(ads().controller).toBe(session.controller)
    expect(ads().bar).toBe(session.bar)
    expect(ads().network).toBe(network)
  })

  it('says whether the build has ads at all, for About', () => {
    let view = mount()
    expect(ads().hasAds).toBe(true)
    view.unmount()
    network.bannerOn = false
    view = mount()
    expect(ads().hasAds).toBe(true)
    view.unmount()
    network.pages = false
    mount()
    expect(ads().hasAds).toBe(false)
  })

  it('says whether full pages belong between the stories: the build has them and the website has them on', () => {
    let view = mount()
    expect(ads().pagesOn).toBe(true)
    view.unmount()
    view = mount({ ...ON, pages: false })
    expect(ads().pagesOn).toBe(false)
    view.unmount()
    view = mount({ ...ON, ads: false })
    expect(ads().pagesOn).toBe(false)
    view.unmount()
    network.pages = false
    mount()
    expect(ads().pagesOn).toBe(false)
  })

  it('has the settings in force, made usable, and how many stories an ad stands for', () => {
    const view = mount({ ads: true, pages: false, every: 7 })
    expect(ads().settings).toEqual({ ads: true, pages: false, every: 7 })
    expect(ads().every).toBe(7)
    view.unmount()
    session.destroy()
    session = createAdsSession({ network, settings: ON, memory: memoryServed() })
    mount({ ads: true, pages: true, every: 0 })
    expect(ads().settings.every).toBe(5)
    expect(ads().every).toBe(5)
  })

  it('starts the ads, asking for consent, once the settings say ads are on', () => {
    mount()
    expect(network.starts).toHaveLength(1)
  })

  it('starts nothing while the settings say ads are off, and starts them when they turn on', () => {
    const view = render(
      <AdsProvider session={session}>
        <Probe settings={{ ...ON, ads: false }} />
      </AdsProvider>,
    )
    expect(network.starts).toHaveLength(0)
    view.rerender(
      <AdsProvider session={session}>
        <Probe settings={ON} />
      </AdsProvider>,
    )
    expect(network.starts).toHaveLength(1)
    expect(ads().pagesOn).toBe(true)
  })

  it('starts the ads once however often it is drawn', () => {
    const view = mount()
    for (let draw = 0; draw < 5; draw++) {
      view.rerender(
        <AdsProvider session={session}>
          <Probe settings={{ ...ON }} />
        </AdsProvider>,
      )
    }
    expect(network.starts).toHaveLength(1)
  })

  it('takes the number of stories from the website until the reader has been seen', () => {
    const view = mount({ ads: true, pages: true, every: 8 })
    expect(ads().every).toBe(8)
    session.controller.reader(5, 40, -1)
    view.rerender(
      <AdsProvider session={session}>
        <Probe settings={{ ads: true, pages: true, every: 3 }} />
      </AdsProvider>,
    )
    expect(ads().every).toBe(8)
    expect(ads().settings.every).toBe(3)
  })

  it('draws again when an ad page joins the pager and when it leaves, with a new list each time', async () => {
    mount()
    expect(ads().shown).toEqual([])
    act(() => {
      network.consent()
      session.controller.reader(2, 40, -1)
    })
    await act(async () => settle())
    const first = ads().shown
    expect(first).toEqual([])
    act(() => {
      network.arrive(network.last())
    })
    expect(ads().shown).toEqual([5])
    expect(ads().controller.page(1)).not.toBeNull()
    const joined = ads().shown
    act(() => {
      session.controller.reader(8, 40, -1)
    })
    expect(ads().shown).toEqual([])
    expect(ads().shown).not.toBe(joined)
  })

  it('draws again when the consent tool has a choice for the reader to change', () => {
    mount()
    expect(ads().privacyOptions).toBe(false)
    act(() => network.setPrivacyOptions(true))
    expect(ads().privacyOptions).toBe(true)
    act(() => network.setPrivacyOptions(false))
    expect(ads().privacyOptions).toBe(false)
  })

  it('opens the choices of the consent tool', async () => {
    mount()
    await act(async () => {
      await ads().showPrivacyOptions()
    })
    expect(network.optionsShown).toBe(1)
  })

  it('keeps the same object while nothing it holds has changed', () => {
    const view = mount()
    const first = ads()
    view.rerender(
      <AdsProvider session={session}>
        <Probe settings={{ ...ON }} />
      </AdsProvider>,
    )
    expect(ads()).toBe(first)
  })

  it('leaves the settings alone for a screen that gives none, so that a screen that only looks cannot turn the ads back on', () => {
    let looked: Ads | null = null
    function Looker() {
      looked = useAds()
      return null
    }
    render(
      <AdsProvider session={session}>
        <Probe settings={{ ...ON, ads: false }} />
        <Looker />
      </AdsProvider>,
    )
    expect(network.starts).toHaveLength(0)
    expect((looked as Ads | null)?.settings).toEqual({ ads: false, pages: true, every: 5 })
    expect((looked as Ads | null)?.pagesOn).toBe(false)
    expect(ads().pagesOn).toBe(false)
  })

  it('shows a screen that gives none the settings another gave, once they are in force', () => {
    let looked: Ads | null = null
    function Looker() {
      looked = useAds()
      return null
    }
    render(
      <AdsProvider session={session}>
        <Probe settings={{ ads: true, pages: false, every: 9 }} />
        <Looker />
      </AdsProvider>,
    )
    expect((looked as Ads | null)?.settings).toEqual({ ads: true, pages: false, every: 9 })
    expect((looked as Ads | null)?.every).toBe(9)
  })

  it('lets the feed build its pager and put the ads in it', async () => {
    function Feed(props: { item: number }) {
      const current = useAds(ON)
      const { controller, pagesOn, shown, every } = current
      useEffect(() => {
        if (pagesOn) controller.reader(props.item, STORIES.length, -1)
      }, [controller, pagesOn, props.item])
      const list = interleave(STORIES, pagesOn ? shown : [], every, adStory)
      return <Text testID="pager">{list.map((story) => (isAd(story) ? `ad${adOrdinal(story)}` : story.id.replace('story-', 's'))).slice(0, 14).join(' ')}</Text>
    }
    const view = render(
      <AdsProvider session={session}>
        <Feed item={0} />
      </AdsProvider>,
    )
    const pager = () => screen.getByTestId('pager').props.children as string
    expect(pager()).toBe('s1 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 s12 s13 s14')
    // Consent is given and the reader moves to the third story: the ad of the first slot is asked for.
    await act(async () => {
      network.consent()
      await settle()
    })
    expect(network.requests).toHaveLength(0)
    view.rerender(
      <AdsProvider session={session}>
        <Feed item={2} />
      </AdsProvider>,
    )
    expect(network.requests).toHaveLength(1)
    // The ad arrives: it joins the pager after the fifth story, and nothing before it moves.
    act(() => {
      network.arrive(network.last())
    })
    expect(pager()).toBe('s1 s2 s3 s4 s5 ad1 s6 s7 s8 s9 s10 s11 s12 s13')
    expect(slotAt(5, session.controller.shown())).toBe(5)
    // The reader has gone far past it: it is gone from the pager.
    act(() => {
      session.controller.reader(8, STORIES.length, -1)
    })
    expect(pager()).toBe('s1 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 s12 s13 s14')
  })
})

describe('the ads of the app, without a session given', () => {
  let network: FakeNetwork

  beforeEach(() => {
    jest.useFakeTimers()
    library().reset()
    network = new FakeNetwork()
    setAdNetwork(network)
  })

  afterEach(() => {
    act(() => {
      resetSharedAdsSession()
    })
    setAdNetwork(null)
  })

  it('are one session, wherever they are asked for', () => {
    let first: Ads | null = null
    let second: Ads | null = null
    function A() {
      first = useAds(ON)
      return null
    }
    function B() {
      second = useAds(ON)
      return null
    }
    render(
      <>
        <A />
        <B />
      </>,
    )
    expect((first as Ads | null)?.session).toBe((second as Ads | null)?.session)
    expect((first as Ads | null)?.session).toBe(sharedAdsSession())
    expect(network.starts).toHaveLength(1)
  })

  it('are made with the settings of the first call', () => {
    expect(sharedAdsSession({ ads: true, pages: true, every: 9 }).controller.every()).toBe(9)
    expect(sharedAdsSession({ ads: true, pages: true, every: 4 }).controller.every()).toBe(9)
  })

  it('are made again from nothing after they were let go', () => {
    const first = sharedAdsSession()
    resetSharedAdsSession()
    expect(sharedAdsSession()).not.toBe(first)
    expect(first.controller.reader).toBeDefined()
  })

  it('know the screen they were made on', () => {
    const session = sharedAdsSession()
    expect(session.bar.enabled()).toBe(false)
    network.bannerOn = true
    expect(session.bar.enabled()).toBe(PHONE.height >= 500)
  })

  it('draw with no setting at all as ads on, with a full page after every fifth story', () => {
    let seen: Ads | null = null
    function Probe() {
      seen = useAds()
      return null
    }
    render(<Probe />)
    expect(seen as Ads | null).toMatchObject({ settings: { ads: true, pages: true, every: 5 }, pagesOn: true, every: 5 })
  })
})

describe('the room for a full page', () => {
  const resize = (override: Partial<typeof PHONE>) =>
    act(() => {
      DeviceEventEmitter.emit('didUpdateDimensions', { window: { ...PHONE, ...override }, screen: PHONE })
    })

  function Room() {
    return <Text testID="room">{String(useRoomForPages())}</Text>
  }

  afterEach(() => {
    resize({})
  })

  it('is there on a usual phone, and not on a phone on its side', () => {
    render(<Room />)
    resize({ width: 392, height: 780, fontScale: 1 })
    expect(screen.getByTestId('room').props.children).toBe('true')
    resize({ width: 780, height: 392, fontScale: 1 })
    expect(screen.getByTestId('room').props.children).toBe('false')
  })

  it('goes as the text gets larger', () => {
    render(<Room />)
    resize({ width: 392, height: 560, fontScale: 1 })
    expect(screen.getByTestId('room').props.children).toBe('true')
    resize({ width: 392, height: 560, fontScale: 2 })
    expect(screen.getByTestId('room').props.children).toBe('false')
  })
})

describe('the slots a pager is drawn with', () => {
  function Pager(props: { slots: readonly number[]; moving: boolean }) {
    const drawn = useSettledSlots(props.slots, props.moving)
    return <Text testID="slots">{drawn.join(',')}</Text>
  }

  const drawn = () => screen.getByTestId('slots').props.children as string

  it('are the slots of now while the pager is at rest', () => {
    const view = render(<Pager slots={[]} moving={false} />)
    expect(drawn()).toBe('')
    view.rerender(<Pager slots={[5]} moving={false} />)
    expect(drawn()).toBe('5')
    view.rerender(<Pager slots={[5, 10]} moving={false} />)
    expect(drawn()).toBe('5,10')
  })

  it('stay as they were drawn while the pager moves, so that nothing moves under a swipe', () => {
    const view = render(<Pager slots={[5]} moving={false} />)
    view.rerender(<Pager slots={[5]} moving />)
    view.rerender(<Pager slots={[5, 10]} moving />)
    expect(drawn()).toBe('5')
    view.rerender(<Pager slots={[]} moving />)
    expect(drawn()).toBe('5')
  })

  it('are taken as soon as the pager has stopped', () => {
    const view = render(<Pager slots={[5]} moving />)
    view.rerender(<Pager slots={[5, 10]} moving />)
    expect(drawn()).toBe('5')
    view.rerender(<Pager slots={[5, 10]} moving={false} />)
    expect(drawn()).toBe('5,10')
  })

  it('are none until the pager has stopped for the first time, when it starts out moving with none drawn', () => {
    const view = render(<Pager slots={[]} moving />)
    expect(drawn()).toBe('')
    view.rerender(<Pager slots={[5]} moving />)
    expect(drawn()).toBe('')
    view.rerender(<Pager slots={[5]} moving={false} />)
    expect(drawn()).toBe('5')
  })
})
