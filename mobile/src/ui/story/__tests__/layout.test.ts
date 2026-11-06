import { ELLIPSIS } from '@shared/text-fit'
import {
  BOTTOM, DEFAULT_LAYOUT_CONFIG, HEADLINE_SCALES, LONG_HEADLINE_LINES, MENU_TOUCH, TOP, ageParts, bodyCutter, bodyLineHeight, computeStoryLayout, isRoomy, lineStarts, pageGeometry,
  titleLineHeight, typeSizes, type Box, type LayoutInput, type MeasuredLine,
} from '../layout'

// A phone in which every character is 8 dp wide, so that how a text breaks into lines can be worked out here.
const CHAR = 8

function breakIntoLines(text: string, charsPerLine: number): MeasuredLine[] {
  const lines: MeasuredLine[] = []
  let current = ''
  for (const word of text.trim().split(/\s+/)) {
    if (current === '') current = word
    else if (current.length + 1 + word.length <= charsPerLine) current += ` ${word}`
    else {
      lines.push({ text: `${current} `, width: current.length * CHAR })
      current = word
    }
  }
  if (current !== '') lines.push({ text: current, width: current.length * CHAR })
  return lines
}

const WORDS = ['the', 'court', 'said', 'Justices', 'Bagchi', 'and', 'Vishwanath', 'markets', 'rally', 'as', 'inflation', 'cools', 'of', 'a', 'Dr.', 'Rao', 'in', '2025', 'report', 'says', 'prices', 'rose', 'by', '3.5', 'percent', 'across', 'India']
function sentence(seed: number, words: number): string {
  const out: string[] = []
  for (let i = 0; i < words; i++) out.push(WORDS[(seed * 7 + i * 13 + (i % 3) * 5) % WORDS.length])
  const text = out.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1) + '.'
}
const paragraph = (seed: number, sentences: number) => Array.from({ length: sentences }, (_, i) => sentence(seed + i, 6 + ((seed + i) % 9))).join(' ')

describe('the cut of a summary', () => {
  it('is the whole text when it fits', () => {
    const text = paragraph(1, 2)
    const lines = breakIntoLines(text, 40)
    expect(bodyCutter(text, lines, 40 * CHAR, CHAR)(lines.length)).toBe(text)
    expect(bodyCutter(text, lines, 40 * CHAR, CHAR)(lines.length + 3)).toBe(text)
  })

  it('never takes more lines than it was given, nor stops far short of them, and ends at a whole word', () => {
    let checked = 0
    for (let seed = 1; seed <= 40; seed++) {
      for (const chars of [18, 24, 31, 40, 55]) {
        const text = paragraph(seed, 6)
        const lines = breakIntoLines(text, chars)
        const cut = bodyCutter(text, lines, chars * CHAR, CHAR)
        for (let n = 1; n < lines.length && n <= 9; n++) {
          const shown = cut(n)
          const used = breakIntoLines(shown, chars).length
          expect({ seed, chars, n, used: used <= n }).toEqual({ seed, chars, n, used: true })
          if (n >= 3) expect(used).toBeGreaterThanOrEqual(n - 2)
          // A prefix of the text, with an ellipsis or at the end of a sentence, never through the middle of a word.
          const body = shown.endsWith(ELLIPSIS) ? shown.slice(0, -1) : shown
          expect(text.startsWith(body)).toBe(true)
          expect(/\s/.test(text.charAt(body.length)) || body.length === text.length || shown.endsWith(ELLIPSIS)).toBe(true)
          if (body.length < text.length) expect(text.charAt(body.length) === ' ' || shown.endsWith(ELLIPSIS)).toBe(true)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('stops at the end of a sentence when one is close to the end of the room', () => {
    const text = 'Prices rose by three percent last month. Economists had expected a smaller rise across the country, and the central bank may now act sooner than it said.'
    const lines = breakIntoLines(text, 30)
    const cut = bodyCutter(text, lines, 30 * CHAR, CHAR)
    expect(cut(2)).toBe('Prices rose by three percent last month.')
  })

  it('walks along the text to find where each line starts, whatever the phone dropped at a break', () => {
    const text = 'one two three four'
    expect(lineStarts(text, [{ text: 'one two ', width: 0 }, { text: 'three four', width: 0 }])).toEqual([0, 8])
    expect(lineStarts(text, [{ text: 'one two', width: 0 }, { text: 'three four', width: 0 }])).toEqual([0, 8])
    expect(lineStarts('a\nb', [{ text: 'a\n', width: 0 }, { text: 'b', width: 0 }])).toEqual([0, 2])
  })

  it('puts the ellipsis on the next line when it does not fit after the last word, and so cuts a word earlier', () => {
    // Every line is full to the last character, so there is no room for the ellipsis after a word that ends a line.
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh'
    const lines = breakIntoLines(text, 9)
    const shown = bodyCutter(text, lines, 9 * CHAR, CHAR)(2)
    expect(breakIntoLines(shown, 9).length).toBeLessThanOrEqual(2)
  })
})

function input(width: number, height: number, titleLength: number, bodyLength: number, overrides: Partial<LayoutInput> = {}): LayoutInput {
  const fontScale = overrides.fontScale ?? 1
  const { titleSp, bodySp } = typeSizes(height)
  const geometry = pageGeometry(width, height)
  const title = paragraph(3, 1).slice(0, titleLength).padEnd(titleLength, 'x')
  const titleLinesAt = HEADLINE_SCALES.map((scale) => breakIntoLines(title, Math.max(8, Math.floor(geometry.columnWidth / (titleSp * scale * 0.55 * fontScale)))).length)
  const body = paragraph(5, 40).slice(0, bodyLength)
  const bodyChars = Math.max(10, Math.floor(geometry.columnWidth / (bodySp * 0.5 * fontScale)))
  const lines = breakIntoLines(body, bodyChars)
  return {
    width, height, fontScale, titleSp, bodySp, hasTitle: titleLength > 0, hasBody: bodyLength > 0, posterShown: false,
    titleLinesAt, bodyLines: lines.length, bodyFull: body, cutBody: bodyCutter(body, lines, geometry.columnWidth, 10 * fontScale),
    config: DEFAULT_LAYOUT_CONFIG, ...overrides,
  }
}

const bottomOf = (box: Box) => box.top + box.height

describe('a story page', () => {
  it('has the same arithmetic as the native app for a 392 by 780 phone', () => {
    const layout = computeStoryLayout(input(392, 780, 60, 700))
    expect(layout.wide).toBe(false)
    expect(layout.pictureAbove).toBe(true)
    // The picture is at most 1.25 of the column's width and 60% of the page, and takes what the text leaves.
    expect(layout.hero.height).toBeGreaterThanOrEqual(Math.min(Math.floor(360 * 0.6), Math.floor(764 * 0.3)))
    expect(layout.hero.height).toBeLessThanOrEqual(Math.min(Math.floor(360 * 1.25), Math.floor(764 * 0.6)))
    expect(layout.meta.top).toBe(layout.hero.top + layout.hero.height + 16)
    expect(layout.title.top).toBe(layout.meta.top + layout.meta.height)
    expect(layout.body.top).toBe(layout.title.top + layout.title.height)
    expect(layout.menu).toMatchObject({ left: layout.hero.left + 8 - 4, top: layout.hero.top + 8 - 4, width: MENU_TOUCH, height: MENU_TOUCH })
  })

  it('shows all of a short summary, and cuts a long one at the end of its room', () => {
    const short = computeStoryLayout(input(392, 780, 50, 120))
    expect(short.bodyText).toBe(input(392, 780, 50, 120).bodyFull)
    const long = computeStoryLayout(input(392, 780, 50, 2400))
    expect(long.bodyLines).toBeGreaterThan(3)
    expect(long.bodyText.length).toBeLessThan(input(392, 780, 50, 2400).bodyFull.length)
  })

  it('keeps every part on the page, in order, without overlap, whatever the screen, text size and story', () => {
    let pages = 0
    for (const [width, height] of [[320, 500], [360, 640], [392, 780], [412, 850], [600, 1000], [800, 1200], [851, 340], [640, 300], [360, 300]]) {
      for (const fontScale of [0.85, 1, 1.3, 2]) {
        for (const [titleLength, bodyLength] of [[0, 0], [20, 0], [0, 300], [40, 160], [90, 700], [160, 1500], [220, 3000]]) {
          for (const posterShown of [false, true]) {
            const layout = computeStoryLayout(input(width, height, titleLength, bodyLength, { fontScale, posterShown }))
            const where = JSON.stringify({ width, height, fontScale, titleLength, bodyLength, posterShown })
            const limit = height - BOTTOM + 0.5
            expect([where, layout.bottom <= limit]).toEqual([where, true])
            for (const box of [layout.hero, layout.meta, layout.title, layout.body]) {
              expect([where, box.left >= -0.5 && box.left + box.width <= width + 0.5 && box.top >= TOP - 0.5 && bottomOf(box) <= limit]).toEqual([where, true])
            }
            if (layout.wide) {
              // On its side the picture stands beside the text.
              expect([where, layout.hero.left + layout.hero.width <= layout.meta.left]).toEqual([where, true])
            } else {
              if (layout.hero.height > 0) expect([where, bottomOf(layout.hero) <= layout.meta.top]).toEqual([where, true])
              expect([where, bottomOf(layout.meta) <= layout.title.top + 0.001]).toEqual([where, true])
              expect([where, bottomOf(layout.title) <= layout.body.top + 0.001]).toEqual([where, true])
            }
            // The headline gives up lines only to the most it may have (5 at the smallest size).
            expect(layout.titleLines).toBeLessThanOrEqual(LONG_HEADLINE_LINES)
            // A cut summary never has more lines than it was given room for.
            expect(layout.bodyLines).toBeGreaterThanOrEqual(0)
            if (layout.bodyLines > 0) expect([where, layout.body.height >= layout.bodyLines * layout.bodyLineHeight]).toEqual([where, true])
            pages++
          }
        }
      }
    }
    expect(pages).toBe(504)
  })

  it('never cuts a summary below its three lines on a normal phone while a picture is kept', () => {
    for (const [width, height] of [[360, 640], [392, 780], [412, 850]]) {
      const layout = computeStoryLayout(input(width, height, 80, 2500))
      if (layout.hero.height > 0) expect(layout.bodyLines).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps a photograph at its minimum on a normal phone, and drops a poster before it cuts the text', () => {
    const photo = computeStoryLayout(input(360, 640, 100, 2000, { fontScale: 1.3 }))
    expect(photo.hero.height).toBeGreaterThan(0)
    const poster = computeStoryLayout(input(360, 640, 100, 2000, { fontScale: 1.3, posterShown: true }))
    expect(poster.hero.height === 0 || poster.bodyLines === input(360, 640, 100, 2000, { fontScale: 1.3, posterShown: true }).bodyLines).toBe(true)
  })

  it('has the picture beside the text on a phone on its side', () => {
    const layout = computeStoryLayout(input(851, 340, 60, 500))
    expect(layout.wide).toBe(true)
    expect(layout.pictureAbove).toBe(false)
    expect(layout.hero.left + layout.hero.width).toBeLessThan(layout.title.left)
    expect(layout.menu.left).toBe(layout.hero.left + 8 - 4)
  })

  it('starts after the menu button when there is no picture above the source line', () => {
    const layout = computeStoryLayout(input(300, 300, 150, 2000))
    if (!layout.pictureAbove) {
      expect(layout.meta.left).toBe(layout.title.left + 48)
      expect(layout.menu.top).toBe(TOP - 4)
    }
  })

  it('sizes the poster\'s name with its tile, within 18 and 36 sp', () => {
    const layout = computeStoryLayout(input(392, 780, 60, 700, { posterShown: true }))
    expect(layout.posterSize).toBeGreaterThanOrEqual(18)
    expect(layout.posterSize).toBeLessThanOrEqual(36)
    expect(computeStoryLayout(input(392, 780, 60, 700, { posterShown: true, fontScale: 2 })).posterSize).toBeGreaterThanOrEqual(36)
  })

  it('follows the layout numbers the website sends', () => {
    const base = computeStoryLayout(input(392, 780, 60, 700))
    const small = computeStoryLayout(input(392, 780, 60, 700, { config: { heroMaxWidth: 1, heroMaxHeight: 0.4, photoMinWidth: 0.4, photoMinHeight: 0.2 } }))
    expect(small.hero.height).toBeLessThan(base.hero.height)
  })
})

describe('sizes and times', () => {
  it('sets the type a little smaller on a short screen', () => {
    expect(typeSizes(780)).toEqual({ titleSp: 24, bodySp: 16 })
    expect(typeSizes(699)).toEqual({ titleSp: 21, bodySp: 15 })
    expect(isRoomy(420)).toBe(true)
    expect(isRoomy(419)).toBe(false)
  })

  it('sets lines exactly, scaled by the phone\'s text size', () => {
    expect(titleLineHeight(24, 1, 1)).toBe(30)
    expect(bodyLineHeight(16, 1)).toBe(24)
    expect(bodyLineHeight(16, 1.5)).toBe(36)
    expect(titleLineHeight(24, 0.8, 1)).toBe(Math.round(24 * 0.8 * 1.25))
  })

  it('says how old a story is', () => {
    const now = 10_000_000_000
    expect(ageParts(0, now)).toEqual({ kind: 'none' })
    expect(ageParts(now + 5, now)).toEqual({ kind: 'none' })
    expect(ageParts(now - 30_000, now)).toEqual({ kind: 'now' })
    expect(ageParts(now - 5 * 60_000, now)).toEqual({ kind: 'minutes', value: 5 })
    expect(ageParts(now - 3 * 3_600_000 - 5, now)).toEqual({ kind: 'hours', value: 3 })
    expect(ageParts(now - 3 * 86_400_000, now).kind).toBe('date')
  })
})
