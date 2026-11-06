import { adSlots } from '@shared/ad-slots'
import { adOrdinal, adStory, caughtUp, isAd, isCaughtUp, makeStory } from '../../data/story'
import { STORIES_PER_AD, NO_SLOTS, interleave, isAdPosition, itemAt, pageFits, pageNeededDp, pagerIndex, slotAt, slotOrdinal, slotsAfter } from '../ad-slots'

const stories = (count: number): string[] => Array.from({ length: count }, (_, index) => `story-${index + 1}`)

// A port of AdSlotsTest.java: where the full-page ads stand, and how a position in the model's list becomes one in the pager and back.
// The cases mirror ad-slots.test.mjs on the website: a phone and a browser count the same.
describe('where the full-page ads stand', () => {
  it('keeps the first five stories clean, so no slot comes before the fifth is passed', () => {
    for (let count = 0; count <= 5; count++) expect({ count, slots: slotsAfter(count) }).toEqual({ count, slots: [] })
  })

  it('puts the slot after the fifth story once a sixth follows it', () => {
    expect(slotsAfter(6)).toEqual([5])
    expect(slotsAfter(9)).toEqual([5])
  })

  it('never ends a feed on an ad, so there is no slot where no story follows', () => {
    expect(slotsAfter(10)).toEqual([5])
    expect(slotsAfter(15)).toEqual([5, 10])
    for (let count = 1; count <= 60; count++) for (const after of slotsAfter(count)) expect(after).toBeLessThan(count)
  })

  it('keeps slots exactly five stories apart, and their number, as more stories are loaded', () => {
    const slots = slotsAfter(100)
    expect(slots).toHaveLength(19)
    slots.forEach((slot, index) => {
      expect(slot).toBe(5 * (index + 1))
      expect(slotOrdinal(slot)).toBe(index + 1)
    })
    for (let count = 6; count < 60; count++) {
      const before = slotsAfter(count)
      const more = slotsAfter(count + 1)
      expect(more.slice(0, before.length)).toEqual(before)
    }
  })

  it('can have the rule changed, and refuses nonsense', () => {
    expect(slotsAfter(8, 3)).toEqual([3, 6])
    expect(() => slotsAfter(10, 0)).toThrow()
    expect(() => slotsAfter(10, -2)).toThrow()
    expect(() => slotsAfter(10, 2.5)).toThrow()
    expect(() => slotsAfter(10, Number.NaN)).toThrow()
    expect(() => slotOrdinal(10, 0)).toThrow()
  })

  it('stands for five stories by default', () => {
    expect(STORIES_PER_AD).toBe(5)
  })

  it('has one empty list of slots for a pager with no ad page in it', () => {
    expect(NO_SLOTS).toEqual([])
    expect(Object.isFrozen(NO_SLOTS)).toBe(true)
    expect(interleave(stories(3), NO_SLOTS, () => 'ad')).toEqual(stories(3))
    expect(pagerIndex(2, NO_SLOTS)).toBe(2)
  })

  it('counts the same slots as the website', () => {
    for (const every of [1, 2, 3, 5, 7, 20]) {
      for (let count = 0; count <= 120; count++) {
        expect(slotsAfter(count, every)).toEqual(adSlots(count, every).map((slot) => slot.after))
        for (const slot of adSlots(count, every)) expect(slotOrdinal(slot.after, every)).toBe(slot.ordinal)
      }
    }
  })
})

describe('the room an ad page needs', () => {
  it('is more the larger the text', () => {
    expect(pageNeededDp(1)).toBe(450)
    expect(pageNeededDp(2)).toBe(540)
    // Smaller text does not shrink the picture.
    expect(pageNeededDp(0.85)).toBe(pageNeededDp(1))
    let last = 0
    for (const scale of [1, 1.15, 1.3, 1.5, 1.75, 2]) {
      expect(pageNeededDp(scale)).toBeGreaterThan(last)
      last = pageNeededDp(scale)
    }
  })

  it('rounds as the native app did, in 32-bit floating point', () => {
    // 90 times 1.15 is 103.5 in a 32-bit float (so 104), and a hair under it in a double (which would make 103).
    expect(pageNeededDp(1.15)).toBe(464)
    expect(pageNeededDp(Math.fround(1.15))).toBe(464)
    expect(pageNeededDp(1.3)).toBe(477)
    expect(pageNeededDp(1.5)).toBe(495)
  })

  it('takes a font scale that is not a number as normal text', () => {
    expect(pageNeededDp(Number.NaN)).toBe(450)
    expect(pageNeededDp(Number.POSITIVE_INFINITY)).toBe(450)
    expect(pageNeededDp(0)).toBe(450)
    expect(pageNeededDp(-3)).toBe(450)
  })

  it('shows ad pages only where the card fits', () => {
    // A usual phone has the room at every text size, a phone on its side or a small window has none.
    for (const scale of [1, 1.3, 2]) expect(pageFits(780, scale)).toBe(true)
    expect(pageFits(393, 1)).toBe(false)
    expect(pageFits(500, 1)).toBe(false)
    // The pager is the screen less the strip, and the edge is exact.
    const needed = pageNeededDp(1.3)
    expect(pageFits(needed + 60, 1.3)).toBe(true)
    expect(pageFits(needed + 59, 1.3)).toBe(false)
    // The same screen has room for the card at normal text and not at the largest.
    expect(pageFits(560, 1)).toBe(true)
    expect(pageFits(560, 2)).toBe(false)
  })
})

describe('putting the ads in the pager', () => {
  it('puts an ad in front of the story each shown slot names', () => {
    const list = interleave(stories(12), [5, 10], (ordinal) => `ad-${ordinal}`)
    expect(list).toEqual([
      'story-1', 'story-2', 'story-3', 'story-4', 'story-5', 'ad-1',
      'story-6', 'story-7', 'story-8', 'story-9', 'story-10', 'ad-2',
      'story-11', 'story-12',
    ])
  })

  it('returns the list itself when nothing is shown', () => {
    const list = stories(12)
    expect(interleave(list, [], () => 'ad')).toBe(list)
    expect(interleave(list, [], 7, () => 'ad')).toBe(list)
  })

  it('stands after whatever number of stories the website sets', () => {
    // One ad after every seventh story: the slots are 7 and 14, and the ads are numbered 1 and 2 as before.
    const slots = slotsAfter(16, 7)
    expect(slots).toEqual([7, 14])
    const list = interleave(stories(16), slots, 7, (ordinal) => `ad-${ordinal}`)
    expect(list[7]).toBe('ad-1')
    expect(list[6]).toBe('story-7')
    expect(list[8]).toBe('story-8')
    expect(list[15]).toBe('ad-2')
    expect(list).toHaveLength(18)
    expect(slotOrdinal(14, 7)).toBe(2)
    // What the number of stories is not set to is five, as it was.
    expect(interleave(stories(6), [5], 5, (ordinal) => `ad-${ordinal}`)).toEqual(['story-1', 'story-2', 'story-3', 'story-4', 'story-5', 'ad-1', 'story-6'])
  })

  it('shows only the slots whose ad is ready and simply skips the others', () => {
    // The first slot has no ad, the second has.
    const list = interleave(stories(12), [10], (ordinal) => `ad-${ordinal}`)
    expect(list).toHaveLength(13)
    expect(list[10]).toBe('ad-2')
    expect(list[9]).toBe('story-10')
    expect(list[11]).toBe('story-11')
  })

  it('ignores a slot that has no story after it any more', () => {
    expect(interleave(stories(5), [5], (ordinal) => `ad-${ordinal}`)).toEqual(stories(5))
    expect(interleave(stories(8), [5, 10], (ordinal) => `ad-${ordinal}`)).toHaveLength(9)
  })

  it('does not change the list it was given', () => {
    const list = stories(12)
    interleave(list, [5, 10], () => 'ad')
    expect(list).toEqual(stories(12))
  })

  it('needs a way to make an ad item', () => {
    expect(() => (interleave as unknown as (items: string[], shown: number[]) => unknown)(stories(12), [5])).toThrow()
  })
})

describe('positions in the model list and in the pager', () => {
  it('turns a position in the models list into one in the pager and back', () => {
    const shown = [5, 10]
    const pager = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14]
    pager.forEach((position, item) => {
      expect({ item, pager: pagerIndex(item, shown) }).toEqual({ item, pager: position })
      expect({ position, item: itemAt(position, shown) }).toEqual({ position, item })
      expect(isAdPosition(position, shown)).toBe(false)
    })
  })

  it("puts an ad at its slot's place, standing for the story before it", () => {
    const shown = [5, 10]
    expect(isAdPosition(5, shown)).toBe(true)
    expect(isAdPosition(11, shown)).toBe(true)
    expect(isAdPosition(4, shown)).toBe(false)
    expect(isAdPosition(6, shown)).toBe(false)
    // The story the reader has just read, not the one that is not on the screen yet.
    expect(itemAt(5, shown)).toBe(4)
    expect(itemAt(11, shown)).toBe(9)
    expect(slotAt(5, shown)).toBe(5)
    expect(slotAt(11, shown)).toBe(10)
    expect(slotAt(6, shown)).toBe(-1)
  })

  it('leaves the positions the same when no ads are shown', () => {
    for (let position = 0; position < 30; position++) {
      expect(pagerIndex(position, [])).toBe(position)
      expect(itemAt(position, [])).toBe(position)
      expect(isAdPosition(position, [])).toBe(false)
      expect(slotAt(position, [])).toBe(-1)
    }
  })

  it('agrees with the list that interleave makes', () => {
    for (let count = 1; count <= 40; count++) {
      const shown = slotsAfter(count)
      const items = stories(count)
      const pager = interleave(items, shown, (ordinal) => `ad-${ordinal}`)
      expect(pager).toHaveLength(count + shown.length)
      for (let item = 0; item < count; item++) expect(pager[pagerIndex(item, shown)]).toBe(items[item])
      pager.forEach((entry, position) => {
        const ad = entry.startsWith('ad-')
        expect({ count, position, ad: isAdPosition(position, shown) }).toEqual({ count, position, ad })
        const stands = itemAt(position, shown)
        // An ad stands for the story before it.
        expect(ad ? pager[position - 1] : entry).toBe(items[stands])
      })
    }
  })

  it('names the ad page by the story class marker and keeps its number', () => {
    const ad = adStory(7)
    expect(isAd(ad)).toBe(true)
    expect(adOrdinal(ad)).toBe(7)
    expect(isCaughtUp(ad)).toBe(false)
    expect(isAd(caughtUp())).toBe(false)
    const story = makeStory({ id: 'the-hindu-s0dezi', title: 'Title', content: 'Body', source: 'The Hindu', sourceUrl: 'https://example.com/a', readTime: '5s', publishedAt: 1 })
    expect(isAd(story)).toBe(false)
    expect(adOrdinal(story)).toBe(0)
    expect(adOrdinal(adStory(12))).toBe(12)
  })

  it('makes a pager of stories and ad markers that the pager can tell apart', () => {
    const list = interleave(Array.from({ length: 12 }, (_, index) => makeStory({ id: `s${index + 1}` })), [5, 10], 5, adStory)
    expect(list.filter(isAd).map(adOrdinal)).toEqual([1, 2])
    expect(list.filter((story) => !isAd(story))).toHaveLength(12)
  })
})
