'use client'

import { useEffect, useRef } from 'react'
import { ads } from '@/lib/ads-config'
import { ADS_BLOCKED_EVENT, adsBlocked } from '@/lib/ads-state'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

export type AdStatus = 'loading' | 'filled' | 'unfilled'

/** How long an ad has to appear before the space is given back. (A blocked script is noticed at once, not after this.) */
const GIVE_UP_MS = 5000

/**
 * One Google ad unit. The AdSense script (loaded once by AdsRuntime) fills the `<ins>` it finds, and marks it `filled` or `unfilled`;
 * that is how the page knows when there is nothing to show and can give the room back instead of leaving a hole. The unit is asked for
 * an ad once and never refreshed, as the program rules require. In preview a labelled box stands in and nothing is requested.
 */
export function AdSlot({
  unit,
  width,
  height,
  rectangle = false,
  label,
  onStatus,
}: {
  unit: string
  /** The size of a fixed unit, in px (a unit made to that size, so the ad is never clipped). */
  width?: number
  height?: number
  /** A responsive rectangle (at most 336 x 280, as wide as the room allows): it can never be taller than the page it is on. */
  rectangle?: boolean
  /** What the preview box says. */
  label: string
  onStatus?: (status: AdStatus) => void
}) {
  const ins = useRef<HTMLModElement>(null)
  const report = useRef(onStatus)
  report.current = onStatus
  // Strict Mode runs an effect twice in development; the unit must still be asked once.
  const asked = useRef(false)

  useEffect(() => {
    if (ads.preview) {
      report.current?.('filled')
      return
    }
    const element = ins.current
    if (!element) return
    let done = false
    const finish = (status: AdStatus) => {
      if (done) return
      done = true
      report.current?.(status)
    }
    // No script, no ad: nothing to wait for.
    if (adsBlocked()) {
      finish('unfilled')
      return
    }
    const onBlocked = () => finish('unfilled')
    window.addEventListener(ADS_BLOCKED_EVENT, onBlocked)
    const read = () => {
      const status = element.getAttribute('data-ad-status')
      if (status === 'filled') finish('filled')
      else if (status === 'unfilled') finish('unfilled')
    }
    const watch = new MutationObserver(read)
    watch.observe(element, { attributes: true, attributeFilter: ['data-ad-status'] })
    const giveUp = setTimeout(() => finish('unfilled'), GIVE_UP_MS)
    if (!asked.current) {
      asked.current = true
      try {
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      } catch {
        finish('unfilled')
      }
    }
    read()
    return () => {
      watch.disconnect()
      clearTimeout(giveUp)
      window.removeEventListener(ADS_BLOCKED_EVENT, onBlocked)
    }
  }, [unit])

  if (ads.preview) {
    return (
      <div
        data-ad-preview
        className="flex items-center justify-center rounded-lg border border-dashed border-dark-border bg-[var(--wash-1)] text-[11px] text-dark-subtle"
        style={{ width: rectangle ? '100%' : width, height: rectangle ? 280 : height }}
      >
        {label}
      </div>
    )
  }

  return (
    <ins
      ref={ins}
      className="adsbygoogle"
      style={{
        display: rectangle ? 'block' : 'inline-block',
        width: rectangle ? '100%' : width,
        height: rectangle ? undefined : height,
        minHeight: rectangle ? 250 : undefined,
      }}
      data-ad-client={ads.client}
      data-ad-slot={unit}
      data-ad-format={rectangle ? 'rectangle' : undefined}
      data-full-width-responsive={rectangle ? 'false' : undefined}
    />
  )
}
