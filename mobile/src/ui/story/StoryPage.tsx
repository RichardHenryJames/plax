import { memo, useEffect, useMemo, useState } from 'react'
import { PixelRatio, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { bodyOf, hasImage as storyHasImage, hasSource, type Story } from '../../data/story'
import { imageCandidates } from '../../data/image-sizing'
import { Icon } from '../Icon'
import { imageUri } from '../../platform/images'
import { useT } from '../i18n-context'
import { LineButton, MenuButton, Txt, withAlpha } from '../primitives'
import { useTheme } from '../theme'
import { BREAKING, bodyTextStyle, titleTextStyle, useMeasured } from './measure'
import { bodyCutter, computeStoryLayout, pageGeometry, typeSizes, type LayoutConfig } from './layout'
import { Poster, PosterBackground } from './Poster'

/** The widest a picture is asked for, in pixels: what the native app's ImageLoader decoded at most. */
const MAX_PICTURE_PX = 1080

export interface StoryPageProps {
  readonly story: Story
  /** The size of the page: the screen between the system bars, and above the strip of ads. */
  readonly width: number
  readonly height: number
  /** The tag over the story ("INDIA"), already in the reader's language and in capitals. */
  readonly tag: string
  /** What stands beside the tag: its age, its read time, and the publisher's name when the website says to name it. '' for nothing. */
  readonly credit: string
  readonly saved: boolean
  /** Saving is possible (the saved stories could be read, and none is being written now). */
  readonly saveEnabled: boolean
  readonly showDeeper: boolean
  readonly layoutConfig: LayoutConfig
  /** The name set large on a poster ("Plax"). */
  readonly masthead: string
  readonly onMenu: () => void
  readonly onSave: (story: Story) => void
  readonly onShare: (story: Story) => void
  readonly onDeeper: (story: Story) => void
  readonly onOpenSource: (story: Story) => void
}

/**
 * One story, laid out so that all of it is in view at once. The page has nothing that scrolls, so a single swipe always moves to the next
 * story; to make that possible the picture, the tag and source line (with the Go deeper, save and share buttons at its right end), the
 * headline and the summary are measured together and share the page's height (src/ui/story/layout.ts, a port of the native app's
 * StoryPage). The headline is the link to the full story.
 */
function StoryPageView(props: StoryPageProps) {
  const { story, width, height, tag, credit, saved, saveEnabled, showDeeper, layoutConfig, masthead } = props
  const { palette } = useTheme()
  const { t, lang } = useT()
  const { fontScale, height: screenHeight } = useWindowDimensions()
  const { titleSp, bodySp } = typeSizes(screenHeight)
  const geometry = pageGeometry(width, height)
  const title = story.title.trim()
  const body = bodyOf(story)
  const includePadding = lang === 'hi'

  const key = [story.id, width, height, fontScale, lang, titleSp, bodySp, title.length, body.length].join('|')
  const { measured, measurers } = useMeasured({ key, columnWidth: geometry.columnWidth, title, body, titleSp, bodySp, includePadding })

  // A picture that cannot be loaded is replaced by the poster, and the page is laid out again for it.
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  // The addresses to try, in order: a wider copy of the picture where the publisher serves one (see imageCandidates), then the one the feed named.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setImageFailed(false)
    setImageLoaded(false)
    setAttempt(0)
  }, [story.id])
  const photo = storyHasImage(story) && !imageFailed

  const layout = useMemo(() => {
    if (!measured) return undefined
    return computeStoryLayout({
      width, height, fontScale, titleSp, bodySp,
      hasTitle: title !== '', hasBody: body !== '', posterShown: !photo,
      titleLinesAt: measured.titleLinesAt, bodyLines: measured.bodyLines.length,
      bodyFull: body, cutBody: bodyCutter(body, measured.bodyLines, geometry.columnWidth, measured.ellipsisWidth),
      config: layoutConfig,
    })
  }, [measured, width, height, fontScale, titleSp, bodySp, title, body, photo, layoutConfig, geometry.columnWidth])

  const linked = hasSource(story)
  const menuBox = layout?.menu
  const pixels = Math.min(MAX_PICTURE_PX, Math.round(PixelRatio.getPixelSizeForLayoutSize(layout?.hero.width ?? width)))
  const candidates = useMemo(() => imageCandidates(story.image, pixels).map(imageUri), [story.image, pixels])
  const picture = candidates[Math.min(attempt, candidates.length - 1)]
  return (
    <View style={{ width, height, backgroundColor: palette.bg }} testID={`story-${story.id}`}>
      {/* The button is first, for a screen reader (it is the first thing on every page), and above the rest, for the eye and the finger. */}
      <View style={{ position: 'absolute', zIndex: 2, left: menuBox?.left ?? geometry.columnLeft - 4, top: menuBox?.top ?? 4, width: 48, height: 48 }}>
        <MenuButton onPress={props.onMenu} />
      </View>
      {measurers}
      {layout ? (
        <>
          {layout.hero.height > 0 ? (
            <View
              testID="hero"
              style={{ position: 'absolute', left: layout.hero.left, top: layout.hero.top, width: layout.hero.width, height: layout.hero.height, borderRadius: 24, overflow: 'hidden', backgroundColor: palette.surfaceAlt }}
            >
              {photo ? (
                <>
                  {imageLoaded ? null : (
                    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: 0.45 }]}>
                      <Icon name="image" size={40} color={palette.text2} />
                    </View>
                  )}
                  <Image
                    source={{ uri: picture }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={160}
                    recyclingKey={story.id}
                    accessible={false}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => (attempt + 1 < candidates.length ? setAttempt(attempt + 1) : setImageFailed(true))}
                  />
                </>
              ) : (
                <>
                  <PosterBackground radius={24} />
                  <Poster name={masthead} section={tag} size={layout.posterSize} />
                </>
              )}
            </View>
          ) : null}

          <View style={{ position: 'absolute', left: layout.meta.left, top: layout.meta.top, width: layout.meta.width, height: layout.meta.height, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ backgroundColor: palette.accentSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '45%' }}>
              <Txt font="sansMedium" size={11} color="accentText" numberOfLines={1} style={{ letterSpacing: 0.66 }} testID="tag">
                {tag}
              </Txt>
            </View>
            {credit !== '' ? (
              <Txt size={12} color="text2" numberOfLines={2} ellipsizeMode="tail" style={{ flex: 1, paddingLeft: 10, paddingRight: 4 }} testID="credit">
                {credit}
              </Txt>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {showDeeper ? <LineButton icon="sparkle" label={t('go_deeper_description')} onPress={() => props.onDeeper(story)} fill={palette.accentSoft} tint={palette.accentText} testID="deeper" /> : null}
            <View style={{ opacity: saveEnabled ? 1 : 0.5 }}>
              <LineButton
                icon={saved ? 'bookmark_filled' : 'bookmark'}
                label={t(saved ? 'unsave_description' : 'save_description')}
                onPress={() => {
                  if (saveEnabled) props.onSave(story)
                }}
                fill={palette.surfaceAlt}
                tint={saved ? palette.accentText : palette.text}
                testID="save"
              />
            </View>
            <LineButton icon="share" label={t('share')} onPress={() => props.onShare(story)} fill={palette.surfaceAlt} tint={palette.text} testID="share" />
          </View>

          {title !== '' ? (
            <Pressable
              testID="headline"
              disabled={!linked}
              onPress={() => props.onOpenSource(story)}
              accessibilityRole={linked ? 'link' : 'header'}
              accessibilityHint={linked ? t('read_full_story') : undefined}
              android_ripple={linked ? { color: withAlpha(palette.text, 0.133) } : undefined}
              style={{ position: 'absolute', left: layout.title.left, top: layout.title.top, width: layout.title.width, height: layout.title.height, paddingTop: 12 }}
            >
              <Text
                {...BREAKING}
                numberOfLines={layout.titleLines}
                ellipsizeMode="tail"
                style={[titleTextStyle(titleSp, layout.titleScale, includePadding), { color: palette.text }]}
              >
                {title}
              </Text>
            </Pressable>
          ) : null}

          {layout.bodyLines > 0 ? (
            <View style={{ position: 'absolute', left: layout.body.left, top: layout.body.top, width: layout.body.width, height: layout.body.height, paddingTop: 14 }} testID="body-box">
              <Text
                {...BREAKING}
                numberOfLines={layout.bodyLines}
                ellipsizeMode="clip"
                testID="body"
                style={[bodyTextStyle(bodySp, includePadding), { color: palette.text, opacity: 0.88 }]}
              >
                {layout.bodyText}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

/** A page is drawn again only when something it shows changed. */
export const StoryPage = memo(StoryPageView, (before, after) =>
  before.story === after.story && before.width === after.width && before.height === after.height && before.tag === after.tag && before.credit === after.credit &&
  before.saved === after.saved && before.saveEnabled === after.saveEnabled && before.showDeeper === after.showDeeper && before.layoutConfig === after.layoutConfig &&
  before.masthead === after.masthead && before.onMenu === after.onMenu && before.onSave === after.onSave && before.onShare === after.onShare &&
  before.onDeeper === after.onDeeper && before.onOpenSource === after.onOpenSource)
