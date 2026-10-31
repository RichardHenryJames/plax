import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeEntities, pageDescription, shortSummary, summaryFromPage, isPublicWebUrl, fillMissingSummaries, forgetSummaries, MAX_SUMMARY_CHARS,
} from './blurb.ts'

// The page of an article, as a link preview reads it.
const page = (head, body = '<p>The article.</p>') => `<!doctype html><html><head><title>x</title>${head}</head><body>${body}</body></html>`
const og = (text) => `<meta property="og:description" content="${text}">`

test('the entities a meta tag holds are turned into what they stand for', () => {
  assert.equal(decodeEntities('Kharge&#x27;s residence &amp; the CEC &#39;impeachment&#39;'), "Kharge's residence & the CEC 'impeachment'")
  assert.equal(decodeEntities('&ldquo;Quoted&rdquo; &mdash; &hellip;'), '\u201cQuoted\u201d \u2014 \u2026')
  assert.equal(decodeEntities('&#8377;174 cr'), '\u20b9174 cr')
  assert.equal(decodeEntities('&#1114112; &#0; &unknownentity;'), '  &unknownentity;', 'a number that is no character is dropped, a name not known is left')
})

test("a page's own description is read: og:description first, then twitter, then the plain one", () => {
  const all = page(`<meta name="description" content="plain"><meta name="twitter:description" content="twitter">${og('open graph')}`)
  assert.equal(pageDescription(all), 'open graph')
  assert.equal(pageDescription(page('<meta name="description" content="plain"><meta name="twitter:description" content="twitter">')), 'twitter')
  assert.equal(pageDescription(page('<meta name="description" content="plain">')), 'plain')
  assert.equal(pageDescription(page('<meta name="viewport" content="width=device-width">')), '')
})

test('the attributes may come in any order, in either kind of quote, and the text is tidied', () => {
  assert.equal(pageDescription(page(`<meta content='  Two   spaces,\n a line break &amp; <b>a tag</b>  ' property='og:description'/>`)), 'Two spaces, a line break & a tag')
  assert.equal(pageDescription(page('<META CONTENT="upper" PROPERTY="OG:DESCRIPTION">')), 'upper')
})

test('only the head of the page is read', () => {
  assert.equal(pageDescription(`<html><head></head><body>${og('in the body')}</body></html>`), '')
  assert.equal(pageDescription(`<meta property="og:description" content="no head at all">`), 'no head at all')
})

test('a long description ends at a sentence when one ends far enough in, else at a word', () => {
  const sentence = 'The opposition alliance staged a mock parliament session. '
  const long = sentence.repeat(10)
  const cut = shortSummary(long.trim())
  assert.ok(cut.length <= MAX_SUMMARY_CHARS)
  assert.ok(cut.endsWith('session.'), cut)
  const noEnd = 'word '.repeat(100).trim()
  const words = shortSummary(noEnd)
  assert.ok(words.endsWith('\u2026') && words.length <= MAX_SUMMARY_CHARS + 1)
  assert.ok(!/\s\u2026$/.test(words), 'no space before the ellipsis')
  assert.equal(shortSummary('Short enough.'), 'Short enough.')
  const hindi = 'यह एक छोटी सी ख़बर है। '.repeat(30).trim()
  assert.ok(shortSummary(hindi).endsWith('\u0964'), 'a danda ends a Hindi sentence')
})

test('the summary of a page is what stands under the headline', () => {
  const description = 'Leaders of the opposition INDIA bloc staged a mock parliament session, tabling a resolution for the public impeachment of the Chief Election Commissioner.'
  assert.equal(summaryFromPage('INDIA Bloc Holds Symbolic Impeachment of CEC Gyanesh Kumar', page(og(description))), description)
  assert.equal(summaryFromPage('Protests spread across the capital', page(og('A protest march against the new rules reached the capital on Saturday, and talks begin on Monday.'))).slice(0, 9), 'A protest', 'protest and protests are one word')
})

test('a description that is the headline again, or too short, or from another subject, is not a summary', () => {
  const title = 'Sambit Patra slams Congress over ECI claims on voter lists'
  assert.equal(summaryFromPage(title, page(og(title))), '', 'the headline again')
  assert.equal(summaryFromPage(title, page(og('Sambit Patra on voter lists.'))), '', 'too short to be a summary')
  assert.equal(summaryFromPage(title, page(og('Latest news, breaking news, videos and live updates from India and the world.'))), '', "a site's tagline")
  assert.equal(summaryFromPage(title, page('')), '', 'no description at all')
  assert.equal(
    summaryFromPage('Markets rally', page(og('Markets rally: banks led the gains on Friday as all sectoral indices turned green.'))),
    'banks led the gains on Friday as all sectoral indices turned green.',
    'a description that begins with the headline loses it'
  )
})

test('only a public web page is ever read', () => {
  assert.ok(isPublicWebUrl('https://www.thehindu.com/news/national/article1.ece'))
  assert.ok(isPublicWebUrl('http://example.org/a'))
  for (const bad of [
    'ftp://example.org/a', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '',
    'http://localhost/a', 'http://127.0.0.1/a', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/a',
    'https://intranet/a', 'https://printer.local/a', 'https://db.internal/a', 'https://example.org:8443/a', 'https://user:pass@example.org/a',
  ]) assert.equal(isPublicWebUrl(bad), false, bad)
})

const story = (title, content, url) => ({ title, content, url })
const describing = (text) => async () => page(og(text))

test('only a story whose text repeats its headline gets a summary, and it is read from its page', async () => {
  forgetSummaries()
  const asked = []
  const stories = [
    story('Opposition levels treason allegations against poll body chief', 'Opposition levels treason allegations against poll body chief', 'https://a.example.com/1'),
    story('Fire breaks out in a bus in Koramangala', 'A preliminary inspection indicated that an electrical short circuit could have triggered the fire.', 'https://a.example.com/2'),
    story('No link story here at all', 'No link story here at all', undefined),
  ]
  const filled = await fillMissingSummaries(stories, {
    readPage: async (link) => {
      asked.push(link)
      return page(og('Leaders of the opposition alliance accused the poll body chief of treason, a charge the commission has rejected.'))
    },
  })
  assert.equal(filled, 1)
  assert.deepEqual(asked, ['https://a.example.com/1'], 'a story with a text, or with no link, is not looked up')
  assert.equal(stories[0].content, 'Leaders of the opposition alliance accused the poll body chief of treason, a charge the commission has rejected.')
  assert.equal(stories[1].content, 'A preliminary inspection indicated that an electrical short circuit could have triggered the fire.')
  assert.equal(stories[2].content, 'No link story here at all')
})

test('what was found is kept, so the next refresh does not read the page again, and "nothing there" is kept for a while too', async () => {
  forgetSummaries()
  let reads = 0
  const readPage = async () => {
    reads++
    return page(og('Government welfare initiatives and self-help groups are enabling women to become financially self-reliant.'))
  }
  const make = () => [story('Women turn entrepreneurs with self-help groups', 'Women turn entrepreneurs with self-help groups', 'https://a.example.com/3')]
  assert.equal(await fillMissingSummaries(make(), { readPage }), 1)
  const again = make()
  assert.equal(await fillMissingSummaries(again, { readPage }), 1)
  assert.equal(reads, 1, 'the second time it came from memory')
  assert.match(again[0].content, /self-help groups/)

  forgetSummaries()
  let empty = 0
  const nothing = async () => { empty++; return page('') }
  const bare = () => [story('A headline with nothing under it', 'A headline with nothing under it', 'https://a.example.com/4')]
  assert.equal(await fillMissingSummaries(bare(), { readPage: nothing }), 0)
  assert.equal(await fillMissingSummaries(bare(), { readPage: nothing }), 0)
  assert.equal(empty, 1, 'a page with nothing is not asked again at once')
  let later = 0
  await fillMissingSummaries(bare(), { readPage: async () => { later++; return page('') }, now: () => Date.now() + 31 * 60 * 1000 })
  assert.equal(later, 1, 'but is, after half an hour')
})

test("the same text on different stories is a site's own description, and is not used", async () => {
  forgetSummaries()
  const stories = [
    story('First story about the budget session', 'First story about the budget session', 'https://b.example.com/1'),
    story('Second story about the budget session', 'Second story about the budget session', 'https://b.example.com/2'),
    story('Third story about the budget session', 'Third story about the budget session', 'https://b.example.com/3'),
  ]
  const answers = {
    'https://b.example.com/1': 'The budget session of Parliament begins on Monday, with the finance bill listed first.',
    'https://b.example.com/2': 'The budget session of Parliament begins on Monday, with the finance bill listed first.',
    'https://b.example.com/3': 'Opposition leaders said the budget session should open with a debate on the budget itself.',
  }
  const filled = await fillMissingSummaries(stories, { readPage: async (link) => page(og(answers[link])) })
  assert.equal(filled, 1)
  assert.equal(stories[0].content, stories[0].title)
  assert.equal(stories[1].content, stories[1].title)
  assert.match(stories[2].content, /^Opposition leaders/)
})

test('a page that fails, is slow, or is not read in time leaves its story as it was', async () => {
  forgetSummaries()
  const stories = [
    story('Broken page story about the monsoon rains', 'Broken page story about the monsoon rains', 'https://c.example.com/1'),
    story('Slow page story about the monsoon rains', 'Slow page story about the monsoon rains', 'https://c.example.com/2'),
    story('Good page story about the monsoon rains', 'Good page story about the monsoon rains', 'https://c.example.com/3'),
  ]
  const started = Date.now()
  const filled = await fillMissingSummaries(stories, {
    budgetMs: 600,
    pageMs: 5000,
    readPage: (link, signal) => {
      if (link.endsWith('/1')) return Promise.reject(new Error('refused'))
      if (link.endsWith('/2')) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
      return Promise.resolve(page(og('Heavy monsoon rains are expected over the coast through the week, the weather office said on Saturday.')))
    },
  })
  assert.ok(Date.now() - started < 3000, 'the budget ends the wait')
  assert.equal(filled, 1)
  assert.equal(stories[0].content, stories[0].title)
  assert.equal(stories[1].content, stories[1].title)
  assert.match(stories[2].content, /monsoon rains/)
  // What was not read is not remembered as "nothing there": it is tried again.
  let retried = 0
  await fillMissingSummaries([stories[0], stories[1]], { readPage: async () => { retried++; return page('') } })
  assert.equal(retried, 2)
})

test('no more pages than the limit are read in one go, and too small a budget reads none', async () => {
  forgetSummaries()
  const many = Array.from({ length: 20 }, (_, i) => story(`Story number ${i} about the weather office`, `Story number ${i} about the weather office`, `https://d.example.com/${i}`))
  let reads = 0
  await fillMissingSummaries(many, { maxPages: 5, readPage: async () => { reads++; return page('') } })
  assert.equal(reads, 5)
  reads = 0
  assert.equal(await fillMissingSummaries(many, { budgetMs: 100, readPage: async () => { reads++; return page('') } }), 0)
  assert.equal(reads, 0)
})

test('a story that links to a private address is never fetched', async () => {
  forgetSummaries()
  let reads = 0
  const stories = [story('Headline of a story to a private address', 'Headline of a story to a private address', 'http://169.254.169.254/latest/meta-data')]
  assert.equal(await fillMissingSummaries(stories, { readPage: async () => { reads++; return '' } }), 0)
  assert.equal(reads, 0)
})
