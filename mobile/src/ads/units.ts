import { adsBuild } from '../build'

/** The two ad units of a build. A unit is public (it is in every APK), not a secret. '' means the build has no ad of that kind. */
export interface AdUnits {
  readonly banner: string
  readonly page: string
}

export const NO_UNITS: AdUnits = Object.freeze({ banner: '', page: '' })

/** The owner's AdMob units, used by the Google Play build: the banner at the foot of the screen and the full-page native ad. */
export const LIVE_UNITS: AdUnits = Object.freeze({
  banner: 'ca-app-pub-2225161543339119/8383793916',
  page: 'ca-app-pub-2225161543339119/5757630575',
})

/** An AdMob ad unit id: ca-app-pub-, 16 digits, a slash, 10 digits. */
export const isAdUnit = (value: string): boolean => /^ca-app-pub-\d{16}\/\d{10}$/.test(value)

/**
 * Google's sample units, used by the e2e build: they serve test ads only and are tied to no account. They are read from the library, and
 * only here, so that a build with no ads never loads the library for them.
 */
export function sampleUnits(): AdUnits {
  const { TestIds } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads')
  return { banner: TestIds.ADAPTIVE_BANNER, page: TestIds.NATIVE }
}

const wellFormed = (units: AdUnits): AdUnits => ({ banner: isAdUnit(units.banner) ? units.banner : '', page: isAdUnit(units.page) ? units.page : '' })

/**
 * The units of a build: the owner's for 'live', Google's for 'sample', none for 'none'. A unit that is not well formed is dropped, so
 * that the build shows no ad of that kind rather than hand the library something it refuses.
 */
export function adUnits(build: 'live' | 'sample' | 'none' = adsBuild()): AdUnits {
  if (build === 'live') return wellFormed(LIVE_UNITS)
  if (build === 'sample') return wellFormed(sampleUnits())
  return NO_UNITS
}
