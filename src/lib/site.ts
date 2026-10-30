import { BASE_PATH } from './base-path.ts'

/**
 * The address of the Plax website: the one every absolute link is built from (canonical and Open Graph addresses,
 * the sitemap, robots.txt, the address on the share cards and in the policy pages, the user agent sent to the content
 * sources). The Android app has the same address built in (FeedApi.SITE), and src/lib/site.test.mjs and the app's
 * SiteAddressTest fail if the two differ, or if the old domain comes back.
 *
 * Plax used to be served at plaxlabs.com/news. That domain expired and stopped answering, and every installed app that
 * pointed at it lost its stories and its sign-in, so the site is addressed by its Vercel domain instead. This is a
 * constant on purpose, not an environment variable: a stale setting must never be able to put an old address back.
 * If a custom domain is ever added, change it here and in FeedApi.SITE together, and ship a new app.
 */
export const SITE_HOST = 'https://plax-rouge.vercel.app'

/** The base of every page and route (the app lives under /news; see base-path.ts). */
export const SITE_URL = `${SITE_HOST}${BASE_PATH}`

/** The same address as written in running text, without the scheme. */
export const SITE_DISPLAY = SITE_URL.replace(/^https:\/\//, '')
