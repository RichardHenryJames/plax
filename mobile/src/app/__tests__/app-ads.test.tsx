import { act, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { configText } from '../../config/__tests__/helpers'
import { stories as makeStories } from '../../data/__tests__/helpers'
import { flushPromises } from '../../test/helpers'
import { forgetMeasures } from '../../ui/story/measure'
import { pagerTarget } from '../FeedView'
import { chooseFromMenu, mountApp, press, startSwipe, swipeTo, SITE, type AppRig } from './rig'

beforeEach(() => forgetMeasures())

describe('which page of the pager an item of the engine’s list is on', () => {
  it('is the item itself where no ad page stands before it', () => {
    expect(pagerTarget(0, -1, [])).toBe(0)
    expect(pagerTarget(3, -1, [5])).toBe(3)
    expect(pagerTarget(4, -1, [5, 10])).toBe(4)
  })

  it('is one further for each ad page before it', () => {
    expect(pagerTarget(5, -1, [5])).toBe(6)
    expect(pagerTarget(7, -1, [5])).toBe(8)
    expect(pagerTarget(12, -1, [5, 10])).toBe(14)
  })

  it('keeps a reader on the ad page they are on: the engine puts it at the story before it', () => {
    expect(pagerTarget(4, 5, [5])).toBe(5)
    expect(pagerTarget(9, 10, [5, 10])).toBe(11)
  })

  it('puts a reader whose ad page has gone on the story the engine holds', () => {
    expect(pagerTarget(4, 5, [])).toBe(4)
    expect(pagerTarget(4, 5, [10])).toBe(4)
  })

  it('does not take a story that follows another’s ad page for the ad page', () => {
    expect(pagerTarget(5, 5, [5])).toBe(6)
  })
})

const ids = () => (screen.UNSAFE_getByType(FlatList).props.data as { id: string }[]).map((item) => item.id)

/** A phone in the Google Play build with ads: the consent is given, and the reader is in the first stories of a long page. */
async function withAds(options: { website?: Record<string, string> } = {}): Promise<AppRig> {
  const rig = await mountApp({ variant: 'play', bannerOn: true, pagesOn: true, stories: makeStories('s', 14), website: options.website })
  await rig.settle()
  await act(async () => {
    rig.network.consent()
    await flushPromises()
  })
  await rig.settle()
  await rig.settle()
  return rig
}

describe('the full-page ads between the stories', () => {
  it('asks for the ad ahead of the reader, and puts its page in the pager when it has arrived', async () => {
    const rig = await withAds()
    expect(rig.network.requests).toHaveLength(0)
    expect(ids().some((id) => id.startsWith('__ad_'))).toBe(false)
    await swipeTo(2)
    expect(rig.network.requests).toHaveLength(1)
    await act(async () => {
      rig.network.arrive(rig.network.last())
      await flushPromises()
    })
    const list = ids()
    expect(list).toHaveLength(15)
    expect(list[5]).toBe('__ad_1__')
    expect(list[4]).toBe('s5')
    expect(list[6]).toBe('s6')
  })

  it('keeps the engine’s place on the story before the ad while the reader is on the ad page', async () => {
    const rig = await withAds()
    await swipeTo(2)
    await act(async () => {
      rig.network.arrive(rig.network.last())
      await flushPromises()
    })
    await swipeTo(4)
    expect(rig.services.engine.currentPosition()).toBe(4)
    await swipeTo(5)
    expect(ids()[5]).toBe('__ad_1__')
    expect(rig.services.engine.currentPosition()).toBe(4)
    await swipeTo(6)
    expect(rig.services.engine.currentPosition()).toBe(5)
  })

  it('does not move the pager under a swipe: an ad that arrives while it moves joins it when it stops', async () => {
    const rig = await withAds()
    await swipeTo(2)
    await startSwipe()
    await act(async () => {
      rig.network.arrive(rig.network.last())
      await flushPromises()
    })
    expect(ids().some((id) => id.startsWith('__ad_'))).toBe(false)
    await swipeTo(3)
    expect(ids()[5]).toBe('__ad_1__')
  })

  it('has no ad pages when the website switches them off, and no strip when it switches all ads off', async () => {
    const rig = await withAds({ website: { [`${SITE}/app-config.json`]: configText('"features":{"adPages":false}') } })
    await swipeTo(2)
    expect(rig.network.requests).toHaveLength(0)
    expect(ids().some((id) => id.startsWith('__ad_'))).toBe(false)
  })

  it('has no ad pages on Saved, and none where there is no story', async () => {
    const rig = await withAds()
    await chooseFromMenu('menu-saved')
    expect(screen.queryByTestId('feed-pager')).toBeNull()
    expect(rig.network.requests).toHaveLength(0)
  })

  it('is not asked for in the build that has none', async () => {
    const rig = await mountApp({ variant: 'preview', stories: makeStories('s', 14) })
    await swipeTo(2)
    expect(rig.network.requests).toHaveLength(0)
    expect(ids().some((id) => id.startsWith('__ad_'))).toBe(false)
  })
})

describe('the ad strip under the story', () => {
  it('is asked for under a story once the consent is given, and takes no room until its ad has come', async () => {
    await withAds()
    const strip = screen.getByTestId('ad-strip', { includeHiddenElements: true })
    expect(strip.props.pointerEvents).toBe('none')
    expect(strip.props.style).toMatchObject({ height: 0 })
  })

  it('offers the reader the consent choices when the consent tool says they apply, and opens them', async () => {
    const rig = await withAds()
    expect(screen.queryByTestId('menu-ad-choices')).toBeNull()
    await act(async () => {
      rig.network.setPrivacyOptions(true)
      await flushPromises()
    })
    await chooseFromMenu('menu-ad-choices')
    expect(rig.network.optionsShown).toBe(1)
  })

  it('never asks for ads, not even for consent, when the website’s last word was to switch them all off', async () => {
    // What the website said the last time is read before anything is drawn, so that the first screen already follows it.
    const off = configText('"features":{"ads":false}')
    const rig = await mountApp({ variant: 'play', bannerOn: true, pagesOn: true, storage: { 'plax.config.file': off }, website: { [`${SITE}/app-config.json`]: off } })
    await rig.settle()
    expect(rig.network.starts).toHaveLength(0)
    expect(screen.queryByTestId('ad-strip')).toBeNull()
  })

  it('starts asking when the website switches ads on again', async () => {
    const off = configText('"features":{"ads":false}')
    const rig = await mountApp({ variant: 'play', bannerOn: true, pagesOn: true, storage: { 'plax.config.file': off }, website: { [`${SITE}/app-config.json`]: off } })
    await rig.settle()
    expect(rig.network.starts).toHaveLength(0)
    rig.website.set(`${SITE}/app-config.json`, configText())
    await act(async () => {
      await rig.services.appConfig.refresh({ force: true })
    })
    await rig.settle()
    expect(rig.network.starts).toHaveLength(1)
  })

  it('stays quiet on Topics', async () => {
    await withAds()
    await chooseFromMenu('menu-topics')
    const strip = screen.queryByTestId('ad-strip')
    if (strip) expect(strip.props.pointerEvents).toBe('none')
    await press(screen.getByTestId('interests-card'))
  })
})
