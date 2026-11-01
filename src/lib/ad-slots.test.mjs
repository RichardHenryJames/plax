import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adSlots, withAds, adCardId, isAdCardId, adOrdinal, STORIES_PER_AD } from './ad-slots.ts'

const stories = (n) => Array.from({ length: n }, (_, i) => `story-${i + 1}`)

test('there is one ad after every fifth story', () => {
  assert.equal(STORIES_PER_AD, 5)
})

test('the first five stories are clean: no slot before the fifth story is passed', () => {
  for (let n = 0; n <= 5; n++) assert.deepEqual(adSlots(n), [], `${n} stories`)
})

test('the slot comes after the fifth story, once a sixth follows it', () => {
  assert.deepEqual(adSlots(6), [{ ordinal: 1, after: 5 }])
  assert.deepEqual(adSlots(9), [{ ordinal: 1, after: 5 }])
})

test('the feed never ends on an ad: no slot where no story follows', () => {
  assert.deepEqual(adSlots(10), [{ ordinal: 1, after: 5 }])
  assert.deepEqual(adSlots(15), [{ ordinal: 1, after: 5 }, { ordinal: 2, after: 10 }])
  for (let n = 1; n <= 60; n++) for (const slot of adSlots(n)) assert.ok(slot.after < n, `${n} stories, slot after ${slot.after}`)
})

test('a slot keeps its number as more stories are loaded', () => {
  const at = (n) => adSlots(n).map((slot) => slot.ordinal)
  assert.deepEqual(at(11), [1, 2])
  assert.deepEqual(at(21), [1, 2, 3, 4])
  for (let n = 6; n < 60; n++) assert.deepEqual(at(n + 1).slice(0, at(n).length), at(n), `${n} then ${n + 1} stories`)
})

test('slots are exactly five stories apart', () => {
  const slots = adSlots(100)
  assert.equal(slots.length, 19)
  slots.forEach((slot, i) => assert.equal(slot.after, 5 * (i + 1)))
})

test('the rule can be changed for tests, and refuses nonsense', () => {
  assert.deepEqual(adSlots(8, 3).map((s) => s.after), [3, 6])
  assert.throws(() => adSlots(10, 0))
  assert.throws(() => adSlots(10, 2.5))
  assert.throws(() => adSlots(10, -1))
})

test('withAds puts an item after each fifth story and leaves the stories in order', () => {
  const list = withAds(stories(12), (slot) => adCardId(slot.ordinal))
  assert.deepEqual(list, [
    'story-1', 'story-2', 'story-3', 'story-4', 'story-5', '__ad_1__',
    'story-6', 'story-7', 'story-8', 'story-9', 'story-10', '__ad_2__',
    'story-11', 'story-12',
  ])
  assert.deepEqual(list.filter((x) => !isAdCardId(x)), stories(12))
})

test('withAds returns the stories themselves when there is nothing to add', () => {
  const few = stories(4)
  assert.equal(withAds(few, () => 'ad'), few)
  assert.deepEqual(withAds([], () => 'ad'), [])
})

test('when no ad is ready for a slot the stories simply run on, and the other slots are unaffected', () => {
  const list = withAds(stories(12), (slot) => (slot.ordinal === 1 ? null : adCardId(slot.ordinal)))
  assert.deepEqual(list.filter(isAdCardId), ['__ad_2__'])
  assert.equal(list.length, 13)
  assert.deepEqual(withAds(stories(12), () => null), stories(12))
})

test('an ad card id is told from a story id', () => {
  assert.equal(adCardId(3), '__ad_3__')
  assert.ok(isAdCardId(adCardId(1)))
  assert.ok(isAdCardId(adCardId(12)))
  assert.ok(!isAdCardId('the-hindu-s0dezi'))
  assert.ok(!isAdCardId('__caught_up__'))
  assert.ok(!isAdCardId('__ad_'))
  assert.ok(!isAdCardId('__ad_x__'))
  assert.ok(!isAdCardId('__ad___'))
})

test('the number of a slot is read back from its card', () => {
  assert.equal(adOrdinal(adCardId(7)), 7)
  assert.equal(adOrdinal(adCardId(12)), 12)
  assert.equal(adOrdinal('__caught_up__'), null)
  assert.equal(adOrdinal('a-story'), null)
})
