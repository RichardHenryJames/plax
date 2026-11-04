import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NEWS_SECTIONS, GENERAL_NEWS_FEEDS } from './types.ts'
import { NEWS_SECTION_SEO } from './news-section-seo.ts'

const ids = NEWS_SECTIONS.map((section) => section.id)

test('the sections are simple slugs, each named once, in English and Hindi', () => {
  assert.equal(new Set(ids).size, ids.length)
  for (const section of NEWS_SECTIONS) {
    assert.match(section.id, /^[a-z]+$/)
    assert.ok(section.label.length > 0 && section.labelHi.length > 0, section.id)
    assert.ok(/[\u0900-\u097F]/.test(section.labelHi), `${section.id} has a Hindi label in Devanagari`)
  }
})

test('every section has the copy of its page: a section without it would be in the sitemap and answer 404', () => {
  for (const id of ids) assert.ok(NEWS_SECTION_SEO[id], `${id} has no copy in news-section-seo.ts`)
  for (const id of Object.keys(NEWS_SECTION_SEO)) assert.ok(ids.includes(id), `${id} has copy but is not a section`)
})

test('every feed is filed under a known section, and every section has a feed', () => {
  for (const [name, url, section] of GENERAL_NEWS_FEEDS) {
    assert.ok(ids.includes(section), `${name} is filed under "${section}", which is not a section`)
    assert.match(url, /^https?:\/\//, name)
  }
  for (const id of ids) assert.ok(GENERAL_NEWS_FEEDS.some(([, , section]) => section === id), `${id} has no feed`)
})

test('a feed is listed once: the same address, or the same outlet name for the same section, would count its stories twice', () => {
  const urls = GENERAL_NEWS_FEEDS.map(([, url]) => url)
  assert.equal(new Set(urls).size, urls.length)
  const names = GENERAL_NEWS_FEEDS.map(([name, , section]) => `${section}|${name}`)
  assert.equal(new Set(names).size, names.length)
})

test('the US section has several outlets, each over https, so one outlet never speaks for it', () => {
  const us = GENERAL_NEWS_FEEDS.filter(([, , section]) => section === 'us')
  assert.ok(us.length >= 5, `${us.length} US feeds`)
  assert.equal(new Set(us.map(([name]) => name)).size, us.length)
  for (const [name, url] of us) assert.match(url, /^https:\/\//, name)
})

test('the US is the first section, and its page is written for a US reader', () => {
  assert.equal(ids[0], 'us')
  const us = NEWS_SECTION_SEO.us
  assert.equal(us.language, 'en-US')
  assert.equal(us.dates.locale, 'en-US')
  assert.equal(us.dates.timeZone, 'America/New_York')
  assert.match(us.title, /^US News Today/)
  assert.ok(us.kw.includes('US news today'))
  // a time on the page is written the way a US reader writes it, with its zone
  const written = new Date(Date.UTC(2026, 10, 4, 18, 30)).toLocaleDateString(us.dates.locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: us.dates.timeZone, timeZoneName: us.dates.timeZoneName,
  })
  assert.match(written, /Nov 4/)
  assert.match(written, /1:30\s?PM EST/)
})

test('a page title and description fit what a search result shows', () => {
  for (const [id, copy] of Object.entries(NEWS_SECTION_SEO)) {
    assert.ok(copy.title.length <= 70, `${id} title is ${copy.title.length} characters`)
    assert.ok(copy.desc.length >= 100 && copy.desc.length <= 170, `${id} description is ${copy.desc.length} characters`)
  }
})
