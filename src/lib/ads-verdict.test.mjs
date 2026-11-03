import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readVerdicts, resting, servedRecently, noteUnfilled, noteFilled, REST_MS, SERVED_MS, VERDICT_KEY, AD_KINDS } from './ads-verdict.ts'

const HOUR = 60 * 60 * 1000
const NOW = 1_800_000_000_000
const memory = (initial) => {
  const data = new Map(initial === undefined ? [] : [[VERDICT_KEY, initial]])
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), data }
}
const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }

test('a browser that knows nothing is not resting and has nothing served', () => {
  const none = readVerdicts(memory())
  for (const kind of AD_KINDS) {
    assert.equal(resting(none, kind, NOW), false)
    assert.equal(servedRecently(none, kind, NOW), false)
  }
})

test('an ask that came back empty rests the unit for six hours, and then it is asked for again', () => {
  const store = memory()
  const known = noteUnfilled(store, 'page', NOW)
  assert.equal(resting(known, 'page', NOW), true)
  assert.equal(resting(known, 'page', NOW + REST_MS - 1), true)
  assert.equal(resting(known, 'page', NOW + REST_MS), false, 'the rest is over: one ask finds out whether anything changed')
  // What was written is what a later visit reads.
  assert.equal(resting(readVerdicts(store), 'page', NOW + HOUR), true)
})

test('a place that has not been asked rests too where nothing has been served and another place was asked in vain: the account serves nothing', () => {
  const known = noteUnfilled(memory(), 'strip', NOW)
  // The strip asks at load; by the time a reader is at the fifth story the card knows what the strip found out.
  assert.equal(resting(known, 'page', NOW + HOUR), true)
  assert.equal(resting(known, 'rail', NOW + HOUR), true)
  assert.equal(resting(known, 'strip', NOW + HOUR), true)
  // It lasts as long as the verdict it rests on.
  assert.equal(resting(known, 'page', NOW + REST_MS - 1), true)
  assert.equal(resting(known, 'page', NOW + REST_MS), false)
})

test('an ad of any kind that came lately shows the account serves: a place that has not been asked is asked, and one that was asked in vain still rests', () => {
  const store = memory()
  noteFilled(store, 'strip', NOW)
  const known = noteUnfilled(store, 'page', NOW + HOUR)
  assert.equal(resting(known, 'page', NOW + HOUR), true, 'its own empty answer still rests it')
  assert.equal(resting(known, 'rail', NOW + HOUR), false, 'a place with no answer of its own is asked, the account being known to serve')
  assert.equal(resting(known, 'strip', NOW + HOUR), false)
  // A week on, the strip's ad is old news: the account is taken to serve nothing again and the page, asked in vain, still rests.
  assert.equal(resting(noteUnfilled(store, 'page', NOW + SERVED_MS + HOUR), 'rail', NOW + SERVED_MS + HOUR), true)
})

test('a verdict from a clock that was set back rests no other place either', () => {
  const known = noteUnfilled(memory(), 'strip', NOW + 10 * HOUR)
  assert.equal(resting(known, 'page', NOW), false)
})

test('the kinds of ad are learned apart: a strip that filled says nothing about the page', () => {
  const store = memory()
  noteUnfilled(store, 'page', NOW)
  const known = noteFilled(store, 'strip', NOW + 1)
  assert.equal(resting(known, 'page', NOW + 2), true)
  assert.equal(resting(known, 'strip', NOW + 2), false)
  assert.equal(servedRecently(known, 'strip', NOW + 2), true)
  assert.equal(servedRecently(known, 'page', NOW + 2), false)
  assert.equal(resting(known, 'rail', NOW + 2), false)
})

test('an ad that was served ends the rest at once, and is served for a week', () => {
  const store = memory()
  noteUnfilled(store, 'rail', NOW)
  const known = noteFilled(store, 'rail', NOW + HOUR)
  assert.equal(resting(known, 'rail', NOW + HOUR), false)
  assert.equal(servedRecently(known, 'rail', NOW + HOUR + SERVED_MS - 1), true)
  assert.equal(servedRecently(known, 'rail', NOW + HOUR + SERVED_MS), false)
})

test('a unit that has filled lately is only between ads: one that did not come rests nothing', () => {
  const store = memory()
  noteFilled(store, 'page', NOW)
  const known = noteUnfilled(store, 'page', NOW + 2 * HOUR)
  assert.equal(resting(known, 'page', NOW + 2 * HOUR), false)
  assert.equal(servedRecently(known, 'page', NOW + 2 * HOUR), true, 'and its place is still known to be worth its room')
  // A unit that has not filled for more than a week is treated as one that never has.
  const old = noteUnfilled(store, 'page', NOW + SERVED_MS + HOUR)
  assert.equal(resting(old, 'page', NOW + SERVED_MS + HOUR), true)
})

test('what is stored is read leniently: junk, wrong shapes and impossible times are ignored', () => {
  for (const raw of ['', 'not json', 'null', '7', '[]', '{"page":5}', '{"page":{"unfilledAt":"soon"}}', '{"page":{"unfilledAt":-4,"filledAt":0}}', '{"other":{"unfilledAt":1}}']) {
    const known = readVerdicts(memory(raw))
    for (const kind of AD_KINDS) assert.equal(resting(known, kind, NOW), false, raw)
  }
  assert.deepEqual(readVerdicts(memory('{"page":{"unfilledAt":123,"extra":true},"strip":{"filledAt":456}}')), { page: { unfilledAt: 123, filledAt: undefined }, strip: { unfilledAt: undefined, filledAt: 456 } })
})

test('a clock that was set back rests nothing', () => {
  const known = noteUnfilled(memory(), 'page', NOW + 10 * HOUR)
  assert.equal(resting(known, 'page', NOW), false)
  assert.equal(servedRecently(noteFilled(memory(), 'page', NOW + HOUR), 'page', NOW), false)
})

test('storage that is missing, full or switched off still gives an answer for the page that is open', () => {
  assert.deepEqual(readVerdicts(null), {})
  assert.deepEqual(readVerdicts(broken), {})
  const known = noteUnfilled(broken, 'page', NOW)
  assert.equal(resting(known, 'page', NOW), true, 'the verdict is returned even where it cannot be kept')
  assert.equal(resting(noteUnfilled(null, 'strip', NOW, known), 'page', NOW), true, 'and what was already known is carried on')
})
