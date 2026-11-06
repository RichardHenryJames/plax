import { requireOptionalNativeModule } from 'expo'

/** What the app's own native module (modules/plax-native) offers. It is missing in a test and wherever the module is not part of the build. */
interface PlaxNative {
  readLegacyPreferences(): Promise<string | null>
  tick(): void
  confirm(): void
}

const native = (): PlaxNative | null => requireOptionalNativeModule<PlaxNative>('PlaxNative')

/** The settings file of the native 1.x app (shared_prefs/plax.xml), or null when there is none or it cannot be read. */
export async function readLegacyPreferences(): Promise<string | null> {
  try {
    return (await native()?.readLegacyPreferences()) ?? null
  } catch {
    return null
  }
}

/** The tick the screen gives under a finger as a page changes. Never throws: a phone with no touch feedback just does not tick. */
export function tick(): void {
  try {
    native()?.tick()
  } catch {
    // Feedback is a nicety.
  }
}

/** The firmer tick for a choice that took effect (a story saved). */
export function confirm(): void {
  try {
    native()?.confirm()
  } catch {
    // Feedback is a nicety.
  }
}
