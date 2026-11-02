'use client'

import { useEffect, useState } from 'react'
import { RAIL_MIN_WIDTH } from '@/lib/ads-config'

// Whether Google's ad script could be loaded in this browser. An ad blocker, or a network that cannot reach Google, leaves it out; then
// there is nothing to wait for, and the page should not hold a place for an ad (a full-page card of nothing, a strip of nothing). The
// script's loader reports it here, and whoever shows an ad listens.

export const ADS_BLOCKED_EVENT = 'plax:ads-blocked'

type Flagged = Window & { __plaxAdsBlocked?: boolean }

/** The script did not load, or loaded and is not the real one: no ad will come. */
export function markAdsBlocked() {
  ;(window as Flagged).__plaxAdsBlocked = true
  window.dispatchEvent(new Event(ADS_BLOCKED_EVENT))
}

export const adsBlocked = () => typeof window !== 'undefined' && (window as Flagged).__plaxAdsBlocked === true

/** True once it is known that no ad will come. */
export function useAdsBlocked(): boolean {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (adsBlocked()) setBlocked(true)
    const on = () => setBlocked(true)
    window.addEventListener(ADS_BLOCKED_EVENT, on)
    return () => window.removeEventListener(ADS_BLOCKED_EVENT, on)
  }, [])
  return blocked
}

/**
 * Whether the right panel of a desktop is on screen, which is where the ads go then (see `adPlacement`). Read from the window at once
 * where there is one, so a feed never starts with the middle's ads and then takes them away; the server render has no window and
 * says no, and nothing that depends on it is drawn there.
 */
export function useRailVisible(): boolean {
  const query = `(min-width: ${RAIL_MIN_WIDTH}px)`
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const wide = window.matchMedia(query)
    const update = () => setVisible(wide.matches)
    update()
    wide.addEventListener('change', update)
    return () => wide.removeEventListener('change', update)
  }, [query])
  return visible
}
