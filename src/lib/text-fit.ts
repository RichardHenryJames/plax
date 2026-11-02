// Where a summary ends when its room does: at the end of a sentence when one falls close to the end of the room, else after the last
// word that fits and can end a text (not "and", "of the", an initial: "…Bagchi and V…"), with an ellipsis. Never in the middle of a word
// ("prope…"), which a browser's or a phone's own ellipsis does, and
// never so early that the card is left with a hole: a sentence is a better place to stop than a word only when it is within `slack`
// lines of the room.
//
// Pure, with the measuring passed in (how many lines a text takes at the card's width), so that it can be tested without a browser. A
// port of TextFit.java in the Android app (android/app/src/main/java/com/plaxlabs/news/TextFit.java); useCardFit measures with the
// page, the app with a layout, and both cut alike.
import { endsSentence, trimWeakTail } from './sentence.ts'

export const ELLIPSIS = '\u2026'
/** A sentence that ends this many lines or fewer short of the room is where the text stops. */
export const SENTENCE_SLACK_LINES = 2

/** Takes off what must not stand before an ellipsis: spaces, and the marks that lead into a next word (a comma, a dash). */
const trimTail = (text: string) => text.replace(/[\s,;:\u2013\u2014-]+$/, '')

/** Whether the text ends a sentence at this index: a full stop (not after a title or an initial), ! ? or a danda, and a closing quote. */
function sentenceEndsAt(text: string, end: number): boolean {
  let mark = end - 1
  if (mark > 0 && /["\u201d\u2019')\]]/.test(text[mark]) && /[.!?\u0964]/.test(text[mark - 1])) mark--
  return /[.!?\u0964]/.test(text[mark]) && endsSentence(text, mark)
}

/**
 * The text as it is shown in `lines` lines: all of it when it fits, else the most of it that does, ending as above.
 * `countLines` says how many lines a text takes where it is shown.
 */
export function fitText(text: string, lines: number, countLines: (candidate: string) => number, slack: number = SENTENCE_SLACK_LINES): string {
  if (lines <= 0) return ''
  const full = text.trim()
  if (full === '' || countLines(full) <= lines) return text
  // The index after each word.
  const ends: number[] = []
  for (const word of full.matchAll(/\S+/g)) ends.push((word.index ?? 0) + word[0].length)
  // The most words that fit with an ellipsis after them (a text that fits with n words fits with fewer).
  let low = 0
  let high = ends.length - 1
  let best = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (countLines(trimTail(full.slice(0, ends[middle])) + ELLIPSIS) <= lines) {
      best = middle
      low = middle + 1
    } else high = middle - 1
  }
  if (best < 0) return ELLIPSIS
  // The last sentence that ends within what fits: a better place to stop than a word when it is close to the end of the room.
  for (let index = best; index >= 0; index--) {
    if (!sentenceEndsAt(full, ends[index])) continue
    const sentence = full.slice(0, ends[index])
    if (countLines(sentence) >= lines - slack) return sentence
    break // an earlier sentence is further from the end still
  }
  return trimTail(trimWeakTail(full.slice(0, ends[best]))) + ELLIPSIS
}
