import { grownHero, planFit } from '@shared/card-fit'
import { ELLIPSIS, fitText } from '@shared/text-fit'

/**
 * How one story page spends its room: a port of StoryPage.onMeasure of the native app, with the same numbers, using the website's own
 * rules (planFit, grownHero and fitText of src/lib), so that the app and the website lay a story out alike. Pure arithmetic in dp: the
 * page measures its texts (how many lines the headline takes at each of its sizes, and how the summary breaks into lines), this works
 * out the rest.
 */

/** A headline needing more lines than this at its usual size is set smaller; at the smallest size it may take one more. */
export const HEADLINE_LINES = 4
export const LONG_HEADLINE_LINES = 5
export const HEADLINE_SCALES = [1, 0.9, 0.8] as const

export const TOP = 8
export const BOTTOM = 8
export const SIDE = 16
export const GUTTER = 16
export const TEXT_WIDTH = 640
export const WIDE_WIDTH = 840
export const HERO_FLOOR = 96
export const WIDE_AT = 480
export const POSTER_MIN_WIDTH = 0.3
export const POSTER_MIN_HEIGHT = 0.25
export const POSTER_MIN_SP = 18
export const POSTER_MAX_SP = 36
/** The space above the source line when a picture is above it. */
export const META_TOP = 16
/** The source line is 48 dp tall because of its buttons. */
export const META_HEIGHT = 48
/** The menu button: the circle drawn, the gap after it, how far inside the picture's corner it stands, and its touch target. */
export const MENU = 40
export const MENU_GAP = 8
export const MENU_INSET = 8
export const MENU_TOUCH = 48
/** The space above the headline and above the summary. */
export const TITLE_TOP = 12
export const BODY_TOP = 14
/** The line of each text is this many times its size (the native app's 1.18 and 1.38 spacing over the font's own line, set exactly). */
export const TITLE_LINE_HEIGHT = 1.25
export const BODY_LINE_HEIGHT = 1.5

/** The sizes of the headline and the summary, in sp: a little smaller on a short screen, so that more of the story fits in its one view. */
export function typeSizes(screenHeight: number): { titleSp: number; bodySp: number } {
  const compact = screenHeight < 700
  return { titleSp: compact ? 21 : 24, bodySp: compact ? 15 : 16 }
}

/** Wide enough to show the read time beside the buttons on the source line; narrower keeps the room for the source and its age. */
export const isRoomy = (width: number): boolean => width >= 420

export interface LayoutConfig {
  readonly heroMaxWidth: number
  readonly heroMaxHeight: number
  readonly photoMinWidth: number
  readonly photoMinHeight: number
}

/** What the app is built with; the website may set it anew (the settings file), within bounds. */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = { heroMaxWidth: 1.25, heroMaxHeight: 0.6, photoMinWidth: 0.6, photoMinHeight: 0.3 }

export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface PageGeometry {
  /** The room for everything, between the space above and below. */
  readonly boxHeight: number
  /** A page much wider than it is tall (a phone on its side) has the picture beside the text instead of above it. */
  readonly wide: boolean
  readonly left: number
  readonly boxWidth: number
  readonly sideWidth: number
  readonly columnLeft: number
  /** The width the headline and the summary are set in: what they are measured at. */
  readonly columnWidth: number
}

export function pageGeometry(width: number, height: number): PageGeometry {
  const boxHeight = Math.max(0, height - TOP - BOTTOM)
  const available = Math.max(0, width - 2 * SIDE)
  const wide = available >= WIDE_AT && Math.min(available, WIDE_WIDTH) >= boxHeight * 1.6
  const boxWidth = Math.min(available, wide ? WIDE_WIDTH : TEXT_WIDTH)
  const left = (width - boxWidth) / 2
  const sideWidth = wide ? Math.min(Math.floor(boxWidth * 0.42), Math.floor(boxHeight * 1.5)) : 0
  const columnLeft = wide ? left + sideWidth + GUTTER : left
  const columnWidth = wide ? boxWidth - sideWidth - GUTTER : boxWidth
  return { boxHeight, wide, left, boxWidth, sideWidth, columnLeft, columnWidth }
}

/** The height of one line of the headline at this size (a scale of HEADLINE_SCALES) and phone text size. */
export const titleLineHeight = (titleSp: number, scale: number, fontScale: number): number => Math.round(titleSp * scale * TITLE_LINE_HEIGHT) * fontScale
export const bodyLineHeight = (bodySp: number, fontScale: number): number => Math.round(bodySp * BODY_LINE_HEIGHT) * fontScale

export interface LayoutInput {
  /** The size of the page: the screen between the system bars, and above the strip of ads. */
  readonly width: number
  readonly height: number
  readonly fontScale: number
  readonly titleSp: number
  readonly bodySp: number
  readonly hasTitle: boolean
  readonly hasBody: boolean
  /** The poster stands in for the picture (the story has none, or it did not load). */
  readonly posterShown: boolean
  /** How many lines the headline takes at each of HEADLINE_SCALES, at the column's width. */
  readonly titleLinesAt: readonly number[]
  /** How many lines the whole summary takes at the column's width. */
  readonly bodyLines: number
  /** The whole summary, and a function that gives it cut to this many lines (the whole of it when it is not more). */
  readonly bodyFull: string
  readonly cutBody: (lines: number) => string
  readonly config: LayoutConfig
}

export interface StoryLayout {
  readonly wide: boolean
  /** A picture is drawn above the source line (not the one beside the text of a page on its side). */
  readonly pictureAbove: boolean
  readonly hero: Box
  readonly meta: Box
  readonly title: Box
  readonly body: Box
  readonly menu: Box
  readonly titleScale: number
  readonly titleLines: number
  readonly titleLineHeight: number
  readonly bodyLines: number
  readonly bodyText: string
  readonly bodyLineHeight: number
  /** The size of the poster's name, in dp, not scaled again by the phone's text size. */
  readonly posterSize: number
  /** Everything below the top of the page ends above this line. */
  readonly bottom: number
}

export function computeStoryLayout(input: LayoutInput): StoryLayout {
  const { fontScale, hasTitle, hasBody, posterShown, config } = input
  const g = pageGeometry(input.width, input.height)
  const { boxHeight, wide, columnWidth, columnLeft, left, sideWidth } = g
  const indent = MENU + MENU_GAP
  const metaTop = wide ? 0 : META_TOP
  const metaWith = metaTop + META_HEIGHT
  // With no picture above it the line is the first thing on the page, and starts after the menu button.
  const metaBare = wide ? META_HEIGHT : Math.max(MENU, META_HEIGHT)

  // The headline is the most important text on the page, so it is set smaller before it is ever cut.
  let scaleIndex = HEADLINE_SCALES.length - 1
  for (let index = 0; index < HEADLINE_SCALES.length; index++) {
    if ((input.titleLinesAt[index] ?? 1) <= HEADLINE_LINES) {
      scaleIndex = index
      break
    }
  }
  const titleScale = HEADLINE_SCALES[scaleIndex]
  const titleNatural = hasTitle ? Math.max(1, input.titleLinesAt[scaleIndex] ?? 1) : 0
  const titleMax = titleNatural <= HEADLINE_LINES ? titleNatural : LONG_HEADLINE_LINES
  const titleLine = hasTitle ? titleLineHeight(input.titleSp, titleScale, fontScale) : 0
  const bodyLine = hasBody ? bodyLineHeight(input.bodySp, fontScale) : 0

  const minWidth = posterShown ? POSTER_MIN_WIDTH : config.photoMinWidth
  const minHeight = posterShown ? POSTER_MIN_HEIGHT : config.photoMinHeight
  const heroMinimum = Math.max(HERO_FLOOR, Math.min(Math.floor(columnWidth * minWidth), Math.floor(boxHeight * minHeight)))
  const heroMaximum = wide ? 0 : Math.max(heroMinimum, Math.min(Math.floor(columnWidth * config.heroMaxWidth), Math.floor(boxHeight * config.heroMaxHeight)))

  const plan = planFit({
    height: boxHeight,
    meta: metaWith,
    metaBare,
    actions: 0,
    titleTop: hasTitle ? TITLE_TOP : 0,
    titleLine,
    titleNatural,
    titleMax,
    bodyTop: hasBody ? BODY_TOP : 0,
    bodyLine,
    bodyNatural: hasBody ? input.bodyLines : 0,
    heroMaximum,
    heroMinimum,
    heroKept: !posterShown,
  })

  // What the headline really takes decides what is left for the summary.
  let heroHeight = wide ? boxHeight : plan.hero
  const pictureAbove = !wide && heroHeight > 0
  const fixed = (pictureAbove ? metaWith : metaBare) + (wide ? 0 : heroHeight)
  let titleLines = hasTitle ? plan.titleLines : 0
  let titleHeight = hasTitle ? TITLE_TOP + titleLines * titleLine : 0
  while (hasTitle && fixed + titleHeight > boxHeight && titleLines > 1) {
    titleLines--
    titleHeight = TITLE_TOP + titleLines * titleLine
  }

  let bodyHeight = 0
  let bodyLines = 0
  let bodyText = ''
  if (hasBody) {
    // Whole lines only: the most that fit under what is already placed.
    const room = boxHeight - fixed - titleHeight - BODY_TOP
    let lines = 0
    while (lines < input.bodyLines && (lines + 1) * bodyLine <= room + 1e-6) lines++
    if (lines > 0) {
      bodyLines = lines
      bodyText = lines >= input.bodyLines ? input.bodyFull : input.cutBody(lines)
      bodyHeight = BODY_TOP + lines * bodyLine
    }
  }

  // The summary may end a line or two short of its room, and a short story leaves room too: the picture takes it, up to its most, so
  // that the page is full. The parts are never spread apart instead.
  if (pictureAbove) heroHeight = grownHero(heroHeight, boxHeight - (metaWith + heroHeight + titleHeight + bodyHeight), heroMaximum)

  const heroWidth = wide ? sideWidth : columnWidth
  let y = TOP
  let hero: Box
  let meta: Box
  if (wide) {
    hero = { left, top: TOP, width: heroWidth, height: heroHeight }
    meta = { left: columnLeft, top: y, width: columnWidth, height: metaBare }
    y += metaBare
  } else {
    hero = { left, top: y, width: heroWidth, height: heroHeight }
    y += heroHeight
    if (pictureAbove) {
      meta = { left: columnLeft, top: y + metaTop, width: columnWidth, height: metaWith - metaTop }
      y += metaWith
    } else {
      meta = { left: columnLeft + indent, top: y, width: columnWidth - indent, height: metaBare }
      y += metaBare
    }
  }
  const title: Box = { left: columnLeft, top: y, width: columnWidth, height: titleHeight }
  y += titleHeight
  const body: Box = { left: columnLeft, top: y, width: columnWidth, height: bodyHeight }
  y += bodyHeight

  // The button stands inside the picture's corner, or, with no picture, where the page begins.
  const pad = (MENU_TOUCH - MENU) / 2
  const inPicture = pictureAbove || wide
  const menu: Box = {
    left: inPicture ? hero.left + MENU_INSET - pad : columnLeft - pad,
    top: inPicture ? hero.top + MENU_INSET - pad : TOP - pad,
    width: MENU_TOUCH,
    height: MENU_TOUCH,
  }

  // The poster's name grows with its tile: a little under a sixth of it, not under 18 sp and not over 36 sp (the website's 1.25 to 2.75 rem).
  const heroSide = wide ? Math.min(heroWidth, heroHeight) : heroHeight
  const posterSize = Math.max(POSTER_MIN_SP * fontScale, Math.min(POSTER_MAX_SP * fontScale, heroSide * 0.16))

  return { wide, pictureAbove, hero, meta, title, body, menu, titleScale, titleLines, titleLineHeight: titleLine, bodyLines, bodyText, bodyLineHeight: bodyLine, posterSize, bottom: y }
}

/** One line of a text as the phone broke it (what onTextLayout reports), reduced to what the cut needs. */
export interface MeasuredLine {
  readonly text: string
  /** How wide the line is, in dp. */
  readonly width: number
}

/** The index in `full` at which each line starts, found by walking along the text, so that spaces the phone dropped at a break do not matter. */
export function lineStarts(full: string, lines: readonly MeasuredLine[]): number[] {
  const starts: number[] = []
  let cursor = 0
  for (const line of lines) {
    while (cursor < full.length && /\s/.test(full[cursor])) cursor++
    starts.push(cursor)
    cursor += line.text.replace(/\s+$/, '').length
  }
  return starts
}

/**
 * A function that gives the summary in n lines, from how the phone broke the whole of it: the end of a sentence close to the end of its
 * room, else the last word that fits and can end a text, with an ellipsis (fitText, which the website uses too). A prefix of a text
 * breaks the same way as the text does (greedy line breaking), so how many lines a cut takes is read from the whole's lines; whether the
 * ellipsis still fits on the last line is estimated from that line's width, and the page clips what is left over, never the middle of a word.
 */
export function bodyCutter(full: string, lines: readonly MeasuredLine[], columnWidth: number, ellipsisWidth: number): (lines: number) => string {
  const starts = lineStarts(full, lines)
  const lengths = lines.map((line) => line.text.replace(/\s+$/, '').length)

  function countLines(candidate: string): number {
    if (candidate === full) return lines.length
    const ends = candidate.endsWith(ELLIPSIS)
    const chars = ends ? candidate.length - 1 : candidate.length
    if (chars <= 0) return 1
    let index = 0
    for (let at = 0; at < starts.length; at++) {
      if (starts[at] <= chars - 1) index = at
      else break
    }
    let count = index + 1
    if (ends) {
      const inLine = Math.min(lengths[index] || 1, Math.max(1, chars - starts[index]))
      const partial = lines[index].width * (inLine / Math.max(1, lengths[index]))
      // A little more than the estimate, so that a close call goes to the safe side.
      if (partial * 1.02 + ellipsisWidth > columnWidth) count++
    }
    return count
  }

  return (count) => (count >= lines.length ? full : fitText(full, count, countLines))
}

export type AgeParts =
  | { kind: 'none' }
  | { kind: 'now' }
  | { kind: 'minutes'; value: number }
  | { kind: 'hours'; value: number }
  | { kind: 'date'; day: number; month: number }

/** The age of a story: "Just now", "5 min ago", "3 h ago", or the date from a day on. */
export function ageParts(publishedAt: number, now: number): AgeParts {
  const delta = now - publishedAt
  if (publishedAt <= 0 || delta < 0) return { kind: 'none' }
  if (delta < 60_000) return { kind: 'now' }
  if (delta < 3_600_000) return { kind: 'minutes', value: Math.floor(delta / 60_000) }
  if (delta < 86_400_000) return { kind: 'hours', value: Math.floor(delta / 3_600_000) }
  const date = new Date(publishedAt)
  return { kind: 'date', day: date.getDate(), month: date.getMonth() }
}
