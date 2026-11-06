import type { AdNetwork } from './ad-network'
import { NO_ADS } from './no-ads'
import { adUnits } from './units'

let replaced: AdNetwork | null = null

/** Puts a fake network in place of the build's own, for a test; null puts the build's own back. (Ads.network in the native app.) */
export function setAdNetwork(network: AdNetwork | null): void {
  replaced = network
}

/**
 * Which ad network the app uses: Google's where the build has an ad unit, none otherwise. The build is read when this is asked, never
 * cached. Google's code is loaded only for a build that has ads: for one without, the library is never touched. (Ads.java.)
 */
export function adsNetwork(): AdNetwork {
  if (replaced) return replaced
  const units = adUnits()
  if (units.banner === '' && units.page === '') return NO_ADS
  const { googleAds } = require('./google-ads') as typeof import('./google-ads')
  return googleAds({ units })
}
