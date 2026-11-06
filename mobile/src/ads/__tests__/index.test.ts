import * as ads from '..'
import { library, mockLibrary } from './helpers'

// What the screens import from '../ads'. A name that is renamed or dropped by mistake fails here and not in a screen.
describe('what the ads module offers the screens', () => {
  beforeEach(() => library().reset())

  it('offers the strip, the full page, the hook and the provider', () => {
    for (const name of ['AdStrip', 'NativeAdPage', 'AdsProvider', 'useAds', 'useRoomForPages', 'useSettledSlots', 'sharedAdsSession', 'resetSharedAdsSession'] as const) {
      expect(typeof ads[name]).toBe('function')
    }
  })

  it('offers the engines and the session they live in', () => {
    for (const name of ['AdController', 'AdBar', 'createAdsSession', 'cleanSettings', 'adsNetwork', 'setAdNetwork'] as const) {
      expect(typeof ads[name]).toBe('function')
    }
  })

  it('offers the arithmetic of the pager', () => {
    for (const name of ['interleave', 'isAdPosition', 'itemAt', 'pageFits', 'pageNeededDp', 'pagerIndex', 'slotAt', 'slotOrdinal', 'slotsAfter'] as const) {
      expect(typeof ads[name]).toBe('function')
    }
    expect(ads.STORIES_PER_AD).toBe(5)
    expect(ads.NO_SLOTS).toEqual([])
    expect(ads.DEFAULT_AD_SETTINGS).toEqual({ ads: true, pages: true, every: 5 })
  })

  it('does not touch the ads library by being imported', () => {
    expect(mockLibrary().MobileAds).not.toHaveBeenCalled()
    expect(library().initializeCall).not.toHaveBeenCalled()
  })
})
