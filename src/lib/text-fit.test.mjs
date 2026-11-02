import test from 'node:test'
import assert from 'node:assert/strict'
import { fitText, ELLIPSIS, SENTENCE_SLACK_LINES } from './text-fit.ts'

// The cases mirror TextFitTest.java in the Android app: the same texts and widths give the same cuts on both. A text is measured as a
// column of 40 characters would hold it (words are not broken, as in a browser and a layout).
const COLUMN = 40
const countLines = (text) => {
  let lines = 1
  let used = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (used === 0) used = word.length
    else if (used + 1 + word.length <= COLUMN) used += 1 + word.length
    else { lines++; used = word.length }
  }
  return lines
}

const STORY = 'Uganda has begun withdrawing its troops from Somalia after nearly two decades of military involvement. ' +
  'The first group of troops deployed under a bilateral arrangement had already arrived back home. ' +
  'Others will follow in a few days, the army said on Monday, and all forces will exit by the end of 2027 in a phased withdrawal.'

test('a text that fits is shown whole, as it is', () => {
  assert.equal(fitText(STORY, 20, countLines), STORY)
  assert.equal(fitText('Short.', 1, countLines), 'Short.')
  assert.equal(fitText('', 3, countLines), '')
})

test('a text that does not fit ends after a word, never in the middle of one, with an ellipsis, and fits', () => {
  for (let lines = 1; lines <= 8; lines++) {
    const shown = fitText(STORY, lines, countLines, 0)
    assert.ok(countLines(shown) <= lines, `${lines}: ${shown}`)
    assert.ok(shown.endsWith(ELLIPSIS) || /[.!?]$/.test(shown), shown)
    const words = shown.replace(ELLIPSIS, '').trim().split(' ')
    for (const word of words) assert.ok(STORY.includes(word), `a whole word: ${word}`)
    assert.ok(STORY.startsWith(shown.replace(ELLIPSIS, '').trim()), 'the start of the text')
  }
})

test('the ellipsis follows the last word, not a comma or a dash that led to the next', () => {
  const text = 'Officials said the review would take several weeks, according to people familiar with it, and more would follow soon after.'
  for (let lines = 1; lines <= 4; lines++) assert.ok(!/[,;:\u2013\u2014-]\u2026$/.test(fitText(text, lines, countLines, 0)), String(lines))
})

test('a sentence that ends within a line or two of the end of the room is where the text stops, with no ellipsis', () => {
  const first = 'Uganda has begun withdrawing its troops from Somalia after nearly two decades of military involvement.'
  // Three lines for the first sentence; the room is four: the sentence is within the slack.
  const shown = fitText(STORY, countLines(first) + 1, countLines)
  assert.equal(shown, first)
  assert.ok(!shown.endsWith(ELLIPSIS))
})

test('a sentence further than that from the end of the room is not worth the gap it leaves: the text runs on to the last word that fits', () => {
  const first = 'Uganda has begun withdrawing its troops from Somalia after nearly two decades of military involvement.'
  const lines = countLines(first) + SENTENCE_SLACK_LINES + 3
  const shown = fitText(STORY, lines, countLines)
  assert.ok(shown.length > first.length)
  assert.ok(countLines(shown) <= lines)
  assert.ok(shown.endsWith(ELLIPSIS) || /[.!?]$/.test(shown))
})

const COURT = 'The Supreme Court on Monday (November 2, 2026) set aside an order of the Rajasthan State Election Commission (SEC) refusing permission to a civil society organisation to conduct voter awareness campaigns. ' +
  'Observing that voters\u2019 awareness initiatives by such organisations should be encouraged rather than restricted, a bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi and V Viswanathan said the order was unsustainable.'
const SHARES = 'IDBI Bank shares ended 2.1 per cent lower in Mumbai on Monday compared to a 1.7 per cent rise in the Sensex as staff began a two-day strike against the planned sale of the lender to a foreign investor.'

test('a cut after a word stops on one that says a thing, not on "and", "of the", an initial, a title or a number', () => {
  assert.ok(fitText(COURT, 11, countLines, 0).endsWith('Justices Joymalya Bagchi\u2026'), 'not "\u2026 Bagchi and V\u2026"')
  assert.ok(fitText(COURT, 12, countLines, 0).endsWith('and V Viswanathan said the order\u2026'), 'not "\u2026 the order was\u2026"')
  assert.ok(fitText(COURT, 7, countLines, 0).endsWith('awareness initiatives\u2026'), 'not "\u2026 initiatives by such\u2026"')
  assert.ok(fitText(COURT, 2, countLines, 0).endsWith('set aside an order\u2026'), 'not "\u2026 an order of the\u2026"')
  assert.ok(fitText(STORY, 8, countLines, 0).endsWith('will exit by the end\u2026'), 'not "\u2026 of 2027 in a\u2026"')
  assert.ok(fitText(SHARES, 2, countLines, 0).endsWith('Monday compared\u2026'), 'not "\u2026 compared to a\u2026"')
  assert.ok(fitText(SHARES, 4, countLines, 0).endsWith('a two-day strike\u2026'), 'not "\u2026 against the\u2026"')
})

test('whatever the room, a cut ends on a word that can end a text, and the text shown still fits', () => {
  const weak = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'from', 'as', 'that', 'was', 'is', 'v'])
  for (const text of [COURT, SHARES, STORY]) {
    for (let lines = 3; lines <= 12; lines++) {
      const shown = fitText(text, lines, countLines, 0)
      assert.ok(countLines(shown) <= lines, `${lines}: ${shown}`)
      if (!shown.endsWith(ELLIPSIS)) continue
      const last = shown.slice(0, -1).trim().split(' ').pop().replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
      assert.ok(!weak.has(last), `${lines}: ${shown}`)
    }
  }
})

test('a full stop after a title or an initial is not the end of a sentence', () => {
  const text = 'Dr. Rao said on Monday that M. K. Stalin would arrive at 4:30 p.m. in the U.S. capital with Mr. Singh and Prof. Das and others.'
  for (let lines = 1; lines <= 3; lines++) {
    const shown = fitText(text, lines, countLines)
    assert.ok(!/(Dr|Mr|Prof|K|U\.S|p\.m)\.$/.test(shown), `${lines}: ${shown}`)
  }
})

test('a closing quote after the full stop belongs to the sentence, and a Hindi sentence ends at its danda', () => {
  const quoted = 'He said \u201cnothing will change before the vote\u201d. The ministry has not said more on the matter since then, officials added.'
  const shown = fitText(quoted, 3, countLines)
  assert.ok(shown.startsWith('He said \u201cnothing will change before the vote\u201d.'), shown)
  const hindi = 'रविवार को दिल्ली में विपक्षी दलों के कई नेता जुटे। हज़ारों लोगों की भीड़ इकट्ठा हुई और नारे लगे। सरकार ने कोई बयान नहीं दिया।'
  const cut = fitText(hindi, 2, countLines)
  assert.ok(countLines(cut) <= 2)
  assert.ok(cut.endsWith('\u0964') || cut.endsWith(ELLIPSIS), cut)
})

test('whatever the room, the text shown fits it, and nothing is made up', () => {
  const words = 'the minister said on monday that the review of every district would take several weeks and that figures would be asked for first'.split(' ')
  let checked = 0
  for (let size = 5; size <= 60; size += 5) {
    const text = Array.from({ length: size }, (_, i) => `${words[i % words.length]}${i % 11 === 10 ? '.' : ''}`).join(' ')
    for (let lines = 1; lines <= 9; lines++) {
      const shown = fitText(text, lines, countLines)
      assert.ok(countLines(shown) <= lines, `${size}/${lines}: ${shown}`)
      assert.ok(text.startsWith(shown.replace(ELLIPSIS, '').trimEnd()), `${size}/${lines}: the start of the text`)
      checked++
    }
  }
  assert.ok(checked > 100)
  assert.equal(fitText(STORY, 0, countLines), '')
  // A word wider than the room: nothing but the ellipsis fits.
  assert.equal(fitText('Pneumonoultramicroscopicsilicovolcanoconiosis is long', 1, (text) => (text.length > 20 ? 2 : 1)), ELLIPSIS)
})
