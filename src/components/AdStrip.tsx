'use client'

import { useEffect, useRef, useState } from 'react'
import { AdSlot, type AdStatus } from './AdSlot'
import { ads } from '@/lib/ads-config'
import { adsServed, useAdsResting } from '@/lib/ads-state'
import { useT } from '@/lib/i18n'

/** The two sizes of unit the strip uses. A unit is made to its size, so the ad inside is never clipped or stretched. */
const WIDE = { width: 728, height: 90 }
const NARROW = { width: 320, height: 50 }
/** A column this wide has room for the 728 px unit with a little to spare (the side panels of a desktop take their share). */
const WIDE_FROM = 740
/** A page shorter than this (a phone on its side) keeps the small unit, so the strip does not take a quarter of the screen. */
const TALL_FROM = 520
/** The space above and below the ad. */
const GAP = 4

/**
 * The strip of ad at the foot of the feed: a phone gets a 320 x 50 unit and a window with room a 728 x 90 one, chosen by the size of the
 * column the strip is in (not the window's, because the side panels of a desktop take some of it): wide enough for the big unit, and tall
 * enough that it does not eat the page (a phone on its side keeps the small one). It is under the story, never over it, so the story is
 * laid out in what is left.
 *
 * Where this browser has been served an ad here before, the strip keeps exactly the ad's height from the start, so nothing jumps when
 * the ad arrives. Where it has not (while the AdSense account has not approved the site, no ad ever comes), the strip takes no room, has
 * no border and shows nothing until an ad has come: the unit is asked for at the foot of the screen, over the story's last pixels
 * without touching them, and the story is made smaller only for an ad that is there. It gives the room back when no ad comes (nothing
 * to show, or a blocker); a strip that has never been served and came back empty is left out for hours (lib/ads-verdict.ts).
 */
export function AdStrip() {
  const { t } = useT()
  const resting = useAdsResting('strip')
  const [reserve] = useState(() => adsServed('strip'))
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState({ width: 0, height: 0 })
  const [status, setStatus] = useState<{ key: string; value: AdStatus }>({ key: '', value: 'loading' })

  useEffect(() => {
    const element = box.current
    if (!element) return
    // The column the strip is in: its width decides which unit has room, and its height whether the page is tall enough for the big one.
    const column = element.parentElement ?? element
    const measure = () => {
      const { width, height } = column.getBoundingClientRect()
      setRoom({ width: Math.round(width), height: Math.round(height) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(column)
    return () => observer.disconnect()
  }, [])

  const hasWide = ads.preview || ads.stripWide !== ''
  const hasNarrow = ads.preview || ads.stripNarrow !== ''
  const wideFits = room.width >= WIDE_FROM && room.height >= TALL_FROM && hasWide
  const size = wideFits ? WIDE : room.width >= NARROW.width && hasNarrow ? NARROW : room.width >= WIDE.width && hasWide ? WIDE : null
  const key = size ? `${size.width}x${size.height}` : ''
  const unit = size === WIDE ? ads.stripWide : ads.stripNarrow
  const unfilled = status.key === key && status.value === 'unfilled'
  const filled = status.key === key && status.value === 'filled'
  const shown = size !== null && !unfilled && !resting
  // Asked for but not yet served, and no ad has been served here before: no room, no border, nothing to see.
  const holding = shown && !filled && !reserve
  const roomy = shown && !holding

  return (
    <div
      ref={box}
      role="complementary"
      aria-label={t('adLabel')}
      aria-hidden={holding || undefined}
      data-ad-strip
      className={`w-full shrink-0 bg-dark-bg flex items-center justify-center ${holding ? 'relative' : 'overflow-hidden'} ${roomy ? 'border-t border-dark-border' : ''}`}
      style={{
        height: roomy && size ? `calc(${size.height + 2 * GAP}px + env(safe-area-inset-bottom))` : 0,
        paddingBottom: roomy ? 'env(safe-area-inset-bottom)' : 0,
      }}
    >
      {shown && size && (
        <div className={holding ? 'pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2' : 'flex items-center justify-center'}>
          <AdSlot
            key={key}
            unit={unit}
            kind="strip"
            width={size.width}
            height={size.height}
            label={`Ad preview ${size.width} x ${size.height}`}
            onStatus={(value) => setStatus({ key, value })}
          />
        </div>
      )}
    </div>
  )
}
