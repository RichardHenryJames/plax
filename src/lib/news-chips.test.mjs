import test from 'node:test'
import assert from 'node:assert/strict'
import { STOCKS_SECTION, STOCKS_TAG, isGeneralNews, feedHasNews, feedIsTimely, sectionAfterTopicChange } from './news-chips.ts'
import { NEWS_SECTIONS } from './types.ts'

test('the Stocks section is not one of the News chips, and has a name in both languages', () => {
  assert.ok(!NEWS_SECTIONS.some((section) => section.id === STOCKS_SECTION))
  assert.equal(STOCKS_TAG.id, STOCKS_SECTION)
  assert.ok(STOCKS_TAG.label && STOCKS_TAG.labelHi)
})

test('a story of the Stocks topic is not general news, a story of any news section is', () => {
  assert.equal(isGeneralNews({ category: 'news', section: 'us' }), true)
  assert.equal(isGeneralNews({ category: 'news' }), true)
  assert.equal(isGeneralNews({ category: 'news', section: STOCKS_SECTION }), false)
  assert.equal(isGeneralNews({ category: 'science' }), false)
  assert.equal(isGeneralNews(null), false)
  assert.equal(isGeneralNews(undefined), false)
})

test('the chips belong to a feed that has the news in it', () => {
  assert.equal(feedHasNews(['news']), true)
  assert.equal(feedHasNews(['science', 'news']), true)
  assert.equal(feedHasNews(['stocks']), false)
  assert.equal(feedHasNews(['science']), false)
  assert.equal(feedHasNews([]), false)
})

test('news and stocks go stale within hours, the other topics do not', () => {
  assert.equal(feedIsTimely(['news']), true)
  assert.equal(feedIsTimely(['stocks']), true)
  assert.equal(feedIsTimely(['science', 'stocks']), true)
  assert.equal(feedIsTimely(['science']), false)
  assert.equal(feedIsTimely([]), false)
})

test('a chosen chip is lost when the reader moves to another topic, and kept on the same one', () => {
  assert.equal(sectionAfterTopicChange('us', 'news', 'science'), null)
  assert.equal(sectionAfterTopicChange('us', 'news', 'stocks'), null)
  assert.equal(sectionAfterTopicChange('us', 'news', null), null)
  assert.equal(sectionAfterTopicChange('us', null, 'news'), null)
  assert.equal(sectionAfterTopicChange('us', 'news', 'news'), 'us')
  assert.equal(sectionAfterTopicChange('india', null, null), 'india')
  assert.equal(sectionAfterTopicChange(null, 'news', 'science'), null)
})
