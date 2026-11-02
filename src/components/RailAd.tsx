'use client'

import { useState } from 'react'
import { AdSlot, type AdShape, type AdStatus } from './AdSlot'
import { ads, adPlacement } from '@/lib/ads-config'
import { adsServed, useAdsResting, useRailVisible } from '@/lib/ads-state'
import { useT } from '@/lib/i18n'
import { usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'

/** The panel's ad is 300 px wide, the width of the unit; the panel (320 px) has the room. */
const WIDTH = 300
/** A window this tall has room for the half page (600 px) above the rest of the panel and still shows the story being read below it. */
const TALL_FROM = 1000

/**
 * The ad of a desktop, at the top of the right panel: the one place the ads go there (none in the middle, which is for the story).
 * It is plainly marked, takes a half page (300 x 600) in a tall window and a rectangle (300 x 250) in a short one, so it never pushes
 * the rest of the panel out of sight, and is asked for once, never refreshed. Like the strip on a phone it is only where there are
 * stories (not on Topics, Saved or an empty For you), only drawn where the panel is on screen (an ad unit in a hidden box cannot be
 * sized), and it gives its room back when no ad comes (nothing to show, or a blocker).
 *
 * It shows nothing, takes no room and says nothing ("Advertisement") until an ad has come, unless this browser has been served an ad here
 * before, when it keeps its room from the start so that the panel does not jump as the ad arrives. The ask itself is made in the open
 * (the unit overlaps the panel under it, without touching it, for the second or so it takes), so an ask that is answered with nothing,
 * as while the AdSense account has not approved the site, leaves neither a labelled blank nor a gap that closes; and a place that has
 * never been served and came back empty is left alone for hours (lib/ads-verdict.ts).
 */
export function RailAd() {
  const railVisible = useRailVisible()
  const screen = useUIStore((s) => s.screen)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const topics = usePlaxStore((s) => s.selectedTopics)
  const resting = useAdsResting('rail')
  const onStories = screen === 'feed' && !(feedFilter === null && topics.length === 0)
  if (resting || !onStories || !adPlacement(ads, railVisible).rail) return null
  return <RailAdUnit />
}

function RailAdUnit() {
  const { t, lang } = useT()
  // Chosen once, as the ad is asked for: an ad is never asked for twice.
  const [shape] = useState<AdShape>(() => (typeof window !== 'undefined' && window.innerHeight >= TALL_FROM ? 'tall' : 'rectangle'))
  const [status, setStatus] = useState<AdStatus>('loading')
  const [reserve] = useState(() => adsServed('rail'))
  if (status === 'unfilled') return null
  const holding = status === 'loading' && !reserve
  // The label says "Advertisement" over an ad, not over room for one: it comes up with the ad.
  const arrived = status === 'filled'
  return (
    <div
      data-ad-rail
      role="complementary"
      aria-label={t('adLabel')}
      aria-hidden={!arrived || undefined}
      className={`relative px-2 ${holding ? 'pointer-events-none h-0' : 'pt-5'} ${lang === 'hi' ? 'lang-hi' : ''}`}
    >
      <div className="mx-auto" style={{ width: WIDTH }}>
        <span className={`mb-2 block text-[11px] font-semibold uppercase tracking-wider text-dark-subtle ${arrived ? '' : 'invisible'}`}>{t('adLabel')}</span>
        <AdSlot unit={ads.rail} kind="rail" shape={shape} label={`Ad preview rail ${shape}`} onStatus={setStatus} />
      </div>
    </div>
  )
}
