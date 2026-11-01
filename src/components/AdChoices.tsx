'use client'

import { ADS_ON, ads } from '@/lib/ads-config'

declare global {
  interface Window {
    googlefc?: { callbackQueue?: unknown[]; showRevocationMessage?: () => void }
  }
}

/** Whether this site shows real ads, and so has a consent choice that can be reopened. */
export const hasAdChoices = ADS_ON && !ads.preview

/**
 * Reopens the consent message of Google's tool (Funding Choices, set up in AdSense > Privacy & messaging), where a reader can change
 * what they allowed. The message is Google's: if it has not loaded yet, the request waits for it; if the account has none for the
 * reader's region, nothing opens, which is why the policy also points to Google's own ad settings.
 */
export function openAdChoices() {
  const consent = (window.googlefc = window.googlefc || {})
  if (consent.showRevocationMessage) {
    consent.showRevocationMessage()
    return
  }
  consent.callbackQueue = consent.callbackQueue || []
  consent.callbackQueue.push({ CONSENT_DATA_READY: () => window.googlefc?.showRevocationMessage?.() })
}

/** The button, in a page of the site's own (the privacy policy). Nothing where there are no ads. */
export function AdChoicesButton() {
  if (!hasAdChoices) return null
  return (
    <button
      type="button"
      onClick={openAdChoices}
      className="focus-ring mt-1 rounded-full border border-dark-border px-4 py-2 text-sm font-semibold text-[color:var(--signal-text)] hover:bg-[var(--wash-1)]"
    >
      Change my ad choices
    </button>
  )
}
