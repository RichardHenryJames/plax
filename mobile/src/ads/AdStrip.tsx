import { useEffect } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads'
import { useStore } from '../state/store'
import { STRIP_LINE_DP } from './ad-bar'
import type { Ads } from './use-ads'

/** The colours of the strip: the page's background, and the hairline that sets it off from the story. */
export interface StripTheme {
  readonly bg: string
  readonly border: string
}

export interface AdStripProps {
  readonly ads: Ads
  /** A story is on the screen, so the strip belongs there (the feed and For you while they have stories, not Topics or Saved). */
  readonly wanted: boolean
  /** Whether the pager is at rest: the strip is never made to appear while it moves, so that the screen is not made smaller under a swipe. */
  readonly still?: () => boolean
  readonly theme: StripTheme
}

const ALWAYS_STILL = () => true

/**
 * The ad strip at the foot of the screen, under the story: an anchored adaptive banner as wide as the screen (at most 640 dp). Put it last
 * in the screen's column and keep it there while the app runs: it holds its place across screens, so that going to Topics and back does
 * not ask for another banner. It takes no room until its ad has arrived (and none for a retry), except where an ad was served in it
 * within the last week, which keeps its room from the start so that the story does not jump; an ad that failed shows nothing. What it
 * does when is in ad-bar.ts. It renders nothing in a build without a banner, and on a screen shorter than 500 dp (a phone on its side).
 */
export function AdStrip({ ads, wanted, still, theme }: AdStripProps) {
  const { bar, network } = ads
  const { width, height } = useWindowDimensions()
  const state = useStore(bar.store, (current) => current)
  const allowed = ads.settings.ads
  useEffect(() => {
    bar.screen(width, height)
  }, [bar, width, height])
  useEffect(() => {
    bar.setStill(still ?? ALWAYS_STILL)
  }, [bar, still])
  useEffect(() => {
    bar.show(wanted && allowed)
  }, [bar, wanted, allowed])
  if (!state.requested && !state.visible) return null
  const request = state.request
  return (
    <View
      testID="ad-strip"
      pointerEvents={state.visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!state.visible}
      importantForAccessibility={state.visible ? 'auto' : 'no-hide-descendants'}
      // Hidden, the banner is still on the screen and asking, but clipped away with no room.
      style={{ height: state.visible ? state.heightDp + STRIP_LINE_DP : 0, overflow: 'hidden', backgroundColor: theme.bg }}
    >
      <View style={{ height: STRIP_LINE_DP, backgroundColor: theme.border }} />
      <View style={{ height: state.heightDp, alignItems: 'center' }}>
        <BannerAd
          key={request}
          unitId={network.bannerUnit()}
          // Marked as replaced by the large strip in the library's typings; it is the same banner the native app asked for.
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          width={state.widthDp}
          onAdLoaded={(size) => bar.loaded(request, size)}
          onSizeChange={(size) => bar.sized(request, size)}
          onAdFailedToLoad={() => bar.failed(request)}
        />
      </View>
    </View>
  )
}
