// How one story card spends its height. The card does not scroll, so that a single swipe always moves to the next story,
// which means everything on it has to fit. What a reader came for is the headline and the summary, together and whole, so
// they come first: the source line and the row at the bottom are always there, then the headline, then the whole of the
// summary, and the picture takes what is left (up to a comfortable size), or is left out when that is too little to be
// worth showing. Only when the summary does not fit even without a picture is it cut, to whole lines, with an ellipsis, never
// through the middle of one; before that the headline gives up lines, but never below two while the summary is worth showing.
//
// Pure arithmetic in pixels, so it can be tested without a browser. A port of CardFit.java in the Android app
// (android/app/src/main/java/com/plaxlabs/news/CardFit.java), so both lay a story out alike; useCardFit measures the
// text and applies the plan.

/** The least of the summary worth showing before the headline gives up a line to make room for it. */
export const MIN_BODY_LINES = 3
/** The headline is cut down to this many lines before the summary is dropped. */
export const MIN_TITLE_LINES = 2

/** What the card knows about itself. A headline or summary that is absent has zero natural lines. */
export interface FitInput {
  /** The room for everything. */
  height: number
  /** The tag and source line with the picture above it, with the space above it. */
  meta: number
  /** The same line when it is the first thing on the card (no picture above it); the menu button sits at its start. */
  metaBare: number
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
  /** The tallest picture worth showing; zero when the card has no picture. */
  heroMaximum: number
  /** The smallest picture worth showing. */
  heroMinimum: number
  /** The tallest picture when there is nothing to read under the headline. */
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
    const { plan, room } = spend(input, titleLines)
    // A headline is worth more than a long summary, but not worth losing the summary altogether; and a headline that does not
    // fit on the card at all has to give up lines, summary or not.
    const readable = input.bodyNatural === 0 || plan.bodyLines >= Math.min(input.bodyNatural, MIN_BODY_LINES)
    if (titleLines > 1 && (room < 0 || (!readable && titleLines > MIN_TITLE_LINES))) {
      titleLines--
      continue
    }
    return plan
  }
}

/** Room short of a line by less than this is taken as enough: see spend. */
const LINE_TOLERANCE = 0.5

/** The plan for a headline of this many lines, and the room it leaves (negative when the headline itself does not fit). */
function spend(input: FitInput, titleLines: number): { plan: FitPlan; room: number } {
  const title = titleLines === 0 ? 0 : input.titleTop + titleLines * input.titleLine
  const roomWith = input.height - input.actions - input.meta - title
  const roomBare = input.height - input.actions - input.metaBare - title
  const picture = input.heroMaximum > 0

  if (input.bodyNatural === 0) {
    const hero = Math.min(roomWith, Math.max(input.heroMaximum, input.heroTall))
    const shown = picture && hero >= input.heroMinimum
    return { plan: { hero: shown ? hero : 0, titleLines, bodyLines: 0 }, room: shown ? roomWith : roomBare }
  }

  const line = Math.max(1, input.bodyLine)
  // The whole summary first; the picture takes what is left of it.
  const spare = roomWith - (input.bodyTop + input.bodyNatural * line)
  if (picture && spare >= input.heroMinimum) {
    return { plan: { hero: Math.min(spare, input.heroMaximum), titleLines, bodyLines: input.bodyNatural }, room: roomWith }
  }
  // No picture. Line heights are fractions of a pixel in a browser: room left for exactly two lines can come out as
  // 1.9999999999999998 of one, and would lose a line (and, through the readable test, a line of the headline). Half a pixel is
  // not a line, and is not seen; the arithmetic is otherwise the same as the app's, which counts whole pixels.
  const fits = Math.floor((roomBare - input.bodyTop + LINE_TOLERANCE) / line)
  return { plan: { hero: 0, titleLines, bodyLines: Math.min(input.bodyNatural, Math.max(0, fits)) }, room: roomBare }
}
