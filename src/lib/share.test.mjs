import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canonicalText, canonicalUrl, signingString, shareId, slugify, sharePath, parseShareSegment, readShareCard, excerpt, isHindi,
  latinCardText, SIGNATURE_PATTERN,
} from './share.ts'
import { signCard, verifyCard, signingKey } from './share-sign.ts'

const KEY = signingKey({ SHARE_SECRET: 'a-test-secret-of-sufficient-length' })

const card = () => ({
  id: 'the-hindu-1x2y3z',
  title: 'J&K regional parties join anti-CEC protests in Kashmir',
  content: 'Leaders of the National Conference and the PDP joined a march in Srinagar on Friday.',
  source: 'The Hindu',
  sourceUrl: 'https://www.thehindu.com/news/national/story.ece?utm=feed&id=7',
  image: 'https://th-i.thgim.com/public/incoming/abc.jpg?w=1200&h=675',
  publishedAt: 1791621638608,
  category: 'news',
  section: 'india',
})

// What the Android app's feed parser does to a card before it can send it back: it trims every text field and decodes
// HTML-escaped ampersands in the two addresses (FeedParser.stripped / FeedParser.url).
const androidView = (c) => {
  const strip = (s) => (s ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
  const url = (s) => strip(s).replace(/&#038;/g, '&').replace(/&#38;/g, '&').replace(/&amp;/g, '&')
  return { ...c, id: strip(c.id), title: strip(c.title), content: strip(c.content), source: strip(c.source),
    category: strip(c.category), section: strip(c.section), sourceUrl: url(c.sourceUrl), image: url(c.image) }
}

test('text is trimmed and stripped of control characters, so the field separator can never be forged', () => {
  assert.equal(canonicalText('  hello  '), 'hello')
  assert.equal(canonicalText('\u00a0hello\u00a0'), 'hello')
  assert.equal(canonicalText('a\u0001b'), 'ab')
  assert.equal(canonicalText(undefined), '')
  assert.equal(canonicalText(null), '')
})

test('addresses are decoded the way the app decodes them, in the same order', () => {
  assert.equal(canonicalUrl('https://x.test/a?b=1&#038;c=2'), 'https://x.test/a?b=1&c=2')
  assert.equal(canonicalUrl('https://x.test/a?b=1&#38;c=2'), 'https://x.test/a?b=1&c=2')
  assert.equal(canonicalUrl('https://x.test/a?b=1&amp;c=2'), 'https://x.test/a?b=1&c=2')
  assert.equal(canonicalUrl(' https://x.test/a?b=1&c=2 '), 'https://x.test/a?b=1&c=2')
  // Only one pass, as in the app: a double-escaped ampersand loses one level.
  assert.equal(canonicalUrl('a&amp;amp;b'), 'a&amp;b')
})

test('a card that went through the app is still the card the server signed', () => {
  const served = { ...card(), sourceUrl: 'https://www.thehindu.com/news/story.ece?utm=feed&#038;id=7', image: 'https://th-i.thgim.com/a.jpg?w=1&amp;h=2' }
  const sig = signCard(served, KEY)
  assert.match(sig, SIGNATURE_PATTERN)
  assert.equal(verifyCard(androidView(served), sig, KEY), true, 'trimmed and decoded by the app')
  assert.equal(verifyCard({ ...served, title: `  ${served.title}\n`, content: `\t${served.content} ` }, sig, KEY), true, 'extra spaces around text')
  assert.equal(verifyCard(served, sig, KEY), true, 'unchanged')
})

test('changing any covered field breaks the signature', () => {
  const sig = signCard(card(), KEY)
  const changes = {
    id: 'the-hindu-other', title: 'A different headline', content: 'Different text.', source: 'Another outlet',
    sourceUrl: 'https://www.thehindu.com/other', image: 'https://th-i.thgim.com/other.jpg', publishedAt: 1791621638609,
    category: 'science', section: 'world',
  }
  for (const [field, value] of Object.entries(changes)) {
    assert.equal(verifyCard({ ...card(), [field]: value }, sig, KEY), false, `${field} is covered`)
  }
  assert.equal(verifyCard({ ...card(), publishedAt: undefined }, sig, KEY), false, 'a missing time is not the signed time')
})

test('an absent optional field is the same as an empty one', () => {
  const bare = { id: 'quote-1', content: 'Words.', category: 'general' }
  const sig = signCard(bare, KEY)
  assert.equal(verifyCard({ ...bare, title: '', source: '', sourceUrl: '', image: '', section: '', publishedAt: 0 }, sig, KEY), true)
  assert.equal(verifyCard({ ...bare, title: null, source: undefined }, sig, KEY), true)
})

test('a signature is bound to the key and to its own shape', () => {
  const sig = signCard(card(), KEY)
  const other = signingKey({ SHARE_SECRET: 'another-secret-of-sufficient-length' })
  assert.notEqual(signCard(card(), other), sig)
  assert.equal(verifyCard(card(), sig, other), false)
  assert.equal(verifyCard(card(), sig.toUpperCase(), KEY), false, 'upper case is not the form the server issues')
  assert.equal(verifyCard(card(), sig.slice(0, 31), KEY), false)
  assert.equal(verifyCard(card(), `${sig.slice(0, 31)}z`, KEY), false)
  assert.equal(verifyCard(card(), '0'.repeat(32), KEY), false)
  assert.equal(verifyCard(card(), sig, null), false, 'no key, nothing is trusted')
})

test('the key comes from SHARE_SECRET, else is derived from the service key, else does not exist', () => {
  assert.equal(signingKey({}), null)
  assert.equal(signingKey({ SHARE_SECRET: 'short' }), null)
  const fromService = signingKey({ SUPABASE_SERVICE_ROLE_KEY: 'a-service-role-key-with-enough-length' })
  assert.ok(fromService && fromService.length === 32)
  assert.notEqual(fromService.toString('utf8'), 'a-service-role-key-with-enough-length', 'derived, never the secret itself')
  const both = signingKey({ SHARE_SECRET: 'a-dedicated-share-secret-123', SUPABASE_SERVICE_ROLE_KEY: 'a-service-role-key-with-enough-length' })
  assert.deepEqual(both, signingKey({ SHARE_SECRET: 'a-dedicated-share-secret-123' }), 'SHARE_SECRET wins')
  assert.equal(signCard(card(), null), null, 'with no key a card is simply unsigned')
})

test('every field is separated, so moving text between fields changes the signature', () => {
  const a = { id: 'x', title: 'ab', content: 'cd', category: 'news' }
  const b = { id: 'x', title: 'a', content: 'bcd', category: 'news' }
  assert.notEqual(signingString(a), signingString(b))
  assert.notEqual(signCard(a, KEY), signCard(b, KEY))
})

test('slugs are short readable Latin words', () => {
  assert.equal(slugify('J&K regional parties join anti-CEC protests'), 'j-k-regional-parties-join-anti-cec-protests')
  assert.equal(slugify('  Café déjà vu: “quoted”  '), 'cafe-deja-vu-quoted')
  assert.equal(slugify('लीना ओकाफोर को नोबेल शांति पुरस्कार'), 'story', 'no Latin letters, a neutral word')
  assert.equal(slugify(''), 'story')
  assert.equal(slugify(undefined), 'story')
  const long = slugify('word '.repeat(60))
  assert.ok(long.length <= 70 && !long.endsWith('-'))
  assert.ok(!long.endsWith('wor'), 'cut at a word, not in the middle of one')
})

test('a story address round-trips and names the story by a public part of the signature', () => {
  const sig = signCard(card(), KEY)
  const path = sharePath(card().title, sig)
  assert.equal(path, `/s/j-k-regional-parties-join-anti-cec-protests-in-kashmir-${shareId(sig)}`)
  assert.equal(shareId(sig).length, 16)
  assert.deepEqual(parseShareSegment(path.slice(3)), { slug: 'j-k-regional-parties-join-anti-cec-protests-in-kashmir', id: shareId(sig) })
  assert.deepEqual(parseShareSegment(`story-${shareId(sig)}`), { slug: 'story', id: shareId(sig) })
  assert.deepEqual(parseShareSegment(shareId(sig)), { slug: '', id: shareId(sig) })
  for (const bad of ['', 'story', 'story-123', 'story-ABCDEF0123456789', `story-${shareId(sig)}0`, `story-${shareId(sig).slice(1)}`, '../etc/passwd']) {
    assert.equal(parseShareSegment(bad), null, `${JSON.stringify(bad)} is not a story address`)
  }
})

test('what a client sends is read strictly, and verified against what the app would have sent', () => {
  const served = card()
  const sig = signCard(served, KEY)
  const read = readShareCard({ ...androidView(served), sig })
  assert.ok(read)
  assert.equal(verifyCard(read.card, read.signature, KEY), true)
  assert.equal(read.card.publishedAt, served.publishedAt)
  assert.equal(readShareCard({ ...served, sig: sig.toUpperCase() })?.signature, sig, 'case of the signature is forgiven')

  const reject = (patch, why) => assert.equal(readShareCard({ ...served, sig, ...patch }), null, why)
  reject({ sig: undefined }, 'no signature')
  reject({ sig: 'abc' }, 'short signature')
  reject({ id: '' }, 'no id')
  reject({ content: '' }, 'no text')
  reject({ category: undefined }, 'no category')
  reject({ title: 5 }, 'title must be text')
  reject({ content: 'x'.repeat(8001) }, 'text too long')
  reject({ sourceUrl: 'javascript:alert(1)' }, 'only web addresses become links')
  reject({ sourceUrl: 'data:text/html;base64,AAAA' }, 'no data: links')
  reject({ sourceUrl: 'not a url' }, 'not an address')
  reject({ image: 'javascript:alert(1)' }, 'a picture must be a web address too')
  reject({ image: 'data:image/png;base64,AAAA' }, 'no data: pictures')
  reject({ publishedAt: '1791621638608' }, 'time must be a number')
  reject({ publishedAt: -5 }, 'time cannot be negative')
  assert.equal(readShareCard(null), null)
  assert.equal(readShareCard([]), null)
  assert.equal(readShareCard('string'), null)
  assert.ok(readShareCard({ ...served, sig, sourceUrl: 'http://www.thehindu.com/a' }), 'a plain http article link is allowed')
  assert.ok(readShareCard({ ...served, sig, image: 'http://th-i.thgim.com/a.jpg' }), 'so is a plain http picture, which the page never shows')
  assert.ok(readShareCard({ ...served, sig, image: '', sourceUrl: '' }), 'a card without picture or link is a card')
})

test('a forged headline on a genuine signature is refused', () => {
  const served = card()
  const sig = signCard(served, KEY)
  const forged = readShareCard({ ...served, title: 'BREAKING: something that never happened', sig })
  assert.ok(forged)
  assert.equal(verifyCard(forged.card, forged.signature, KEY), false)
})

test('descriptions are cut at a word', () => {
  assert.equal(excerpt('Short.', 50), 'Short.')
  const cut = excerpt('The quick brown fox jumps over the lazy dog and keeps running far away', 30)
  assert.ok(cut.length <= 31 && cut.endsWith('…') && !/ …$/.test(cut), cut)
  assert.equal(excerpt('  spaced \n\n out  ', 50), 'spaced out')
})

test('what the Android app sends back for a story is accepted as that very story (golden vector shared with ShareLinksTest)', () => {
  const vector = JSON.parse(readFileSync(new URL('../../android/app/src/test/resources/share-vector.json', import.meta.url), 'utf8'))
  const key = signingKey({ SHARE_SECRET: vector.secret })
  assert.equal(signCard(vector.served, key), vector.sig, 'the server signs the served story as recorded')
  assert.equal(vector.served.sig, vector.sig)
  const read = readShareCard(JSON.parse(JSON.stringify(vector.body)))
  assert.ok(read, 'the body the app builds is a well-formed card')
  assert.equal(verifyCard(read.card, read.signature, key), true, 'and it verifies as the story the server signed')
  assert.equal(verifyCard({ ...read.card, title: `${read.card.title}!` }, read.signature, key), false)
  assert.equal(sharePath(read.card.title, read.signature), sharePath(vector.served.title, vector.sig), 'both name the same page')
})

test('Hindi is recognised by script', () => {
  assert.equal(isHindi('लीना ओकाफोर'), true)
  assert.equal(isHindi('Plain English', 'और हिंदी'), true)
  assert.equal(isHindi('Plain English'), false)
})

test('a preview card draws only what its Latin font can, and says so when that is too little', () => {
  assert.equal(latinCardText('Sensex jumps 900 points'), 'Sensex jumps 900 points')
  assert.equal(latinCardText('  Café “reopens” — finally…  '), 'Café “reopens” — finally…')
  assert.equal(latinCardText('Govt sets ₹5 lakh crore aside'), 'Govt sets Rs 5 lakh crore aside')
  assert.equal(latinCardText('Budget 2026: ₹ 1,200 crore for rail'), 'Budget 2026: Rs 1,200 crore for rail')
  assert.equal(latinCardText('Plax 🎉 launches'), 'Plax launches', 'a stray symbol is dropped')
  assert.equal(latinCardText('लीना ओकाफोर को नोबेल शांति पुरस्कार'), null, 'Hindi is never drawn')
  assert.equal(latinCardText('Modi ने कहा कि भारत आगे बढ़ रहा है'), null, 'mostly Hindi is not drawn either')
  assert.equal(latinCardText('   '), null)
  assert.equal(latinCardText(undefined), null)
})
