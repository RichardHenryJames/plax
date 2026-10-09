import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyWithoutHeadline } from './story-body.ts'

// The cases mirror StoryTest.java in the Android app: the same inputs give the same body on both.

test('a headline repeated as the whole text leaves no body', () => {
  assert.equal(bodyWithoutHeadline('Markets rally', 'Markets rally'), '')
  assert.equal(bodyWithoutHeadline('Markets rally.', '  markets   rally '), '')
  assert.equal(bodyWithoutHeadline('Markets rally', 'Markets rally\u2026'), '')
})

test('the headline is dropped when a separator sets it apart from the text', () => {
  assert.equal(
    bodyWithoutHeadline('Sensex gains 800 points', 'Sensex gains 800 points: all sectoral indices turned green after a sharp selloff.'),
    'all sectoral indices turned green after a sharp selloff.'
  )
  const rest = 'Banks led the gains on Friday.'
  for (const separator of ['.', ' -', ' \u2014', ' \u2013', ' |', '\u2026', ':']) {
    assert.equal(bodyWithoutHeadline('Markets rally', `Markets rally${separator} ${rest}`), rest, JSON.stringify(separator))
  }
  assert.equal(
    bodyWithoutHeadline('बाज़ार में तेज़ी', 'बाज़ार में तेज़ी। बैंकों ने शुक्रवार को बढ़त बनाई।'),
    'बैंकों ने शुक्रवार को बढ़त बनाई।'
  )
})

test('a sentence that merely begins with the headline stays whole', () => {
  const lead = 'Evolution is the change in the heritable characteristics of populations.'
  assert.equal(bodyWithoutHeadline('Evolution', lead), lead)
  const comma = 'Mercury, the smallest planet, orbits the Sun every 88 days.'
  assert.equal(bodyWithoutHeadline('Mercury', comma), comma)
  const longer = 'Markets rally as inflation cools and banks lead the gains.'
  assert.equal(bodyWithoutHeadline('Markets rally', longer), longer)
  // A hyphen inside a word is not a separator.
  assert.equal(bodyWithoutHeadline('Mid', 'Mid-Atlantic ridge spreading is slow.'), 'Mid-Atlantic ridge spreading is slow.')
})

test('independent text is kept, short tails are dropped and a missing headline changes nothing', () => {
  assert.equal(bodyWithoutHeadline('Headline', 'A different explanation entirely.'), 'A different explanation entirely.')
  assert.equal(bodyWithoutHeadline('Headline words here', 'Headline words here. Ok.'), '')
  assert.equal(bodyWithoutHeadline('', 'A quote with no title.'), 'A quote with no title.')
  assert.equal(bodyWithoutHeadline(undefined, '  A quote with no title.  '), 'A quote with no title.')
  assert.equal(bodyWithoutHeadline('Title', ''), '')
})
