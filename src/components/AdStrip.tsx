'use client'

import { useEffect, useRef, useState } from 'react'
import { AdSlot, type AdStatus } from './AdSlot'
import { ads } from '@/lib/ads-config'
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
 * The strip of ad at the foot of the feed, always there: a phone gets a 320 x 50 unit and a window with room a 728 x 90 one, chosen by
 * the size of the column the strip is in (not the window's, because the side panels of a desktop take some of it): wide enough for the
 * big unit, and tall enough that it does not eat the page (a phone on its side keeps the small one). It is under the story, never over
 * it, so the story is laid out in what is left. It keeps exactly the ad's height from the start, so nothing jumps when the ad arrives,
 * and gives the room back to the story when no ad comes (nothing to show, or a blocker).
 */
export function AdStrip() {
  const { t } = useT()
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
  const shown = size !== null && !unfilled

  return (
    <div
      ref={box}
      role="complementary"
      aria-label={t('adLabel')}
      data-ad-strip
      className={`w-full shrink-0 overflow-hidden bg-dark-bg flex items-center justify-center ${shown ? 'border-t border-dark-border' : ''}`}
      style={{
        height: shown && size ? `calc(${size.height + 2 * GAP}px + env(safe-area-inset-bottom))` : 0,
        paddingBottom: shown ? 'env(safe-area-inset-bottom)' : 0,
      }}
    >
      {shown && size && (
        <AdSlot
          key={key}
          unit={unit}
          width={size.width}
          height={size.height}
          label={`Ad preview ${size.width} x ${size.height}`}
          onStatus={(value) => setStatus({ key, value })}
        />
      )}
    </div>
  )
}
