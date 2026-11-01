import test from 'node:test'
import assert from 'node:assert/strict'
import { articleLead, leadFor, extendSummaries, forgetLeads, LEAD_MAX_CHARS, LEAD_BELOW_CHARS } from './lead.ts'

const SENTENCE = (n) => `Officials said on Sunday that the review of case number ${n} would take several weeks and that every district would be asked for figures.`
const page = (body, head = '') => `<!doctype html><html><head><title>x</title>${head}</head><body>${body}</body></html>`
const article = (...paragraphs) =>
  page(`<nav><p>Home. Sections. A long menu of things that looks like a sentence but belongs to the navigation of the site.</p></nav>
    <article><h1>The headline</h1>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</article>
    <footer><p>Copyright 2026 Example News. All rights reserved. Terms of use apply to everything on this site.</p></footer>`)
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

test("the opening of an article is its first paragraphs, from its article element, without the page's furniture", () => {
  const html = article(SENTENCE(1), SENTENCE(2))
  assert.equal(articleLead(html), `${SENTENCE(1)} ${SENTENCE(2)}`)
})

test('bylines, captions, offers and notices are not the story', () => {
  const html = article(
    'By Jane Doe',
    'Photo: A crowd gathers outside the court on Sunday morning, as the hearing began.',
    'Buy One Founder Summit Ticket, Get a Second for Free. Register now. The summit begins on Nov. 4 at nine.',
    "This article has been reviewed according to Science X's editorial process and policies. Editors have highlighted the following attributes.",
    'Also read: the minister said on Sunday that nothing would change before the elections.',
    'Subscribe to our newsletter to get the day’s top stories delivered to your inbox every morning.',
    SENTENCE(3),
  )
  assert.equal(articleLead(html), SENTENCE(3))
})

test('a sentence that merely begins with a word like source or image is kept', () => {
  const lead = 'Sources said the minister would resign on Monday, and that a successor had already been chosen by the party.'
  assert.equal(articleLead(article(lead)), lead)
  assert.equal(articleLead(article('Image recognition software used by the police was wrong in one case out of three, a study found.')),
    'Image recognition software used by the police was wrong in one case out of three, a study found.')
})

test("a page's structured body is used when it has one, and only the block that holds it is read", () => {
  const html = page('<p>Not this paragraph, which is long enough to be one, and which ends here.</p>',
    ld({ '@type': 'WebSite', name: 'x' }) + '<script type="application/ld+json">{ not json </script>' +
    ld({ '@graph': [{ '@type': 'Organization' }, { '@type': 'NewsArticle', articleBody: `${SENTENCE(1)}\n${SENTENCE(2)}` }] }))
  assert.equal(articleLead(html), `${SENTENCE(1)} ${SENTENCE(2)}`)
})

test('a body given as one run of text has a space put where a sentence ends', () => {
  const body = 'The minister called the demand a “separatist mindset”.Arjuna replied that the flag was only a symbol of the state.He added more later on.'
  assert.equal(articleLead(page('', ld({ '@type': 'NewsArticle', articleBody: body }))),
    'The minister called the demand a “separatist mindset”. Arjuna replied that the flag was only a symbol of the state. He added more later on.')
  // An abbreviation is left alone.
  assert.equal(articleLead(page('', ld({ '@type': 'NewsArticle', articleBody: 'The U.S.Army and the Ph.D. holders were at the meeting in Delhi on Sunday afternoon.' }))),
    'The U.S.Army and the Ph.D. holders were at the meeting in Delhi on Sunday afternoon.')
})

test('entities are decoded, and a link inside a sentence leaves no gap before the comma', () => {
  const html = article('In a recent <a href="/x">Nature Communications study</a>, researchers said it&#039;s &quot;new&quot; &amp; striking, as reported on Sunday.')
  assert.equal(articleLead(html), 'In a recent Nature Communications study, researchers said it\'s "new" & striking, as reported on Sunday.')
})

test('the opening is cut at a sentence when one ends far enough in, and is never longer than the limit', () => {
  const html = article(...Array.from({ length: 8 }, (_, i) => SENTENCE(i + 1)))
  const lead = articleLead(html)
  assert.ok([...lead].length <= LEAD_MAX_CHARS)
  assert.ok(lead.endsWith('.'), lead.slice(-30))
  assert.ok(lead.startsWith(SENTENCE(1)))
  assert.equal(articleLead(page('<p>Too short.</p>')), '')
  assert.equal(articleLead(''), '')
})

test('a Hindi page is read the same way, with a danda ending the sentence', () => {
  const para = 'रविवार को दिल्ली के रामलीला मैदान में विपक्षी दलों के कई बड़े नेता और हज़ारों लोगों की भीड़ इकट्ठा हुई।'
  assert.equal(articleLead(article(para)), para)
})

test('the text for a story is the opening without its headline, and only when it is clearly more than the feed gave', () => {
  const title = 'Officials review case number nine'
  const html = article(`${title}. ${SENTENCE(9)}`, SENTENCE(10))
  const text = leadFor(title, 'A short line from the feed.', html)
  assert.ok(text.startsWith(SENTENCE(9)), text)
  assert.ok(!text.includes('Officials review case number nine.'))
  // Not clearly more than the feed already gave.
  assert.equal(leadFor(title, `${SENTENCE(9)} ${SENTENCE(10)}`, html), '')
  // A page with nothing to say, or that says it about something else.
  assert.equal(leadFor(title, 'x', page('<p>Nothing here.</p>')), '')
  assert.equal(leadFor('Elephants cross the river', 'x', article('We use cookies to give you the best experience on this site, which is explained in the policy below.', SENTENCE(1))), '')
})

// ── The batch step
const story = (n, over = {}) => ({
  title: `Case number ${n} reviewed`, content: 'A short line.', url: `https://news.example/${n}`, source: 'The Daily', category: 'news', publishedAt: 1_000 + n, ...over,
})
const open = (n) => article(SENTENCE(n), SENTENCE(n + 100))

test('a news story with a short text gets its article opening, and keeps the text its id is made from', async () => {
  forgetLeads()
  const stories = [story(1)]
  assert.equal(await extendSummaries(stories, { readPage: async () => open(1) }), 1)
  assert.equal(stories[0].content, `${SENTENCE(1)} ${SENTENCE(101)}`)
  assert.equal(stories[0].lead, true)
  assert.equal(stories[0].idText, 'A short line.')
  // Extended again (a refresh that finds it in the memory), the id text is still the feed's own.
  assert.equal(await extendSummaries(stories, { readPage: async () => assert.fail('read again') }), 0)
  assert.equal(stories[0].idText, 'A short line.')
})

test('only news with a short text and a public address is read, the newest first, a page of one outlet at most', async () => {
  forgetLeads()
  const read = []
  const stories = [
    ...Array.from({ length: 9 }, (_, i) => story(i + 1)),
    story(20, { category: 'science' }),
    story(21, { content: SENTENCE(21).repeat(3).slice(0, LEAD_BELOW_CHARS + 10) }),
    story(22, { url: 'http://localhost:3000/x' }),
    story(23, { url: undefined }),
    story(24, { source: 'Other', publishedAt: 5 }),
  ]
  await extendSummaries(stories, { readPage: async (link) => { read.push(link); return open(Number(link.split('/').pop())) } })
  assert.deepEqual(read.sort(), ['https://news.example/4', 'https://news.example/5', 'https://news.example/6', 'https://news.example/7', 'https://news.example/8', 'https://news.example/9', 'https://news.example/24'].sort())
})

test("the same opening on different stories is the site's own text, and is not used", async () => {
  forgetLeads()
  const stories = [story(1), story(2), story(3)]
  const extended = await extendSummaries(stories, { readPage: async (link) => (link.endsWith('/3') ? open(3) : article(SENTENCE(50), SENTENCE(51))) })
  assert.equal(extended, 1)
  assert.equal(stories[0].lead, undefined)
  assert.equal(stories[1].lead, undefined)
  assert.equal(stories[2].lead, true)
})

test('what was found is kept, and "nothing there" is kept for a while too', async () => {
  forgetLeads()
  let reads = 0
  const make = () => [story(1)]
  assert.equal(await extendSummaries(make(), { readPage: async () => { reads++; return open(1) } }), 1)
  assert.equal(await extendSummaries(make(), { readPage: async () => { reads++; return open(1) } }), 1)
  assert.equal(reads, 1, 'the second refresh did not read the page again')
  forgetLeads()
  reads = 0
  const nothing = async () => { reads++; return page('<p>Nothing.</p>') }
  assert.equal(await extendSummaries(make(), { readPage: nothing }), 0)
  assert.equal(await extendSummaries(make(), { readPage: nothing }), 0)
  assert.equal(reads, 1)
  await extendSummaries(make(), { readPage: nothing, now: () => Date.now() + 31 * 60 * 1000 })
  assert.equal(reads, 2, 'looked at again after half an hour')
})

test('a page that fails, is slow, or is not read in time leaves its story as it was', async () => {
  forgetLeads()
  const stories = [story(1), story(2), story(3)]
  const extended = await extendSummaries(stories, {
    budgetMs: 1000,
    pageMs: 200,
    readPage: (link, signal) => {
      if (link.endsWith('/1')) throw new Error('refused')
      if (link.endsWith('/2')) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('slow'))))
      return Promise.resolve(open(3))
    },
  })
  assert.equal(extended, 1)
  assert.equal(stories[0].content, 'A short line.')
  assert.equal(stories[1].content, 'A short line.')
  assert.equal(stories[2].lead, true)
  // The outlet is left alone for ten minutes, and tried again after that.
  let retried = 0
  await extendSummaries([stories[0], stories[1]], { readPage: async () => { retried++; return page('') } })
  assert.equal(retried, 0, 'not at once')
  await extendSummaries([stories[0], stories[1]], { readPage: async () => { retried++; return page('') }, now: () => Date.now() + 11 * 60 * 1000 })
  assert.equal(retried, 2, 'but on a later refresh')
})

test('an outlet that refuses or hangs costs its wait once, and its other stories are left alone for a while', async () => {
  forgetLeads()
  let reads = 0
  const refused = async () => { reads++; throw new Error('refused: 403') }
  const mixed = () => [story(1, { source: 'Closed', url: 'https://closed.example/1' }), story(2, { source: 'Closed', url: 'https://closed.example/2' }), story(3, { url: 'https://open.example/3' })]
  const readPage = async (link) => (link.includes('closed.example') ? refused() : (reads++, open(3)))
  assert.equal(await extendSummaries(mixed(), { readPage }), 1)
  assert.equal(reads, 3, 'every page was tried the first time')
  reads = 0
  const again = mixed()
  assert.equal(await extendSummaries(again, { readPage }), 1, 'the open outlet is read again from memory')
  assert.equal(reads, 0, 'the closed outlet is not asked again, and the open one is remembered')
  assert.equal(again[0].content, 'A short line.')
})

test('no more pages than the limit are read in one go, too small a budget reads none, and it can be turned off', async () => {
  forgetLeads()
  let reads = 0
  const many = Array.from({ length: 12 }, (_, i) => story(i + 1, { source: `S${i}` }))
  await extendSummaries(many, { maxPages: 5, readPage: async () => { reads++; return page('') } })
  assert.equal(reads, 5)
  forgetLeads()
  reads = 0
  assert.equal(await extendSummaries(many, { budgetMs: 100, readPage: async () => { reads++; return open(1) } }), 0)
  assert.equal(reads, 0)
  process.env.PLAX_ARTICLE_LEADS = 'off'
  try {
    assert.equal(await extendSummaries(many, { readPage: async () => { reads++; return open(1) } }), 0)
    assert.equal(reads, 0)
  } finally {
    delete process.env.PLAX_ARTICLE_LEADS
  }
})
