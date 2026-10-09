import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import {
  CLOSE_MS,
  EARLIER_LIMIT,
  KEY_LIMIT,
  MIN_SHARED,
  SEEN_EVERGREEN_AGE_MS,
  SEEN_LIMIT,
  SEEN_MAX_AGE_MS,
  WINDOW_MS,
  SeenStore,
  append,
  cluster,
  covers,
  printOf,
  printOfHeadline,
  replace,
  sameEvent,
  sameEventAt,
} from './story-engine.ts'

// seen-storage.ts imports './story-engine' without an extension, as the bundler expects; Node needs one.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(/^\.\.?\/[^.]*$/.test(specifier) ? `${specifier}.ts` : specifier, context)
  },
})
const { SEEN_STORAGE_KEY, loadSeen, saveSeen } = await import('./seen-storage.ts')

// The scenarios below mirror android/app/src/test/java/com/plaxlabs/news/DuplicatesTest.java:
// same headlines, same expectations, so the website and the app agree on what is a repeat.
const HOUR = 3600000
const NOW = 1800000000000

// publishedHoursAgo < 0 means the feed gave no publish time.
function story(id, title, publishedHoursAgo) {
  return {
    id,
    title,
    content: `A short summary of ${id}`,
    category: 'news',
    image: '',
    publishedAt: publishedHoursAgo < 0 ? 0 : NOW - publishedHoursAgo * HOUR,
  }
}

const withImage = (item) => ({ ...item, image: `https://img.example.com/${item.id}.jpg` })
const same = (a, b) => sameEvent(printOf(a), printOf(b))
const ids = (stories) => stories.map((item) => item.id)

// Five words that no other index shares, so unrelated test stories never count as one event.
function headline(index) {
  const words = []
  for (let part = 1; part <= 5; part++) words.push(`${(index * 7919 + part * 104729).toString(36)}q`)
  return words.join(' ')
}

// A headline long enough for its key to be cut at KEY_LIMIT, in the middle of a word.
const LONG_HEADLINE =
  'Parliament passes sweeping reform bill after marathon overnight debate as opposition members walk out in protest ' +
  'over amendments to the national budget, citing concerns about funding for rural hospitals and schools nationwide'

// A print with the given distinctive tokens, for exercising the thresholds directly.
const printWith = (tokens, published, timely = true) => printOfHeadline(tokens.join(' '), published, timely)
const topics = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${String.fromCharCode(97 + index)}x`)

test('one event worded differently by each outlet is recognised', () => {
  const group = [
    story('a', 'Lena Okafor wins Nobel Peace Prize', 5),
    story('b', 'South African human rights lawyer Lena Okafor wins the Nobel Peace Prize', 4),
    story('c', 'Indian-Origin Lena Okafor Awarded Nobel Peace Prize 2026', 5),
    story('d', "Nobel chair admits they haven't reached Peace Prize winner Okafor", 4),
  ]
  for (const x of group) for (const y of group) assert.ok(same(x, y), `${x.id}${y.id}`)
})

test('similar templates about different events are not merged', () => {
  assert.equal(
    same(
      story('a', '7 workers killed, 20 injured as pickup collides with truck in Oakvale', 2),
      story('b', 'Driver Killed, 12 Injured After Bus Collides With Truck In Marrow Bay', 2)
    ),
    false
  )
  assert.equal(
    same(
      story('a', 'Nobel Prize 2026: Three Science Discoveries That Sound Like Fiction', 1),
      story('b', 'Lena Okafor wins Nobel Peace Prize', 1)
    ),
    false,
    'A prize and a year are not an event'
  )
  assert.equal(
    same(story('a', 'Anne Carson wins Nobel Literature Prize', 1), story('b', 'Lena Okafor wins Nobel Peace Prize', 1)),
    false,
    'Two different Nobel winners'
  )
  assert.equal(
    same(
      story('a', 'Stocks making the biggest moves premarket: Alder, Birch, Cedar, Dune', 4),
      story('b', 'Stocks making the biggest moves midday: Goldwyn, Hartley, Ivy, Jorvik', 1)
    ),
    false
  )
})

test('live blog updates are one event but the next days blog is not', () => {
  const morning = story('a', 'Sensex today | Stock Market Live: Sensex gains over 879 points, Nifty tops 22,520', 3)
  const noon = story('b', 'Stock Market LIVE Updates, Sensex Today: Sensex gains nearly 1,000 points, Nifty tops 22,540', 1)
  const nextDay = story('c', 'Sensex today | Stock Market Live: Sensex gains over 450 points, Nifty tops 22,880', -1)
  assert.equal(same(morning, noon), true)
  const yesterday = story('d', 'Sensex today | Stock Market Live: Sensex gains over 879 points, Nifty tops 22,520', 27)
  const today = story('e', 'Sensex today | Stock Market Live: Sensex gains over 450 points, Nifty tops 22,880', 3)
  assert.equal(same(yesterday, today), false, 'A recurring headline a day later is new')
  assert.equal(same(morning, nextDay), true, 'Unknown publish times fall back to wording alone')
})

test('identical headlines match only when they are timely or exactly equal', () => {
  const evergreen = (id, title, content) => ({ id, title, content, category: 'nature' })
  const fact = evergreen('f1', 'Octopuses have three hearts and blue blood', 'Body one')
  const alike = evergreen('f2', 'Octopuses have three hearts and blue blood!', 'Body two')
  const related = evergreen('f3', 'Why octopuses have three hearts and bright blue blood explained', 'Body three')
  assert.equal(same(fact, alike), true)
  assert.equal(same(fact, related), false, 'Evergreen facts are never merged by overlap')
})

test('hindi headlines are compared like english ones', () => {
  const a = story('a', 'दिल्ली मेट्रो बंद करने पर सुप्रीम कोर्ट की सख़्त टिप्पणी, प्रदर्शन के लिए मार्ग खुले रखें', 2)
  const b = story('b', 'सुप्रीम कोर्ट ने दिल्ली मेट्रो पूरी तरह बंद करने पर जताई आपत्ति, प्रदर्शन के मार्ग', 2)
  const c = story('c', 'भारतीय टीम ने श्रीलंका को तीसरे वनडे में हराकर सीरीज़ जीती', 2)
  assert.equal(same(a, b), true)
  assert.equal(same(a, c), false)
})

test('a seen story is recognised again and so is another outlets version', () => {
  const seen = new SeenStore()
  const first = story('a', 'Lena Okafor wins Nobel Peace Prize', 5)
  assert.equal(seen.contains(first, NOW), false)
  assert.equal(seen.mark(first, NOW), true)
  assert.equal(seen.mark(first, NOW), false, 'Marking twice changes nothing')
  assert.equal(seen.contains(first, NOW), true)
  assert.equal(seen.contains(story('a', 'Edited headline that shares nothing at all', 5), NOW), true)
  assert.equal(seen.contains(story('b', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 4), NOW), true)
  assert.equal(seen.contains(story('c', 'Anne Carson wins Nobel Literature Prize', 4), NOW), false)
  assert.equal(seen.size, 1)
})

test('seen history round trips and forgets old entries', () => {
  const seen = new SeenStore()
  seen.mark(story('old', 'Harbour bridge reopens after three year repair programme', 1), NOW - 31 * 24 * HOUR)
  seen.mark(story('new', 'Lena Okafor wins Nobel Peace Prize', 2), NOW)
  const reloaded = SeenStore.fromJson(seen.toJson(), NOW)
  assert.equal(reloaded.size, 1, 'Entries older than 30 days are dropped')
  assert.equal(reloaded.contains(story('new', 'Lena Okafor wins Nobel Peace Prize', 2), NOW), true)
  assert.equal(
    reloaded.contains(story('other', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 1), NOW),
    true,
    'The wording fingerprint survives a restart'
  )
  assert.deepEqual(reloaded.recentIds(5), ['new'])
})

test('seen history is bounded and the newest ids come first', () => {
  const seen = new SeenStore()
  for (let index = 0; index < SEEN_LIMIT + 50; index++) seen.mark(story(`s${index}`, headline(index), -1), NOW + index)
  assert.equal(seen.size, SEEN_LIMIT)
  assert.deepEqual(seen.recentIds(3), ['s1549', 's1548', 's1547'])
})

test('damaged seen history is rejected, not trusted', () => {
  const invalid = [
    '',
    '[]',
    '{"schema":2,"seen":[]}',
    '{"schema":1}',
    '{"schema":1,"seen":[{}]}',
    '{"schema":1,"seen":[{"id":"","k":"x","p":0,"t":1,"n":true}]}',
    '{"schema":1,"seen":[{"id":"a","k":"x","p":-5,"t":1,"n":true}]}',
  ]
  for (const text of invalid) assert.throws(() => SeenStore.fromJson(text, NOW), Error, JSON.stringify(text))
})

test('every other kind of damage is rejected too', () => {
  const entry = (fields) => JSON.stringify({ schema: 1, seen: [{ id: 'a', k: 'x', p: 0, t: 1, n: true, ...fields }] })
  const invalid = [
    'not json',
    'null',
    '42',
    '"text"',
    '{"schema":1,"seen":[',
    '{"schema":1,"seen":"x"}',
    '{"schema":1,"seen":{}}',
    '{"schema":1,"seen":null}',
    '{"seen":[]}',
    '{"schema":"1","seen":[]}',
    '{"schema":1,"seen":[1]}',
    '{"schema":1,"seen":["a"]}',
    '{"schema":1,"seen":[null]}',
    '{"schema":1,"seen":[[]]}',
    entry({ id: 'x'.repeat(201) }),
    entry({ k: 'x'.repeat(601) }),
    entry({ id: undefined }),
    entry({ k: undefined }),
    entry({ p: undefined }),
    entry({ t: undefined }),
    entry({ n: undefined }),
    entry({ id: null }),
    entry({ id: 5 }),
    entry({ k: 5 }),
    entry({ p: '5' }),
    entry({ t: -1 }),
    entry({ n: 1 }),
    entry({ n: 'true' }),
  ]
  for (const text of invalid) assert.throws(() => SeenStore.fromJson(text, NOW), Error, text)
  assert.throws(() => SeenStore.fromJson('{"schema":1,"seen":[{"id":"a","k":"x","p":-5,"t":1,"n":true}', NOW), Error)
})

test('the limits of a valid history are inclusive and unknown fields are ignored', () => {
  const limits = { schema: 1, seen: [{ id: 'x'.repeat(200), k: 'x'.repeat(600), p: 0, t: 0, n: false }] }
  assert.equal(SeenStore.fromJson(JSON.stringify(limits), 0).size, 1)
  const extra = `{"schema":1,"extra":true,"seen":[{"id":"a","k":"x","p":0,"t":${NOW},"n":true,"more":[1]}]}`
  assert.deepEqual(SeenStore.fromJson(extra, NOW).recentIds(5), ['a'])
})

test('a page shows only unseen stories and withholds the rest', () => {
  const seen = new SeenStore()
  const read1 = story('r1', 'Harbour bridge reopens after three year repair programme', 6)
  const read2 = story('r2', 'Council approves riverside housing development despite objections', 5)
  seen.mark(read1, NOW)
  seen.mark(read2, NOW)
  const fresh1 = story('n1', 'Glacier survey finds Himalayan ice melting faster than models predicted', 2)
  const fresh2 = story('n2', 'Central bank holds interest rates steady citing inflation worries', 1)
  const result = replace([], [], [fresh2, read1, fresh1, read2], seen, NOW)
  assert.deepEqual(ids(result.visible), ['n2', 'n1'])
  assert.deepEqual(ids(result.earlier), ['r1', 'r2'])
  assert.deepEqual(ids(result.fresh), ['n2', 'n1'])
})

test('reopening the same page shows nothing new', () => {
  const seen = new SeenStore()
  const page = []
  for (let index = 0; index < 6; index++) page.push(story(`p${index}`, headline(index), index))
  for (const item of page) seen.mark(item, NOW)
  const result = replace([], [], page, seen, NOW + HOUR)
  assert.equal(result.visible.length, 0)
  assert.equal(result.earlier.length, 6)
  assert.equal(result.fresh.length, 0)
})

test('stories still on screen but not viewed stay and viewed ones move away', () => {
  const seen = new SeenStore()
  const viewed = story('a', 'Harbour bridge reopens after three year repair programme', 6)
  const waiting = story('b', 'Council approves riverside housing development despite objections', 5)
  seen.mark(viewed, NOW)
  const arrival = story('c', 'Glacier survey finds Himalayan ice melting faster than models predicted', 1)
  const result = replace([viewed, waiting], [], [arrival, waiting], seen, NOW)
  assert.deepEqual(ids(result.visible), ['c', 'b'])
  assert.deepEqual(ids(result.earlier), ['a'])
  assert.deepEqual(ids(result.fresh), ['c'], 'Only the arrival is new to the reader')
})

test('an older page appends only what is new and keeps what was seen aside', () => {
  const seen = new SeenStore()
  const current = story('a', 'Harbour bridge reopens after three year repair programme', 3)
  const repeat = story('b', 'Council approves riverside housing development despite objections', 20)
  seen.mark(repeat, NOW)
  const older = story('c', 'Glacier survey finds Himalayan ice melting faster than models predicted', 22)
  const sameEvents = story('d', 'Harbour bridge finally reopens following three year programme of repairs', 2)
  const result = append([current], [], [repeat, older, sameEvents], seen, NOW)
  assert.deepEqual(ids(result.visible), ['a', 'c'])
  assert.deepEqual(ids(result.earlier), ['b'])
  assert.deepEqual(ids(result.fresh), ['c'])
})

test('clustering keeps one story per event and prefers a pictured version', () => {
  const plain = story('a', 'Lena Okafor wins Nobel Peace Prize', 5)
  const pictured = withImage(story('b', 'South African human rights lawyer Lena Okafor wins the Nobel Peace Prize', 5))
  const other = story('c', 'Anne Carson wins Nobel Literature Prize', 5)
  assert.deepEqual(ids(cluster([plain, pictured, other])), ['b', 'c'])
  const hoursLater = withImage(story('d', 'South African lawyer Lena Okafor wins Nobel Peace Prize', 0))
  assert.deepEqual(ids(cluster([plain, other, hoursLater])), ['a', 'c'], 'A later story is not swapped in')
})

test('similarity is fast enough for a large history', () => {
  const seen = new SeenStore()
  for (let index = 0; index < SEEN_LIMIT; index++) seen.mark(story(`s${index}`, headline(index), index % 400), NOW)
  const page = []
  for (let index = 0; index < 100; index++) page.push(story(`n${index}`, headline(5000 + index), index))
  assert.equal(seen.size, SEEN_LIMIT)
  const started = performance.now()
  const result = replace([], [], page, seen, NOW)
  assert.ok(performance.now() - started < 1500, 'Merging a page must not stall the page')
  assert.equal(result.visible.length, 100)
})

test('the constants match the Android app', () => {
  assert.equal(MIN_SHARED, 3)
  assert.equal(KEY_LIMIT, 160)
  assert.equal(WINDOW_MS, 16 * HOUR)
  assert.equal(CLOSE_MS, 3 * HOUR)
  assert.equal(EARLIER_LIMIT, 200)
  assert.equal(SEEN_LIMIT, 1500)
  assert.equal(SEEN_MAX_AGE_MS, 30 * 24 * HOUR)
  assert.equal(SEEN_EVERGREEN_AGE_MS, 7 * 24 * HOUR)
})

test('words are stemmed before the stop word, year and digit checks', () => {
  const tokens = (text) => printOfHeadline(text, 0, true).tokens
  assert.deepEqual(tokens('Hearts, glass, virus, crisis, cats, the 2026 12345 of ab'), ['cats', 'crisis', 'glass', 'heart', 'virus'])
  assert.deepEqual(tokens('Octopus octopus OCTOPUS'), ['octopus'], 'tokens are unique')
  // "stocks" is a stop word but its stem "stock" is not, so it still counts; "reports" stems onto a stop word.
  assert.deepEqual(tokens('stocks reports report'), ['stock'])
  assert.deepEqual(tokens('1999 2026 2100 3000 1900s'), [], 'years and all-digit words never count')
  assert.deepEqual(tokens('सुप्रीम कोर्ट की नहीं और टिप्पणी'), ['कोर्ट', 'टिप्पणी', 'सुप्रीम'], 'Hindi function words are dropped')
  assert.deepEqual(tokens('ＮＡＳＡ ﬁnds ｗater'), ['find', 'nasa', 'water'], 'NFKC folds full-width letters and ligatures')
})

test('the key keeps every word, single spaced and capped at the key limit', () => {
  assert.equal(printOfHeadline('  The Quick,  BROWN fox!! 2026 ', 0, true).key, 'the quick brown fox 2026')
  assert.equal(printOfHeadline('', 0, true).key, '')
  const long = printOfHeadline(Array.from({ length: 80 }, (_, index) => `word${index}`).join(' '), 0, true)
  assert.equal(long.key.length, KEY_LIMIT)
})

test('empty inputs are handled', () => {
  assert.deepEqual(printOfHeadline('', 0, true), { tokens: [], key: '', published: 0, timely: true })
  const empty = printOfHeadline('', 0, true)
  assert.equal(sameEvent(empty, printOfHeadline('!!!', 0, true)), false, 'Two empty keys are not the same event')
  const seen = new SeenStore()
  const lone = story('a', 'Lena Okafor wins Nobel Peace Prize', 1)
  assert.deepEqual(cluster([]), [])
  assert.equal(covers([], lone), false)
  assert.equal(seen.size, 0)
  assert.deepEqual(seen.recentIds(5), [])
  assert.equal(seen.toJson(), '{"schema":1,"seen":[]}')
  assert.equal(SeenStore.fromJson(seen.toJson(), NOW).size, 0)
  for (const merge of [replace, append]) {
    assert.deepEqual(merge([], [], [], seen, NOW), { visible: [], earlier: [], fresh: [] })
    assert.deepEqual(ids(merge([lone], [], [], seen, NOW).visible), ['a'])
  }
  assert.deepEqual(ids(replace([], [], [lone], seen, NOW).fresh), ['a'])
})

test('a blank title falls back to the lead of the content', () => {
  const body = 'Lena Okafor wins Nobel Peace Prize. The committee praised years of work. More follows.'
  const titled = printOf({ id: 'a', title: 'Lena Okafor wins Nobel Peace Prize', content: 'x', category: 'news' })
  for (const title of [undefined, '', '   ', '\n\t ']) {
    const print = printOf({ id: 'b', title, content: body, category: 'news' })
    assert.equal(print.key, 'lena okafor wins nobel peace prize', JSON.stringify(title))
    assert.deepEqual(print.tokens, titled.tokens)
  }
  assert.equal(printOf({ id: 'c', title: 'Real title here', content: body, category: 'news' }).key, 'real title here')
  // A full stop within the first 20 characters is not a sentence end; past 140 characters the text is cut.
  assert.equal(printOf({ id: 'd', content: 'Dr. Okafor wins. Nobel prize', category: 'news' }).key, 'dr okafor wins nobel prize')
  const cut = printOf({ id: 'e', content: `${'abcdefghi '.repeat(20)}end. more`, category: 'news' })
  assert.equal(cut.key, 'abcdefghi '.repeat(14).trim())
  assert.equal(printOf({ id: 'f', title: '', content: '', category: 'news' }).key, '')
})

test('a translated card keeps the identity of the headline the source wrote', () => {
  const english = story('a', 'Lena Okafor wins Nobel Peace Prize', 5)
  const translated = { ...english, title: 'लीना ओकाफोर को नोबेल शांति पुरस्कार', originalTitle: english.title }
  assert.equal(printOf(translated).key, printOf(english).key)
  assert.deepEqual(printOf(translated).tokens, printOf(english).tokens)
  const other = story('b', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 4)
  assert.equal(sameEvent(printOf(translated), printOf(other)), true, 'Translating a card does not hide a repeat')
  // Without the original (a feed that is already in the reader's language) the title is used as before.
  assert.equal(printOf({ ...english, originalTitle: '' }).key, printOf(english).key)
  assert.equal(printOf({ ...english, originalTitle: undefined }).key, printOf(english).key)
  const seen = new SeenStore()
  seen.mark(english, NOW)
  assert.equal(seen.contains(translated, NOW), true, 'A story seen in English is still seen once translated')
})

test('a story whose id could not be stored and read back is never recorded', () => {
  const seen = new SeenStore()
  assert.equal(seen.mark(story('', 'Lena Okafor wins Nobel Peace Prize', 1), NOW), false)
  assert.equal(seen.mark(story('x'.repeat(201), 'Lena Okafor wins Nobel Peace Prize', 1), NOW), false)
  assert.equal(seen.size, 0)
  assert.equal(seen.mark(story('x'.repeat(200), 'Lena Okafor wins Nobel Peace Prize', 1), NOW), true)
  assert.equal(SeenStore.fromJson(seen.toJson(), NOW).size, 1, 'What was recorded can always be read back')
})

test('timely is a publish time or the news category, and the time is kept whole', () => {
  const base = { id: 'a', title: 'Some headline words', content: 'x' }
  assert.equal(printOf({ ...base, category: 'news' }).timely, true)
  assert.equal(printOf({ ...base, category: 'nature' }).timely, false)
  assert.equal(printOf({ ...base, category: 'nature', publishedAt: NOW }).timely, true)
  assert.equal(printOf({ ...base, category: 'nature', publishedAt: 0 }).timely, false)
  assert.equal(printOf({ ...base, category: 'nature', publishedAt: NOW }).published, NOW)
  for (const odd of [Number.NaN, -5, Infinity, Number.MAX_SAFE_INTEGER + 2, undefined, null]) {
    const print = printOf({ ...base, category: 'nature', publishedAt: odd })
    assert.deepEqual([print.published, print.timely], [0, false], String(odd))
  }
  assert.equal(printOf({ ...base, category: 'news', publishedAt: NOW + 0.75 }).published, NOW)
})

test('the same event is decided by shared words, their overlap and how close the stories are', () => {
  const a10 = topics('alpha', 10)
  // Three of ten words in common: too loose to be the same event unless the stories came out together.
  const loose = printWith([...a10.slice(0, 3), ...topics('beta', 7)], NOW)
  assert.equal(sameEventAt(printWith(a10, NOW), NOW, loose, NOW + 2 * HOUR), true)
  assert.equal(sameEventAt(printWith(a10, NOW), NOW, loose, NOW + 4 * HOUR), false)
  assert.equal(sameEventAt(printWith(a10, NOW), NOW, loose, NOW + CLOSE_MS), true, 'three hours apart still counts as close')
  // Two shared words are never enough.
  assert.equal(sameEventAt(printWith(a10, NOW), NOW, printWith([...a10.slice(0, 2), ...topics('beta', 8)], NOW), NOW), false)
  // Jaccard 3/11 passes on its own anywhere inside the window, and nowhere beyond it.
  const near = printWith([...a10.slice(0, 3), ...topics('gamma', 4)], NOW)
  const seven = printWith([...a10.slice(0, 3), ...topics('delta', 4)], NOW)
  assert.equal(sameEventAt(near, NOW, seven, NOW + 10 * HOUR), true)
  assert.equal(sameEventAt(near, NOW, seven, NOW + WINDOW_MS), true)
  assert.equal(sameEventAt(near, NOW, seven, NOW + WINDOW_MS + 1), false)
  // A short headline almost wholly inside a long one (containment 3/4) is the same event at any distance in the window.
  const short = printWith(a10.slice(0, 4), NOW)
  const wide = printWith([...a10.slice(0, 3), ...topics('omega', 17)], NOW)
  assert.equal(sameEventAt(short, NOW, wide, NOW + 10 * HOUR), true)
  // Evergreen prints never match by overlap, but an identical key always does.
  assert.equal(sameEventAt(printWith(a10, 0, false), 0, printWith(a10, 0, false), 0), true)
  assert.equal(sameEventAt(printWith(a10, 0, false), 0, printWith([...a10, 'extrax'], 0, false), 0), false)
  assert.equal(sameEventAt(printWith(a10, NOW), NOW, printWith(a10, NOW), NOW + 30 * HOUR), true, 'equal keys ignore the window')
})

test('without both publish times only the wording decides, and the close rule applies', () => {
  const a10 = topics('alpha', 10)
  const loose = [...a10.slice(0, 3), ...topics('beta', 7)]
  assert.equal(sameEvent(printWith(a10, NOW), printWith(loose, 0)), true)
  assert.equal(sameEvent(printWith(a10, 0), printWith(loose, 0)), true)
  assert.equal(sameEvent(printWith(a10, NOW), printWith(loose, NOW + 4 * HOUR)), false)
  assert.equal(sameEvent(printWith(a10, 0, false), printWith(loose, 0, true)), false)
})

test('a story with no publish time is placed by when it was seen', () => {
  const seen = new SeenStore()
  seen.mark(story('a', 'Harbour bridge reopens after three year repair programme', -1), NOW)
  const again = story('b', 'Harbour bridge finally reopens following three year programme of repairs', -1)
  assert.equal(seen.contains(again, NOW + 2 * HOUR), true)
  assert.equal(seen.contains(again, NOW + 20 * HOUR), false, 'Seen more than 16 hours ago counts as another event')
  const dated = story('c', 'Harbour bridge finally reopens following three year programme of repairs', 1)
  assert.equal(seen.contains(dated, NOW + 20 * HOUR), true, 'A dated story is compared at its publish time')
})

test('evergreen entries are forgotten after a week and news after thirty days', () => {
  const entry = (id, key, published, seenAt, timely) => ({ id, k: key, p: published, t: seenAt, n: timely })
  const text = JSON.stringify({
    schema: 1,
    seen: [
      entry('news-old', 'alpha one story', NOW - 31 * 24 * HOUR, NOW - 31 * 24 * HOUR, true),
      entry('news-ok', 'beta two story', NOW - 29 * 24 * HOUR, NOW - 29 * 24 * HOUR, true),
      entry('fact-old', 'gamma three fact', 0, NOW - 8 * 24 * HOUR, false),
      entry('fact-ok', 'delta four fact', 0, NOW - 6 * 24 * HOUR, false),
    ],
  })
  assert.deepEqual(SeenStore.fromJson(text, NOW).recentIds(10), ['fact-ok', 'news-ok'])
})

test('a stored history longer than the limit keeps only the newest entries', () => {
  const seen = Array.from({ length: SEEN_LIMIT + 5 }, (_, index) => ({ id: `s${index}`, k: headline(index), p: 0, t: NOW, n: true }))
  const reloaded = SeenStore.fromJson(JSON.stringify({ schema: 1, seen }), NOW)
  assert.equal(reloaded.size, SEEN_LIMIT)
  assert.deepEqual(reloaded.recentIds(2), [`s${SEEN_LIMIT + 4}`, `s${SEEN_LIMIT + 3}`])
  assert.equal(reloaded.contains({ id: 's4', title: 'unrelated words nothing', content: '', category: 'nature' }, NOW), false)
})

test('the saved history has the same JSON shape as the Android app', () => {
  const seen = new SeenStore()
  seen.mark(story('a', 'Lena Okafor wins Nobel Peace Prize', 5), NOW)
  seen.mark({ id: 'f', title: 'Octopuses have three hearts!', content: 'Body', category: 'nature' }, NOW + 1)
  assert.equal(
    seen.toJson(),
    `{"schema":1,"seen":[{"id":"a","k":"lena okafor wins nobel peace prize","p":${NOW - 5 * HOUR},"t":${NOW},"n":true},` +
      `{"id":"f","k":"octopuses have three hearts","p":0,"t":${NOW + 1},"n":false}]}`
  )
})

test('a key cut at the key limit survives a save and reload', () => {
  const long = story('long', LONG_HEADLINE, 2)
  assert.ok(LONG_HEADLINE.length > KEY_LIMIT)
  const seen = new SeenStore()
  assert.equal(seen.mark(long, NOW), true)
  const stored = JSON.parse(seen.toJson()).seen[0]
  assert.equal(stored.k.length, KEY_LIMIT)
  const reloaded = SeenStore.fromJson(seen.toJson(), NOW)
  assert.equal(reloaded.size, 1)
  assert.equal(reloaded.contains(long, NOW), true)
  assert.equal(reloaded.contains({ ...long, id: 'other' }, NOW), true, 'Another id with the same words matches by key')
  assert.equal(reloaded.contains(story('x', 'Lena Okafor wins Nobel Peace Prize', 1), NOW), false)
  assert.equal(reloaded.toJson(), seen.toJson(), 'The key is stable across further reloads')
})

test('a publish time that is not a whole number still saves and reloads', () => {
  const seen = new SeenStore()
  const base = { content: 'x', category: 'news' }
  seen.mark({ ...base, id: 'nan', title: 'Alpha bravo charlie delta', publishedAt: Number.NaN }, NOW)
  seen.mark({ ...base, id: 'neg', title: 'Echo foxtrot golf hotel', publishedAt: -7 }, NOW)
  seen.mark({ ...base, id: 'frac', title: 'India juliet kilo lima', publishedAt: NOW - HOUR + 0.5 }, NOW)
  const reloaded = SeenStore.fromJson(seen.toJson(), NOW)
  assert.deepEqual(reloaded.recentIds(5), ['frac', 'neg', 'nan'])
})

test('a history written by the Android app is read back unchanged', () => {
  // Output of the Android SeenStore.toJson for a Hindi headline, an evergreen fact, a headline cut at the key limit
  // and a quoted id; each probe below gave the same answer on Android.
  const written = String.raw`{"schema":1,"seen":[{"id":"bbc-a1","k":"दिल्ली मेट्रो बंद करने पर सुप्रीम कोर्ट की टिप्पणी","p":1799982000000,"t":1799985600000,"n":true},{"id":"wiki-7","k":"octopuses have three hearts and blue blood","p":0,"t":1799827200000,"n":false},{"id":"long-1","k":"parliament passes sweeping reform bill after marathon overnight debate as opposition members walk out in protest over amendments to the national budget citing c","p":1799996400000,"t":1799996400000,"n":true},{"id":"quote-\"7\"","k":"a short summary of quote 7","p":0,"t":1799998200000,"n":true}]}`
  const seen = SeenStore.fromJson(written, NOW)
  assert.equal(seen.size, 4)
  assert.equal(seen.toJson(), written)
  assert.deepEqual(seen.recentIds(10), ['quote-"7"', 'long-1', 'wiki-7', 'bbc-a1'])
  const probe = (id, title, hoursAgo, category = 'news') =>
    seen.contains({ id, title, content: 'x', category, publishedAt: hoursAgo < 0 ? 0 : NOW - hoursAgo * HOUR }, NOW)
  assert.equal(probe('p1', 'दिल्ली मेट्रो बंद करने पर सुप्रीम कोर्ट की टिप्पणी', 5), true)
  assert.equal(probe('p2', 'सुप्रीम कोर्ट ने दिल्ली मेट्रो पूरी तरह बंद करने पर जताई आपत्ति', 4), true)
  assert.equal(probe('p3', 'Octopuses have three hearts and blue blood', -1, 'nature'), true)
  assert.equal(probe('p4', LONG_HEADLINE, 1), true)
  assert.equal(probe('p7', 'Parliament passes sweeping reform bill after marathon overnight debate', 2), true)
  assert.equal(probe('p5', 'Anne Carson wins Nobel Literature Prize', 1), false)
  assert.equal(probe('quote-"7"', 'Completely unrelated words here', 0), true, 'matched by id')
})

test('recent ids honour the maximum', () => {
  const seen = new SeenStore()
  for (let index = 0; index < 4; index++) seen.mark(story(`s${index}`, headline(index), -1), NOW + index)
  assert.deepEqual(seen.recentIds(2), ['s3', 's2'])
  assert.deepEqual(seen.recentIds(0), [])
  assert.deepEqual(seen.recentIds(-1), [])
  assert.deepEqual(seen.recentIds(99), ['s3', 's2', 's1', 's0'])
})

test('covers matches an id or another outlets version of the same event', () => {
  const first = story('a', 'Lena Okafor wins Nobel Peace Prize', 5)
  assert.equal(covers([], first), false)
  assert.equal(covers([first], first), true)
  assert.equal(covers([first], { ...story('zz', 'Something else entirely about harbour bridges', 5), id: 'a' }), true)
  assert.equal(covers([first], story('b', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 4)), true)
  assert.equal(covers([first], story('c', 'Anne Carson wins Nobel Literature Prize', 4)), false)
})

test('clustering prefers a picture only for a real https link and a similar time', () => {
  const plain = story('a', 'Lena Okafor wins Nobel Peace Prize', 5)
  const twin = (image, hours = 5) => ({ ...story('b', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', hours), image })
  const picked = (candidate) => ids(cluster([plain, candidate]))[0]
  assert.equal(picked(twin('https://img.example.com/b.jpg')), 'b')
  assert.equal(picked(twin('HTTPS://IMG.EXAMPLE.COM/b.jpg?w=1&h=2#x')), 'b')
  assert.equal(picked(twin('https://img.example.com')), 'b')
  assert.equal(picked(twin('https://img.example.com/b.jpg?x=[1]')), 'b', 'brackets are fine in a query')
  for (const bad of [
    '',
    'http://img.example.com/b.jpg',
    'https://img.example.com:8443/b.jpg',
    'https://user@img.example.com/b.jpg',
    'https:///b.jpg',
    'https://img.example.com/a b.jpg',
    'https://img.example.com/a|b.jpg',
    'https://img.example.com/100%.jpg',
    'https://img.example.com/a[1].jpg',
    // A feed that leaves "&#038;" undecoded puts a second # in the link, which java.net.URI refuses.
    'https://platform.theverge.com/b.jpg?quality=90&#038;strip=all&#038;crop=0,0,100,100',
    'ftp://img.example.com/b.jpg',
    '/b.jpg',
  ]) {
    assert.equal(picked(twin(bad)), 'a', bad)
  }
  assert.equal(picked(twin('https://img.example.com/b.jpg', 1)), 'a', 'four hours apart')
  const unknown = { ...twin('https://img.example.com/b.jpg'), publishedAt: 0 }
  assert.equal(picked(unknown), 'b', 'an unknown time may still swap in a picture')
  const both = withImage(plain)
  assert.deepEqual(ids(cluster([both, twin('https://img.example.com/b.jpg')])), ['a'], 'the first pictured story stays')
})

test('earlier stories are capped and listed once', () => {
  const seen = new SeenStore()
  const page = []
  for (let index = 0; index < EARLIER_LIMIT + 50; index++) page.push(story(`p${index}`, headline(index), index % 10))
  for (const item of page) seen.mark(item, NOW)
  const result = replace([], [], page, seen, NOW)
  assert.equal(result.earlier.length, EARLIER_LIMIT)
  assert.deepEqual(ids(result.earlier), ids(page.slice(0, EARLIER_LIMIT)))
  const again = append([], page.slice(0, 3), page.slice(0, 5), seen, NOW)
  assert.deepEqual(ids(again.earlier), ['p0', 'p1', 'p2', 'p3', 'p4'])
})

test('a viewed story on screen and already in earlier moves to earlier once', () => {
  const seen = new SeenStore()
  const viewed = story('a', 'Harbour bridge reopens after three year repair programme', 6)
  seen.mark(viewed, NOW)
  const result = replace([viewed], [viewed], [], seen, NOW)
  assert.deepEqual(ids(result.visible), [])
  assert.deepEqual(ids(result.earlier), ['a'])
})

test('merging does not change what it was given', () => {
  const seen = new SeenStore()
  const read = story('r', 'Harbour bridge reopens after three year repair programme', 6)
  seen.mark(read, NOW)
  const visible = [read, story('v', 'Council approves riverside housing development despite objections', 5)]
  const earlier = [story('e', 'Central bank holds interest rates steady citing inflation worries', 9)]
  const page = [story('n', 'Glacier survey finds Himalayan ice melting faster than models predicted', 1), read]
  const before = JSON.stringify([visible, earlier, page])
  for (const merge of [replace, append]) {
    const result = merge(visible, earlier, page, seen, NOW)
    result.visible.push(read)
    result.earlier.length = 0
    result.fresh.length = 0
  }
  assert.equal(JSON.stringify([visible, earlier, page]), before)
})

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  }
}

function inBrowser(localStorage, run) {
  globalThis.window = { localStorage }
  try {
    return run()
  } finally {
    delete globalThis.window
  }
}

test('storage: an empty store when nothing is saved', () => {
  const storage = fakeStorage()
  const seen = inBrowser(storage, () => loadSeen(NOW))
  assert.equal(seen.size, 0)
  assert.equal(storage.data.size, 0)
})

test('storage: a saved history is loaded again', () => {
  const storage = fakeStorage()
  const first = story('a', 'Lena Okafor wins Nobel Peace Prize', 5)
  const seen = new SeenStore()
  seen.mark(first, NOW)
  inBrowser(storage, () => saveSeen(seen))
  assert.equal(SEEN_STORAGE_KEY, 'plax-seen-v1')
  assert.equal(storage.data.get(SEEN_STORAGE_KEY), seen.toJson())
  const loaded = inBrowser(storage, () => loadSeen(NOW))
  assert.equal(loaded.size, 1)
  assert.equal(loaded.contains({ ...first, id: 'other' }, NOW), true)
})

test('storage: a damaged history is discarded and removed', () => {
  for (const damaged of ['{"schema":1,"seen":[{"id":""}]}', 'not json', '[]']) {
    const storage = fakeStorage({ [SEEN_STORAGE_KEY]: damaged })
    assert.equal(inBrowser(storage, () => loadSeen(NOW)).size, 0, damaged)
    assert.equal(storage.data.has(SEEN_STORAGE_KEY), false, damaged)
  }
})

test('storage: an old history is pruned on load', () => {
  const old = { schema: 1, seen: [{ id: 'a', k: 'some old story', p: 0, t: NOW - 31 * 24 * HOUR, n: true }] }
  const storage = fakeStorage({ [SEEN_STORAGE_KEY]: JSON.stringify(old) })
  assert.equal(inBrowser(storage, () => loadSeen(NOW)).size, 0)
})

test('storage: a full or blocked store is swallowed', () => {
  const seen = new SeenStore()
  seen.mark(story('a', 'Lena Okafor wins Nobel Peace Prize', 5), NOW)
  const full = { ...fakeStorage(), setItem: () => { throw new DOMException('quota', 'QuotaExceededError') } }
  assert.doesNotThrow(() => inBrowser(full, () => saveSeen(seen)))
  const blocked = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('denied') },
    removeItem: () => { throw new Error('denied') },
  }
  assert.equal(inBrowser(blocked, () => loadSeen(NOW)).size, 0)
  assert.doesNotThrow(() => inBrowser(blocked, () => saveSeen(seen)))
  const denied = { ...fakeStorage({ [SEEN_STORAGE_KEY]: 'not json' }), removeItem: () => { throw new Error('denied') } }
  assert.equal(inBrowser(denied, () => loadSeen(NOW)).size, 0)
})

test('storage: without a window (server render) nothing is read or written', () => {
  assert.equal(typeof globalThis.window, 'undefined')
  assert.equal(loadSeen(NOW).size, 0)
  assert.doesNotThrow(() => saveSeen(new SeenStore()))
})

