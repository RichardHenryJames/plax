import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeRss } from './rss-text.ts'

test('markup and CDATA are taken out and the entities of a field are what they stand for', () => {
  assert.equal(decodeRss('<![CDATA[<p>Fish &amp; chips, &quot;hot&quot;&nbsp;and <b>fresh</b></p>]]>'), 'Fish & chips, "hot" and fresh')
  assert.equal(decodeRss("It&#39;s Rahul&#x2019;s &lsquo;day&rsquo;&hellip;"), 'It\'s Rahul\u2019s \u2018day\u2019\u2026')
  assert.equal(decodeRss(''), '')
})

test('a field that is escaped twice, as NDTV sends it, is decoded to the apostrophe, not left as &#039;', () => {
  assert.equal(decodeRss('A woman died at her home in Pune&amp;#039;s Mukund Nagar, police said.'), "A woman died at her home in Pune's Mukund Nagar, police said.")
  assert.equal(decodeRss('Iran&amp;#039;s demands &amp;amp; the talks, &amp;quot;ready&amp;quot;'), 'Iran\'s demands & the talks, "ready"')
})

test('an entity that is not known is a space, and an emoji written as a number is kept whole', () => {
  assert.equal(decodeRss('caf&eacute; au lait'), 'caf au lait')
  assert.equal(decodeRss('Goal &#128512; scored'), 'Goal \u{1F600} scored')
})
