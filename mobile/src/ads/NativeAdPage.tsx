import { Component, type ReactNode } from 'react'
import { Image, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } from 'react-native-google-mobile-ads'
import { translate, type Lang } from '../i18n'
import type { AdPage } from './ad-network'

/** The colours the page and its card are drawn in. The last three are optional: where they are missing they are made from the others. */
export interface AdTheme {
  readonly bg: string
  readonly text: string
  readonly textSecondary: string
  readonly accent: string
  readonly onAccent: string
  readonly surface: string
  readonly border: string
  /** The text of the "Ad" label (the accent where not given). */
  readonly accentText?: string
  /** The background of the "Ad" label (the accent, made faint, where not given). */
  readonly accentSoft?: string
  /** The background of the picture and the icon while they draw (the border colour where not given). */
  readonly surfaceAlt?: string
}

/** The picture is never smaller than this: Google's minimum for the media of a native ad is 120 dp each way. */
export const MIN_MEDIA_DP = 120
/** The most lines of the headline and of the text: what the page is planned for (see pageFits in ad-slots.ts). */
export const HEADLINE_LINES = 2
export const BODY_LINES = 2
/** The card is as wide as the screen less this on each side, and no wider than CARD_MAX_WIDTH_DP. */
export const CARD_MARGIN_DP = 16
export const CARD_MAX_WIDTH_DP = 560
const CARD_PADDING_DP = 16
/** The page leaves the top corner to the menu button (a 48 dp touch target and a little room) and the foot to the hint. */
export const MENU_TOUCH_DP = 48
const PAGE_TOP_DP = MENU_TOUCH_DP + 8
const PAGE_BOTTOM_DP = 56

/** `color` with this opacity (0 to 255) as its alpha; a colour that is not written #rgb or #rrggbb is returned as it is. */
export function withAlpha(color: string, alpha: number): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : /^#[0-9a-f]{6}$/i.test(color) ? color : null
  if (!hex) return color
  return `${hex}${Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, '0')}`
}

/**
 * Whatever goes wrong in drawing an ad costs the reader one blank page and never the app: an ad is something Google's library hands
 * over at its own time and in its own shape.
 */
class CardBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false }

  static getDerivedStateFromError() {
    return { broken: true }
  }

  render() {
    return this.state.broken ? null : this.props.children
  }
}

const usable = (page: AdPage | null): page is AdPage => {
  try {
    return page !== null && !page.destroyed
  } catch {
    return false
  }
}

const keyOf = (page: AdPage): string => {
  try {
    return page.content.id
  } catch {
    return 'unreadable'
  }
}

/**
 * A native ad drawn as a card in Plax's own look. Google's rules for native ads shape it:
 * - every asset the ad uses (headline, picture or video, text, icon, button) is a child of the NativeAdView and is registered with it as
 *   the direct child of a NativeAsset, and none of them has a press handler of ours: the ads library handles and counts the presses;
 * - the card is a visible "Ad" label first, so nobody can take it for a story; the AdChoices icon, which the library puts in the top
 *   right corner of the card, has that corner to itself;
 * - the picture or video is shown whole, never cropped, and is at least 120 dp each way (it gives way, down to that, to the text and the
 *   button when the page is short);
 * - nothing of ours is drawn over the card and nothing of ours that can be pressed is next to it.
 */
function AdCard({ page, theme, lang }: { page: AdPage; theme: AdTheme; lang: Lang }) {
  const { width: screen } = useWindowDimensions()
  const content = page.content
  const width = Math.min(screen - 2 * CARD_MARGIN_DP, CARD_MAX_WIDTH_DP)
  const mediaWanted = content.media ? Math.round((width - 2 * CARD_PADDING_DP) / content.media.aspectRatio) : 0
  // Devanagari marks sit above and below the line; trimming the font padding can clip them.
  const font: TextStyle = { includeFontPadding: lang === 'hi' }
  const alt = theme.surfaceAlt ?? theme.border
  return (
    <NativeAdView nativeAd={page.ad} style={[styles.card, { width, backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.column}>
        <Text
          accessibilityLabel={translate(lang, 'ad_description')}
          numberOfLines={1}
          style={[styles.label, font, { color: theme.accentText ?? theme.accent, backgroundColor: theme.accentSoft ?? withAlpha(theme.accent, 0x26) }]}
        >
          {translate(lang, 'ad_label')}
        </Text>
        {content.media ? (
          <View style={[styles.media, { flexBasis: mediaWanted, backgroundColor: alt }]}>
            <NativeMediaView resizeMode="contain" style={styles.mediaView} />
          </View>
        ) : null}
        <View style={styles.info}>
          {content.icon ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: content.icon.url }} style={[styles.icon, { backgroundColor: alt }]} />
            </NativeAsset>
          ) : null}
          <View style={styles.words}>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text numberOfLines={HEADLINE_LINES} ellipsizeMode="tail" style={[styles.headline, font, { color: theme.text }]}>
                {content.headline}
              </Text>
            </NativeAsset>
            {content.advertiser ? (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.advertiser, font, { color: theme.textSecondary }]}>
                  {content.advertiser}
                </Text>
              </NativeAsset>
            ) : null}
          </View>
        </View>
        {content.body ? (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text numberOfLines={BODY_LINES} ellipsizeMode="tail" style={[styles.body, font, { color: theme.text }]}>
              {content.body}
            </Text>
          </NativeAsset>
        ) : null}
        {content.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text
              accessibilityRole="button"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.action, font, { color: theme.onAccent, backgroundColor: theme.accent }]}
            >
              {content.callToAction}
            </Text>
          </NativeAsset>
        ) : null}
      </View>
    </NativeAdView>
  )
}

export interface NativeAdPageProps {
  /** The ad of the slot (AdController.page()); null, or an ad that has been let go, leaves the page empty. */
  readonly page: AdPage | null
  readonly theme: AdTheme
  readonly lang: Lang
  /** The menu button every page has in its top corner (the page keeps the corner free for it). */
  readonly menu?: ReactNode
  /** The page fills what it is given; the pager says how big that is. */
  readonly style?: StyleProp<ViewStyle>
}

/**
 * The page of a full-page ad: the menu button in the corner as on every page, the ad's card in the middle, and under it a quiet hint of
 * how to move on. The hint is text only: nothing of ours that can be pressed stands near the ad.
 */
export function NativeAdPage({ page, theme, lang, menu, style }: NativeAdPageProps) {
  return (
    <View testID="ad-page" style={[styles.page, { backgroundColor: theme.bg }, style]}>
      <View style={styles.host}>
        {usable(page) ? (
          <CardBoundary key={keyOf(page)}>
            <AdCard page={page} theme={theme} lang={lang} />
          </CardBoundary>
        ) : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hint}>
        <Text style={[styles.arrow, { color: theme.textSecondary }]}>{'\u2191'}</Text>
        <Text style={[styles.hintText, { color: theme.textSecondary }]}>{translate(lang, 'ad_next_hint')}</Text>
      </View>
      {menu ? <View style={styles.menu}>{menu}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  host: { flex: 1, marginTop: PAGE_TOP_DP, marginBottom: PAGE_BOTTOM_DP, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', maxHeight: '100%' },
  column: { padding: CARD_PADDING_DP, flexShrink: 1 },
  label: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, overflow: 'hidden', fontSize: 11, fontWeight: '500', letterSpacing: 0.66 },
  media: { marginTop: 12, minHeight: MIN_MEDIA_DP, flexGrow: 0, flexShrink: 1, borderRadius: 14, overflow: 'hidden' },
  mediaView: { width: '100%', height: '100%' },
  info: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  icon: { width: 44, height: 44, borderRadius: 10, marginRight: 12 },
  words: { flex: 1 },
  headline: { fontFamily: 'serif', fontSize: 19, lineHeight: 22, fontWeight: '700' },
  advertiser: { fontSize: 12, paddingTop: 2 },
  body: { marginTop: 8, fontSize: 15, lineHeight: 20, opacity: 0.88 },
  action: { marginTop: 16, minHeight: 52, borderRadius: 16, overflow: 'hidden', paddingHorizontal: 28, textAlign: 'center', textAlignVertical: 'center', fontSize: 15, fontWeight: '500' },
  hint: { position: 'absolute', bottom: 22, alignSelf: 'center', flexDirection: 'row', alignItems: 'center' },
  arrow: { fontSize: 16, opacity: 0.8 },
  hintText: { fontSize: 12, paddingLeft: 6 },
  menu: { position: 'absolute', top: 4, left: 12, width: MENU_TOUCH_DP, height: MENU_TOUCH_DP },
})
