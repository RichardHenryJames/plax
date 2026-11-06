import { SeenStore as SharedSeenStore, append as sharedAppend, cluster as sharedCluster, replace as sharedReplace, type EngineStory } from '@shared/story-engine'
import { SEEN_EVERGREEN_AGE_MS, SEEN_LIMIT, SEEN_MAX_AGE_MS, SeenParseError, SeenStore } from '../seen-store'
import { EARLIER_LIMIT, appendPage, cluster, covers, replacePage } from '../feed-merge'
import { CLOSE_MS, KEY_LIMIT, MIN_SHARED, WINDOW_MS, printOf, sameStory } from '../similarity'
import { makeStory, type Story } from '../story'
import { HOUR, headline, ids } from './helpers'

const NOW = 1_800_000_000_000

/** A news story published this many hours before NOW (or with no publish time when negative). */
function news(id: string, title: string, publishedHoursAgo: number): Story {
  return makeStory({
    id,
    title,
    content: `A short summary of ${id}`,
    category: 'news',
    source: `Outlet ${id}`,
    sourceUrl: `https://example.com/${id}`,
    publishedAt: publishedHoursAgo < 0 ? 0 : NOW - publishedHoursAgo * HOUR,
  })
}

const withImage = (item: Story): Story => makeStory({ ...item, image: `https://img.example.com/${item.id}.jpg` })

describe('one event told by several outlets', () => {
  it('is recognised however each outlet words it', () => {
    const a = news('a', 'Lena Okafor wins Nobel Peace Prize', 5)
    const b = news('b', 'South African human rights lawyer Lena Okafor wins the Nobel Peace Prize', 4)
    const c = news('c', 'Indian-Origin Lena Okafor Awarded Nobel Peace Prize 2026', 5)
    const d = news('d', "Nobel chair admits they haven't reached Peace Prize winner Okafor", 4)
    for (const x of [a, b, c, d]) for (const y of [a, b, c, d]) expect({ x: x.id, y: y.id, same: sameStory(x, y) }).toEqual({ x: x.id, y: y.id, same: true })
  })

  it('is not mistaken for another when only a template of the wording is shared', () => {
    expect(sameStory(news('a', '7 workers killed, 20 injured as pickup collides with truck in Oakvale', 2), news('b', 'Driver Killed, 12 Injured After Bus Collides With Truck In Marrow Bay', 2))).toBe(false)
    // A prize and a year are not an event.
    expect(sameStory(news('a', 'Nobel Prize 2026: Three Science Discoveries That Sound Like Fiction', 1), news('b', 'Lena Okafor wins Nobel Peace Prize', 1))).toBe(false)
    // Two different Nobel winners.
    expect(sameStory(news('a', 'Anne Carson wins Nobel Literature Prize', 1), news('b', 'Lena Okafor wins Nobel Peace Prize', 1))).toBe(false)
    expect(sameStory(news('a', 'Stocks making the biggest moves premarket: Alder, Birch, Cedar, Dune', 4), news('b', 'Stocks making the biggest moves midday: Goldwyn, Hartley, Ivy, Jorvik', 1))).toBe(false)
  })

  it('is one for the updates of a live blog, but the next day\u2019s blog is not', () => {
    const morning = news('a', 'Sensex today | Stock Market Live: Sensex gains over 879 points, Nifty tops 22,520', 3)
    const noon = news('b', 'Stock Market LIVE Updates, Sensex Today: Sensex gains nearly 1,000 points, Nifty tops 22,540', 1)
    const nextDay = news('c', 'Sensex today | Stock Market Live: Sensex gains over 450 points, Nifty tops 22,880', -1)
    expect(sameStory(morning, noon)).toBe(true)
    const yesterday = news('d', 'Sensex today | Stock Market Live: Sensex gains over 879 points, Nifty tops 22,520', 27)
    const today = news('e', 'Sensex today | Stock Market Live: Sensex gains over 450 points, Nifty tops 22,880', 3)
    expect(sameStory(yesterday, today)).toBe(false)
    // Unknown publish times fall back to wording alone.
    expect(sameStory(morning, nextDay)).toBe(true)
  })

  it('is matched for identical headlines only when they are timely or exactly equal', () => {
    const fact = (id: string, title: string) => makeStory({ id, title, content: `Body ${id}`, category: 'nature', source: 'Wikipedia' })
    const a = fact('f1', 'Octopuses have three hearts and blue blood')
    const same = fact('f2', 'Octopuses have three hearts and blue blood!')
    const related = fact('f3', 'Why octopuses have three hearts and bright blue blood explained')
    expect(sameStory(a, same)).toBe(true)
    // Evergreen facts are never merged by overlap.
    expect(sameStory(a, related)).toBe(false)
  })

  it('is judged in Hindi as in English', () => {
    const a = news('a', 'दिल्ली मेट्रो बंद करने पर सुप्रीम कोर्ट की सख़्त टिप्पणी, प्रदर्शन के लिए मार्ग खुले रखें', 2)
    const b = news('b', 'सुप्रीम कोर्ट ने दिल्ली मेट्रो पूरी तरह बंद करने पर जताई आपत्ति, प्रदर्शन के मार्ग', 2)
    const c = news('c', 'भारतीय टीम ने श्रीलंका को तीसरे वनडे में हराकर सीरीज़ जीती', 2)
    expect(sameStory(a, b)).toBe(true)
    expect(sameStory(a, c)).toBe(false)
  })

  it('uses the first sentence of the text for a story that has no headline', () => {
    const quote = makeStory({ id: 'q', content: 'Doubt is not a pleasant condition. But certainty is absurd.', category: 'philosophy' })
    expect(printOf(quote).key).toBe('doubt is not a pleasant condition')
    expect(printOf(quote).timely).toBe(false)
  })

  it('keeps a headline key of at most 160 characters, and the windows the website uses', () => {
    expect(printOf(news('a', 'word '.repeat(100), 1)).key.length).toBeLessThanOrEqual(KEY_LIMIT)
    expect([KEY_LIMIT, MIN_SHARED, WINDOW_MS, CLOSE_MS]).toEqual([160, 3, 16 * HOUR, 3 * HOUR])
  })

  it('has one fingerprint per story, made once', () => {
    const item = news('a', 'Lena Okafor wins Nobel Peace Prize', 5)
    expect(printOf(item)).toBe(printOf(item))
    expect(printOf(news('a', 'Lena Okafor wins Nobel Peace Prize', 5))).not.toBe(printOf(item))
    expect(printOf(item)).toEqual(printOf(news('a', 'Lena Okafor wins Nobel Peace Prize', 5)))
  })
})

describe('the seen history', () => {
  it('recognises a story again, and another outlet\u2019s version of it', () => {
    const seen = new SeenStore()
    const first = news('a', 'Lena Okafor wins Nobel Peace Prize', 5)
    expect(seen.contains(first, NOW)).toBe(false)
    expect(seen.mark(first, NOW)).toBe(true)
    // Marking twice changes nothing.
    expect(seen.mark(first, NOW)).toBe(false)
    expect(seen.contains(first, NOW)).toBe(true)
    expect(seen.contains(news('a', 'Edited headline that shares nothing at all', 5), NOW)).toBe(true)
    expect(seen.contains(news('b', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 4), NOW)).toBe(true)
    expect(seen.contains(news('c', 'Anne Carson wins Nobel Literature Prize', 4), NOW)).toBe(false)
    expect(seen.size).toBe(1)
  })

  it('round-trips, and forgets the entries older than 30 days', () => {
    const seen = new SeenStore()
    seen.mark(news('old', 'Harbour bridge reopens after three year repair programme', 1), NOW - 31 * 24 * HOUR)
    seen.mark(news('new', 'Lena Okafor wins Nobel Peace Prize', 2), NOW)
    const reloaded = SeenStore.fromJson(seen.toJson(), NOW)
    expect(reloaded.size).toBe(1)
    expect(reloaded.contains(news('new', 'Lena Okafor wins Nobel Peace Prize', 2), NOW)).toBe(true)
    // The wording fingerprint survives a restart.
    expect(reloaded.contains(news('other', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 1), NOW)).toBe(true)
    expect(reloaded.recentIds(5)).toEqual(['new'])
  })

  it('forgets the evergreen entries after a week and the news after a month', () => {
    const fact = makeStory({ id: 'fact', title: 'Octopuses have three hearts', content: 'Body', category: 'nature' })
    const item = news('item', 'Harbour bridge reopens after three year repair programme', 1)
    const seen = new SeenStore()
    seen.mark(fact, NOW)
    seen.mark(item, NOW)
    expect(SeenStore.fromJson(seen.toJson(), NOW + SEEN_EVERGREEN_AGE_MS).size).toBe(2)
    expect(SeenStore.fromJson(seen.toJson(), NOW + SEEN_EVERGREEN_AGE_MS + 1).recentIds(5)).toEqual(['item'])
    expect(SeenStore.fromJson(seen.toJson(), NOW + SEEN_MAX_AGE_MS).recentIds(5)).toEqual(['item'])
    expect(SeenStore.fromJson(seen.toJson(), NOW + SEEN_MAX_AGE_MS + 1).size).toBe(0)
  })

  it('is bounded, and the newest ids come first', () => {
    const seen = new SeenStore()
    for (let index = 0; index < SEEN_LIMIT + 50; index++) seen.mark(news(`s${index}`, headline(index), -1), NOW + index)
    expect(seen.size).toBe(SEEN_LIMIT)
    expect(seen.recentIds(3)).toEqual(['s1549', 's1548', 's1547'])
    expect(seen.contains(news('s49', headline(49), -1), NOW + 2000)).toBe(false)
    expect(seen.contains(news('s50', headline(50), -1), NOW + 2000)).toBe(true)
    expect(SeenStore.fromJson(seen.toJson(), NOW + 2000).size).toBe(SEEN_LIMIT)
  })

  it('lists the most recent ids up to the number asked for', () => {
    const seen = new SeenStore()
    for (let index = 0; index < 5; index++) seen.mark(news(`s${index}`, headline(index), -1), NOW + index)
    expect(seen.recentIds(2)).toEqual(['s4', 's3'])
    expect(seen.recentIds(0)).toEqual([])
    expect(seen.recentIds(50)).toHaveLength(5)
  })

  it('never records a story whose id could not be read back', () => {
    const seen = new SeenStore()
    expect(seen.mark(news('', 'Lena Okafor wins Nobel Peace Prize', 1), NOW)).toBe(false)
    expect(seen.mark(news('x'.repeat(201), 'Lena Okafor wins Nobel Peace Prize', 1), NOW)).toBe(false)
    expect(seen.size).toBe(0)
    expect(seen.mark(news('x'.repeat(200), 'Lena Okafor wins Nobel Peace Prize', 1), NOW)).toBe(true)
    // What was recorded can always be read back.
    expect(SeenStore.fromJson(seen.toJson(), NOW).size).toBe(1)
  })

  it('refuses a damaged history instead of trusting it', () => {
    const invalid = [
      '',
      '[]',
      'null',
      '{bad',
      '{"schema":2,"seen":[]}',
      '{"schema":"1","seen":[]}',
      '{"schema":1}',
      '{"schema":1,"seen":{}}',
      '{"schema":1,"seen":[{}]}',
      '{"schema":1,"seen":[null]}',
      '{"schema":1,"seen":[{"id":"","k":"x","p":0,"t":1,"n":true}]}',
      '{"schema":1,"seen":[{"id":"a","k":"x","p":-5,"t":1,"n":true}]}',
      '{"schema":1,"seen":[{"id":"a","k":"x","p":0,"t":-1,"n":true}]}',
      '{"schema":1,"seen":[{"id":"a","k":"x","p":"0","t":1,"n":true}]}',
      '{"schema":1,"seen":[{"id":"a","k":"x","p":0,"t":1,"n":"true"}]}',
      '{"schema":1,"seen":[{"id":"a","k":5,"p":0,"t":1,"n":true}]}',
      `{"schema":1,"seen":[{"id":"${'i'.repeat(201)}","k":"x","p":0,"t":1,"n":true}]}`,
      `{"schema":1,"seen":[{"id":"a","k":"${'k'.repeat(601)}","p":0,"t":1,"n":true}]}`,
    ]
    for (const text of invalid) expect({ text, error: (() => { try { SeenStore.fromJson(text, NOW); return null } catch (e) { return e instanceof SeenParseError } })() }).toEqual({ text, error: true })
  })

  it('reads the history the native app wrote', () => {
    const native = JSON.stringify({ schema: 1, seen: [{ id: 'bbc-1', k: 'lena okafor wins nobel peace prize', p: NOW - 5 * HOUR, t: NOW - HOUR, n: true }, { id: 'quote-1', k: 'doubt is not a pleasant condition', p: 0, t: NOW - HOUR, n: false }] })
    const seen = SeenStore.fromJson(native, NOW)
    expect(seen.size).toBe(2)
    expect(seen.recentIds(5)).toEqual(['quote-1', 'bbc-1'])
    expect(seen.contains(news('other', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 4), NOW)).toBe(true)
    expect(JSON.parse(seen.toJson())).toEqual(JSON.parse(native))
  })

  it('does not match a story to an expired entry', () => {
    const seen = new SeenStore()
    seen.mark(news('a', 'Lena Okafor wins Nobel Peace Prize', 5), NOW - 40 * 24 * HOUR)
    expect(SeenStore.fromJson(seen.toJson(), NOW).contains(news('a', 'Lena Okafor wins Nobel Peace Prize', 5), NOW)).toBe(false)
  })

  it('merges two histories into one: the later time for an id seen twice, the newest entries when there are too many', () => {
    const a = new SeenStore()
    const b = new SeenStore()
    a.mark(news('shared', headline(1), -1), NOW - 3 * HOUR)
    a.mark(news('only-a', headline(2), -1), NOW - 2 * HOUR)
    b.mark(news('shared', headline(1), -1), NOW - HOUR)
    b.mark(news('only-b', headline(3), -1), NOW - 4 * HOUR)
    const merged = a.merge(b, NOW)
    expect(merged.size).toBe(3)
    expect(merged.recentIds(5)).toEqual(['shared', 'only-a', 'only-b'])
    expect(a.size).toBe(2)
    expect(b.size).toBe(2)

    const many = new SeenStore()
    const more = new SeenStore()
    for (let index = 0; index < SEEN_LIMIT; index++) many.mark(news(`m${index}`, headline(index), -1), NOW - 10 * HOUR + index)
    for (let index = 0; index < 20; index++) more.mark(news(`n${index}`, headline(10_000 + index), -1), NOW - HOUR + index)
    const bounded = many.merge(more, NOW)
    expect(bounded.size).toBe(SEEN_LIMIT)
    expect(bounded.recentIds(1)).toEqual(['n19'])
    expect(bounded.contains(news('m0', headline(0), -1), NOW)).toBe(false)
  })
})

describe('a merged page', () => {
  it('shows only the stories not seen, and withholds the rest', () => {
    const seen = new SeenStore()
    const read1 = news('r1', 'Harbour bridge reopens after three year repair programme', 6)
    const read2 = news('r2', 'Council approves riverside housing development despite objections', 5)
    seen.mark(read1, NOW)
    seen.mark(read2, NOW)
    const fresh1 = news('n1', 'Glacier survey finds Himalayan ice melting faster than models predicted', 2)
    const fresh2 = news('n2', 'Central bank holds interest rates steady citing inflation worries', 1)
    const result = replacePage([], [], [fresh2, read1, fresh1, read2], seen, NOW)
    expect(ids(result.visible)).toEqual(['n2', 'n1'])
    expect(ids(result.earlier)).toEqual(['r1', 'r2'])
    expect(ids(result.fresh)).toEqual(['n2', 'n1'])
  })

  it('shows nothing new when the same page is opened again', () => {
    const seen = new SeenStore()
    const page = Array.from({ length: 6 }, (_unused, index) => news(`p${index}`, headline(index), index))
    for (const item of page) seen.mark(item, NOW)
    const result = replacePage([], [], page, seen, NOW + HOUR)
    expect(result.visible).toEqual([])
    expect(result.earlier).toHaveLength(6)
    expect(result.fresh).toEqual([])
  })

  it('keeps the stories still on screen that were not viewed, and moves the viewed ones away', () => {
    const seen = new SeenStore()
    const viewed = news('a', 'Harbour bridge reopens after three year repair programme', 6)
    const waiting = news('b', 'Council approves riverside housing development despite objections', 5)
    seen.mark(viewed, NOW)
    const arrival = news('c', 'Glacier survey finds Himalayan ice melting faster than models predicted', 1)
    const result = replacePage([viewed, waiting], [], [arrival, waiting], seen, NOW)
    expect(ids(result.visible)).toEqual(['c', 'b'])
    expect(ids(result.earlier)).toEqual(['a'])
    // Only the arrival is new to the reader.
    expect(ids(result.fresh)).toEqual(['c'])
  })

  it('does not keep a story on screen that the new page tells again in other words', () => {
    const seen = new SeenStore()
    const onScreen = news('a', 'Lena Okafor wins Nobel Peace Prize', 5)
    const rewording = news('b', 'South African human rights lawyer Lena Okafor wins the Nobel Peace Prize', 4)
    const result = replacePage([onScreen], [], [rewording], seen, NOW)
    expect(ids(result.visible)).toEqual(['b'])
    expect(ids(result.fresh)).toEqual([])
  })

  it('adds an older page after the stories, keeping aside what was seen', () => {
    const seen = new SeenStore()
    const current = news('a', 'Harbour bridge reopens after three year repair programme', 3)
    const repeat = news('b', 'Council approves riverside housing development despite objections', 20)
    seen.mark(repeat, NOW)
    const older = news('c', 'Glacier survey finds Himalayan ice melting faster than models predicted', 22)
    const sameEvent = news('d', 'Harbour bridge finally reopens following three year programme of repairs', 2)
    const result = appendPage([current], [], [repeat, older, sameEvent], seen, NOW)
    expect(ids(result.visible)).toEqual(['a', 'c'])
    expect(ids(result.earlier)).toEqual(['b'])
    expect(ids(result.fresh)).toEqual(['c'])
  })

  it('withholds a story the reader has already been told is earlier', () => {
    const seen = new SeenStore()
    const earlier = news('e', 'Council approves riverside housing development despite objections', 20)
    const again = news('e2', 'Council approves riverside housing plan despite objections raised', 19)
    const result = appendPage([], [earlier], [again], seen, NOW)
    expect(ids(result.visible)).toEqual([])
    expect(ids(result.earlier)).toEqual(['e', 'e2'])
    expect(result.fresh).toEqual([])
  })

  it('keeps one story per event and prefers a pictured version', () => {
    const plain = news('a', 'Lena Okafor wins Nobel Peace Prize', 5)
    const pictured = withImage(news('b', 'South African human rights lawyer Lena Okafor wins the Nobel Peace Prize', 5))
    const other = news('c', 'Anne Carson wins Nobel Literature Prize', 5)
    expect(ids(cluster([plain, pictured, other]))).toEqual(['b', 'c'])
    const hoursLater = withImage(news('d', 'South African lawyer Lena Okafor wins Nobel Peace Prize', 0))
    // A later story is not swapped in.
    expect(ids(cluster([plain, other, hoursLater]))).toEqual(['a', 'c'])
    // Nor is one when the first already has a picture.
    expect(ids(cluster([withImage(plain), pictured]))).toEqual(['a'])
  })

  it('knows whether a list holds a story or another outlet\u2019s version of it', () => {
    const list = [news('a', 'Lena Okafor wins Nobel Peace Prize', 5)]
    expect(covers(list, news('a', 'Anything at all', 5))).toBe(true)
    expect(covers(list, news('b', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', 4))).toBe(true)
    expect(covers(list, news('c', 'Anne Carson wins Nobel Literature Prize', 4))).toBe(false)
    expect(covers([], news('a', 'Anything', 1))).toBe(false)
  })

  it('withholds at most 200 stories, the first it has', () => {
    const seen = new SeenStore()
    const page = Array.from({ length: 60 }, (_unused, index) => news(`p${index}`, headline(index), index))
    for (const item of page) seen.mark(item, NOW)
    const earlier = Array.from({ length: 190 }, (_unused, index) => news(`e${index}`, headline(1000 + index), index))
    const result = replacePage([], earlier, page, seen, NOW)
    expect(EARLIER_LIMIT).toBe(200)
    expect(result.earlier).toHaveLength(200)
    expect(ids(result.earlier).slice(0, 3)).toEqual(['p0', 'p1', 'p2'])
    expect(appendPage([], earlier, page, seen, NOW).earlier).toHaveLength(200)
  })

  it('does not hold a story twice among the withheld', () => {
    const seen = new SeenStore()
    const item = news('a', 'Lena Okafor wins Nobel Peace Prize', 5)
    seen.mark(item, NOW)
    expect(ids(replacePage([item], [item], [item], seen, NOW).earlier)).toEqual(['a'])
  })

  it('is fast enough for a large history', () => {
    const seen = new SeenStore()
    for (let index = 0; index < SEEN_LIMIT; index++) seen.mark(news(`s${index}`, headline(index), index % 400), NOW)
    const page = Array.from({ length: 100 }, (_unused, index) => news(`n${index}`, headline(5000 + index), index))
    expect(seen.size).toBe(SEEN_LIMIT)
    const started = Date.now()
    const result = replacePage([], [], page, seen, NOW)
    expect(Date.now() - started).toBeLessThan(1500)
    expect(result.visible).toHaveLength(100)
  })
})

// The website decides what is a repeat with the same module (src/lib/story-engine.ts) and a plain list for its history. The app's
// history finds the entries to compare through an index of their words; this checks that it never answers differently.
describe('the history against the website\u2019s own', () => {
  const WORDS = 'nobel peace prize lena okafor wins awarded sensex nifty gains points stocks market live updates harbour bridge reopens repair council approves housing glacier himalayan ice melting bank rates inflation workers killed injured truck bus oakvale marrow of the in and 2026 1000 सुप्रीम कोर्ट दिल्ली मेट्रो बंद की के'.split(' ')

  function generator(seed: number) {
    let state = seed
    return (limit: number) => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state % limit
    }
  }

  function corpus(seed: number, count: number): Story[] {
    const random = generator(seed)
    return Array.from({ length: count }, (_unused, index) => {
      const words = Array.from({ length: 3 + random(7) }, () => WORDS[random(WORDS.length)])
      const hours = random(5) === 0 ? -1 : random(70)
      return makeStory({
        id: `id${index}`,
        title: random(12) === 0 ? '' : words.join(' '),
        content: `${words.join(' ')}. A longer text follows the first sentence here.`,
        category: random(4) === 0 ? 'nature' : 'news',
        publishedAt: hours < 0 ? 0 : NOW - hours * HOUR,
        image: random(3) === 0 ? 'https://img.example.com/a.jpg' : '',
      })
    })
  }

  it('answers the same for every story asked about', () => {
    for (const seed of [1, 7, 42, 2026]) {
      const stories = corpus(seed, 260)
      const mine = new SeenStore()
      const theirs = new SharedSeenStore()
      stories.slice(0, 130).forEach((item, index) => {
        const at = NOW + index * 60_000
        expect(mine.mark(item, at)).toBe(theirs.mark(item as EngineStory, at))
      })
      expect(mine.size).toBe(theirs.size)
      expect(mine.recentIds(1000)).toEqual(theirs.recentIds(1000))
      expect(mine.toJson()).toBe(theirs.toJson())
      for (const item of stories) expect({ id: item.id, held: mine.contains(item, NOW + 10_000_000) }).toEqual({ id: item.id, held: theirs.contains(item as EngineStory, NOW + 10_000_000) })
      const reloadedMine = SeenStore.fromJson(mine.toJson(), NOW + 86_400_000)
      const reloadedTheirs = SharedSeenStore.fromJson(theirs.toJson(), NOW + 86_400_000)
      expect(reloadedMine.size).toBe(reloadedTheirs.size)
      for (const item of stories) expect({ id: item.id, held: reloadedMine.contains(item, NOW + 86_400_000) }).toEqual({ id: item.id, held: reloadedTheirs.contains(item as EngineStory, NOW + 86_400_000) })
    }
  })

  it('merges pages the same way', () => {
    for (const seed of [3, 11, 99]) {
      const stories = corpus(seed, 150)
      const mine = new SeenStore()
      const theirs = new SharedSeenStore()
      stories.slice(0, 50).forEach((item) => {
        mine.mark(item, NOW)
        theirs.mark(item as EngineStory, NOW)
      })
      const visible = stories.slice(40, 80)
      const earlier = stories.slice(20, 30)
      const page = stories.slice(60, 120)
      const first = replacePage(visible, earlier, page, mine, NOW)
      const firstTheirs = sharedReplace(visible as EngineStory[], earlier as EngineStory[], page as EngineStory[], theirs, NOW)
      expect(ids(first.visible)).toEqual(firstTheirs.visible.map((item) => item.id))
      expect(ids(first.earlier)).toEqual(firstTheirs.earlier.map((item) => item.id))
      expect(ids(first.fresh)).toEqual(firstTheirs.fresh.map((item) => item.id))
      const next = appendPage(visible, earlier, page, mine, NOW)
      const nextTheirs = sharedAppend(visible as EngineStory[], earlier as EngineStory[], page as EngineStory[], theirs, NOW)
      expect(ids(next.visible)).toEqual(nextTheirs.visible.map((item) => item.id))
      expect(ids(next.earlier)).toEqual(nextTheirs.earlier.map((item) => item.id))
      expect(ids(next.fresh)).toEqual(nextTheirs.fresh.map((item) => item.id))
      expect(ids(cluster(page))).toEqual(sharedCluster(page as EngineStory[]).map((item) => item.id))
    }
  })
})
