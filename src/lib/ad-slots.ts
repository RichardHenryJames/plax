// Where the ads go in a feed. A reader gets one full-page ad after every fifth story: never before the fifth, so the first five
// stories are clean, and never as the last thing in the list, so the feed does not end on an ad. The Android app has the same
// rule (AdSlots.java), so a phone and a browser count alike.
//
// Pure arithmetic on a count, so it can be tested without a browser. The slots are numbered from 1, and a slot keeps its number
// when more stories are loaded after it, so whatever was loaded for it (an ad) stays with it.

/** One ad after this many stories. */
export const STORIES_PER_AD = 5

export interface AdSlot {
  /** The slot's number, from 1: the same slot, however many stories have been loaded since. */
  ordinal: number
  /** How many stories come before it. */
  after: number
}

/** The slots a list of this many stories has: after the 5th, the 10th, and so on, but only where another story follows. */
export function adSlots(storyCount: number, every: number = STORIES_PER_AD): AdSlot[] {
  if (!Number.isInteger(every) || every < 1) throw new Error('an ad slot needs at least one story before it')
  const slots: AdSlot[] = []
  for (let after = every; after < storyCount; after += every) slots.push({ ordinal: after / every, after })
  return slots
}

/**
 * The stories with an item for each slot put in after the story it follows. `make` says what goes in a slot, or null when nothing
 * should (no ad is ready, or ads are off), and then the stories simply run on.
 */
export function withAds<T>(stories: T[], make: (slot: AdSlot) => T | null, every: number = STORIES_PER_AD): T[] {
  const slots = adSlots(stories.length, every)
  if (slots.length === 0) return stories
  const out: T[] = []
  let next = 0
  stories.forEach((story, index) => {
    out.push(story)
    if (next < slots.length && slots[next].after === index + 1) {
      const filler = make(slots[next])
      if (filler !== null) out.push(filler)
      next++
    }
  })
  return out
}

/** The id of the card that stands in a slot. */
export const adCardId = (ordinal: number) => `__ad_${ordinal}__`

/** Whether a card is an ad slot and not a story. */
export const isAdCardId = (id: string) => /^__ad_\d+__$/.test(id)

/** The number of the slot a card stands in, or null for a card that is not an ad. */
export const adOrdinal = (id: string): number | null => (isAdCardId(id) ? Number(id.slice(5, -2)) : null)
