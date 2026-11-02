'use client'

import { useEffect, useState } from 'react'
import { RAIL_MIN_WIDTH } from '@/lib/ads-config'
import { noteFilled, noteUnfilled, readVerdicts, resting, servedRecently, type AdKind, type Verdicts } from '@/lib/ads-verdict'

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

// What this browser has learned about whether Google serves the ads (lib/ads-verdict.ts keeps it between visits): a place for an ad that
// has never been served is left alone for a while after an ask that came back empty, so a reader is not taken through the same empty
// moment on every visit while the AdSense account has not approved the site; and a place that has been served keeps its room from the
// start, so that nothing jumps when its ad arrives.

export const ADS_VERDICT_EVENT = 'plax:ads-verdict'

/** What this page has learned, for a browser whose storage cannot keep it. */
let learned: Verdicts = {}

function browserStore(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function known(): Verdicts {
  return { ...learned, ...readVerdicts(browserStore()) }
}

/** Whether this kind of ad is to be left alone now. */
export const adsResting = (kind: AdKind) => typeof window !== 'undefined' && resting(known(), kind, Date.now())

/** Whether an ad of this kind was served lately. */
export const adsServed = (kind: AdKind) => typeof window !== 'undefined' && servedRecently(known(), kind, Date.now())

/** An ask of this kind was answered with an ad, or came back with nothing: every place that shows ads hears of it. */
export function rememberAds(kind: AdKind, served: boolean) {
  const now = Date.now()
  learned = served ? noteFilled(browserStore(), kind, now, known()) : noteUnfilled(browserStore(), kind, now, known())
  window.dispatchEvent(new Event(ADS_VERDICT_EVENT))
}

/** True while this kind of ad is being left alone. Read from storage at once, so a feed never starts with an ad card and then takes it away. */
export function useAdsResting(kind: AdKind): boolean {
  const [rest, setRest] = useState(() => adsResting(kind))
  useEffect(() => {
    const update = () => setRest(adsResting(kind))
    update()
    window.addEventListener(ADS_VERDICT_EVENT, update)
    return () => window.removeEventListener(ADS_VERDICT_EVENT, update)
  }, [kind])
  return rest
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
