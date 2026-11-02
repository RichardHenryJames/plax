import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Google's script sets `height: auto !important` (and `min-height: 0 !important`) on every box around a responsive ad, up to the first
// absolutely positioned one. The full-page ad is a scrolling box with a page held in it, and it stopped working with the real script
// (no room to scroll, a page as tall as its contents) while everything was green against the preview boxes. These keep it from
// depending on a `height` again. The behaviour itself is checked in a browser with the script stood in for (see TECH.md, Ads).
const source = readFileSync(new URL('../components/AdCard.tsx', import.meta.url), 'utf8')

test('the ad page takes the room it scrolls through from spacers beside the page, never from the height of a box around it', () => {
  const spacers = source.match(/<div aria-hidden className="shrink-0" style=\{\{ height: SLACK \}\} \/>/g) ?? []
  assert.equal(spacers.length, 2, 'one above the page and one below it')
  assert.doesNotMatch(source, /height:\s*`calc\(/, 'no box around the ad is sized by a calc() height: the script resets it')
  assert.doesNotMatch(source, /calc\(100%/, 'nor by a percentage of its parent')
})

test('the page is as tall as the box it scrolls in by its flex-basis, which the script leaves alone (not height, min-height or max-height)', () => {
  assert.match(source, /basis-\[100cqh\]/, 'the page is 100cqh, the height of the scrolling box')
  assert.match(source, /shrink-0 grow-0 basis-\[100cqh\]/, 'and keeps that size when the contents are taller or shorter')
  assert.match(source, /\[container-type:size\]/, 'the scrolling box is the container the unit is measured against')
  assert.doesNotMatch(source, /\b(?:min-h|max-h|h)-\[[^\]]*cqh\]/, 'not by a height that the script resets')
})

test('the scrolling box is absolutely positioned (the script stops there) and is the only thing that moves the page on', () => {
  assert.match(source, /className="absolute inset-0 overflow-y-auto /, 'absolutely positioned, a box of its own')
  assert.match(source, /data-no-feed-scroll/, 'the feed\'s own wheel and touch handlers leave it alone, so a gesture goes one way only')
  assert.match(source, /const SLACK = 20000\b/, 'far more room than any gesture can cover')
})

test('until an ad has come the card shows only room: the label and the button are invisible, not taken out, so the layout the shape was chosen from is the same', () => {
  assert.match(source, /const chrome = revealed \? '' : 'invisible'/)
  assert.equal((source.match(/\$\{chrome\}/g) ?? []).length, 2, 'the label, and the button with its hints')
  assert.doesNotMatch(source, /revealed &&|!revealed &&|revealed \?\s*\(/, 'nothing is added or removed by it: the box around the ad keeps its size')
})

test('the label and the button come up when an ad has come, or when the wait has gone on, so that a slow answer never leaves a reader with no way on', () => {
  assert.match(source, /if \(next === 'filled'\) \{\s*setRevealed\(true\)\s*onFilled\(\)/)
  assert.match(source, /const SLOW_MS = 2500\b/)
  assert.match(source, /setTimeout\(\(\) => setRevealed\(true\), SLOW_MS\)/)
  // The wait for an ad is given up at 5 s (AdSlot): the label is up for the last of it, not for a card that is about to go.
  const give = Number(readFileSync(new URL('../components/AdSlot.tsx', import.meta.url), 'utf8').match(/const GIVE_UP_MS = (\d+)/)?.[1])
  assert.ok(give > 2500, 'the label comes before the card is given up on')
})

const slot = readFileSync(new URL('../components/AdSlot.tsx', import.meta.url), 'utf8')

test('only what Google itself answers is remembered, not a wait that ran out, a script that threw or a blocker', () => {
  assert.match(slot, /if \(status === 'filled'\) finish\('filled', true\)/)
  assert.match(slot, /else if \(status === 'unfilled'\) finish\('unfilled', true\)/)
  assert.match(slot, /setTimeout\(\(\) => finish\('unfilled', false\), GIVE_UP_MS\)/)
  assert.match(slot, /const onBlocked = \(\) => finish\('unfilled', false\)/)
  assert.equal((slot.match(/finish\('unfilled', false\)/g) ?? []).length, 4, 'a blocker at once, a blocker later, the wait that ran out, a script that threw')
  assert.match(slot, /if \(answered\) rememberAds\(kind, status === 'filled'\)/)
})

test('every place that asks for an ad says which place it is, so what is learned is kept for it', () => {
  for (const [file, kind] of [['AdCard.tsx', 'page'], ['AdStrip.tsx', 'strip'], ['RailAd.tsx', 'rail']]) {
    assert.match(readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8'), new RegExp(`<AdSlot[^>]*\\bkind="${kind}"`, 's'), file)
  }
})

test('the panel asks without taking room or saying "Advertisement" until an ad has come, unless an ad was served here before', () => {
  const rail = readFileSync(new URL('../components/RailAd.tsx', import.meta.url), 'utf8')
  assert.match(rail, /const holding = status === 'loading' && !reserve/)
  assert.match(rail, /holding \? 'pointer-events-none h-0' : 'pt-5'/, 'no room, and the unit that overlaps the panel under it touches nothing')
  assert.match(rail, /\$\{arrived \? '' : 'invisible'\}/, 'and the label is not shown: it comes up with the ad, even where the room was kept')
  assert.match(rail, /if \(resting \|\| !onStories/, 'a place that rests is not drawn at all')
})
