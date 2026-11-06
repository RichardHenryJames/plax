import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Txt } from '../primitives'
import { useTheme } from '../theme'

/** A diagonal blend from the soft accent to the quiet surface: what stands behind a poster (the native app's top-left to bottom-right gradient). */
export function PosterBackground({ radius }: { radius: number }) {
  const { palette } = useTheme()
  const id = useMemo(() => `poster-${Math.random().toString(36).slice(2, 8)}`, [])
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.accentSoft} />
          <Stop offset="1" stopColor={palette.surfaceAlt} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  )
}

/**
 * What stands in for the picture of a story that has none: the name of Plax, set like a masthead, a short rule and the story's section
 * under that, small (as on the website: src/lib/poster.ts). The page sets the size of the whole from the size of its tile; the section is
 * a third of the name's size.
 */
export function Poster({ name, section, size }: { name: string; section: string; size: number }) {
  const { palette } = useTheme()
  const masthead = name.replace(/\s+/g, ' ').trim()
  return (
    <View testID="poster" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }]} accessible={false} importantForAccessibility="no-hide-descendants">
      {masthead !== '' ? (
        <Txt font="serifBold" allowFontScaling={false} numberOfLines={1} size={size} style={{ lineHeight: size * 1.12, textAlign: 'center' }}>
          {masthead}
        </Txt>
      ) : null}
      <View style={{ width: 40, height: 2, borderRadius: 1, backgroundColor: palette.accent, opacity: 0.7, marginVertical: size * 0.25 }} />
      <Txt allowFontScaling={false} numberOfLines={1} size={Math.max(8, size * 0.32)} color="accentText" style={{ letterSpacing: 0.6, textAlign: 'center' }}>
        {section}
      </Txt>
    </View>
  )
}
