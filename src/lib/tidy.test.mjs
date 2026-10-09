import test from 'node:test'
import assert from 'node:assert/strict'
import { tidyMarkers } from './tidy.ts'

test('keeps correct spacing around bold markers (regression: LLM output)', () => {
  assert.equal(
    tidyMarkers('समय दिया है **13 अक्टूबर, 2026** तक का'),
    'समय दिया है **13 अक्टूबर, 2026** तक का'
  )
})

test('trims spaces an engine put just inside bold markers', () => {
  assert.equal(tidyMarkers('लिए ** 13 अक्टूबर ** तक'), 'लिए **13 अक्टूबर** तक')
})

test('trims spaces inside italic markers but not outside', () => {
  assert.equal(tidyMarkers('this is * italic * text'), 'this is *italic* text')
})

test('does not confuse bold with italic', () => {
  assert.equal(tidyMarkers('a **bold** and *it* here'), 'a **bold** and *it* here')
})

test('removes stray spaces before punctuation', () => {
  assert.equal(tidyMarkers('यह सच है । क्या ?'), 'यह सच है। क्या?')
})
