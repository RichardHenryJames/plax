'use client'

import { useEffect, useRef, useState } from 'react'
import { AdSlot, type AdShape } from './AdSlot'
import { ads } from '@/lib/ads-config'
import { useT } from '@/lib/i18n'

/**
 * Room to scroll above and below the page, in px. It is far more than any gesture can cover, so a long swipe, or the tail of a
 * trackpad push, never runs the box to its end: a box at its end goes silent, which looks just like a box that has stopped, and the
 * rest of the tail would then be taken for a new swipe.
 */
const SLACK = 20000
/** How far such a scroll has to go before the page moves on: the same 72 px that a swipe on a story needs. */
const TRIGGER = 72
/** The scroll has to be still this long (ms) before a new one counts, so the tail of the gesture that brought the reader here is not read as a new one. */
const QUIET_MS = 220
/** If the page is still here this long (ms) after it tried to move on (there was nowhere to go), the scroll is given back. */
const RETRY_MS = 900
/** A place for the ad this tall (the half page, 600 px, and the air above and below it) gets the half-page unit; a shorter one, the rectangle. */
const TALL_FROM = 632

/**
 * The full-page ad that stands between stories: after every fifth one, in the same swipe feed, so the next story is one swipe away,
 * as in Inshorts. It is plainly marked as an advertisement (a label above, and Google's own mark on the ad) and holds the biggest unit
 * the page has room for: a half page (300 x 600) where the page is tall, else a rectangle (300 x 250 up to 336 x 280). It can always
 * be left, in every way a story can: a swipe, the wheel, the arrow keys, or the button under it.
 *
 * A swipe or a push of the wheel that begins on the ad itself belongs to the ad's frame, which is Google's and a different origin, so
 * the page's own handlers never hear of it. What the browser does with a gesture that nothing in the frame uses is scroll the nearest
 * scrolling box around it, so the page is one: the box scrolls (the page stays where it is, held by `sticky`), and the scroll is the
 * gesture. It moves on when it has gone as far as a swipe on a story has to, in the direction it went, and, like the wheel on a story,
 * only once it has been still since the page came up, so the tail of the gesture that brought the reader here does not carry them past.
 * The whole page is that box (`data-no-feed-scroll` keeps the feed's own wheel and touch handlers off it), so every gesture on it goes
 * the one way and none can move the page twice.
 *
 * With no ad to show (none served, or a blocker) it tells the feed, which drops the card, so a reader is never left on an empty page.
 */
export function AdCard({
  onNext,
  onPrev,
  onHold,
  onFilled,
  onUnfilled,
}: {
  onNext: () => void
  onPrev: () => void
  /** Called as the page moves on by scroll, so the feed keeps the wheel's tail from moving the next one too. */
  onHold: () => void
  onFilled: () => void
  onUnfilled: () => void
}) {
  const { t, lang } = useT()
  const [shape, setShape] = useState<AdShape | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const hand = useRef({ onNext, onPrev, onHold })
  hand.current = { onNext, onPrev, onHold }
  const hindi = lang === 'hi' ? 'lang-hi' : ''

  // The shape is chosen once, from the room there is, before the ad is asked for: an ad is never asked for twice.
  useEffect(() => {
    setShape((area.current?.clientHeight ?? 0) >= TALL_FROM ? 'tall' : 'rectangle')
  }, [])

  // The box starts in the middle of its range, and starts not counting: whatever arrives in the first moments is the tail of the gesture
  // that brought the reader here. Every scroll starts the wait again; once it has been still the box is put back in the middle and from
  // then on a scroll counts. A scroll that stopped short of a swipe is taken back the same way.
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    let counting = false
    let seen = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const centre = () => {
      box.scrollTop = SLACK
      seen = box.scrollTop
    }
    const wait = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(settle, ms)
    }
    const settle = () => {
      // A page that is busy tells of a scroll late, and the box has already moved: that is not a box at rest.
      if (box.scrollTop !== seen) {
        seen = box.scrollTop
        wait(QUIET_MS)
        return
      }
      centre()
      counting = true
    }
    const onScroll = () => {
      seen = box.scrollTop
      if (counting) {
        const moved = seen - SLACK
        if (Math.abs(moved) >= TRIGGER) {
          counting = false
          hand.current.onHold()
          if (moved > 0) hand.current.onNext()
          else hand.current.onPrev()
          wait(RETRY_MS)
          return
        }
      }
      wait(QUIET_MS)
    }
    centre()
    wait(QUIET_MS)
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      box.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <div
      ref={scroller}
      data-ad-card
      data-no-feed-scroll
      role="complementary"
      aria-label={t('adLabel')}
      className="absolute inset-0 overflow-y-auto overscroll-contain [overflow-anchor:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ height: `calc(100% + ${2 * SLACK}px)` }}>
        <div
          className={`sticky top-0 mx-auto flex w-full max-w-[26rem] flex-col items-center px-5 pt-16 pb-6 text-center lg:pt-20 ${hindi}`}
          style={{ height: `calc(100% - ${2 * SLACK}px)` }}
        >
          <span className="rounded-full border border-dark-border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-dark-muted">
            {t('adLabel')}
          </span>

          <div ref={area} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden py-4">
            <div className="w-full max-w-[336px]">
              {shape && (
                <AdSlot
                  unit={ads.page}
                  shape={shape}
                  label="Ad preview"
                  onStatus={(next) => {
                    if (next === 'filled') onFilled()
                    if (next === 'unfilled') onUnfilled()
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2.5">
            <button type="button" onClick={onNext} className="btn-primary focus-ring px-6 py-2.5 text-sm">
              {t('adNextButton')} ↓
            </button>
            <p className="text-xs text-dark-subtle [@media(pointer:fine)]:hidden">{t('adNext')}</p>
            <p className="hidden text-xs text-dark-subtle [@media(pointer:fine)]:block">{t('adNextKey')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
