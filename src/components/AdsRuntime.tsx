'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { ads, ADS_ON } from '@/lib/ads-config'
import { markAdsBlocked } from '@/lib/ads-state'
import { keepLayoutHeights } from '@/lib/layout-guard'

/**
 * Loads Google's ad script, once, when the site has ads. With none set (the default) it renders nothing, so no request is made to
 * Google at all. The same script shows the consent choice to readers in the EEA, the UK and Switzerland when the AdSense account has
 * one set up (Privacy & messaging), and ads wait for it.
 *
 * A blocker that stops the script, or one that lets a stand-in load, is noticed at once (`adsbygoogle.loaded` is set only by the real
 * script), so the page never holds a place for an ad that will not come.
 *
 * The script also sets `height: auto !important` on the page's window-sized boxes, which emptied the middle of a desktop on the live site;
 * they are kept at their heights (lib/layout-guard.ts) for as long as the script is on the page.
 */
export function AdsRuntime() {
  const on = ADS_ON && !ads.preview && !!ads.client
  useEffect(() => {
    if (!on) return
    const main = document.querySelector('main')
    return keepLayoutHeights([main, main?.firstElementChild as HTMLElement | null])
  }, [on])
  if (!on) return null
  return (
    <Script
      id="adsbygoogle-script"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ads.client}`}
      onError={markAdsBlocked}
      onLoad={() => {
        const script = (window as unknown as { adsbygoogle?: { loaded?: boolean } }).adsbygoogle
        if (!script || script.loaded !== true) markAdsBlocked()
      }}
    />
  )
}
