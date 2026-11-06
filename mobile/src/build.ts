import * as Application from 'expo-application'

/**
 * The three builds of the app (see app.config.js). What a build does is decided here, at run time, from its application id: an over-the-air
 * update carries the `extra` of whoever published it, so nothing that differs between builds may come from there.
 */
export type Variant = 'play' | 'preview' | 'e2e'

export const APPLICATION_IDS: Record<Variant, string> = {
  play: 'com.plaxlabs.news',
  preview: 'com.plaxlabs.news.preview',
  e2e: 'com.plaxlabs.news.e2e',
}

/** The website the app reads stories from, signs in through and checks for updates at (SITE_URL in the website's src/lib/site.ts). */
export const PRODUCTION_SITE = 'https://plax-rouge.vercel.app/news'

/** The address the device tests' mock website answers at, seen from the emulator. Used by the e2e build only. */
export const E2E_SITE = 'http://10.0.2.2:8787/news'

/** Which build is running. Read when asked, never cached, so that a test can change it. An unknown id is taken as the safest build. */
export function variant(): Variant {
  const id = Application.applicationId
  if (id === APPLICATION_IDS.play) return 'play'
  if (id === APPLICATION_IDS.e2e) return 'e2e'
  return 'preview'
}

export const isPlayBuild = () => variant() === 'play'

/** The Google Play build is updated by Google Play and never looks for an APK; the website's build looks at the website. */
export const looksForApkUpdates = () => variant() === 'preview'

/** Ads are shown by the Google Play build with the owner's units, and by the e2e build with Google's sample units. */
export const adsBuild = (): 'live' | 'sample' | 'none' => {
  const v = variant()
  return v === 'play' ? 'live' : v === 'e2e' ? 'sample' : 'none'
}

/** The address of the website this build talks to. Only the e2e build may use anything but the production website. */
export function site(): string {
  return variant() === 'e2e' ? E2E_SITE : PRODUCTION_SITE
}

/** The deep link scheme this build answers to (the same as its application id). */
export const authScheme = () => APPLICATION_IDS[variant()]

/** The version as the reader sees it: 2.0.0, and 2.0.0-preview for the website's build (its version name says so, see app.config.js). */
export function versionLabel(): string {
  return Application.nativeApplicationVersion ?? '0.0.0'
}

export function versionCode(): number {
  const code = Number(Application.nativeBuildVersion)
  return Number.isFinite(code) ? code : 0
}
