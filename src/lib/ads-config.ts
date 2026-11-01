// What the website needs to show Google ads, read from the environment. Ads are off unless a publisher id and the ids of the ad
// units are set, and a build without them behaves exactly as before: no script is loaded, no space is kept at the foot of the
// page, and no ad card stands in the feed. So nothing is shown (and nothing sent to Google) until the AdSense account behind it
// exists and has approved the site.
//
// `preview` draws labelled boxes where the ads would be, and sends nothing: for looking at the layout, and for the tests. It is
// never set in production.

export interface AdsConfig {
  /** The AdSense publisher id: ca-pub- and sixteen digits. */
  client: string
  /** The 320 x 50 ad unit of the strip at the foot of the page (phones and narrow windows). */
  stripNarrow: string
  /** The 728 x 90 ad unit of the strip (a window wide enough for it). */
  stripWide: string
  /** The ad unit of the full-page card between stories. */
  page: string
  /** Boxes in place of ads, and no request to Google. */
  preview: boolean
}

const PUBLISHER = /^ca-pub-\d{16}$/
const UNIT = /^\d{6,20}$/

/** A publisher id looks like `ca-pub-` and sixteen digits. */
export const isPublisherId = (value: string) => PUBLISHER.test(value)

/** An ad unit id is a run of digits. */
export const isUnitId = (value: string) => UNIT.test(value)

type Env = Record<string, string | undefined>

/** The settings in an environment: a value that is not shaped like an id counts as not set, so a typo never reaches Google. */
export function readAdsConfig(env: Env): AdsConfig {
  const client = (env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '').trim()
  const unit = (name: string) => {
    const value = (env[name] ?? '').trim()
    return isUnitId(value) ? value : ''
  }
  return {
    client: isPublisherId(client) ? client : '',
    stripNarrow: unit('NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW'),
    stripWide: unit('NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE'),
    page: unit('NEXT_PUBLIC_ADSENSE_SLOT_PAGE'),
    preview: (env.NEXT_PUBLIC_ADS_PREVIEW ?? '').trim() === 'true',
  }
}

/** Whether the strip at the foot of the page is shown. */
export const stripEnabled = (config: AdsConfig) => config.preview || (config.client !== '' && (config.stripNarrow !== '' || config.stripWide !== ''))

/** Whether the feed has a full-page ad after every fifth story. */
export const pageEnabled = (config: AdsConfig) => config.preview || (config.client !== '' && config.page !== '')

/** Whether any ad is shown at all (and so whether the script, the consent choice and the privacy link are needed). */
export const adsEnabled = (config: AdsConfig) => stripEnabled(config) || pageEnabled(config)

/**
 * Whether the privacy policy says that Plax shows ads. One policy covers the website and the Android app, so it says so where the
 * website has real ads (not the preview), or where `NEXT_PUBLIC_ADS_POLICY` is "true": set it when the app's release with ads goes out,
 * and not before, so the policy is never ahead of what a reader gets.
 */
export const adsDisclosed = (config: AdsConfig, env: Env) => (adsEnabled(config) && !config.preview) || (env.NEXT_PUBLIC_ADS_POLICY ?? '').trim() === 'true'

/** The line that goes in ads.txt (and app-ads.txt): the publisher may sell this site's ads, directly, under Google's certification id. */
export function adsTxtLine(client: string): string {
  if (!isPublisherId(client)) throw new Error('not an AdSense publisher id')
  return `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`
}

// The environment variables are named in full here, not read from a variable: Next puts a value into the browser's code only
// where it finds `process.env.NEXT_PUBLIC_...` written out.
export const ads: AdsConfig = readAdsConfig({
  NEXT_PUBLIC_ADSENSE_CLIENT: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
  NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW: process.env.NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW,
  NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE: process.env.NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE,
  NEXT_PUBLIC_ADSENSE_SLOT_PAGE: process.env.NEXT_PUBLIC_ADSENSE_SLOT_PAGE,
  NEXT_PUBLIC_ADS_PREVIEW: process.env.NEXT_PUBLIC_ADS_PREVIEW,
})

export const STRIP_ON = stripEnabled(ads)
export const PAGE_ON = pageEnabled(ads)
export const ADS_ON = adsEnabled(ads)
export const ADS_DISCLOSED = adsDisclosed(ads, { NEXT_PUBLIC_ADS_POLICY: process.env.NEXT_PUBLIC_ADS_POLICY })
