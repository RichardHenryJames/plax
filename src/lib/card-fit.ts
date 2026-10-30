// How one story card spends its height. The card does not scroll, so that a single swipe always moves to the next story,
// which means everything on it has to fit: the source line, the headline and the row at the bottom always, then a few
// lines of the summary, and the picture takes what is left, up to a comfortable size. With too little room the picture
// goes first, then lines of the headline; the summary is cut to whole lines, never through the middle of one.
//
// Pure arithmetic in pixels, so it can be tested without a browser. A port of CardFit.java in the Android app
// (android/app/src/main/java/com/plaxlabs/news/CardFit.java), so both lay a story out alike; useCardFit measures the
// text and applies the plan.

/** The least of the summary worth showing before the picture is given up. */
export const MIN_BODY_LINES = 3
/** The headline is cut down to this many lines before the summary is dropped. */
export const MIN_TITLE_LINES = 2

/** What the card knows about itself. A headline or summary that is absent has zero natural lines. */
export interface FitInput {
  /** The room for everything. */
  height: number
  /** The tag and source line, with the space above it. */
  meta: number
  /** The row pinned under the summary (zero when there is none), with the space above it. */
  actions: number
  /** The space above the headline. */
  titleTop: number
  /** The height of one headline line. */
  titleLine: number
  /** The lines the headline needs at its width, uncut. */
  titleNatural: number
  /** The most lines the headline may take. */
  titleMax: number
  /** The space above the summary. */
  bodyTop: number
  /** The height of one summary line. */
  bodyLine: number
  /** The lines the summary needs at its width, uncut. */
  bodyNatural: number
  /** The picture's height when there is room; zero when the card has no picture. */
  heroPreferred: number
  /** The smallest picture worth showing. */
  heroMinimum: number
  /** The picture's height when there is nothing to read under the headline. */
  heroTall: number
}

/** What to draw: the picture's height (zero for none), and how many lines of the headline and the summary. */
export interface FitPlan {
  hero: number
  titleLines: number
  bodyLines: number
}

export function planFit(input: FitInput): FitPlan {
  let titleLines = Math.min(input.titleNatural, input.titleMax)
  for (;;) {
    const title = titleLines === 0 ? 0 : input.titleTop + titleLines * input.titleLine
    const room = input.height - input.actions - input.meta - title
    const plan = spend(input, room, titleLines)
    // A headline is worth more than a long summary, but not worth losing the summary altogether; and a headline that
    // does not fit on the card at all has to give up lines, summary or not.
    const readable = input.bodyNatural === 0 || plan.bodyLines >= Math.min(input.bodyNatural, 2)
    if (titleLines > 1 && (room < 0 || (!readable && titleLines > MIN_TITLE_LINES))) {
      titleLines--
      continue
    }
    return plan
  }
}

/** Room short of a line by less than this is taken as enough: see spend. */
const LINE_TOLERANCE = 0.5

function spend(input: FitInput, room: number, titleLines: number): FitPlan {
  if (input.bodyNatural === 0) {
    const hero = Math.min(room, input.heroTall)
    return { hero: input.heroPreferred === 0 || hero < input.heroMinimum ? 0 : hero, titleLines, bodyLines: 0 }
  }
  const line = Math.max(1, input.bodyLine)
  const wanted = input.bodyTop + Math.min(input.bodyNatural, MIN_BODY_LINES) * line
  let hero = Math.min(input.heroPreferred, room - wanted)
  if (hero < input.heroMinimum) hero = 0
  const bodyRoom = room - hero - input.bodyTop
  // Line heights are fractions of a pixel in a browser: room left for exactly two lines can come out as 1.9999999999999998 of
  // one, and would lose a line (and, through the readable test, a line of the headline). Half a pixel is not a line, and
  // is not seen; the arithmetic is otherwise the same as the app's, which counts whole pixels.
  return { hero, titleLines, bodyLines: Math.max(0, Math.floor((bodyRoom + LINE_TOLERANCE) / line)) }
}
