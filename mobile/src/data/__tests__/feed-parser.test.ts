import { CACHE_LIMIT, FEED_LIMIT, FeedParseError, FeedServiceError, MAX_BYTES, SAVED_LIMIT, encodeCache, encodeSaved, fixUrl, isStorable, parseCacheEntry, parseCached, parseFeed, parseSaved } from '../feed-parser'
import { hasImage, hasSource, makeStory } from '../story'
import { story } from './helpers'

const SIG = '45cf1f8654294cfdfa03b1376166de5b'

const card = (fields: Record<string, unknown> = {}) => ({ id: 'a', content: 'Summary', category: 'news', ...fields })
const feed = (...cards: unknown[]) => JSON.stringify({ cards })
const fixture = (id: string, title: string, section: string) =>
  makeStory({ id, title, content: 'A concise story for testing.', category: 'news', section, source: 'Publisher', sourceUrl: 'https://example.com/story', readTime: '1 min', publishedAt: 1_780_000_000_000 })

describe('a page of the feed', () => {
  it('is read from the real feed shape and keeps the publisher attribution', () => {
    const stories = parseFeed(`{"cards":[{"id":"bbc-abc","title":"A discovery","content":"A short summary.",
      "category":"news","section":"science","source":"BBC",
      "sourceUrl":"https://www.bbc.com/news/test","publishedAt":1780000000000,
      "image":"https://images.example.com/story.jpg","readTime":"30 sec"}],"cached":true,"count":80}`)
    expect(stories).toHaveLength(1)
    expect(stories[0].source).toBe('BBC')
    expect(hasSource(stories[0])).toBe(true)
    expect(hasImage(stories[0])).toBe(true)
    expect(stories[0].section).toBe('science')
    expect(stories[0]).toMatchObject({ id: 'bbc-abc', title: 'A discovery', content: 'A short summary.', category: 'news', readTime: '30 sec', publishedAt: 1_780_000_000_000, sig: '' })
  })

  it('does not invent a publish time, a publisher or a picture for a quote', () => {
    const [quote] = parseFeed('{"cards":[{"id":"quote","content":"A brief thought","category":"philosophy"}]}')
    expect(quote.title).toBe('')
    expect(quote.source).toBe('')
    expect(quote.publishedAt).toBe(0)
    expect(hasImage(quote)).toBe(false)
    expect(hasSource(quote)).toBe(false)
  })

  it('tells an empty feed from one that failed', () => {
    expect(parseFeed('{"cards":[]}')).toEqual([])
    expect(() => parseFeed('{"cards":[],"error":"upstream failed"}')).toThrow(FeedServiceError)
    // The error comes first, whatever else the answer holds.
    expect(() => parseFeed('{"cards":"garbage","error":"upstream failed"}')).toThrow(FeedServiceError)
    expect(parseFeed('{"cards":[],"error":null}')).toEqual([])
  })

  it('decodes the HTML-escaped ampersands feeds carry inside addresses', () => {
    const [item] = parseFeed(
      feed(card({ image: 'https://cdn.example.com/p.jpg?quality=90&#038;strip=all&amp;w=800', sourceUrl: 'https://example.com/a?x=1&#038;y=2' })),
    )
    expect(item.image).toBe('https://cdn.example.com/p.jpg?quality=90&strip=all&w=800')
    expect(item.sourceUrl).toBe('https://example.com/a?x=1&y=2')
  })

  it('decodes in the order the native app did, so that text is never decoded twice', () => {
    expect(fixUrl('a&#038;b&#38;c&amp;d')).toBe('a&b&c&d')
    expect(fixUrl('a&amp;#038;b')).toBe('a&#038;b')
    expect(fixUrl('a&amp;amp;b')).toBe('a&amp;b')
    expect(fixUrl('no entities')).toBe('no entities')
  })

  it('refuses a malformed, unexpected or oversized answer', () => {
    const invalid = [
      '',
      '{',
      'null',
      '[]',
      '"cards"',
      '42',
      '{"cards":null}',
      '{"cards":{}}',
      '{}',
      '{"cards":[{}]}',
      '{"cards":[null]}',
      '{"cards":[[]]}',
      '{"cards":["text"]}',
      '{"cards":[]} trailing',
      '{"cards":[{"id":1,"content":"hi","category":"news"}]}',
      '{"cards":[{"id":"a","content":"hi","category":"news","publishedAt":-1}]}',
      '{"cards":[{"id":"a","content":"hi","category":"news","publishedAt":1.5}]}',
    ]
    for (const text of invalid) expect({ text, error: (() => { try { parseFeed(text); return null } catch (e) { return e instanceof FeedParseError } })() }).toEqual({ text, error: true })
    expect(() => parseFeed(' '.repeat(MAX_BYTES + 1))).toThrow(FeedParseError)
    expect(parseFeed(`{"cards":[]}${' '.repeat(MAX_BYTES - 12)}`)).toEqual([])
  })

  it('refuses a story whose identifier is repeated', () => {
    expect(() => parseFeed(feed(card(), card()))).toThrow(FeedParseError)
    expect(parseFeed(feed(card(), card({ id: 'b' })))).toHaveLength(2)
  })

  it('holds at most 60 stories', () => {
    const many = (count: number) => feed(...Array.from({ length: count }, (_unused, index) => card({ id: `s${index}` })))
    expect(FEED_LIMIT).toBe(60)
    expect(parseFeed(many(60))).toHaveLength(60)
    expect(() => parseFeed(many(61))).toThrow(FeedParseError)
  })

  it('never puts any of the text it refused into its message', () => {
    const secret = 'secret-story-text'
    for (const text of [`{"cards":[{"id":"${secret}","content":"x","category":"news","publishedAt":"${secret}"}]}`, `{"cards":[{"id":"a","content":"${'x'.repeat(8001)}${secret}","category":"news"}]}`, `not json ${secret}`]) {
      const failure = (() => { try { parseFeed(text) } catch (e) { return e as Error } return null })()
      expect(failure).toBeInstanceOf(FeedParseError)
      expect(failure?.message).not.toContain(secret)
    }
  })
})

describe('the fields of a story', () => {
  const limits: [string, number, boolean][] = [
    ['id', 180, true],
    ['title', 2000, false],
    ['content', 8000, true],
    ['category', 80, true],
    ['section', 40, false],
    ['source', 200, false],
    ['sourceUrl', 4096, false],
    ['image', 4096, false],
    ['readTime', 60, false],
  ]

  it.each(limits)('%s has a most length of %d characters', (field, maximum) => {
    expect(parseFeed(feed(card({ [field]: 'x'.repeat(maximum) })))[0]).toBeDefined()
    expect(() => parseFeed(feed(card({ [field]: 'x'.repeat(maximum + 1) })))).toThrow(FeedParseError)
  })

  it('judges the length after the white space at the ends has gone', () => {
    expect(parseFeed(feed(card({ title: `  ${'x'.repeat(2000)}  ` })))[0].title).toHaveLength(2000)
  })

  it('needs an id, a text and a category, which are not blank', () => {
    for (const field of ['id', 'content', 'category']) {
      expect(() => parseFeed(feed(card({ [field]: null })))).toThrow(FeedParseError)
      expect(() => parseFeed(feed(card({ [field]: '' })))).toThrow(FeedParseError)
      expect(() => parseFeed(feed(card({ [field]: ' \n\t ' })))).toThrow(FeedParseError)
      expect(() => parseFeed(feed({ ...card(), [field]: undefined }))).toThrow(FeedParseError)
    }
  })

  it('lets the others be missing, null or empty', () => {
    for (const field of ['title', 'section', 'source', 'sourceUrl', 'image', 'readTime']) {
      expect(parseFeed(feed(card({ [field]: null })))[0]).toMatchObject({ [field]: '' })
      expect(parseFeed(feed(card({ [field]: '' })))[0]).toMatchObject({ [field]: '' })
      expect(parseFeed(feed(card()))[0]).toMatchObject({ [field]: '' })
    }
  })

  it('refuses a field that is not a text', () => {
    for (const value of [5, true, {}, [], ['text']]) {
      for (const field of ['id', 'title', 'content', 'category', 'section', 'source', 'sourceUrl', 'image', 'readTime']) {
        expect({ field, value, refused: (() => { try { parseFeed(feed(card({ [field]: value }))); return false } catch (e) { return e instanceof FeedParseError } })() }).toEqual({ field, value, refused: true })
      }
    }
  })

  it('strips white space as Java does: the no-break space stays, the separators of lines and paragraphs go', () => {
    expect(parseFeed(feed(card({ title: '\u00a0Title\u00a0' })))[0].title).toBe('\u00a0Title\u00a0')
    expect(parseFeed(feed(card({ title: '\u2028\u2029 Title \u3000\u001f' })))[0].title).toBe('Title')
    expect(parseFeed(feed(card({ title: '\ufeffTitle' })))[0].title).toBe('\ufeffTitle')
  })

  it('reads the time as a whole number of at least 0', () => {
    const at = (value: unknown) => parseFeed(feed(card({ publishedAt: value })))[0].publishedAt
    expect(at(undefined)).toBe(0)
    expect(at(null)).toBe(0)
    expect(at(0)).toBe(0)
    expect(Object.is(at(-0), 0)).toBe(true)
    expect(at(1_780_000_000_000)).toBe(1_780_000_000_000)
    expect(at(1780000000000.0)).toBe(1_780_000_000_000)
    expect(at(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    for (const bad of [-1, 1.5, '1780000000000', true, {}, [], 1e30]) expect(() => at(bad)).toThrow(FeedParseError)
    expect(parseFeed('{"cards":[{"id":"a","content":"c","category":"news","publishedAt":1e3}]}')[0].publishedAt).toBe(1000)
    expect(() => parseFeed('{"cards":[{"id":"a","content":"c","category":"news","publishedAt":9007199254740993}]}')).toThrow(FeedParseError)
  })

  it('ignores what it does not know', () => {
    const [item] = parseFeed(feed(card({ type: 'microessay', unknown: { deep: [1, 2] }, cached: true })))
    expect(Object.keys(item).sort()).toEqual(['category', 'content', 'id', 'image', 'publishedAt', 'readTime', 'section', 'sig', 'source', 'sourceUrl', 'title'])
  })

  it('does not take a link for one that the app opens', () => {
    const [item] = parseFeed(feed(card({ sourceUrl: 'javascript:alert(1)', image: 'http://example.com/a.jpg' })))
    expect(item.sourceUrl).toBe('javascript:alert(1)')
    expect([hasSource(item), hasImage(item)]).toEqual([false, false])
  })
})

describe('the signature of a story', () => {
  it('is kept when it is 32 lower-case hexadecimal digits, with the spaces around it gone', () => {
    expect(parseFeed(feed(card({ sig: SIG })))[0].sig).toBe(SIG)
    expect(parseFeed(feed(card({ sig: ` ${SIG} ` })))[0].sig).toBe(SIG)
  })

  it('is empty when it is missing or damaged, and never fails the feed', () => {
    for (const sig of ['abc', 42, null, {}, [], SIG.toUpperCase(), SIG + '0', true, '']) {
      const stories = parseFeed(feed(card({ sig })))
      expect({ sig, count: stories.length, kept: stories[0].sig }).toEqual({ sig, count: 1, kept: '' })
    }
    expect(parseFeed(feed(card()))[0].sig).toBe('')
  })

  it('survives the cache and the saved stories, and an unsigned story writes none', () => {
    const signed = story('signed', 'T', 1, { sig: SIG })
    const unsigned = story('plain')
    const [again] = parseCached(encodeCache([signed]))
    expect(again.sig).toBe(SIG)
    expect(parseSaved(encodeSaved([signed]))).toEqual([signed])
    expect(encodeSaved([unsigned])).not.toContain('sig')
    expect(parseSaved(encodeSaved([unsigned]))[0].sig).toBe('')
    expect(parseSaved('{"schema":1,"stories":[{"id":"a","content":"Text","category":"news"}]}')[0].sig).toBe('')
  })
})

describe('the saved stories and the cache', () => {
  it('give back what was written', () => {
    const originals = [fixture('a', 'A "quoted" headline', 'india'), fixture('b', '', 'world')]
    expect(parseSaved(encodeSaved(originals))).toEqual(originals)
    const cached = [fixture('a', 'First', 'world'), fixture('b', 'Second', '')]
    expect(parseCached(encodeCache(cached))).toEqual(cached)
  })

  it('write the fields in a fixed shape that the native app read', () => {
    const [item] = [fixture('a', 'T', 'india')]
    expect(JSON.parse(encodeSaved([item]))).toEqual({
      schema: 1,
      stories: [{ id: 'a', title: 'T', content: 'A concise story for testing.', category: 'news', section: 'india', source: 'Publisher', sourceUrl: 'https://example.com/story', image: '', readTime: '1 min', publishedAt: 1_780_000_000_000 }],
    })
  })

  it('refuse another schema, or text that is not in this format', () => {
    for (const parse of [parseSaved, parseCached]) {
      expect(() => parse('{"schema":2,"stories":[]}')).toThrow(FeedParseError)
      expect(() => parse('{"schema":"1","stories":[]}')).toThrow(FeedParseError)
      expect(() => parse('{"cards":[]}')).toThrow(FeedParseError)
      expect(() => parse('{"stories":[]}')).toThrow(FeedParseError)
      expect(() => parse('{"schema":1}')).toThrow(FeedParseError)
      expect(() => parse('{"schema":1,"stories":{}}')).toThrow(FeedParseError)
      expect(() => parse('{bad json')).toThrow(FeedParseError)
    }
  })

  it('keep a bounded number of stories: 200 saved, 100 cached', () => {
    const many = (count: number) => Array.from({ length: count }, (_unused, index) => story(`s${index}`, `Story ${index}`, 1))
    expect(SAVED_LIMIT).toBe(200)
    expect(CACHE_LIMIT).toBe(100)
    expect(parseSaved(encodeSaved(many(200)))).toHaveLength(200)
    expect(() => parseSaved(encodeSaved(many(201)))).toThrow(FeedParseError)
    expect(parseCached(encodeCache(many(100)))).toHaveLength(100)
    expect(() => parseCached(encodeCache(many(101)))).toThrow(FeedParseError)
  })

  it('refuse a text longer than a megabyte', () => {
    expect(() => parseSaved(' '.repeat(MAX_BYTES + 1))).toThrow(FeedParseError)
    expect(() => parseCached(' '.repeat(MAX_BYTES + 1))).toThrow(FeedParseError)
  })

  it('hold the time a page was cached at, which the native app did not write', () => {
    expect(parseCacheEntry(encodeCache([story('a')], 1_800_000_000_000)).savedAt).toBe(1_800_000_000_000)
    expect(parseCacheEntry(encodeCache([story('a')])).savedAt).toBe(0)
    expect(() => parseCacheEntry('{"schema":1,"savedAt":-5,"stories":[]}')).toThrow(FeedParseError)
    expect(() => parseCacheEntry('{"schema":1,"savedAt":"soon","stories":[]}')).toThrow(FeedParseError)
  })

  it('know whether a story would be read back after it is saved', () => {
    expect(isStorable(story('a'))).toBe(true)
    expect(isStorable(story('a', 'T', 0, { sig: SIG }))).toBe(true)
    expect(isStorable(story('a', 'A title but no text', 1, { content: '' }))).toBe(false)
    expect(isStorable(story('a', 'T', 1, { content: '   ' }))).toBe(false)
    expect(isStorable(story('', 'T'))).toBe(false)
    expect(isStorable(story('x'.repeat(181)))).toBe(false)
    expect(isStorable(story('a', 'T', 1, { content: 'c'.repeat(8001) }))).toBe(false)
    expect(isStorable(story('a', 'T', 1, { category: '' }))).toBe(false)
    expect(isStorable(story('a', 'T', -5))).toBe(false)
    expect(isStorable(story('a', 'T', 1.5))).toBe(false)
    expect(isStorable(story('a', 'T', 1, { sig: 'not a signature' }))).toBe(true)
  })
})
