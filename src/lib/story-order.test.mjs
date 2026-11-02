import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_BODY_CHARS, bodyChars, isFull, richness, richestFirst, capPerSource, newsOrder } from './story-order.ts'

const text = (n) => 'x'.repeat(n)
const card = (id, over = {}) => ({ id, title: `Headline ${id}`, content: text(FULL_BODY_CHARS), source: 'S', category: 'news', publishedAt: 1000 - id, ...over })
const ids = (cards) => cards.map((c) => c.id)

test('a story fills a card from about a screenful of text under its headline, and the headline said twice is not text', () => {
  assert.equal(bodyChars({ title: 'Same words here', content: 'Same words here' }), 0)
  assert.equal(bodyChars({ title: 'Headline', content: `Headline. ${text(50)}` }), 50)
  assert.equal(isFull(card(1)), true)
  assert.equal(isFull(card(1, { content: text(FULL_BODY_CHARS - 1) })), false)
  assert.equal(isFull({ title: 'T' }), false)
})

test('a story is worth its text, up to what a card holds, and a picture', () => {
  const plain = richness(card(1, { content: text(300) }))
  assert.equal(plain, 300)
  assert.equal(richness(card(1, { content: text(300), image: 'https://x.example/a.jpg' })), 550)
  assert.equal(richness(card(1, { content: text(5000) })), 600)
  assert.ok(richness(card(1, { content: text(100), image: 'https://x.example/a.jpg' })) > richness(card(1, { content: text(300) })), 'a picture is worth some text')
})

test('the telling with the most to show leads, and the rest keep their order', () => {
  const list = [card(1, { content: text(100) }), card(2, { content: text(500) }), card(3, { content: text(100) }), card(4, { content: text(500), image: 'https://x.example/a.jpg' })]
  assert.deepEqual(ids(richestFirst(list)), [4, 2, 1, 3])
  assert.deepEqual(ids(list), [1, 2, 3, 4], 'the list itself is not changed')
})

test('no more than so many stories of one outlet, in the order they come', () => {
  const list = [card(1), card(2), card(3, { source: 'B' }), card(4), card(5, { source: 'B' })]
  assert.deepEqual(ids(capPerSource(list, 2)), [1, 2, 3, 5])
})

test('the news stream is newest first, and what fills a card comes before what does not', () => {
  const thin = (id) => card(id, { content: text(100) })
  const list = [thin(1), card(2), thin(3), card(4), card(5)]
  assert.deepEqual(ids(newsOrder(list, 6, 30)), [2, 4, 5, 1, 3], 'the full ones newest first, then the thin ones newest first')
  assert.deepEqual(ids(newsOrder(list, 6, 3)), [2, 4, 5], 'a page the full ones can fill has none of the others')
  assert.deepEqual(ids(newsOrder(list, 6, 4)), [2, 4, 5, 1])
})

test('only news, and no more than so many of one outlet, but a thin one is still shown when there is nothing else', () => {
  const list = [card(1, { category: 'science' }), card(2, { content: 'short' }), card(3, { content: 'short' }), card(4, { content: 'short' })]
  assert.deepEqual(ids(newsOrder(list, 2, 30)), [2, 3])
  assert.deepEqual(ids(newsOrder([], 6, 30)), [])
  assert.deepEqual(ids(newsOrder([card(1, { publishedAt: undefined }), card(2, { publishedAt: 5 })], 6, 30)), [2, 1], 'a story with no time sinks')
})
