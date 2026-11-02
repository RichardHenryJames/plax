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
