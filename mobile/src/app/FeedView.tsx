import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  NO_SLOTS,
  NativeAdPage,
  interleave,
  itemAt,
  pagerIndex,
  slotAt,
  useRoomForPages,
  useSettledSlots,
  type AdTheme,
  type Ads,
} from '../ads'
import type { AppConfig } from '../config/app-config'
import { showsSourceName } from '../config/app-config'
import { feedBanner } from '../data/feed-banner'
import type { FeedEngine, FeedState } from '../data/feed-engine'
import { adOrdinal, adStory, hasImage, isAd, isCaughtUp, type Story } from '../data/story'
import { imageUri } from '../platform/images'
import { useT } from '../ui/i18n-context'
import { MenuButton } from '../ui/primitives'
import { Pager, type PageSize } from '../ui/Pager'
import { CaughtUpPage, FeedBanner, NoInsets } from '../ui/screens'
import { StoryPage } from '../ui/story/StoryPage'
import { isRoomy } from '../ui/story/layout'
import { useTheme } from '../ui/theme'
import { storyCredit, storyTag } from './story-text'

/** What a page of the feed can ask of the app. The callbacks stay the same for as long as the app runs, so that a page is drawn again only when it changed. */
export interface StoryActions {
  readonly onMenu: () => void
  readonly onSave: (story: Story) => void
  readonly onShare: (story: Story) => void
  readonly onDeeper: (story: Story) => void
  readonly onOpenSource: (story: Story) => void
}

export interface FeedViewProps {
  readonly state: FeedState
  readonly engine: FeedEngine
  readonly config: AppConfig
  readonly ads: Ads
  readonly actions: StoryActions
  /** The pager is being swiped or gliding (true), or at rest (false): the strip of ads is not made to appear while it moves. */
  readonly onMovingChange?: (moving: boolean) => void
  /** The reader has moved to another page: the phone ticks under their finger. */
  readonly onTick?: () => void
}

/**
 * The page of the pager that shows this item of the engine's list, with the ad pages of `slots` in it. A reader who is on an ad page
 * stays on it: the engine puts an ad page at the story before it (MainActivity.pagerIndex).
 */
export function pagerTarget(item: number, onAd: number, slots: readonly number[]): number {
  if (onAd >= 0 && item === onAd - 1) {
    for (let index = 0; index < slots.length; index++) if (slots[index] === onAd) return onAd + index
  }
  return pagerIndex(item, slots)
}

/** How many of the stories after the one in view have their picture asked for ahead of time. */
const PREFETCH_AHEAD = 2

function prefetchPictures(stories: readonly Story[], item: number): void {
  for (let next = item + 1; next <= item + PREFETCH_AHEAD && next < stories.length; next++) {
    const story = stories[next]
    if (!hasImage(story)) continue
    try {
      void Promise.resolve(Image.prefetch(imageUri(story.image))).catch(() => undefined)
    } catch {
      // A picture that cannot be fetched ahead is fetched when its page is drawn.
    }
  }
}

/**
 * The stories one under the other, a page each (MainActivity's pager). Full-page ads stand between the stories where the ad controller
 * has one ready; they are put in, and taken out, only while the pager is still, so that nothing moves under a swipe. The engine's own
 * position is the reader's place in its list of stories; the pager's page is made from it and from the ads that are in.
 */
export function FeedView({ state, engine, config, ads, actions, onMovingChange, onTick }: FeedViewProps) {
  const { t, lang } = useT()
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const stories = state.stories
  const browsing = state.screen === 'feed' || state.screen === 'forYou'
  const roomForAds = useRoomForPages()
  const adPages = browsing && stories.length > 0 && roomForAds && ads.pagesOn

  const [moving, setMoving] = useState(false)
  const slots = useSettledSlots(adPages ? ads.shown : NO_SLOTS, moving)
  const items = useMemo(() => (slots.length === 0 ? stories : interleave(stories, slots, ads.every, adStory)), [stories, slots, ads.every])

  // The page the reader is on and the ad pages the pager was made with, as of the last time it was drawn.
  const page = useRef(0)
  const drawn = useRef<readonly number[]>(NO_SLOTS)
  const [, swiped] = useState(0)

  const item = stories.length === 0 ? 0 : Math.min(engine.currentPosition(), stories.length - 1)
  const onAd = adPages ? slotAt(page.current, drawn.current) : -1
  const target = stories.length === 0 ? 0 : pagerTarget(item, onAd, slots)
  useLayoutEffect(() => {
    page.current = target
    drawn.current = slots
  })

  // Ads are asked for ahead of the reader, so the reader's place is told to them whenever it, or the list, changes.
  useEffect(() => {
    if (adPages) ads.controller.reader(item, stories.length, onAd)
  }, [adPages, ads.controller, item, stories.length, onAd])

  useEffect(() => prefetchPictures(stories, item), [stories, item])

  const onIndexChange = useCallback(
    (next: number) => {
      page.current = next
      onTick?.()
      // An ad page stands for the story before it, so that the engine keeps the place of the story the reader has just read.
      engine.position(itemAt(next, drawn.current))
      swiped((count) => count + 1)
    },
    [engine, onTick],
  )
  const onPagerMoving = useCallback(
    (now: boolean) => {
      setMoving(now)
      onMovingChange?.(now)
    },
    [onMovingChange],
  )
  const retry = useCallback(() => engine.retry(), [engine])
  const check = useCallback(() => engine.refresh(), [engine])
  const earlier = useCallback(() => engine.revealEarlier(), [engine])

  const adTheme = useMemo<AdTheme>(
    () => ({
      bg: palette.bg,
      text: palette.text,
      textSecondary: palette.text2,
      accent: palette.accent,
      onAccent: palette.onAccent,
      surface: palette.surface,
      border: palette.border,
      accentText: palette.accentText,
      accentSoft: palette.accentSoft,
      surfaceAlt: palette.surfaceAlt,
    }),
    [palette],
  )

  const namesSource = showsSourceName(config)
  // The age on a page is told to the minute: a page is made again when the minute turns and the feed is drawn again.
  const minute = Math.floor(Date.now() / 60_000)
  const { savedIds, storageReady, saving } = state
  const earlierCount = state.earlier
  const saveEnabled = storageReady && !saving
  const renderPage = useCallback(
    (story: Story, _at: number, size: PageSize) => {
      const box = { width: size.width, height: size.height }
      if (isAd(story)) {
        return (
          <View style={box}>
            <NativeAdPage page={ads.controller.page(adOrdinal(story))} theme={adTheme} lang={lang} menu={<MenuButton onPress={actions.onMenu} />} style={box} />
          </View>
        )
      }
      if (isCaughtUp(story)) {
        return (
          <View style={box}>
            <NoInsets>
              <CaughtUpPage earlier={earlierCount} onCheck={check} onEarlier={earlier} onMenu={actions.onMenu} />
            </NoInsets>
          </View>
        )
      }
      return (
        <StoryPage
          story={story}
          width={size.width}
          height={size.height}
          tag={storyTag(story, config, lang, t)}
          credit={storyCredit(story, t, { lang, now: minute * 60_000, namesSource, roomy: isRoomy(size.width) })}
          saved={savedIds.has(story.id)}
          saveEnabled={saveEnabled}
          showDeeper={config.features.deeper}
          layoutConfig={config.layout}
          masthead={t('app_name')}
          onMenu={actions.onMenu}
          onSave={actions.onSave}
          onShare={actions.onShare}
          onDeeper={actions.onDeeper}
          onOpenSource={actions.onOpenSource}
        />
      )
    },
    [ads.controller, adTheme, lang, t, actions, earlierCount, check, earlier, config, namesSource, savedIds, saveEnabled, minute],
  )

  const banner = feedBanner(state, item)
  return (
    <View style={{ flex: 1 }} testID="feed-view">
      <FeedBanner banner={banner} onRetry={retry} />
      <View style={{ flex: 1, paddingTop: banner === null ? insets.top : 0, paddingLeft: insets.left, paddingRight: insets.right }}>
        <Pager items={items} index={target} onIndexChange={onIndexChange} onMovingChange={onPagerMoving} renderPage={renderPage} testID="feed-pager" />
      </View>
    </View>
  )
}
