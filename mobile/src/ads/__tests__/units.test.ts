import { adUnits, isAdUnit, LIVE_UNITS, NO_UNITS, sampleUnits } from '../units'
import { mockLibrary } from './helpers'
import { setVariant } from '../../test/helpers'

describe('the ad units of a build', () => {
  it('are the owner\u2019s for the Google Play build', () => {
    expect(adUnits('live')).toEqual({ banner: 'ca-app-pub-2225161543339119/8383793916', page: 'ca-app-pub-2225161543339119/5757630575' })
    expect(adUnits('live')).toEqual(LIVE_UNITS)
  })

  it('are Google\u2019s sample units for the test build', () => {
    expect(adUnits('sample')).toEqual({ banner: mockLibrary().TestIds.ADAPTIVE_BANNER, page: mockLibrary().TestIds.NATIVE })
    expect(sampleUnits()).toEqual({ banner: 'ca-app-pub-3940256099942544/9214589741', page: 'ca-app-pub-3940256099942544/2247696110' })
  })

  it('are none for the website\u2019s build', () => {
    expect(adUnits('none')).toEqual({ banner: '', page: '' })
    expect(adUnits('none')).toBe(NO_UNITS)
  })

  it('are chosen by the build that is running, read when asked', () => {
    setVariant('play')
    expect(adUnits()).toEqual(LIVE_UNITS)
    setVariant('e2e')
    expect(adUnits().banner).toBe(mockLibrary().TestIds.ADAPTIVE_BANNER)
    setVariant('preview')
    expect(adUnits()).toEqual(NO_UNITS)
    setVariant('play')
    expect(adUnits()).toEqual(LIVE_UNITS)
  })

  it('cannot be changed by whoever has them', () => {
    expect(Object.isFrozen(LIVE_UNITS)).toBe(true)
    expect(Object.isFrozen(NO_UNITS)).toBe(true)
  })

  it('are well formed: ca-app-pub-, sixteen digits, a slash, ten digits', () => {
    expect(isAdUnit(LIVE_UNITS.banner)).toBe(true)
    expect(isAdUnit(LIVE_UNITS.page)).toBe(true)
    expect(isAdUnit(mockLibrary().TestIds.NATIVE)).toBe(true)
    for (const bad of ['', 'ca-app-pub-2225161543339119~9585194942', 'ca-app-pub-222516154333911/8383793916', 'ca-app-pub-2225161543339119/838379391', ' ca-app-pub-2225161543339119/8383793916', 'ca-app-pub-2225161543339119/8383793916\n', 'x']) {
      expect({ bad, ok: isAdUnit(bad) }).toEqual({ bad, ok: false })
    }
  })

  it('leave out a unit that is not well formed, so that the build shows no ad of that kind', () => {
    const ids = mockLibrary().TestIds
    const kept = ids.ADAPTIVE_BANNER
    try {
      ids.ADAPTIVE_BANNER = ''
      expect(adUnits('sample')).toEqual({ banner: '', page: ids.NATIVE })
      ids.ADAPTIVE_BANNER = kept
      ids.NATIVE = 'not a unit'
      expect(adUnits('sample')).toEqual({ banner: kept, page: '' })
    } finally {
      ids.ADAPTIVE_BANNER = kept
      ids.NATIVE = 'ca-app-pub-3940256099942544/2247696110'
    }
  })
})
