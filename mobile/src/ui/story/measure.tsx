import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, View, type TextStyle, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native'
import { FONT } from '../theme'
import type { MeasuredLine } from './layout'
import { HEADLINE_SCALES, TITLE_LINE_HEIGHT, BODY_LINE_HEIGHT } from './layout'

/** The text styles of the headline and the summary: the visible texts and the hidden ones that measure them have to be set alike. */
export function titleTextStyle(titleSp: number, scale: number, includePadding: boolean): TextStyle {
  return { ...FONT.serifBold, fontSize: titleSp * scale, lineHeight: Math.round(titleSp * scale * TITLE_LINE_HEIGHT), includeFontPadding: includePadding }
}

export function bodyTextStyle(bodySp: number, includePadding: boolean): TextStyle {
  return { ...FONT.sans, fontSize: bodySp, lineHeight: Math.round(bodySp * BODY_LINE_HEIGHT), includeFontPadding: includePadding }
}

/** The settings that make a text break its lines the same way each time it is measured and shown (greedy breaks, no hyphens). */
export const BREAKING = { textBreakStrategy: 'simple', android_hyphenationFrequency: 'none' } as const

export interface Measured {
  /** How many lines the headline takes at each of HEADLINE_SCALES. */
  readonly titleLinesAt: readonly number[]
  /** How the phone broke the whole summary, and how wide an ellipsis is in its font. */
  readonly bodyLines: readonly MeasuredLine[]
  readonly ellipsisWidth: number
}

const CACHE = new Map<string, Measured>()
const CACHE_LIMIT = 400

export const measuredFor = (key: string): Measured | undefined => CACHE.get(key)

/** Forgets what was measured (the phone's text size or its fonts changed, or a test starts over). */
export function forgetMeasures(): void {
  CACHE.clear()
}

function remember(key: string, measured: Measured): void {
  if (CACHE.size >= CACHE_LIMIT) CACHE.delete(CACHE.keys().next().value as string)
  CACHE.set(key, measured)
}

const reduce = (event: NativeSyntheticEvent<TextLayoutEventData>): MeasuredLine[] => event.nativeEvent.lines.map((line) => ({ text: line.text, width: line.width }))

/**
 * Measures a story's texts at the width of its column, without showing them: the headline at each of its sizes, and the whole summary.
 * The phone tells how its text broke only after it has laid it out, so the answer comes a moment after the page is made; it is kept, per
 * story and size of page, so that a page made again (a list gives its pages back and takes them again) does not measure twice.
 */
export function useMeasured(options: { key: string; columnWidth: number; title: string; body: string; titleSp: number; bodySp: number; includePadding: boolean }): { measured: Measured | undefined; measurers: React.ReactElement | null } {
  const { key, columnWidth, title, body, titleSp, bodySp, includePadding } = options
  const [measured, setMeasured] = useState<Measured | undefined>(() => CACHE.get(key))
  const parts = useRef<{ key: string; title: (number | undefined)[]; body?: MeasuredLine[]; ellipsis?: number }>({ key, title: [] })
  if (parts.current.key !== key) parts.current = { key, title: [] }

  // A new key (another story, another size of page) starts from what is remembered for it, or from nothing.
  useEffect(() => {
    setMeasured(CACHE.get(key))
  }, [key])

  const finish = useCallback(() => {
    const current = parts.current
    const titleDone = title === '' || HEADLINE_SCALES.every((_, index) => current.title[index] !== undefined)
    const bodyDone = body === '' || current.body !== undefined
    if (!titleDone || !bodyDone || current.ellipsis === undefined) return
    const result: Measured = {
      titleLinesAt: HEADLINE_SCALES.map((_, index) => current.title[index] ?? 1),
      bodyLines: current.body ?? [],
      ellipsisWidth: current.ellipsis,
    }
    remember(key, result)
    setMeasured(result)
  }, [key, title, body])

  if (measured || columnWidth <= 0) return { measured, measurers: null }

  const measurers = (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0, width: columnWidth, opacity: 0 }}>
      {title !== ''
        ? HEADLINE_SCALES.map((scale, index) => (
            <Text
              key={scale}
              {...BREAKING}
              style={titleTextStyle(titleSp, scale, includePadding)}
              onTextLayout={(event) => {
                parts.current.title[index] = event.nativeEvent.lines.length
                finish()
              }}
            >
              {title}
            </Text>
          ))
        : null}
      {body !== '' ? (
        <Text
          {...BREAKING}
          style={bodyTextStyle(bodySp, includePadding)}
          onTextLayout={(event) => {
            parts.current.body = reduce(event)
            finish()
          }}
        >
          {body}
        </Text>
      ) : null}
      <Text
        {...BREAKING}
        numberOfLines={1}
        style={[bodyTextStyle(bodySp, includePadding), { alignSelf: 'flex-start' }]}
        onTextLayout={(event) => {
          parts.current.ellipsis = event.nativeEvent.lines[0]?.width ?? bodySp
          finish()
        }}
      >
        {'\u2026'}
      </Text>
    </View>
  )
  return { measured, measurers }
}
