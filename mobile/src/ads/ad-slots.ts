import { STORIES_PER_AD, adSlots } from '@shared/ad-slots'

/**
 * Where the full-page ads stand in the pager: one after every Nth story (5 by default), never before the Nth, so the first stories are
 * clean, and never after the last story, so a feed does not end on an ad. The website has the same rule (src/lib/ad-slots.ts, which
 * decides the slots here too), so a phone and a browser count alike. A port of AdSlots.java.
 *
 * The feed engine knows nothing of ads: its list holds stories (and the caught-up card), and its positions index that list. The pager's
 * list is made from it by putting an ad page in each of the slots that are shown (the slots whose ad has loaded), and the functions
 * below turn a position in one list into a position in the other. A slot is described by its `after`: the number of items that come
 * before it, which is also the index of the item it stands in front of.
 */
export { STORIES_PER_AD }

/**
 * What a full-page ad needs, in dp: the card plus the page's margins. The card (see NativeAdPage) is a picture of at least 120 dp, a
 * label, a headline, a line of text and a button; all but the picture is text, which grows with the font scale, by about 90 dp for each
 * whole step of it. The native app drew its card on pages of exactly this height at every scale to keep the numbers from drifting from
 * the layout; the card of this app has the same measures.
 */
const PAGE_BASE_DP = 360
const PAGE_PER_FONT_SCALE_DP = 90
/** The strip at the foot of the screen takes this much of the pager's height. */
const STRIP_DP = 60

/** The slots of a pager with no ad page in it: one array for every time, so that nothing that depends on it is drawn again for nothing. */
export const NO_SLOTS: readonly number[] = Object.freeze([])

function checkEvery(every: number): void {
  if (!Number.isInteger(every) || every < 1) throw new Error('an ad slot needs at least one story before it')
}

/**
 * The height in dp that an ad page needs at this font scale. A scale under 1 changes nothing: the picture does not shrink. The product is
 * rounded as a 32-bit float, as the native app's was, so that a scale of 1.15 needs the same 104 dp of text room there and here. A scale
 * that is not a number is taken as 1.
 */
export function pageNeededDp(fontScale: number): number {
  const scale = Math.fround(Math.max(1, Number.isFinite(fontScale) ? fontScale : 1))
  return PAGE_BASE_DP + Math.round(Math.fround(PAGE_PER_FONT_SCALE_DP * scale))
}

/** Whether a screen this tall (in dp), at this font scale, has room for an ad page: its pager is the screen less the strip. */
export function pageFits(screenHeightDp: number, fontScale: number): boolean {
  return screenHeightDp - STRIP_DP >= pageNeededDp(fontScale)
}

/** The `after` of each slot a list of this many stories has: 5, 10, 15, and so on, but only where another story follows. */
export function slotsAfter(storyCount: number, every: number = STORIES_PER_AD): number[] {
  checkEvery(every)
  return adSlots(storyCount, every).map((slot) => slot.after)
}

/** The number of the slot that stands after this many stories (from 1): the same slot, however many stories are loaded. */
export function slotOrdinal(after: number, every: number = STORIES_PER_AD): number {
  checkEvery(every)
  return Math.trunc(after / every)
}

/** The position in the pager of an item of the model's list, when the slots in `shown` (ascending) hold ads. */
export function pagerIndex(item: number, shown: readonly number[]): number {
  let index = item
  for (const after of shown) if (after <= item) index++
  return index
}

/** Whether this pager position is an ad. The ad of `shown[k]` stands at `shown[k] + k`. */
export function isAdPosition(pager: number, shown: readonly number[]): boolean {
  return shown.some((after, slot) => after + slot === pager)
}

/**
 * The item of the model's list that a pager position stands for. An ad stands for the story before it, so that the model keeps the
 * position of the story the reader has just read, and does not count the next one as seen before it is on the screen.
 */
export function itemAt(pager: number, shown: readonly number[]): number {
  let ads = 0
  for (let slot = 0; slot < shown.length; slot++) {
    const at = shown[slot] + slot
    if (at === pager) return shown[slot] - 1
    if (at < pager) ads++
  }
  return pager - ads
}

/** The slot of the ad at this pager position, as its `after`, or -1 where there is no ad. */
export function slotAt(pager: number, shown: readonly number[]): number {
  for (let slot = 0; slot < shown.length; slot++) if (shown[slot] + slot === pager) return shown[slot]
  return -1
}

/**
 * The model's list with an ad item put in front of the item each shown slot names; `every` is how many stories one ad stands for.
 * With nothing shown it is the list itself.
 */
export function interleave<T>(items: readonly T[], shown: readonly number[], every: number, ad: (ordinal: number) => T): readonly T[]
export function interleave<T>(items: readonly T[], shown: readonly number[], ad: (ordinal: number) => T): readonly T[]
export function interleave<T>(
  items: readonly T[],
  shown: readonly number[],
  everyOrAd: number | ((ordinal: number) => T),
  maybeAd?: (ordinal: number) => T,
): readonly T[] {
  const every = typeof everyOrAd === 'number' ? everyOrAd : STORIES_PER_AD
  const ad = typeof everyOrAd === 'function' ? everyOrAd : maybeAd
  if (!ad) throw new Error('interleave needs a way to make an ad item')
  if (shown.length === 0) return items
  const out: T[] = []
  let next = 0
  items.forEach((item, index) => {
    if (next < shown.length && shown[next] === index) {
      out.push(ad(slotOrdinal(shown[next], every)))
      next++
    }
    out.push(item)
  })
  return out
}
