import type { Release } from '../apk-updates'

export { NOW, answer, deferred, memoryStorage, type Deferred, type MemoryStorage } from '../../config/__tests__/helpers'

/** The website's address as the website's build asks it. */
export const ORIGIN = 'https://plax-rouge.vercel.app/news'
export const APK = `${ORIGIN}/plax-1.4.0.apk`
export const SHA = 'a'.repeat(64)

/** A feed the way the website publishes it, with these fields changed. The fields are in the order the website writes them. */
export function manifest(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    versionCode: 10,
    versionName: '1.4.0',
    minSdk: 26,
    apkUrl: APK,
    sha256: SHA,
    size: 1_850_000,
    ...changes,
  }
}

export const manifestText = (changes: Record<string, unknown> = {}) => JSON.stringify(manifest(changes))

export const RELEASE: Release = { versionCode: 5, versionName: '1.4.0', apkUrl: `${ORIGIN}/plax-1.4.0.apk` }
export const NEWER: Release = { versionCode: 6, versionName: '1.5.0', apkUrl: `${ORIGIN}/plax-1.5.0.apk` }
