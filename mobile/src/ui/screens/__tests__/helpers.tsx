import type { ReactNode } from 'react'
import { AccessibilityInfo, BackHandler, Dimensions, StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { SafeAreaProvider, type EdgeInsets } from 'react-native-safe-area-context'
import type { Lang } from '../../../i18n'
import { LanguageProvider } from '../../i18n-context'
import { ThemeProvider } from '../../theme'

export interface Options {
  mode?: 'light' | 'dark'
  lang?: Lang
  /** The phone's insets (the status bar and the navigation bar); none by default, as in the tests of the kit. */
  insets?: Partial<EdgeInsets>
}

/** A screen as the reader has it: in a theme and a language, and between system bars when there are some. */
export function wrap(node: ReactNode, { mode = 'light', lang = 'en', insets }: Options = {}) {
  const content = (
    <ThemeProvider mode={mode}>
      <LanguageProvider lang={lang}>{node}</LanguageProvider>
    </ThemeProvider>
  )
  if (!insets) return content
  const full: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0, ...insets }
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: full }}>
      {content}
    </SafeAreaProvider>
  )
}

export const show = (node: ReactNode, options?: Options) => render(wrap(node, options))

/** The window the screens are drawn in (the tests' own is 750 by 1334 dp). */
export function setWindow(width: number, height: number): void {
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 }, screen: { width, height, scale: 2, fontScale: 1 } })
}

export const resetWindow = (): void => setWindow(750, 1334)

/** Turns the pulse of the placeholders off, as a phone set to reduce motion does: the tests then have no animation left running. */
export function quietMotion(): void {
  ;(AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockImplementation(() => Promise.resolve(true))
}

/**
 * The phone's back button, for a test: it takes the place of the real one (which only a device has) and `press()` presses it. The most
 * recently opened overlay answers first, as on the phone; `press()` says whether anything took the press. Call `restore()` afterwards.
 */
export function backButton() {
  const handlers: (() => boolean | null | undefined)[] = []
  const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler)
    return {
      remove: () => {
        const index = handlers.indexOf(handler)
        if (index >= 0) handlers.splice(index, 1)
      },
    }
  })
  return {
    press: (): boolean => handlers.length > 0 && handlers[handlers.length - 1]() === true,
    listening: (): number => handlers.length,
    restore: (): void => spy.mockRestore(),
  }
}

/** A Hindi text far longer than a screen is wide, with the marks that sit above and below the line. */
export const LONG_HINDI =
  'यह एक बहुत लंबा हिन्दी वाक्य है जो कई पंक्तियों में फैलता है, ताकि यह देखा जा सके कि बड़ी मात्राएँ, संयुक्ताक्षर और ऊपर-नीचे की मात्राएँ कटे बिना दिखती हैं। ' +
  'अंतर्राष्ट्रीय प्रतिक्रियाओं, सर्वोच्च न्यायालय के निर्णयों और वैज्ञानिक अनुसंधानों के बारे में पूरी ख़बर यहाँ पढ़ें।'

interface TreeNode {
  type: string
  props: Record<string, unknown>
  children: (TreeNode | string)[] | null
}

function nodes(): TreeNode[] {
  const json = screen.toJSON() as unknown
  return (Array.isArray(json) ? json : json === null ? [] : [json]) as TreeNode[]
}

const flat = (style: unknown): Record<string, unknown> => (StyleSheet.flatten(style as never) as Record<string, unknown> | undefined) ?? {}

const contentOf = (node: TreeNode | string): string => (typeof node === 'string' ? node : (node.children ?? []).map(contentOf).join(''))

function visit(callback: (node: TreeNode, trail: TreeNode[]) => void): void {
  const walk = (node: TreeNode | string, trail: TreeNode[]) => {
    if (typeof node === 'string') return
    callback(node, trail)
    for (const child of node.children ?? []) walk(child, [...trail, node])
  }
  for (const root of nodes()) walk(root, [])
}

/**
 * The places where text is given a height of its own: a text with a `height` or a `maxHeight`, or a view with a fixed `height` of more
 * than `limit` dp around a text. Hindi lines are taller than English ones and the phone's text size can be anything, so a box that
 * holds text must grow with it (`minHeight` does). A few boxes are fixed on purpose (the 24 dp badge of a digit, the kit's 36 dp
 * chip); what is not named in `allow` (by testID) and is at most `limit` dp tall is left alone.
 */
export function fixedHeightOffenders(allow: readonly string[] = [], limit = 40): string[] {
  const found = new Set<string>()
  visit((node, trail) => {
    if (node.type !== 'Text') return
    const own = flat(node.props.style)
    if (own.height !== undefined || own.maxHeight !== undefined) found.add(`a text has a fixed height: "${contentOf(node)}"`)
    for (const ancestor of trail) {
      const height = flat(ancestor.props.style).height
      const id = typeof ancestor.props.testID === 'string' ? ancestor.props.testID : ''
      if (typeof height === 'number' && height > limit && !allow.includes(id)) found.add(`"${contentOf(node)}" is inside a view (${id || 'no testID'}) that is ${height} dp tall`)
    }
  })
  return [...found]
}

/** The texts that are cut at a number of lines (`numberOfLines`), with the number. */
export function limitedLines(): { text: string; lines: number }[] {
  const found: { text: string; lines: number }[] = []
  visit((node) => {
    if (node.type === 'Text' && typeof node.props.numberOfLines === 'number') found.push({ text: contentOf(node), lines: node.props.numberOfLines })
  })
  return found
}

/** What every text on the screen says, in order of the tree. */
export function allTexts(): string[] {
  const found: string[] = []
  visit((node, trail) => {
    // A text inside a text is part of the outer one.
    if (node.type === 'Text' && !trail.some((ancestor) => ancestor.type === 'Text')) found.push(contentOf(node))
  })
  return found
}

/** The flattened style of the first text with this content that has a size of its own (the outer text, when a span of it says the same). */
export function textStyleOf(content: string): Record<string, unknown> {
  let style: Record<string, unknown> | undefined
  visit((node) => {
    if (node.type !== 'Text' || style !== undefined || contentOf(node) !== content) return
    const own = flat(node.props.style)
    if (own.fontSize !== undefined) style = own
  })
  return style ?? {}
}

/** The line height of the first text with this content, as the screen sets it. */
export function lineHeightOf(content: string): number | undefined {
  let height: number | undefined
  visit((node) => {
    if (node.type === 'Text' && height === undefined && contentOf(node) === content) height = flat(node.props.style).lineHeight as number | undefined
  })
  return height
}

/** The flattened style of the element with this testID. */
export function styleOf(testID: string): Record<string, unknown> {
  let style: Record<string, unknown> = {}
  visit((node) => {
    if (node.props.testID === testID && Object.keys(style).length === 0) style = flat(node.props.style)
  })
  return style
}
