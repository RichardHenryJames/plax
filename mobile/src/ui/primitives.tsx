import { useEffect, useRef, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Pressable, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native'
import { Text } from 'react-native'
import { FONT, useTheme, type FontName, type Palette } from './theme'
import { Icon, type IconName } from './Icon'
import { useT } from './i18n-context'

/** A colour with some transparency, from a #RRGGBB colour. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const red = parseInt(value.slice(0, 2), 16)
  const green = parseInt(value.slice(2, 4), 16)
  const blue = parseInt(value.slice(4, 6), 16)
  return `rgba(${red},${green},${blue},${alpha})`
}

export interface TxtProps extends TextProps {
  /** In sp: it grows with the phone's text size, as the native app's did. */
  size?: number
  /** A name in the palette (text, text2, accent, accentText, onAccent, danger ...) or any colour. */
  color?: keyof Palette | (string & {})
  font?: FontName
}

/** Text in the app's fonts and colours. Devanagari marks sit above and below the line, so Hindi keeps the font's own padding. */
export function Txt({ size = 15, color = 'text', font = 'sans', style, ...rest }: TxtProps) {
  const { palette } = useTheme()
  const { lang } = useT()
  const resolved = (palette as unknown as Record<string, string>)[color] ?? color
  return <Text {...rest} style={[FONT[font], { fontSize: size, color: resolved, includeFontPadding: lang === 'hi' }, style as StyleProp<TextStyle>]} />
}

const ripple = (palette: Palette) => ({ color: withAlpha(palette.text, 0.133) })

interface ButtonBase {
  label: string
  onPress: () => void
  disabled?: boolean
  testID?: string
}

function TextButton({ label, onPress, disabled, testID, fill, textColor, outline }: ButtonBase & { fill: string; textColor: string; outline?: string }) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      android_ripple={ripple(palette)}
      style={{
        minHeight: 52,
        paddingHorizontal: 28,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill,
        borderWidth: outline ? 1 : 0,
        borderColor: outline,
        opacity: disabled ? 0.5 : 1,
        overflow: 'hidden',
      }}
    >
      <Txt font="sansMedium" size={15} color={textColor} style={{ textAlign: 'center' }}>
        {label}
      </Txt>
    </Pressable>
  )
}

/** The main button of a screen: the accent colour. */
export function PrimaryButton(props: ButtonBase) {
  const { palette } = useTheme()
  return <TextButton {...props} fill={palette.accent} textColor={palette.onAccent} />
}

/** A quieter button for a second choice beside the primary one. */
export function SecondaryButton(props: ButtonBase) {
  const { palette } = useTheme()
  return <TextButton {...props} fill={palette.accentSoft} textColor={palette.accentText} />
}

/** For something that cannot be undone: an outline in the warning colour, never the accent. */
export function DangerButton(props: ButtonBase) {
  const { palette } = useTheme()
  return <TextButton {...props} fill="transparent" textColor={palette.danger} outline={palette.danger} />
}

/** A 48 dp touch target with a 24 dp glyph, in a round fill. */
export function IconButton({ icon, label, onPress, fill, tint, testID }: { icon: IconName; label: string; onPress: () => void; fill?: string; tint?: string; testID?: string }) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      android_ripple={ripple(palette)}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: fill ?? 'transparent', overflow: 'hidden' }}
    >
      <Icon name={icon} size={24} color={tint ?? palette.text} />
    </Pressable>
  )
}

export const LINE_BUTTON = { width: 44, height: 48, circle: 36, glyph: 20 } as const

/**
 * A button for the end of a story's source line: a 36 dp circle with a 20 dp glyph, in a 44 by 48 dp touch target, so that three of
 * them fit beside the tag and the source on a narrow phone.
 */
export function LineButton({ icon, label, onPress, fill, tint, testID, selected }: { icon: IconName; label: string; onPress: () => void; fill: string; tint: string; testID?: string; selected?: boolean }) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      testID={testID}
      android_ripple={{ color: withAlpha(palette.text, 0.133), borderless: true, radius: LINE_BUTTON.circle / 2 }}
      style={{ width: LINE_BUTTON.width, height: LINE_BUTTON.height, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: LINE_BUTTON.circle, height: LINE_BUTTON.circle, borderRadius: LINE_BUTTON.circle / 2, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={LINE_BUTTON.glyph} color={tint} />
      </View>
    </Pressable>
  )
}

/**
 * The menu button that floats over a story: a small circle of dark glass with a white glyph, readable over any picture and on either
 * theme. A 48 dp touch target with a 40 dp circle drawn in it.
 */
export function MenuButton({ onPress, testID = 'menu-button' }: { onPress: () => void; testID?: string }) {
  const { t } = useT()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('menu')}
      onPress={onPress}
      testID={testID}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
      android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 20 }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: 'rgba(12,12,16,0.55)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.16)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="menu" size={22} color="#FFFFFF" />
      </View>
    </Pressable>
  )
}

/** A selectable rounded label, 48 dp tall to touch but drawn 36 dp. */
export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      testID={testID}
      android_ripple={ripple(palette)}
      style={{ minHeight: 48, justifyContent: 'center' }}
    >
      <View style={{ height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', backgroundColor: selected ? palette.accent : palette.surfaceAlt }}>
        <Txt font="sansMedium" size={13} color={selected ? palette.onAccent : palette.text2}>
          {label}
        </Txt>
      </View>
    </Pressable>
  )
}

/** A pressable row or block with the app's ripple. */
export function Touchable({ children, style, ...rest }: PressableProps & { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme()
  return (
    <Pressable android_ripple={ripple(palette)} style={style} {...rest}>
      {children}
    </Pressable>
  )
}

/** A thin rule between two groups. */
export function Divider() {
  const { palette } = useTheme()
  return <View style={{ height: 1, backgroundColor: palette.border }} />
}

/** A block that pulses (unless the reader has turned animations off): the placeholder of something on its way. */
export function Pulse({ style }: { style: StyleProp<ViewStyle> }) {
  const { palette } = useTheme()
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.45, duration: 850, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 850, useNativeDriver: true }),
        ]),
      )
      loop.start()
    })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [opacity])
  return <Animated.View style={[{ backgroundColor: palette.skeleton, opacity }, style]} />
}

/** Placeholder blocks shaped like a story card, shown while the first page is on its way. */
export function SkeletonCard({ compact = false }: { compact?: boolean }) {
  const block = (key: string, width: number | `${number}%`, height: number, top: number, radius: number) => (
    <Pulse key={key} style={{ width, height, marginTop: top, borderRadius: radius }} />
  )
  return (
    <View testID="skeleton" style={{ paddingHorizontal: 16, paddingVertical: 8 }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Pulse style={{ height: compact ? 150 : 210, borderRadius: 24 }} />
      {block('tag', 150, 14, 16, 7)}
      {(['100%', '100%', 240] as const).map((width, index) => block(`head${index}`, width, 22, 12, 8))}
      {(['100%', '100%', '100%', '100%', 180] as const).map((width, index) => block(`body${index}`, width, 14, 10, 7))}
    </View>
  )
}
