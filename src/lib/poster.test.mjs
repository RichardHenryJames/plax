import test from 'node:test'
import assert from 'node:assert/strict'
import { posterName, POSTER_NAME, wantsPoster } from './poster.ts'

test('the poster of a story is headed by Plax, never by the name of the outlet it comes from', () => {
  assert.equal(posterName(), 'Plax')
  assert.equal(POSTER_NAME, 'Plax')
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
