import test from 'node:test'
import assert from 'node:assert/strict'
import { articleLead, leadFor, leadFrom, extendSummaries, forgetLeads, stripDateline, NoPage, LEAD_MAX_CHARS, LEAD_BELOW_CHARS } from './lead.ts'

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

test('only news with a short text or no picture, and a public address, is read: the newest first, a page of one outlet at most', async () => {
  forgetLeads()
  const read = []
  const stories = [
    ...Array.from({ length: 9 }, (_, i) => story(i + 1)),
    story(20, { category: 'science' }),
    // Full and with a picture: nothing to give, though it keeps its place among the outlet's six.
    story(21, { content: SENTENCE(21).repeat(3).slice(0, LEAD_BELOW_CHARS + 10), image: 'https://news.example/21.jpg' }),
    story(22, { url: 'http://localhost:3000/x' }),
    story(23, { url: undefined }),
    story(24, { source: 'Other', publishedAt: 5 }),
  ]
  await extendSummaries(stories, { readPage: async (link) => { read.push(link); return open(Number(link.split('/').pop())) } })
  assert.deepEqual(read.sort(), ['https://news.example/7', 'https://news.example/8', 'https://news.example/9', 'https://news.example/24'].sort())
})

test('the stories of one outlet are not all asked for together: the pages being read are of different sites in turn', async () => {
  forgetLeads()
  const read = []
  const stories = [
    story(1, { source: 'A', url: 'https://a.example/1' }),
    story(2, { source: 'A', url: 'https://a.example/2' }),
    story(3, { source: 'B', url: 'https://b.example/3' }),
    story(4, { source: 'B', url: 'https://b.example/4' }),
  ]
  await extendSummaries(stories, { concurrency: 1, readPage: async (link) => { read.push(link); return page('') } })
  assert.deepEqual(read, ['https://b.example/4', 'https://a.example/2', 'https://b.example/3', 'https://a.example/1'])
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

// ── What is not the story's words
const STORY = [
  'The Centre has notified rules for grievance redressal under the new employment law, mandating that complaints be resolved within fifteen days.',
  'State governments will have to set up a three-tier mechanism at the gram panchayat, block and district levels, the Ministry said on Monday.',
  'The rules provide for designated officers at each level to receive, register, enquire into and dispose of complaints from workers.',
  'Workers who are not satisfied may escalate the matter to the next level if it remains pending beyond the prescribed period of time.',
]
const withHead = (head, ...paragraphs) => page(`<article>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</article>`, head)

test('the line that says where a story was written is taken off the front', () => {
  const body = 'Tata Trusts board member Darius Khambata has alleged that directors of Tata Sons sullied the image of the company.'
  for (const written of [
    'Mumbai: ', 'MUMBAI: ', 'Mumbai - ', '( for web) Our Bureau Mumbai:  ', 'Hyderabad, Nov 2: ', 'New Delhi, Nov 2 (PTI) ', 'LONDON (Reuters) - ',
    'KOCHI ', 'New Delhi ', 'CHENNAI ', 'PUDUKOTTAI ', 'KOTTAYAM ',
  ]) assert.equal(stripDateline(written + body), body, written)
  // What only looks like one is kept: a name, a country's possessive, an acronym, a plain first word.
  for (const kept of [
    'Hemanth, the 21-year-old accused in the chainsaw attack, was related to the minor victim, sources told India Today.',
    "Tamil Nadu's economic performance under the new government has come under attack from the opposition on Monday.",
    'NASA scientists said on Monday that the cluster is among the oldest known stellar remnants in the galaxy.',
    'UNICEF Executive Director Catherine Russell said on Monday that children in the region are at risk of famine.',
    'Sources said the minister would resign on Monday, and that a successor had already been chosen by the party.',
  ]) assert.equal(stripDateline(kept), kept)
})

test("another story linked inside a structured body, a widget's counter or a sentence given twice send the reading to the markup", () => {
  const markup = [STORY[0], STORY[1], STORY[2]]
  const wanted = markup.join(' ')
  const linked = ld({ '@type': 'NewsArticle', articleBody: `${STORY[0]} https://news.example/related Cutting off a rural lifeline ${STORY[1]}` })
  assert.equal(articleLead(page(`<article>${markup.map((p) => `<p>${p}</p>`).join('')}</article>`, linked)), wanted)
  const counted = ld({ '@type': 'NewsArticle', articleBody: `${STORY[0]} Cutting off a rural lifeline opinion 1 ${STORY[1]}` })
  assert.equal(articleLead(page(`<article>${markup.map((p) => `<p>${p}</p>`).join('')}</article>`, counted)), wanted)
  const twice = ld({ '@type': 'NewsArticle', articleBody: `${STORY[0]} ${STORY[1]} ${STORY[1]}` })
  assert.equal(articleLead(page(`<article>${markup.map((p) => `<p>${p}</p>`).join('')}</article>`, twice)), wanted)
  // With no markup to read, the structured body is cut where the furniture begins, at a sentence.
  assert.equal(articleLead(page('', linked)), STORY[0])
  assert.equal(articleLead(page('', counted)), STORY[0])
})

test('a web address is never in the text, and a clean structured body is used as it is', () => {
  const clean = ld({ '@type': 'NewsArticle', articleBody: `${STORY.join('\n')}\n${STORY[0].replace('Centre', 'Union Government')}` })
  const lead = articleLead(page('', clean))
  assert.ok(!/https?:|www\./.test(lead))
  assert.ok(lead.startsWith(STORY[0]))
})

test('the day\'s running updates and a list of names are not a story a card can sum up', () => {
  const title = 'Q2 Results Today Live: Marico and Petronet profit surge'
  const live = 'Q2 Results Today, 02nd November 2026 Live Updates: Find all the latest Q2 results 2026 updates of Aadhaar Ventures India, Aelea Commodities, Amir Chand Jagdish Kumar, Akums Drugs and Pharmaceuticals, Alankit, Alacrity Securities, Advance Metering Technology, Amara Raja Energy, Arvind Fashions, Add-Shop ERetail.'
  assert.equal(leadFrom(title, 'x', live), '')
  const names = 'The Q2 results of Aadhaar Ventures India, Aelea Commodities, Amir Chand Jagdish Kumar, Akums Drugs, Alankit, Alacrity Securities, Advance Metering, Amara Raja Energy, Arvind Fashions, Add-Shop ERetail, Atharva Poly-Plast, Avonmore Capital'
  assert.equal(leadFrom(title, 'x', names), '')
  assert.ok(leadFrom('Officials review case number nine', 'x', `${SENTENCE(9)} ${STORY[0]}`).startsWith('Officials said'))
})

// ── The picture of a story that has none
const OG = (address) => `<meta property="og:image" content="${address}">`
const opening = (n, head) => withHead(head, SENTENCE(n), STORY[n % 4])

test('a story with no picture gets the one its page names, as an https address; one that has a picture keeps it', async () => {
  forgetLeads()
  const stories = [story(1), story(2, { image: 'https://cdn.example/own.jpg' }), story(3, { url: 'https://other.example/3', source: 'Other' })]
  const heads = { 1: OG('/img/one.jpg?w=1200&amp;h=675'), 2: OG('https://cdn.example/page-says.jpg'), 3: OG('http://cdn.example/three.jpg') }
  const extended = await extendSummaries(stories, { readPage: async (link) => opening(Number(link.split('/').pop()), heads[link.split('/').pop()]) })
  assert.equal(extended, 3)
  assert.equal(stories[0].image, 'https://news.example/img/one.jpg?w=1200&h=675')
  assert.equal(stories[1].image, 'https://cdn.example/own.jpg')
  assert.equal(stories[2].image, 'https://cdn.example/three.jpg')
})

test('a full story with no picture is read for the picture only, and its text stays as it is', async () => {
  forgetLeads()
  const full = SENTENCE(1).repeat(3).slice(0, LEAD_BELOW_CHARS + 20)
  const stories = [story(1, { content: full })]
  const extended = await extendSummaries(stories, { readPage: async () => opening(1, OG('https://cdn.example/one.jpg')) })
  assert.equal(extended, 0)
  assert.equal(stories[0].content, full)
  assert.equal(stories[0].lead, undefined)
  assert.equal(stories[0].image, 'https://cdn.example/one.jpg')
})

test('a logo, an icon, a stand-in or a banner shared by several stories is not the story\'s picture', async () => {
  forgetLeads()
  const stories = [story(1), story(2), story(3), story(4), story(5), story(6)]
  const heads = {
    1: OG('https://cdn.example/assets/logo.png'),
    2: OG('https://cdn.example/icons/site.svg'),
    3: OG('https://cdn.example/default-image.jpg'),
    4: OG('https://cdn.example/banner.jpg'),
    5: OG('https://cdn.example/banner.jpg'),
    6: OG('https://cdn.example/banner.jpg'),
  }
  await extendSummaries(stories, { readPage: async (link) => opening(Number(link.split('/').pop()), heads[link.split('/').pop()]) })
  assert.deepEqual(stories.map((s) => s.image), [undefined, undefined, undefined, undefined, undefined, undefined])
  // Two stories of one event may share a photograph.
  forgetLeads()
  const pair = [story(1), story(2)]
  await extendSummaries(pair, { readPage: async (link) => opening(Number(link.split('/').pop()), OG('https://cdn.example/event.jpg')) })
  assert.deepEqual(pair.map((s) => s.image), ['https://cdn.example/event.jpg', 'https://cdn.example/event.jpg'])
})

test('a reader that remembers across requests can say that a page gave nothing, and what it says is used', async () => {
  forgetLeads()
  const stories = [story(1), story(2)]
  const reported = []
  const extended = await extendSummaries(stories, {
    report: (report) => reported.push(report),
    readInfo: async (link) => {
      if (link.endsWith('/2')) throw new NoPage()
      return { lead: `${SENTENCE(1)} ${STORY[0]}`, image: 'https://cdn.example/one.jpg' }
    },
  })
  assert.equal(extended, 1)
  assert.equal(stories[0].lead, true)
  assert.equal(stories[0].image, 'https://cdn.example/one.jpg')
  assert.equal(stories[1].lead, undefined)
  assert.deepEqual(reported, [{ read: 1, texts: 1, pictures: 1, failed: [] }])
})
