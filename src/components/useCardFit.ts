'use client'

import { useLayoutEffect, type RefObject } from 'react'
import { planFit, MIN_BODY_LINES } from '@/lib/card-fit'

// Fits one story card into its box, as the Android app's StoryPage does: nothing on a card scrolls, so a single swipe
// always moves to the next story, and for that the picture, the tag and source line, the headline, the summary and the
// row at the bottom share the box's height. The arithmetic is lib/card-fit; this measures the text and applies the plan.
//
// The box holds up to five parts, found by their data-fit attribute: hero (the picture), meta (tag and source line), title
// (the headline), body (the summary) and actions (the row pinned under the summary). Each part carries the space above it
// as padding, so the plan can count it. Only inline styles are set, so React's own rendering is left alone.
//
// The box's data-hero says whether a picture is drawn ("on") or not ("off"). The menu button floats over the picture; with
// none, the source line is the first thing on the card and makes room at its start for the button (see globals.css), so the
// line is measured both ways. --sheet-room is how much room the sheets of Go deeper and the like have above their row.

/** A headline needing more lines than this at its usual size is set smaller; at the smallest size it may take one more. */
const HEADLINE_LINES = 4
const LONG_HEADLINE_LINES = 5
const HEADLINE_SCALES = [1, 0.9, 0.8]
/** The summary is always set at its own size, so that stories look alike; a longer one is cut at a whole line instead. */
const BODY_SCALES = [1]
/** The picture takes what the text leaves: at most a square and 55% of the box in the usual case, and up to 1.2 times its width and
 * 62% of the box when there is little to read, so that the card is full. */
const HERO_MAX_WIDTH = 1
const HERO_MAX_HEIGHT = 0.55
const HERO_TALL_WIDTH = 1.2
const HERO_TALL_HEIGHT = 0.62
/** A photograph is given at least 60% of the width and 30% of the box before the summary is cut instead (as in Inshorts, a story
 * with a picture has one, and not a stamp of one); a poster, which only stands in for a picture, a third of that, and is dropped
 * when the text needs the room. */
const PHOTO_MIN_WIDTH = 0.6
const PHOTO_MIN_HEIGHT = 0.3
const POSTER_MIN_WIDTH = 0.3
const POSTER_MIN_HEIGHT = 0.25
/** A picture shorter than this, in px, is never worth showing. */
const HERO_FLOOR = 96

const px = (value: string) => {
  const number = parseFloat(value)
  return Number.isFinite(number) ? number : 0
}

/** The height of one line of this element's text; a font with a "normal" line height is taken as 1.3 times its size. */
function lineHeightOf(element: HTMLElement) {
  const style = getComputedStyle(element)
  const height = px(style.lineHeight)
  return height > 0 ? height : px(style.fontSize) * 1.3
}

/** Takes off whatever an earlier fit set, so the element can be measured as it naturally is. */
function release(element: HTMLElement | null, ...properties: string[]) {
  if (!element) return
  for (const property of properties) element.style.removeProperty(property)
}

const CUT = ['display', '-webkit-box-orient', '-webkit-line-clamp', 'overflow', 'max-height']

/** Shows this many lines of the text and ends in an ellipsis, or all of it (untouched) when the lines are enough. */
function limit(element: HTMLElement, lines: number, natural: number, line: number, top: number) {
  release(element, ...CUT)
  if (lines >= natural) return
  element.style.display = '-webkit-box'
  element.style.setProperty('-webkit-box-orient', 'vertical')
  element.style.setProperty('-webkit-line-clamp', String(lines))
  element.style.overflow = 'hidden'
  // Cuts at a whole line even where the clamp cannot reach (blocks inside the text).
  element.style.maxHeight = `${top + lines * line}px`
}

function part(box: HTMLElement, name: string) {
  return box.querySelector<HTMLElement>(`[data-fit="${name}"]`)
}

/**
 * How far down the box its content reaches, from where the parts are laid out. Not scrollHeight: that counts a part as the
 * transform of its entrance animation (a slide of some pixels) leaves it, and would call the card too tall while it fades in.
 */
function contentBottom(box: HTMLElement) {
  let bottom = 0
  for (const child of Array.from(box.children) as HTMLElement[]) bottom = Math.max(bottom, child.offsetTop + child.offsetHeight)
  return bottom
}

export function fitCard(box: HTMLElement) {
  const hero = part(box, 'hero')
  const meta = part(box, 'meta')
  const title = part(box, 'title')
  const body = part(box, 'body')
  const actions = part(box, 'actions')

  // Back to the natural state, to measure.
  release(hero, 'height', 'display', '--hero-h')
  release(meta, 'display')
  release(actions, 'display')
  release(title, 'font-size', ...CUT)
  release(body, 'font-size', ...CUT)
  box.dataset.hero = hero ? 'on' : 'off'
  const height = box.clientHeight
  const width = box.clientWidth
  if (height <= 0 || width <= 0) return

  // The headline is the most important text on the card, so it is set smaller before it is ever cut.
  let titleNatural = 0
  let titleMax = 0
  let titleLine = 0
  let titleTop = 0
  if (title) {
    titleTop = px(getComputedStyle(title).paddingTop)
    const base = px(getComputedStyle(title).fontSize)
    for (const scale of HEADLINE_SCALES) {
      title.style.fontSize = `${base * scale}px`
      titleLine = lineHeightOf(title)
      titleNatural = Math.max(1, Math.round((title.offsetHeight - titleTop) / titleLine))
      if (titleNatural <= HEADLINE_LINES) break
    }
    titleMax = titleNatural <= HEADLINE_LINES ? titleNatural : LONG_HEADLINE_LINES
  }

  // The summary is measured at each size it may be set at, below: see the loop that asks the plan.
  const bodyBase = body ? px(getComputedStyle(body).fontSize) : 0

  // The source line, measured with a picture above it and without one: with none it is the first thing on the card, and the
  // menu button stands at its start.
  let metaWith = 0
  let metaBare = 0
  if (meta) {
    box.dataset.hero = 'off'
    metaBare = meta.offsetHeight
    box.dataset.hero = hero ? 'on' : 'off'
    metaWith = hero ? meta.offsetHeight : metaBare
  }
  let actionsHeight = actions ? actions.offsetHeight : 0
  // A box too short for the source line, one line of the headline and the row under the summary gives up that row. The source
  // line stays: Listen, Save and Share stand on it.
  if (title) {
    const least = titleTop + titleLine
    if (actions && metaBare + actionsHeight + least > height) {
      actions.style.display = 'none'
      actionsHeight = 0
    }
  }

  const heroMaximum = hero ? Math.min(width * HERO_MAX_WIDTH, height * HERO_MAX_HEIGHT) : 0
  const heroTall = hero ? Math.max(heroMaximum, Math.min(width * HERO_TALL_WIDTH, height * HERO_TALL_HEIGHT)) : 0
  const poster = !!hero && hero.classList.contains('poster-tile')
  const heroMinimum = Math.max(
    HERO_FLOOR,
    poster ? Math.min(width * POSTER_MIN_WIDTH, height * POSTER_MIN_HEIGHT) : Math.min(width * PHOTO_MIN_WIDTH, height * PHOTO_MIN_HEIGHT),
  )

  // The summary is measured at its own size; the plan cuts it to the lines that fit beside the picture's minimum.
  let bodyNatural = 0
  let bodyLine = 0
  let bodyTop = 0
  const planNow = () =>
    planFit({ height, meta: metaWith, metaBare, actions: actionsHeight, titleTop, titleLine, titleNatural, titleMax, bodyTop, bodyLine, bodyNatural, heroMaximum, heroMinimum, heroTall, heroKept: !poster })
  let plan = planNow()
  if (body) {
    for (const scale of BODY_SCALES) {
      body.style.fontSize = `${bodyBase * scale}px`
      bodyTop = px(getComputedStyle(body).paddingTop)
      bodyLine = lineHeightOf(body.querySelector<HTMLElement>('p, blockquote') ?? body)
      bodyNatural = Math.max(1, Math.round((body.offsetHeight - bodyTop) / bodyLine))
      plan = planNow()
      if (plan.bodyLines >= bodyNatural) break
    }
  }

  let heroHeight = plan.hero
  let titleLines = plan.titleLines
  let bodyLines = plan.bodyLines
  const apply = () => {
    box.dataset.hero = heroHeight > 0 ? 'on' : 'off'
    if (hero) {
      if (heroHeight > 0) {
        hero.style.height = `${heroHeight}px`
        // A poster's emoji is sized from it.
        hero.style.setProperty('--hero-h', `${heroHeight}px`)
      } else hero.style.display = 'none'
    }
    if (title) limit(title, titleLines, titleNatural, titleLine, titleTop)
    if (body) {
      if (bodyLines > 0) limit(body, bodyLines, bodyNatural, bodyLine, bodyTop)
      else body.style.display = 'none'
    }
  }
  apply()

  // Margins, rounding or a font the arithmetic did not know about: take back what is over. The picture gives first, down to its
  // minimum; then the summary, a line at a time down to three lines; only then does the picture go, and then the rest of the
  // summary and the headline's lines.
  for (let attempt = 0; attempt < 8; attempt++) {
    const over = contentBottom(box) - box.clientHeight
    if (over <= 1) break
    if (hero && heroHeight > heroMinimum) heroHeight = Math.max(heroMinimum, heroHeight - over)
    else if (hero && poster && heroHeight > 0) heroHeight = 0 // a poster only stands in for a picture: it goes before any text is cut
    else if (body && bodyLines > Math.min(bodyNatural, MIN_BODY_LINES)) bodyLines--
    else if (hero && heroHeight > 0) heroHeight = 0
    else if (body && bodyLines > 0) bodyLines--
    else if (title && titleLines > 1) titleLines--
    else break
    release(hero, 'height', 'display', '--hero-h')
    apply()
  }

  // How much room a sheet (Go deeper and the like) has above the row it opens from, so that it never reaches past the card.
  const rowShown = !!actions && actions.style.display !== 'none'
  box.style.setProperty('--sheet-room', `${Math.max(0, rowShown ? actions.offsetTop : box.clientHeight)}px`)
}

/**
 * Fits the card in the box now, and again whenever the box changes size or the web fonts arrive (the lines of text change
 * with them). `deps` are what the card shows: when any of them changes the text is different, so it is fitted again.
 */
export function useCardFit(box: RefObject<HTMLElement | null>, deps: readonly unknown[]) {
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    let frame = 0
    const fitAgain = () => {
      frame = 0
      fitCard(element)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fitAgain)
    }
    fitCard(element)
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    void fonts?.ready.then(schedule)
    fonts?.addEventListener?.('loadingdone', schedule)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      fonts?.removeEventListener?.('loadingdone', schedule)
    }
    // The caller lists what the card shows; the box is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
