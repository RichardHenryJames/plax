import test from 'node:test'
import assert from 'node:assert/strict'
import { isDisambiguationPage } from './wikipedia-quality.ts'

test('a disambiguation extract is recognised even when it carries its list', () => {
  const extract =
    'The Evolution may refer to:\n\nCiara: The Evolution, 2006, or its title song\nThe Evolution (Made Men Music Group album), 2014'
  assert.equal(isDisambiguationPage('', 'The Evolution', extract), true)
  assert.equal(isDisambiguationPage('', 'Mercury', 'Mercury may also refer to:'), true)
  assert.equal(isDisambiguationPage('', 'Lead', 'Lead can refer to:\nLead, a metal\nLead (film)'), true)
  assert.equal(isDisambiguationPage('', 'Mercury', '  Mercury may refer to:'), true)
})

test('the title or the Wikidata description can give it away', () => {
  assert.equal(isDisambiguationPage('', 'Mercury (disambiguation)', 'Mercury is a planet.'), true)
  assert.equal(isDisambiguationPage('Wikimedia disambiguation page', 'Mercury', ''), true)
})

test('an ordinary article is kept', () => {
  assert.equal(
    isDisambiguationPage(
      'Theory in biology',
      'Evolution',
      'Evolution is the change in the heritable characteristics of biological populations over successive generations.'
    ),
    false
  )
  assert.equal(isDisambiguationPage('', '', ''), false)
})

test('the phrase must come in the opening words, not deep inside an article', () => {
  const deep =
    'Photosynthesis is the process by which green plants and some other organisms use sunlight to synthesise nutrients from carbon dioxide and water. The word may refer to the whole process.'
  assert.equal(isDisambiguationPage('', 'Photosynthesis', deep), false)
  assert.equal(isDisambiguationPage('', 'Memory', 'Memory is the faculty of the brain. It may refer to many things.'), false)
})
