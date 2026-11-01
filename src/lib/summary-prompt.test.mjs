import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildPrompt, topicGuidance, wantsShortBrief } from './summary-prompt.ts'

const here = (path) => new URL(path, import.meta.url)
const CATEGORIES = ['news', 'science', 'physics', 'space', 'health', 'nature', 'books', 'philosophy', 'psychology', 'finance', 'business', 'history', 'technology', '']

test('only the website\'s news card asks for the short brief', () => {
  assert.equal(wantsShortBrief('news', true), true)
  // The app's on-demand AI brief sends no flag, and the flag must be the boolean itself.
  assert.equal(wantsShortBrief('news', undefined), false)
  assert.equal(wantsShortBrief('news', false), false)
  assert.equal(wantsShortBrief('news', 'true'), false)
  assert.equal(wantsShortBrief('news', 1), false)
  // Every other topic is a micro-essay by design.
  for (const category of CATEGORIES.filter((c) => c !== 'news')) assert.equal(wantsShortBrief(category, true), false, category)
})

test('the short news brief is a few lines, the usual brief and the app\'s are unchanged', () => {
  assert.match(topicGuidance('news', true).words, /^35–60 words/)
  assert.match(topicGuidance('news', true).words, /never pad a thin source/)
  assert.equal(topicGuidance('news').words, '70–110 words, 2–3 tight paragraphs')
  assert.equal(topicGuidance('news', false).words, '70–110 words, 2–3 tight paragraphs')
})

test('no other topic changes with the flag', () => {
  for (const category of CATEGORIES.filter((c) => c !== 'news')) {
    assert.deepEqual(topicGuidance(category, true), topicGuidance(category, false), category)
  }
})

test('the prompt carries the range that was asked for, in either language', () => {
  const source = 'The minister said the reservoir level will rise to 152 metres, doubling storage.'
  const usual = buildPrompt('news', source, 'microessay')
  const brief = buildPrompt('news', source, 'microessay', undefined, true)
  assert.match(usual, /- 70–110 words, 2–3 tight paragraphs\./)
  assert.doesNotMatch(usual, /35–60/)
  assert.match(brief, /- 35–60 words in one or two tight paragraphs\./)
  assert.doesNotMatch(brief, /70–110/)
  // Written straight in Hindi from a Hindi source: the language rule stays and the range follows the flag.
  const hindi = buildPrompt('news', source, 'microessay', 'Hindi (Devanagari script)', true)
  assert.match(hindi, /entirely in Hindi \(Devanagari script\)/)
  assert.match(hindi, /35–60 words/)
  // What the model is told about faithfulness and format does not depend on the flag.
  for (const prompt of [usual, brief, hindi]) {
    assert.match(prompt, /STAY FAITHFUL to the source/)
    assert.match(prompt, /Respond with JSON only/)
    assert.ok(prompt.includes(source))
  }
})

test('the route sends the flag only through wantsShortBrief and keeps its own cache version for the short brief', () => {
  const route = fs.readFileSync(here('../app/api/summarize/route.ts'), 'utf8')
  assert.match(route, /const shortBrief = wantsShortBrief\(category, card\)/)
  assert.match(route, /cacheKey\('summarize', shortBrief \? 'v2-brief' : 'v2'/)
  // Both prompts (the Hindi direct one and the English one) follow the flag.
  assert.match(route, /buildPrompt\(category, content, type, 'Hindi \(Devanagari script\)', shortBrief\)/)
  assert.match(route, /buildPrompt\(category, content, type, undefined, shortBrief\)/)
})

test('the website asks for a card\'s text, the app\'s brief does not', () => {
  const feed = fs.readFileSync(here('../components/Feed.tsx'), 'utf8')
  const requests = feed.match(/JSON\.stringify\(\{ content: baseContent[^}]*\}\)/g) ?? []
  // enhanceCard and prewarmOppositeLang: the warm-up must hit the same cache entry as the card that is shown later.
  assert.equal(requests.length, 2)
  for (const request of requests) assert.match(request, /card: true/)
  const brief = fs.readFileSync(here('../../android/app/src/main/java/com/plaxlabs/news/BriefApi.java'), 'utf8')
  assert.doesNotMatch(brief, /"card"/)
})
