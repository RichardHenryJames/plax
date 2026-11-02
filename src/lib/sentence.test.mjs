import test from 'node:test'
import assert from 'node:assert/strict'
import { endsSentence, trimWeakTail } from './sentence.ts'

test('a text cut at a word stops before the words that need the next one', () => {
  assert.equal(trimWeakTail('a bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi and V'),
    'a bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi')
  assert.equal(trimWeakTail('shares ended 2.1 per cent lower in Mumbai on Monday compared to a 1.7'), 'shares ended 2.1 per cent lower in Mumbai on Monday compared')
  assert.equal(trimWeakTail('all forces will exit by the end of 2027 in a'), 'all forces will exit by the end')
  assert.equal(trimWeakTail('the minister said on Monday that he would meet Dr.'), 'the minister said on Monday that he would meet')
  assert.equal(trimWeakTail('Officials said the review would take several weeks \u2013'), 'Officials said the review would take several weeks')
})

test('a text that ends on a word that says a thing is left as it is', () => {
  for (const text of [
    'Officials said the review would take several weeks',
    'The bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi',
    'the study of 4,000 patients found that nothing changed, researchers said.',
    'Officials said the review would take several weeks,',
  ]) assert.equal(trimWeakTail(text), text)
})

test('an opening bracket that is never closed, near the end, is no place to stop', () => {
  assert.equal(trimWeakTail('The Supreme Court on Monday (November 2'), 'The Supreme Court on Monday')
  assert.equal(trimWeakTail('Raids were carried out on Monday by officers of the Directorate of Revenue Intelligence (DRI'),
    'Raids were carried out on Monday by officers of the Directorate of Revenue Intelligence')
  // Closed, or too far back to matter, or all there is: kept.
  assert.equal(trimWeakTail('The Supreme Court on Monday (November 2, 2026) set aside the order'), 'The Supreme Court on Monday (November 2, 2026) set aside the order')
  assert.equal(trimWeakTail('(the first line of a long note that goes on for a good while and says several things about the case'), '(the first line of a long note that goes on for a good while and says several things about the case')
  assert.equal(trimWeakTail('A (short note'), 'A (short note')
})

test('at most four words are taken off, and never so many that fewer than four are left', () => {
  assert.equal(trimWeakTail('the minister said that the'), 'the minister said that')
  assert.equal(trimWeakTail('one two three'), 'one two three')
  assert.equal(trimWeakTail('they said it was one of the in a of the to'), 'they said it was one of the in')
  assert.equal(trimWeakTail('a b c of the in a', 2, 3), 'a b c of the')
})

test('Hindi postpositions and conjunctions do not end a cut either', () => {
  assert.equal(trimWeakTail('रविवार को दिल्ली के रामलीला मैदान में विपक्षी दलों के कई नेता और'), 'रविवार को दिल्ली के रामलीला मैदान में विपक्षी दलों के कई नेता')
  assert.equal(trimWeakTail('रविवार को दिल्ली में हज़ारों लोगों की भीड़ इकट्ठा हुई और हज़ारों लोगों की'), 'रविवार को दिल्ली में हज़ारों लोगों की भीड़ इकट्ठा हुई और हज़ारों लोगों')
})

test('a full stop after a title or an initial is still not the end of a sentence', () => {
  assert.equal(endsSentence('Dr. Rao said so.', 2), false)
  assert.equal(endsSentence('Dr. Rao said so.', 15), true)
})
