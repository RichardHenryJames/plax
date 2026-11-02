'use client'

import { useState } from 'react'
import { AdSlot, type AdShape, type AdStatus } from './AdSlot'
import { ads, adPlacement } from '@/lib/ads-config'
import { useRailVisible } from '@/lib/ads-state'
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
 */
export function RailAd() {
  const railVisible = useRailVisible()
  const screen = useUIStore((s) => s.screen)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const topics = usePlaxStore((s) => s.selectedTopics)
  const onStories = screen === 'feed' && !(feedFilter === null && topics.length === 0)
  if (!onStories || !adPlacement(ads, railVisible).rail) return null
  return <RailAdUnit />
}

function RailAdUnit() {
  const { t, lang } = useT()
  // Chosen once, as the ad is asked for: an ad is never asked for twice.
  const [shape] = useState<AdShape>(() => (typeof window !== 'undefined' && window.innerHeight >= TALL_FROM ? 'tall' : 'rectangle'))
  const [status, setStatus] = useState<AdStatus>('loading')
  if (status === 'unfilled') return null
  return (
    <div data-ad-rail role="complementary" aria-label={t('adLabel')} className={`px-2 pt-5 ${lang === 'hi' ? 'lang-hi' : ''}`}>
      <div className="mx-auto" style={{ width: WIDTH }}>
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-dark-subtle">{t('adLabel')}</span>
        <AdSlot unit={ads.rail} shape={shape} label={`Ad preview rail ${shape}`} onStatus={setStatus} />
      </div>
    </div>
  )
}
