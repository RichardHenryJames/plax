import { useCallback, useState, type ReactNode } from 'react'
import { ScrollView, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context'
import { Icon, type IconName } from '../Icon'
import { useT } from '../i18n-context'
import { Sheet } from '../overlays'
import { IconButton, MenuButton, Txt, type TxtProps } from '../primitives'
import { useTheme } from '../theme'

/** The four places of the app (the native app's FeedViewModel.Screen); the same words as the feed engine uses. */
export type FeedScreen = 'feed' | 'forYou' | 'topics' | 'saved'

export const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Draws what is inside it as if the screen had no system bars. Every screen of this folder pads itself by the phone's insets (so that
 * nothing sits under the status bar or the navigation bar); a shell that already pads its root, as MainActivity did, puts them in this.
 */
export function NoInsets({ children }: { children: ReactNode }) {
  return <SafeAreaInsetsContext.Provider value={NO_INSETS}>{children}</SafeAreaInsetsContext.Provider>
}

/**
 * The height of a line of text. The native app set `setLineSpacing(0, 1.3f)`, which makes a line 1.3 times the font's own line height
 * (about 1.17 times its size for the Latin font, and taller for Devanagari, whose marks sit above and below the line). React Native
 * wants the whole height, so the factor is applied to a natural height of the language; it grows with the phone's text size.
 */
export function useLeading(): (size: number, multiplier: number) => number {
  const { lang } = useT()
  return useCallback((size, multiplier) => Math.round(size * (lang === 'hi' ? 1.35 : 1.17) * multiplier), [lang])
}

/** Running text with the native app's line spacing (a multiplier of the font's line height). */
export function Paragraph({ size = 15, multiplier = 1.3, style, ...rest }: TxtProps & { multiplier?: number }) {
  const leading = useLeading()
  return <Txt size={size} {...rest} style={[{ lineHeight: leading(size, multiplier) }, style]} />
}

/** The menu button for a screen that is not a story (a story has its own): in the top-left corner, 12 dp in and 4 dp down, as MainActivity placed it. */
export function CornerMenu({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View testID="corner-menu" pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 4, left: insets.left + 12 }}>
      <MenuButton onPress={onPress} />
    </View>
  )
}

/**
 * A scrolling area that only takes touches when what is in it is taller than its room. A page of a pager that holds a short column
 * (the caught-up page) then never fights the pager for a swipe, and the same page still scrolls on a small phone set to a large text.
 */
export function FitScroll({ children, style, contentStyle, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; testID?: string }) {
  const [room, setRoom] = useState(0)
  const [content, setContent] = useState(0)
  return (
    <ScrollView
      testID={testID}
      style={style}
      contentContainerStyle={[{ flexGrow: 1 }, contentStyle]}
      scrollEnabled={content > room + 1}
      onLayout={(event) => setRoom(event.nativeEvent.layout.height)}
      onContentSizeChange={(_width, height) => setContent(height)}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
    >
      {children}
    </ScrollView>
  )
}

export interface SheetFrameProps {
  visible: boolean
  onClose: () => void
  icon: IconName
  title: string
  testID?: string
  /** What stands under the title bar and does not scroll (the language chips of Go deeper). */
  top?: ReactNode
  /** What stands under the scrolling part and does not scroll (the note of Go deeper, the count and the save button of the topics). */
  bottom?: ReactNode
  /** The share of the window's height the sheet takes (the topics take 0.86); by default it is as tall as what is in it, up to the kit's limit. */
  heightShare?: number
  /** Under the sheet's last part: 24 dp, as the account and contact sheets had it. */
  bottomPadding?: number
  /** The scrolling part. */
  children: ReactNode
}

/**
 * The sheet of the native app: an icon, a title and a round close button on a bar that stays put, a part that scrolls, and
 * (optionally) a part under it that stays put. The kit's Sheet draws the handle, the rounded top and the room for the navigation bar.
 */
export function SheetFrame({ visible, onClose, icon, title, testID, top, bottom, heightShare, bottomPadding = 24, children }: SheetFrameProps) {
  const { t } = useT()
  const { palette } = useTheme()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const fixed = heightShare === undefined ? undefined : Math.round(height * heightShare)
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t('close')} testID={testID}>
      <View
        testID={testID === undefined ? undefined : `${testID}-frame`}
        // The sides keep clear of a navigation bar that stands at the side of a phone on its side.
        style={{ flexShrink: 1, height: fixed, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right, paddingBottom: bottomPadding }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name={icon} size={20} color={palette.accentText} />
          <Txt font="sansMedium" size={18} accessibilityRole="header" style={{ flex: 1, paddingLeft: 8 }}>
            {title}
          </Txt>
          <IconButton icon="close" label={t('close')} onPress={onClose} fill={palette.surfaceAlt} tint={palette.text} testID="sheet-close" />
        </View>
        {top}
        <ScrollView style={fixed === undefined ? undefined : { flex: 1 }} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {bottom}
      </View>
    </Sheet>
  )
}

/** The height a dialog takes besides its scrolling body: the screen's margin, the dialog's padding, the title and the buttons. */
export const DIALOG_CHROME = 280

/**
 * The body of a dialog whose text can be long (About, a notice from the website, the warning before an account is deleted): it scrolls
 * inside the dialog, so that the buttons stay in reach on a short screen, in landscape and at a large text size.
 */
export function DialogScroll({ children, testID }: { children: ReactNode; testID?: string }) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // What the dialog needs besides its body: the screen's margin, the dialog's padding, a title of one or two lines and a row (or two) of buttons.
  const room = Math.max(120, height - insets.top - insets.bottom - DIALOG_CHROME)
  return (
    <ScrollView testID={testID} style={{ maxHeight: room }}>
      {children}
    </ScrollView>
  )
}
