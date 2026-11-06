// The ads library must be loaded only by a build that shows ads. Each check here makes the library throw when it is loaded, which
// stays in force for the rest of the file, so these checks are on their own: no other test of the slice may be in this file.
describe('a build with no ads', () => {
  const libraryThatMustNotLoad = () =>
    jest.doMock('react-native-google-mobile-ads', () => {
      throw new Error('the library was loaded')
    })

  it('never loads the library to know its ad units', () => {
    jest.isolateModules(() => {
      libraryThatMustNotLoad()
      const units = require('../units') as typeof import('../units')
      expect(units.adUnits('none')).toEqual({ banner: '', page: '' })
      expect(units.adUnits('live')).toEqual(units.LIVE_UNITS)
      // The test build is the one that asks the library for its sample units, so it is the one that loads it.
      expect(() => units.adUnits('sample')).toThrow('the library was loaded')
    })
  })

  it('never loads Google\u2019s code, nor the library, to choose its ad network', () => {
    jest.isolateModules(() => {
      libraryThatMustNotLoad()
      const { setVariant } = require('../../test/helpers') as typeof import('../../test/helpers')
      const { adsNetwork } = require('../ads') as typeof import('../ads')
      setVariant('preview')
      expect(adsNetwork().banner()).toBe(false)
      expect(adsNetwork().page()).toBe(false)
      setVariant('play')
      expect(() => adsNetwork()).toThrow('the library was loaded')
    })
  })

  it('never loads the library to run a session of the ads with no network', () => {
    jest.isolateModules(() => {
      libraryThatMustNotLoad()
      const { NO_ADS } = require('../no-ads') as typeof import('../no-ads')
      const { createAdsSession } = require('../ads-session') as typeof import('../ads-session')
      const session = createAdsSession({ network: NO_ADS, settings: { ads: true, pages: true, every: 5 } })
      session.configure({ ads: true, pages: true, every: 5 })
      session.controller.ready()
      session.controller.reader(2, 40, -1)
      expect(session.controller.shown()).toEqual([])
      session.destroy()
    })
  })
})
