import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STOCK_FEEDS,
  STOCK_FEED_ITEMS,
  STOCK_FEED_TIMEOUT_MS,
  STOCK_MAX_AGE_MS,
  STOCK_OUTLET_MAX,
  STOCK_POOL_MAX,
  STOCK_SETTLE_MS,
  STOCK_TEXT_MAX,
  clip,
  isStockStory,
  pickStocks,
  settled,
  stockCoverage,
} from './stocks.ts'
import { SOURCE_DEADLINE_MS } from './deadline.ts'

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0)
const HOUR = 3600 * 1000
const markets = { name: 'M', url: 'https://example.com/m', region: 'Global', markets: true }
const desk = { name: 'D', url: 'https://example.com/d', region: 'Global', markets: false }
const story = (title, extra = {}) => ({ title, content: 'A description that is long enough to be a real one.', source: 'Outlet', url: `https://example.com/${encodeURIComponent(title)}`, publishedAt: NOW - HOUR, ...extra })

test('the feeds are https, each one once, and read within the sources deadline', () => {
  const urls = STOCK_FEEDS.map((feed) => feed.url)
  assert.equal(new Set(urls).size, urls.length, 'a feed is listed twice')
  for (const feed of STOCK_FEEDS) {
    assert.match(feed.url, /^https:\/\//, feed.url)
    assert.ok(feed.name.length > 1, feed.url)
    assert.ok(feed.max === undefined || (Number.isInteger(feed.max) && feed.max >= 5 && feed.max <= 250), `${feed.name} max`)
  }
  // The pool is ready when the slowest feed has answered (or been given up on) and the pages that need it have been read.
  assert.ok(STOCK_FEED_TIMEOUT_MS + 2000 <= SOURCE_DEADLINE_MS, 'feeds that are slow would hold the pool past the deadline')
  assert.ok(STOCK_SETTLE_MS < STOCK_FEED_TIMEOUT_MS, 'the pool would never go ahead of a feed that hangs')
  // after going ahead, the pages whose text only repeats the headline are read for at most 2.5 s (lib/blurb.ts), inside the same deadline
  assert.ok(STOCK_SETTLE_MS + 2500 <= SOURCE_DEADLINE_MS, 'a pool that went ahead at the settle time could not read those pages in time')
  assert.ok(STOCK_FEED_ITEMS >= 20)
})

test('the pool goes ahead without the feeds that hang, but only once enough have answered and it has waited a while', () => {
  const total = 60
  assert.equal(settled(60, total, 100), true, 'all answered: no reason to wait')
  assert.equal(settled(57, total, STOCK_SETTLE_MS - 1), false, 'not waited long enough')
  assert.equal(settled(57, total, STOCK_SETTLE_MS), true, 'waited, and nearly all have answered')
  assert.equal(settled(40, total, STOCK_SETTLE_MS * 2), false, 'too few have answered: keep waiting for them')
  assert.equal(settled(0, total, STOCK_SETTLE_MS * 2), false)
})

test('the feeds cover the world, with many outlets in each big market', () => {
  const coverage = stockCoverage()
  for (const region of ['United States', 'Canada', 'United Kingdom and Ireland', 'Europe', 'India', 'Asia and Pacific', 'Middle East and Africa', 'Latin America', 'Global']) {
    assert.ok(coverage[region]?.feeds >= 1, `no feed for ${region}`)
  }
  assert.ok(coverage['United States'].outlets >= 12)
  assert.ok(coverage['India'].outlets >= 5)
  assert.ok(coverage['United Kingdom and Ireland'].outlets >= 6)
  assert.ok(coverage['Asia and Pacific'].outlets >= 6)
  assert.ok(new Set(STOCK_FEEDS.map((feed) => feed.name)).size >= 45, 'fewer than 45 outlets')
  assert.ok(STOCK_FEEDS.length >= 60, 'fewer than 60 feeds')
})

test('a story about the markets is one, whatever the outlet calls it', () => {
  for (const title of [
    'Stocks rally as the Fed signals a rate cut',
    'Sensex, Nifty close higher on IT stocks',
    'Tesla shares jump after earnings beat',
    'FTSE 100 closes at a record high',
    "Apple's quarterly results top estimates",
    'Oil prices fall as OPEC weighs more output',
    'Wall Street ends lower as yields climb',
    'Gold price today: what to watch',
    'The bank raised its dividend and announced a buyback',
    'Investors pile into small caps',
    'Hang Seng slides as property developers sink',
    'Rupee weakens past 90 against the dollar',
  ]) assert.equal(isStockStory(title), true, title)
  assert.equal(isStockStory('Why the week ahead matters', 'Markets are bracing for the jobs report.'), true, 'the text counts too')
})

test('a story that is not about the markets is not one', () => {
  for (const title of [
    'Ten recipes for a summer barbecue',
    'The football club has appointed a new manager',
    'House prices rise in the south east',
    'The housing market cools in the spring',
    'A dowager duchess opens a school',
    'Shareware makers look back on the nineties',
    'Council approves plans for a new library',
  ]) assert.equal(isStockStory(title, 'A pleasant day out for the whole family.'), false, title)
})

test('a text is cut at the end of a word, and a short one is left as it is', () => {
  assert.equal(clip('Short text.'), 'Short text.')
  const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ')
  const cut = clip(long)
  assert.ok(cut.length <= STOCK_TEXT_MAX + 1, `${cut.length}`)
  assert.ok(cut.endsWith('…'))
  assert.ok(long.startsWith(cut.slice(0, -1)), 'it is the start of the text')
  // the next word of the text starts right after the cut, so the cut did not fall inside a word
  assert.equal(long[cut.length - 1], ' ', `cut inside a word: ${cut.slice(-20)}`)
})

test('the pool keeps the last week, newest first, and drops stories that cannot be placed in time', () => {
  const answers = [{
    feed: markets,
    stories: [
      story('Fresh one', { publishedAt: NOW - HOUR }),
      story('Fresher one', { publishedAt: NOW - 10 * 60 * 1000 }),
      story('Six days old', { publishedAt: NOW - 6 * 24 * HOUR }),
      story('Eight days old', { publishedAt: NOW - STOCK_MAX_AGE_MS - HOUR }),
      story('No time at all', { publishedAt: undefined }),
      story('From the future', { publishedAt: NOW + 5 * HOUR }),
    ],
  }]
  assert.deepEqual(pickStocks(answers, NOW).map((s) => s.title), ['Fresher one', 'Fresh one', 'Six days old'])
})

test('a business desk gives only its stories about the markets, a markets feed gives all', () => {
  const stories = [story('Shares of the bank rise after results'), story('A new bakery opens on the high street')]
  assert.deepEqual(pickStocks([{ feed: desk, stories }], NOW).map((s) => s.title), ['Shares of the bank rise after results'])
  assert.equal(pickStocks([{ feed: markets, stories }], NOW).length, 2)
})

test('a "price prediction" is search-engine filler, even in a markets feed', () => {
  const stories = [story('Hedera Hashgraph (HBAR) Price Prediction: 2025, 2026, 2030'), story('Tesla stock price predictions for the next decade'), story('Tesla shares fall after the price target is cut')]
  assert.deepEqual(pickStocks([{ feed: markets, stories }], NOW).map((s) => s.title), ['Tesla shares fall after the price target is cut'])
})

test('one story told in two feeds, or by two addresses of one page, is one story', () => {
  const a = story('Bank profit jumps', { url: 'https://example.com/news/bank-profit?utm_source=feed' })
  const b = story('Bank profit jumps 20%', { url: 'https://www.example.com/news/bank-profit/#comments', publishedAt: NOW - 2 * HOUR })
  const c = story('Another outlet, the same words', { url: 'https://other.example.org/x' })
  const d = story('another outlet: the same WORDS!', { url: 'https://other.example.org/y', publishedAt: NOW - 3 * HOUR })
  const picked = pickStocks([{ feed: markets, stories: [a, c] }, { feed: desk, stories: [b, d] }], NOW)
  assert.deepEqual(picked.map((s) => s.title).sort(), ['Another outlet, the same words', 'Bank profit jumps'])
})

test('no outlet fills the pool, and the pool has a size', () => {
  const outlets = Array.from({ length: 12 }, (_, o) => `Outlet ${o}`)
  const stories = outlets.flatMap((source, o) => Array.from({ length: 200 }, (_, i) => story(`Story ${o}-${i}`, { source, publishedAt: NOW - (i * 12 + o) * 60 * 1000 })))
  const picked = pickStocks([{ feed: markets, stories }], NOW)
  assert.equal(picked.length, STOCK_POOL_MAX)
  const counts = new Map()
  for (const s of picked) counts.set(s.source, (counts.get(s.source) ?? 0) + 1)
  for (const [source, n] of counts) assert.ok(n <= STOCK_OUTLET_MAX, `${source} has ${n}`)
  for (let i = 1; i < picked.length; i++) assert.ok(picked[i - 1].publishedAt >= picked[i].publishedAt, 'not newest first')

  const few = outlets.slice(0, 3).flatMap((source, o) => Array.from({ length: 200 }, (_, i) => story(`Few ${o}-${i}`, { source, publishedAt: NOW - (i * 3 + o) * 60 * 1000 })))
  assert.equal(pickStocks([{ feed: markets, stories: few }], NOW).length, 3 * STOCK_OUTLET_MAX)
})

test('what it is given is not changed, and a long text is clipped in the copy', () => {
  const long = Array.from({ length: 400 }, (_, i) => `w${i}`).join(' ')
  const original = story('A long one about shares', { content: long })
  const picked = pickStocks([{ feed: markets, stories: [original] }], NOW)
  assert.equal(original.content, long)
  assert.ok(picked[0].content.length <= STOCK_TEXT_MAX + 1)
  assert.notEqual(picked[0], original)
})
