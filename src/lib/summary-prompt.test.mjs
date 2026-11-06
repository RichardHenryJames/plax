import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildPrompt, topicGuidance, wantsShortBrief } from './summary-prompt.ts'

const here = (path) => new URL(path, import.meta.url)
const CATEGORIES = ['news', 'science', 'physics', 'space', 'health', 'nature', 'books', 'philosophy', 'psychology', 'finance', 'business', 'history', 'technology', '']

test('only the website\'s news card asks for the short brief', () => {
  assert.equal(wantsShortBrief('news', true), true)
  // The on-demand brief that versions of the app before Go deeper ask for sends no flag, and the flag must be the boolean itself.
  assert.equal(wantsShortBrief('news', undefined), false)
  assert.equal(wantsShortBrief('news', false), false)
  assert.equal(wantsShortBrief('news', 'true'), false)
  assert.equal(wantsShortBrief('news', 1), false)
  // Every other topic is a micro-essay by design.
  for (const category of CATEGORIES.filter((c) => c !== 'news')) assert.equal(wantsShortBrief(category, true), false, category)
})

test('the short news brief fills a card, the usual brief and the one older apps ask for are unchanged', () => {
  assert.match(topicGuidance('news', true).words, /^55–85 words/)
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
  assert.doesNotMatch(usual, /55–85/)
  assert.match(brief, /- 55–85 words in one or two tight paragraphs/)
  assert.doesNotMatch(brief, /70–110/)
  // Written straight in Hindi from a Hindi source: the language rule stays and the range follows the flag.
  const hindi = buildPrompt('news', source, 'microessay', 'Hindi (Devanagari script)', true)
  assert.match(hindi, /entirely in Hindi \(Devanagari script\)/)
  assert.match(hindi, /55–85 words/)
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
  assert.match(route, /cacheKey\('summarize', shortBrief \? 'v3-brief' : 'v2'/)
  // Both prompts (the Hindi direct one and the English one) follow the flag.
  assert.match(route, /buildPrompt\(category, content, type, 'Hindi \(Devanagari script\)', shortBrief\)/)
  assert.match(route, /buildPrompt\(category, content, type, undefined, shortBrief\)/)
})

test('the website asks for a card\'s text with the card flag, and the app no longer asks for a brief at all', () => {
  const feed = fs.readFileSync(here('../components/Feed.tsx'), 'utf8')
  const requests = feed.match(/JSON\.stringify\(\{ content: baseContent[^}]*\}\)/g) ?? []
  // enhanceCard and prewarmOppositeLang: the warm-up must hit the same cache entry as the card that is shown later.
  assert.equal(requests.length, 2)
  for (const request of requests) assert.match(request, /card: true/)
  // The app has Go deeper, not an AI brief: it asks /api/deeper, and nothing in it asks /api/summarize (older installed apps still do,
  // which is why the route keeps the longer form for a request without the flag).
  const folder = here('../../mobile/src/')
  const sources = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
  const files = sources(folder)
  assert.ok(files.some((path) => path.pathname.endsWith('/deeper-api.ts')))
  for (const path of files) assert.doesNotMatch(fs.readFileSync(path, 'utf8'), /api\/summarize/, `${path.pathname} must not ask for a brief`)
  assert.match(fs.readFileSync(new URL('data/deeper-api.ts', folder), 'utf8'), /\/api\/deeper/)
})
