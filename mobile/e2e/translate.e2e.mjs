// Reading in Hindi a topic the feed of Hindi has only in English (Stocks, Books): the page was a Hindi menu and tag over an English story. The app
// now translates such stories as the website does, shows a placeholder meanwhile, and leaves everything that is already in Hindi, and all of
// English, as it was.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { d, mkdirShots, openWorld } from './lib/app.mjs'
import { hindiTranslation } from './lib/fixtures.mjs'
import { pageView, problemsOf } from './lib/fit.mjs'

let world
before(async () => {
  mkdirShots()
  world = await openWorld()
  world.phone({})
})
after(async () => world?.close())

const DEVANAGARI = /[\u0900-\u097f]/
const text = (node) => (node ? node.text || node.desc : '')
const translations = () => world.asked('/news/api/summarize').map((entry) => ({ ...entry, sent: JSON.parse(entry.body) }))

/**
 * What the app sent for the story whose translation is on the page in view. The requests are logged in the order they reached the server, which is
 * not the order they were sent in (three go out together), so the story is found by its words: the mock gives the same Hindi for the same request,
 * and the one request that made the headline and the start of the summary on the page is the story's.
 */
function sentForPageInView() {
  const headline = world.headline()
  const summary = text(world.story().body)
  const entry = translations().find((candidate) => {
    const expected = hindiTranslation(candidate.sent)
    return expected.title === headline && summary.startsWith(expected.content.replace(/\*\*/g, '').slice(0, 12))
  })
  assert.ok(entry, `a request that the page in view is the translation of (${headline})`)
  return entry.sent
}

/** In English, on Stocks: the topic the feed of Hindi has no stories of its own for. */
async function onStocksInEnglish() {
  await world.fresh()
  await world.choose('menu-topics')
  await world.until('Follow your curiosity.')
  await world.press('Stocks')
  await world.untilStory()
  assert.doesNotMatch(world.headline(), DEVANAGARI, 'English to begin with')
}

describe('Stocks read in Hindi', () => {
  it('shows a placeholder where the story will be, none of the English, and then the story in Hindi, with its tag in Hindi', async () => {
    await onStocksInEnglish()
    world.server.setSummarize({ delayMs: 6000 })
    world.server.clearLog()
    await world.choose('menu-language-hi')
    const placeholder = await world.untilInView('translating', { timeout: 40_000 })
    assert.match(placeholder.desc, /अनुवाद हो रहा है/, 'it says what it is doing, in Hindi')
    world.shot('translating')
    assert.equal(world.inView('headline'), undefined, 'no headline of an English story is on the page meanwhile')
    assert.doesNotMatch(world.words().join(' '), /Analysts said|The court said|Prices rose|Opposition leaders/, 'nor any of its words')
    world.server.setSummarize({ delayMs: 0 })

    await world.untilStory(60_000)
    world.shot('translated')
    const story = world.story()
    assert.match(text(story.headline), DEVANAGARI, 'the headline is in Hindi')
    assert.match(text(story.body), DEVANAGARI, 'and the summary')
    assert.doesNotMatch(text(story.body), /\*/, 'with none of the Markdown emphasis the AI draft has')
    assert.match(text(story.tag), /शेयर बाज़ार/, 'under the topic’s own name in Hindi')
    assert.equal(world.inView('translating'), undefined)
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })

  it('asks the website the way the website asks itself, with the story’s English text and nothing that says who the reader is', async () => {
    const [first] = translations()
    assert.ok(first, 'a translation was asked for')
    assert.equal(first.method, 'POST')
    assert.deepEqual(Object.keys(first.sent).sort(), ['card', 'category', 'content', 'lang', 'title', 'type'])
    assert.equal(first.sent.lang, 'hi')
    assert.equal(first.sent.card, true)
    assert.equal(first.sent.type, 'microessay')
    assert.equal(first.sent.category, 'stocks')
    assert.doesNotMatch(first.sent.title + first.sent.content, DEVANAGARI, 'it is the English that is sent')
    assert.equal(first.headers.cookie, undefined)
    // The story in view, and the four after it (the website looks four ahead too), so that the next stories are ready when the reader gets to them.
    await d.waitFor(() => translations().length >= 5, { timeout: 40_000, label: 'the stories ahead to be asked for' })
    assert.equal(new Set(translations().slice(0, 5).map((entry) => entry.sent.title)).size, 5, 'five different stories')
  })

  it('shows the page of a translated story as it shows any other: all of it in view, nothing cut off or overlapping', async () => {
    let nodes = await world.settle()
    for (let page = 0; page < 3; page += 1) {
      const title = pageView(nodes).pick('headline')
      assert.ok(title, `page ${page} has its headline`)
      assert.deepEqual(problemsOf(nodes), [], `page ${page}`)
      if (page < 2) nodes = await world.swipe('up', { timeout: 40_000 })
    }
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })

  it('has the translation of the next story ready by the time the reader swipes to it', async () => {
    const before = world.headline()
    await d.waitFor(() => translations().length >= 5, { timeout: 40_000, label: 'the stories ahead to be asked for' })
    await d.sleep(8000)
    const nodes = await world.swipe('up', { timeout: 40_000 })
    const title = text(pageView(nodes).pick('headline'))
    assert.match(title, DEVANAGARI)
    assert.notEqual(title, before)
  })
})

describe('what a translated story is, to the buttons and to what is kept', () => {
  it('saves the story the feed gave, not its translation: in English it is the English story, and in Hindi it is shown translated', async () => {
    await onStocksInEnglish()
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilStory(60_000)
    const sent = sentForPageInView()
    await world.press({ id: 'save' })
    await world.choose('menu-saved')
    await world.untilStory(40_000)
    assert.match(world.headline(), DEVANAGARI, 'in Hindi the saved story is shown translated')
    await world.choose('menu-language-en')
    await world.choose('menu-saved')
    await world.untilStory(40_000)
    assert.equal(world.headline(), sent.title, 'in English it is the feed’s own story, as it was saved')
  })

  it('shares the story the feed gave: the page the website makes for it is made from the English the feed had, with its signature', async () => {
    await onStocksInEnglish()
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilStory(60_000)
    const sent = sentForPageInView()
    await world.press({ id: 'share' })
    await d.waitFor(() => /Chooser|Resolver|Sharesheet|intentresolver/i.test(d.focus()), { timeout: 20_000, label: 'the share sheet' })
    d.back()
    await world.backInApp()
    const shares = world.asked('/news/api/share')
    assert.equal(shares.length, 1)
    const body = JSON.parse(shares[0].body)
    assert.equal(body.title, sent.title, 'the headline sent is the English one')
    assert.equal(body.content, sent.content, 'and the text')
    assert.match(body.sig, /^[0-9a-f]{32}$/, 'with the signature the feed gave it')
    assert.doesNotMatch(body.title + body.content, DEVANAGARI)
  })
})

describe('when the translation cannot be had', () => {
  /** How many times each story's translation was asked for, by the English headline the app sent. */
  const triesByStory = () => {
    const tries = new Map()
    for (const entry of translations()) tries.set(entry.sent.title, (tries.get(entry.sent.title) ?? 0) + 1)
    return tries
  }

  it('shows the story as it came, in English, once the tries are used, and never leaves the page waiting', async () => {
    await onStocksInEnglish()
    world.server.setSummarize({ mode: 'error500' })
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilInView('translating', { timeout: 40_000 })
    // Three tries, the second after 1.5 s and the third after 4 s more.
    await world.untilStory(90_000)
    assert.equal(world.inView('translating'), undefined)
    assert.doesNotMatch(world.headline(), DEVANAGARI, 'the story as the feed gave it')
    assert.equal(triesByStory().get(world.headline()), 3, 'three tries for that story, and no more')
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })

  it('shows the story in Hindi when a second try is the one that is answered', async () => {
    await onStocksInEnglish()
    world.server.setSummarize({ mode: 'ok', failFirst: 1 })
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilStory(90_000)
    assert.match(world.headline(), DEVANAGARI)
    // The refused request may be one of a story that is not in view yet; its second try comes 1.5 s after the first.
    await d.waitFor(() => [...triesByStory().values()].includes(2), { timeout: 20_000, label: 'a story to be asked for a second time' })
    assert.equal(world.inView('translating'), undefined)
  })

  it('takes the English the website gives back, when it could not translate, for a failure: the page is not left in the wrong language by it', async () => {
    await onStocksInEnglish()
    world.server.setSummarize({ mode: 'english' })
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilInView('translating', { timeout: 40_000 })
    await world.untilStory(90_000)
    // Three tries for the story, as for a refusal; the English it is left with is the feed’s own, not an answer taken for a translation.
    assert.doesNotMatch(world.headline(), DEVANAGARI)
    assert.equal(triesByStory().get(world.headline()), 3)
    world.server.setSummarize({ mode: 'ok' })
  })
})

describe('what is left as it was', () => {
  it('asks for nothing for a topic the feed of Hindi has in Hindi, and shows its stories at once', async () => {
    await world.fresh()
    await world.choose('menu-topics')
    await world.until('Follow your curiosity.')
    await world.press('Science')
    await world.untilStory()
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilStory()
    assert.match(world.headline(), DEVANAGARI)
    assert.equal(world.inView('translating'), undefined)
    assert.deepEqual(translations(), [])
  })

  it('asks for nothing in English, Stocks included', async () => {
    await world.fresh()
    world.server.clearLog()
    await world.choose('menu-topics')
    await world.until('Follow your curiosity.')
    await world.press('Stocks')
    await world.untilStory()
    for (let page = 0; page < 3; page += 1) await world.swipe('up')
    assert.doesNotMatch(world.headline(), DEVANAGARI)
    assert.equal(world.inView('translating'), undefined)
    assert.deepEqual(translations(), [])
  })

  it('asks for nothing on a Hindi news feed, whatever the reader does', async () => {
    await world.fresh()
    await world.choose('menu-language-hi')
    await world.untilStory()
    world.server.clearLog()
    for (let page = 0; page < 3; page += 1) await world.swipe('up')
    assert.match(world.headline(), DEVANAGARI)
    assert.deepEqual(translations(), [])
  })

  it('goes back to the English feed, with nothing of the Hindi on it, and asks for nothing more', async () => {
    await onStocksInEnglish()
    await world.choose('menu-language-hi')
    await world.untilStory(60_000)
    await world.choose('menu-language-en')
    await world.untilStory(40_000)
    assert.doesNotMatch(world.headline(), DEVANAGARI)
    assert.equal(world.inView('translating'), undefined)
    const asked = translations().length
    await d.sleep(4000)
    assert.equal(translations().length, asked)
  })

  it('does not ask again, in a language it has the translations of, for a story that is shown again', async () => {
    await onStocksInEnglish()
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilStory(60_000)
    await d.waitFor(() => translations().length >= 5, { timeout: 40_000, label: 'the stories ahead to be asked for' })
    const asked = translations().length
    await world.swipe('up', { timeout: 40_000 })
    await world.swipe('down', { timeout: 40_000 })
    assert.match(world.headline(), DEVANAGARI)
    const titles = translations().map((entry) => entry.sent.title)
    assert.equal(new Set(titles).size, titles.length, 'no story was asked for twice')
    assert.ok(translations().length >= asked)
  })
})

describe('the words the mock gives for a story are the ones on the page', () => {
  it('is the translation of the story whose English was sent', async () => {
    await onStocksInEnglish()
    world.server.clearLog()
    await world.choose('menu-language-hi')
    await world.untilStory(60_000)
    const sent = sentForPageInView()
    const expected = hindiTranslation(sent)
    assert.equal(world.headline(), expected.title)
    assert.equal(text(world.story().body).startsWith(expected.content.replace(/\*\*/g, '').slice(0, 12)), true)
    // The story in view is in the first three asked for (the app asks for it and the next ones, three at a time, the nearest first), though they
    // reach the server in no fixed order.
    assert.ok(translations().slice(0, 3).some((entry) => entry.sent.title === sent.title), 'the story in view was in the first batch')
  })
})
