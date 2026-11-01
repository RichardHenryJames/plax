import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { SECTION_POSTERS, posterEmoji, wantsPoster } from './poster.ts'

const here = (path) => new URL(path, import.meta.url)
// A Java string literal ("\uD83D\uDCBB") is also a JSON string.
const javaString = (literal) => JSON.parse(`"${literal}"`)

test('a news section has its own sign, a topic its emoji, anything else a spark', () => {
  assert.equal(posterEmoji('india', '\u{1F4F0}'), '\u{1F1EE}\u{1F1F3}')
  assert.equal(posterEmoji('world'), '\u{1F30D}')
  assert.equal(posterEmoji('history', '\u{1F4DC}'), '\u{1F4DC}')
  assert.equal(posterEmoji('somethingelse'), '\u2728')
})

test('the signs of the sections are the app\'s (StoryAdapter.emoji and Topic)', () => {
  const adapter = fs.readFileSync(here('../../android/app/src/main/java/com/plaxlabs/news/StoryAdapter.java'), 'utf8')
  const topics = fs.readFileSync(here('../../android/app/src/main/java/com/plaxlabs/news/Topic.java'), 'utf8')
  const literal = (section) => adapter.match(new RegExp(`case "${section}": return "([^"]+)";`))?.[1]
  const topicEmoji = (name) => topics.match(new RegExp(`${name}\\("[a-z]+", R\\.string\\.[a-z_]+, "([^"]+)"\\)`))?.[1]
  const app = {
    india: javaString(literal('india')),
    world: javaString(literal('world')),
    tech: javaString(topicEmoji('TECHNOLOGY')),
    business: javaString(topicEmoji('BUSINESS')),
    science: javaString(topicEmoji('SCIENCE')),
  }
  assert.deepEqual(SECTION_POSTERS, app)
})

test('every story without a picture gets a poster, not only the news', () => {
  const idle = { translating: false, imageFailed: false }
  assert.equal(wantsPoster({ type: 'microessay', image: '' }, idle), true, 'a news story with no picture')
  assert.equal(wantsPoster({ type: 'explainer' }, idle), true, 'a topic story (Wikipedia and the like) with no picture')
  assert.equal(wantsPoster({ type: 'fact', image: undefined }, idle), true)
  assert.equal(wantsPoster({ type: 'code' }, idle), true)
})

test('a story whose picture could not be loaded gets one too, and one with a picture does not', () => {
  assert.equal(wantsPoster({ type: 'microessay', image: 'https://example.com/a.jpg' }, { translating: false, imageFailed: false }), false)
  assert.equal(wantsPoster({ type: 'microessay', image: 'https://example.com/a.jpg' }, { translating: false, imageFailed: true }), true)
})

test('a quote is its own picture, and nothing is drawn while the card is being made ready', () => {
  assert.equal(wantsPoster({ type: 'quote' }, { translating: false, imageFailed: false }), false)
  assert.equal(wantsPoster({ type: 'quote', image: 'x' }, { translating: false, imageFailed: true }), false)
  assert.equal(wantsPoster({ type: 'microessay' }, { translating: true, imageFailed: false }), false)
})
