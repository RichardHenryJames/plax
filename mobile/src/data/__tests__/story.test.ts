import { adOrdinal, adStory, bodyOf, caughtUp, hasImage, hasSource, headlineKey, isAd, isCaughtUp, isSignature, isWebLink, makeStory, readSeconds, sourceHost } from '../story'

const story = (title: string, content: string, sourceUrl = '') => makeStory({ id: 'id', title, content, source: 'Publisher', sourceUrl })

describe('the body of a story', () => {
  it('is hidden when the headline is repeated as the whole text', () => {
    expect(bodyOf(story('Markets rally', 'Markets rally'))).toBe('')
    expect(bodyOf(story('Markets rally.', '  markets   rally '))).toBe('')
    expect(bodyOf(story('Markets rally', 'Markets rally\u2026'))).toBe('')
  })

  it('drops the headline when the text starts with it and a separator follows', () => {
    expect(bodyOf(story('Sensex gains 800 points', 'Sensex gains 800 points: all sectoral indices turned green after a sharp selloff.'))).toBe(
      'all sectoral indices turned green after a sharp selloff.',
    )
  })

  it('keeps independent text, drops a tail too short to be one, and keeps a quote that has no title', () => {
    expect(bodyOf(story('Headline', 'A different explanation entirely.'))).toBe('A different explanation entirely.')
    expect(bodyOf(story('Headline words here', 'Headline words here. Ok.'))).toBe('')
    expect(bodyOf(story('', 'A quote with no title.'))).toBe('A quote with no title.')
  })

  it('keeps a sentence that merely begins with the title', () => {
    expect(bodyOf(story('Evolution', 'Evolution is the change in the heritable characteristics of populations.'))).toBe(
      'Evolution is the change in the heritable characteristics of populations.',
    )
    expect(bodyOf(story('Mercury', 'Mercury, the smallest planet, orbits the Sun every 88 days.'))).toBe('Mercury, the smallest planet, orbits the Sun every 88 days.')
    expect(bodyOf(story('Markets rally', 'Markets rally as inflation cools and banks lead the gains.'))).toBe('Markets rally as inflation cools and banks lead the gains.')
  })

  it('drops the headline only when a separator follows it', () => {
    for (const separator of ['.', ' -', ' \u2014', ' |']) {
      expect(bodyOf(story('Markets rally', `Markets rally${separator} Banks led the gains on Friday.`))).toBe('Banks led the gains on Friday.')
    }
    expect(bodyOf(story('\u092c\u093e\u091c\u093c\u093e\u0930 \u092e\u0947\u0902 \u0924\u0947\u091c\u093c\u0940', '\u092c\u093e\u091c\u093c\u093e\u0930 \u092e\u0947\u0902 \u0924\u0947\u091c\u093c\u0940\u0964 \u092c\u0948\u0902\u0915\u094b\u0902 \u0928\u0947 \u0936\u0941\u0915\u094d\u0930\u0935\u093e\u0930 \u0915\u094b \u092c\u0922\u093c\u0924 \u092c\u0928\u093e\u0908\u0964'))).toBe(
      '\u092c\u0948\u0902\u0915\u094b\u0902 \u0928\u0947 \u0936\u0941\u0915\u094d\u0930\u0935\u093e\u0930 \u0915\u094b \u092c\u0922\u093c\u0924 \u092c\u0928\u093e\u0908\u0964',
    )
  })
})

describe('the link of a story', () => {
  it('names the publisher host without www and requires https', () => {
    expect(sourceHost(story('t', 'c', 'https://www.bbc.com/news/a'))).toBe('bbc.com')
    expect(sourceHost(story('t', 'c', 'https://NDTV.com/x?y=1'))).toBe('ndtv.com')
    expect(sourceHost(story('t', 'c', 'http://example.com/a'))).toBe('')
    expect(sourceHost(story('t', 'c', ''))).toBe('')
  })

  it('is a link only when it is https with a host and no user name, password or port', () => {
    expect(isWebLink('https://example.com/a?b=c#d')).toBe(true)
    for (const bad of ['', 'http://example.com', 'https://', 'https://user@example.com/', 'https://user:pw@example.com/', 'https://example.com:8443/x', 'https://example.com:/x', 'javascript:alert(1)', 'https://exa mple.com', '//example.com', 'ftp://example.com']) {
      expect({ bad, link: isWebLink(bad) }).toEqual({ bad, link: false })
    }
  })

  it('says whether the story has a source and a picture', () => {
    const full = makeStory({ id: 'x', sourceUrl: 'https://a.test/s', image: 'https://a.test/i.jpg' })
    expect([hasSource(full), hasImage(full)]).toEqual([true, true])
    const bare = makeStory({ id: 'y', sourceUrl: 'http://a.test/s', image: 'data:image/png;base64,AAAA' })
    expect([hasSource(bare), hasImage(bare)]).toEqual([false, false])
  })
})

describe('the reading time', () => {
  it('is understood from the feed so that it can be localized', () => {
    const cases: Record<string, number> = { '13s': 13, '30 sec': 30, '1 min': 60, '2 mins': 120, '45 Seconds': 45, '3m': 180 }
    for (const [text, seconds] of Object.entries(cases)) expect({ text, seconds: readSeconds(makeStory({ id: 'i', readTime: text })) }).toEqual({ text, seconds })
    for (const unknown of ['', 'soon', '1h', '-5s', '12345s']) expect({ unknown, seconds: readSeconds(makeStory({ id: 'i', readTime: unknown })) }).toEqual({ unknown, seconds: -1 })
  })
})

describe('the pages that are not stories', () => {
  it('is the caught-up card, and nothing else', () => {
    expect(isCaughtUp(caughtUp())).toBe(true)
    expect(isCaughtUp(makeStory({ id: 'a' }))).toBe(false)
    expect(isAd(caughtUp())).toBe(false)
  })

  it('is an ad page when its id says so, and knows its number', () => {
    expect(isAd(adStory(3))).toBe(true)
    expect(adOrdinal(adStory(3))).toBe(3)
    expect(adOrdinal(adStory(12))).toBe(12)
    expect(isAd(makeStory({ id: '__ad__' }))).toBe(false)
    expect(adOrdinal(makeStory({ id: '__ad_x__' }))).toBe(0)
    expect(adOrdinal(makeStory({ id: 'plain' }))).toBe(0)
  })
})

describe('the keys of a story', () => {
  it('finds a headline again whatever the case and spacing', () => {
    expect(headlineKey(makeStory({ id: 'a', title: '  Markets   RALLY ' }))).toBe('markets rally')
    expect(headlineKey(makeStory({ id: 'b', title: '   ' }))).toBe('b')
  })

  it('knows a signature when it is 32 lower-case hex digits', () => {
    expect(isSignature('0123456789abcdef0123456789abcdef')).toBe(true)
    for (const bad of ['', 'ABCDEF0123456789abcdef0123456789', '0123456789abcdef0123456789abcde', '0123456789abcdef0123456789abcdeff', 'g123456789abcdef0123456789abcdef', null, 7]) {
      expect(isSignature(bad)).toBe(false)
    }
  })
})
