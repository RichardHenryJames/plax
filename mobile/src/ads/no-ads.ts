import type { AdNetwork } from './ad-network'

/** The network of a build with no ads: it asks for nothing, so nothing is shown and nothing leaves the phone. */
export const NO_ADS: AdNetwork = {
  banner: () => false,
  page: () => false,
  bannerUnit: () => '',
  start: () => undefined,
  privacyOptions: () => false,
  watchPrivacyOptions: () => () => undefined,
  showPrivacyOptions: () => Promise.resolve(),
  loadPage(listener) {
    listener.failed()
    return { cancel: () => undefined }
  },
}
