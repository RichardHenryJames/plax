import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LINK_HOSTS, allowedLink, emoji, plain } from '@shared/app-config-rules'
import { PRODUCTION_SITE } from '@/build'
import { topicLabel } from '@/data/topic'
import { setVariant } from '@/test/helpers'
import {
  BUILT_IN_SECTIONS,
  DEFAULT_APP_CONFIG,
  MAX_CONFIG_BYTES,
  hasSection,
  linkApplies,
  linkLabel,
  noticeApplies,
  noticeBody,
  noticeTitle,
  parseAppConfig,
  sectionLabel,
  showsSourceName,
  type AppConfig,
  type Notice,
} from '../app-config'
import { configText, noticePart, updatePart } from './helpers'

const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const PUBLISHED = read('public/app-config.json')

/** The same piece of text the website's test makes of a case: `@repeat:c:n` stands for the character c written n times. */
const expand = (text: string) => text.replace(/@repeat:(.):(\d+)/g, (_whole, character: string, count: string) => character.repeat(Number(count)))

interface Case {
  name: string
  json?: string
  config?: unknown
  rejected: string[]
  webOnly?: string[]
}

const CASES = (JSON.parse(read('src/lib/app-config-cases.json')) as { cases: Case[] }).cases

const parse = (parts: string): AppConfig => {
  const parsed = parseAppConfig(configText(parts))
  if (parsed === null) throw new Error(`refused: ${parts}`)
  return parsed.config
}

const NEWS = '{"id":"news","emoji":"\\ud83d\\udcf0","en":"News","hi":"N"}'
const NOW_FAR = Date.UTC(2100, 0, 1)

describe('the cases the website shares with the app', () => {
  it('are named once each, and are the contract between the two', () => {
    const names = CASES.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
    expect(CASES.length).toBeGreaterThanOrEqual(168)
  })

  it.each(CASES)('are judged as the website judges them: $name', (entry) => {
    const text = expand(entry.json ?? JSON.stringify(entry.config))
    const parsed = parseAppConfig(text)
    // A file refused whole is what the website's check calls a schema it does not take.
    const rejected = parsed === null ? ['schemaVersion'] : parsed.rejected
    // The app ignores what it does not know; only the website's check says so.
    const unknown = parsed === null ? [] : parsed.unknown
    expect([...rejected].sort()).toEqual([...entry.rejected].sort())
    expect([...unknown].sort()).toEqual([...(entry.webOnly ?? [])].sort())
  })
})

describe('the published file', () => {
  it('is taken whole, under the size the app takes, and says what the app needs', () => {
    expect(Buffer.byteLength(PUBLISHED, 'utf8')).toBeLessThanOrEqual(MAX_CONFIG_BYTES)
    const parsed = parseAppConfig(PUBLISHED)
    expect(parsed).not.toBeNull()
    expect(parsed?.rejected).toEqual([])
    expect(parsed?.unknown).toEqual([])
    const config = (parsed as NonNullable<typeof parsed>).config
    expect(config.topics.map((topic) => topic.id)).toEqual(expect.arrayContaining(['news', 'stocks']))
    expect(hasSection(config, 'us')).toBe(true)
    expect(hasSection(config, '')).toBe(true)
    expect(hasSection(config, 'nothing')).toBe(false)
    expect(config.adPageEvery).toBeGreaterThanOrEqual(3)
    expect(config.adPageEvery).toBeLessThanOrEqual(20)
  })

  it('is what a build that has not read it does: the built-in topics, sections, switches, page ad rhythm and layout', () => {
    const file = JSON.parse(PUBLISHED) as {
      topics: { id: string; emoji: string; en: string; hi: string }[]
      sections: { id: string; en: string; hi: string }[]
      features: Record<string, boolean>
      ads: { pageEvery: number }
      layout: Record<string, number>
      notice: null
      update: null
      links: unknown[]
    }
    expect(DEFAULT_APP_CONFIG.topics.map((topic) => ({ ...topic }))).toEqual(file.topics)
    expect(DEFAULT_APP_CONFIG.sections.map((entry) => ({ ...entry }))).toEqual(file.sections)
    expect({ ...DEFAULT_APP_CONFIG.features }).toEqual(file.features)
    expect(DEFAULT_APP_CONFIG.adPageEvery).toBe(file.ads.pageEvery)
    expect({ ...DEFAULT_APP_CONFIG.layout }).toEqual(file.layout)
    expect(DEFAULT_APP_CONFIG.notice).toBe(file.notice)
    expect(DEFAULT_APP_CONFIG.update).toBe(file.update)
    expect(DEFAULT_APP_CONFIG.links).toEqual(file.links)
    // And reading the file gives exactly those values.
    expect(parseAppConfig(PUBLISHED)?.config).toEqual(DEFAULT_APP_CONFIG)
  })

  it('names every part, so that nothing is left to a built-in value by accident', () => {
    const file = JSON.parse(PUBLISHED) as Record<string, unknown>
    for (const part of ['schemaVersion', 'topics', 'sections', 'features', 'ads', 'layout', 'notice', 'update', 'links']) {
      expect(file).toHaveProperty(part)
    }
  })

  it('is refused whole in every shorter form: a cut-off file is never taken', () => {
    for (let length = 0; length < PUBLISHED.trimEnd().length; length++) expect(parseAppConfig(PUBLISHED.slice(0, length))).toBeNull()
  })
})

describe('a build that has not read the file', () => {
  it('does what it did before: 18 topics, the six sections, every switch on but the publisher name, five stories to an ad', () => {
    const defaults = DEFAULT_APP_CONFIG
    expect(defaults.topics).toHaveLength(18)
    expect(defaults.topics[0].id).toBe('news')
    expect(defaults.topics[1].id).toBe('stocks')
    expect(defaults.sections.map((entry) => entry.id)).toEqual(['us', 'india', 'world', 'tech', 'business', 'science'])
    expect(defaults.features).toEqual({ deeper: true, shareLinks: true, ads: true, adPages: true, sourceName: false })
    expect(defaults.adPageEvery).toBe(5)
    expect(defaults.layout).toEqual({ heroMaxWidth: 1.25, heroMaxHeight: 0.6, photoMinWidth: 0.6, photoMinHeight: 0.3 })
    expect(defaults.notice).toBeNull()
    expect(defaults.update).toBeNull()
    expect(defaults.links).toEqual([])
  })

  it('names the built-in sections in both languages', () => {
    expect(BUILT_IN_SECTIONS.map((entry) => sectionLabel(entry, 'en'))).toEqual(['US', 'India', 'World', 'Tech', 'Business', 'Science'])
    for (const entry of BUILT_IN_SECTIONS) expect(sectionLabel(entry, 'hi')).not.toBe(sectionLabel(entry, 'en'))
  })
})

describe('parseAppConfig', () => {
  it('takes a file part by part, and a good part is never lost to a bad one', () => {
    const parsed = parseAppConfig(
      '{"schemaVersion":1,"features":{"ads":false,"deeper":"no"},"notice":{"id":"x y"},"ads":{"pageEvery":8},"layout":{"heroMaxHeight":0.65,"photoMinWidth":5}}',
    )
    expect(parsed?.rejected).toEqual(['features.deeper', 'layout.photoMinWidth', 'notice'])
    const config = (parsed as NonNullable<typeof parsed>).config
    expect(config.features.ads).toBe(false)
    expect(config.features.deeper).toBe(true)
    expect(config.adPageEvery).toBe(8)
    expect(config.layout.heroMaxHeight).toBeCloseTo(0.65, 6)
    expect(config.layout.photoMinWidth).toBe(DEFAULT_APP_CONFIG.layout.photoMinWidth)
    expect(config.notice).toBeNull()
  })

  it('keeps the built-in value of every part the file does not have', () => {
    expect(parseAppConfig(configText())?.config).toEqual(DEFAULT_APP_CONFIG)
  })

  it('keeps the built-in value of every part the file has and the rules refuse', () => {
    const parsed = parseAppConfig(
      configText(
        '"topics":[],"sections":{},"features":[],"ads":null,"layout":[],"notice":"x","update":{},"links":{}',
      ),
    )
    expect(parsed?.rejected.sort()).toEqual(['ads', 'features', 'layout', 'links', 'notice', 'sections', 'topics', 'update'])
    expect(parsed?.config).toEqual(DEFAULT_APP_CONFIG)
  })

  it('takes the website\'s topics in its order, under its names, and a topic the app was not made with', () => {
    const config = parse(
      `"topics":[${NEWS},{"id":"stocks","emoji":"\\ud83d\\udcca","en":"Markets","hi":"B"},{"id":"crypto","emoji":"\\ud83e\\ude99","en":"Crypto","hi":"C"}]`,
    )
    expect(config.topics.map((topic) => topic.id)).toEqual(['news', 'stocks', 'crypto'])
    expect(topicLabel(config.topics[1], 'en')).toBe('Markets')
    expect(topicLabel(config.topics[1], 'hi')).toBe('B')
    expect(config.topics[2]).toEqual({ id: 'crypto', emoji: '\u{1FA99}', en: 'Crypto', hi: 'C' })
  })

  it('takes the website\'s sections, none at all, or the six built in', () => {
    const listed = parse('"sections":[{"id":"us","en":"US","hi":"A"},{"id":"world","en":"Globe","hi":"C"}]')
    expect(listed.sections).toEqual([
      { id: 'us', en: 'US', hi: 'A' },
      { id: 'world', en: 'Globe', hi: 'C' },
    ])
    expect(hasSection(listed, 'world')).toBe(true)
    expect(hasSection(listed, 'india')).toBe(false)
    expect(hasSection(listed, '')).toBe(true)
    const none = parse('"sections":[]')
    expect(none.sections).toEqual([])
    expect(hasSection(none, 'us')).toBe(false)
    expect(hasSection(none, '')).toBe(true)
    expect(sectionLabel(listed.sections[1], 'en')).toBe('Globe')
    expect(sectionLabel(listed.sections[1], 'hi')).toBe('C')
  })

  it('takes the switches one by one, and any it does not mention keeps its built-in value', () => {
    expect(parse('"features":{"ads":false}').features).toEqual({ deeper: true, shareLinks: true, ads: false, adPages: true, sourceName: false })
    expect(parse('"features":{"deeper":false,"shareLinks":false,"ads":false,"adPages":false,"sourceName":true}').features).toEqual({
      deeper: false,
      shareLinks: false,
      ads: false,
      adPages: false,
      sourceName: true,
    })
    const refused = parseAppConfig(configText('"features":{"sourceName":"yes","deeper":false,"sparkle":true}'))
    expect(refused?.rejected).toEqual(['features.sourceName'])
    expect(refused?.unknown).toEqual(['unknown:features.sparkle'])
    expect(refused?.config.features).toEqual({ deeper: false, shareLinks: true, ads: true, adPages: true, sourceName: false })
  })

  it('takes the number of stories to an ad within 3 and 20, written as a whole number', () => {
    expect(parse('"ads":{"pageEvery":3}').adPageEvery).toBe(3)
    expect(parse('"ads":{"pageEvery":20}').adPageEvery).toBe(20)
    for (const bad of ['2', '21', '5.0', '5e0', '"5"', 'null', '-5']) {
      const parsed = parseAppConfig(configText(`"ads":{"pageEvery":${bad}}`))
      expect(parsed?.rejected).toEqual(['ads.pageEvery'])
      expect(parsed?.config.adPageEvery).toBe(5)
    }
  })

  it('takes the layout numbers only in bounds, and each on its own', () => {
    expect(parse('"layout":{"heroMaxWidth":1.4}').layout.heroMaxWidth).toBeCloseTo(1.4, 6)
    expect(parse('"layout":{"heroMaxWidth":1.25e0}').layout.heroMaxWidth).toBe(1.25)
    // The least of a picture is kept small enough that a long story keeps its photograph on a small page: a bigger one is refused,
    // and what is right beside it is taken.
    const over = parseAppConfig(configText('"layout":{"photoMinHeight":0.5,"heroMaxWidth":1.5,"photoMinWidth":0.7}'))
    expect(over?.rejected).toEqual(['layout.photoMinHeight'])
    expect(over?.config.layout.photoMinHeight).toBe(DEFAULT_APP_CONFIG.layout.photoMinHeight)
    expect(over?.config.layout.heroMaxWidth).toBeCloseTo(1.5, 6)
    expect(over?.config.layout.photoMinWidth).toBeCloseTo(0.7, 6)
    // The least can never be above the most: the largest least is below the smallest most.
    const extremes = parseAppConfig(configText('"layout":{"heroMaxWidth":1,"heroMaxHeight":0.4,"photoMinWidth":0.7,"photoMinHeight":0.35}'))
    expect(extremes?.rejected).toEqual([])
    const layout = (extremes as NonNullable<typeof extremes>).config.layout
    expect(layout.photoMinWidth).toBeLessThanOrEqual(layout.heroMaxWidth)
    expect(layout.photoMinHeight).toBeLessThanOrEqual(layout.heroMaxHeight)
  })

  it('reads a notice with all it says', () => {
    const config = parse(
      '"notice":{"id":"2026-11.stocks_added","level":"important","title":{"en":"Stocks is here","hi":"\\u0936\\u0947\\u092f\\u0930"},' +
        '"body":{"en":"One\\nTwo","hi":"\\u090f\\u0915"},"url":"https://plax-rouge.vercel.app/news/privacy","build":"play","minVersionCode":15,' +
        '"maxVersionCode":40,"until":"2026-12-01T00:00:00Z"}',
    )
    expect(config.notice).toEqual({
      id: '2026-11.stocks_added',
      important: true,
      titleEn: 'Stocks is here',
      titleHi: 'शेयर',
      bodyEn: 'One\nTwo',
      bodyHi: 'एक',
      url: 'https://plax-rouge.vercel.app/news/privacy',
      build: 'play',
      minVersionCode: 15,
      maxVersionCode: 40,
      untilMillis: Date.UTC(2026, 11, 1),
    })
  })

  it('reads a plain notice: for every build and version, with no end, no link and no Hindi', () => {
    expect(parse(noticePart('n1', 'info')).notice).toEqual({
      id: 'n1',
      important: false,
      titleEn: 'T',
      titleHi: '',
      bodyEn: 'B',
      bodyHi: '',
      url: '',
      build: 'all',
      minVersionCode: 0,
      maxVersionCode: 0,
      untilMillis: 0,
    })
  })

  it('takes no notice for null, and keeps none for a bad one', () => {
    expect(parse('"notice":null').notice).toBeNull()
    expect(parseAppConfig(configText('"notice":{"id":"n","level":"loud","title":{"en":"T"},"body":{"en":"B"}}'))?.rejected).toEqual(['notice'])
  })

  it('reads the word that a newer version is on Google Play', () => {
    expect(parse(updatePart(17, 15)).update).toEqual({ latestVersionCode: 17, latestVersionName: '1.7.0', minSupportedVersionCode: 15 })
    expect(parse('"update":null').update).toBeNull()
    expect(parseAppConfig(configText(updatePart(17, 18)))?.rejected).toEqual(['update'])
  })

  it('reads up to four links for the menu, in order, each for the build it names', () => {
    const config = parse(
      '"links":[{"id":"a","en":"A","hi":"H","url":"https://github.com/x"},{"id":"b","en":"B","hi":"H","url":"https://github.com/x","build":"play"},' +
        '{"id":"c","en":"C","hi":"H","url":"https://github.com/x","build":"direct"}]',
    )
    expect(config.links.map((link) => [link.id, link.build])).toEqual([
      ['a', 'all'],
      ['b', 'play'],
      ['c', 'direct'],
    ])
    expect(config.links.filter((link) => linkApplies(link, true)).map((link) => link.id)).toEqual(['a', 'b'])
    expect(config.links.filter((link) => linkApplies(link, false)).map((link) => link.id)).toEqual(['a', 'c'])
    expect(linkLabel(config.links[0], 'hi')).toBe('H')
    expect(linkLabel(config.links[0], 'en')).toBe('A')
  })

  it('takes the good links and refuses the others by their place: a fifth, one with an id seen before, a bad one', () => {
    const link = (id: string, url = 'https://github.com/x') => `{"id":"${id}","en":"E","hi":"H","url":"${url}"}`
    const parsed = parseAppConfig(configText(`"links":[${link('a')},${link('a')},${link('c', 'http://github.com/x')},${link('d')},${link('e')}]`))
    expect(parsed?.rejected).toEqual(['links[1]', 'links[2]', 'links[4]'])
    expect(parsed?.config.links.map((entry) => entry.id)).toEqual(['a', 'd'])
  })

  it('does not take a name that is only a name for anything special', () => {
    expect(parseAppConfig(configText('"__proto__":{"features":{"ads":false}},"constructor":1'))?.rejected).toEqual([])
    expect(parse('"__proto__":{"features":{"ads":false}}').features.ads).toBe(true)
    expect(({} as Record<string, unknown>).ads).toBeUndefined()
  })

  it('names what it ignores but the owner probably mistyped, for the website\'s check only', () => {
    const parsed = parseAppConfig('{"schemaVersion":1,"extra":1}')
    expect(parsed?.rejected).toEqual([])
    expect(parsed?.unknown).toEqual(['unknown:extra'])
  })

  it('takes a value at the sixth level and refuses one at the seventh (the object that holds everything is the first)', () => {
    expect(parseAppConfig('{"schemaVersion":1,"a":[[[[[1]]]]]}')).not.toBeNull()
    expect(parseAppConfig('{"schemaVersion":1,"a":[[[[[[1]]]]]]}')).toBeNull()
    expect(parseAppConfig('{"schemaVersion":1,"a":[[[[[[[1]]]]]]]}')).toBeNull()
  })

  it('refuses a file that is not usable whole', () => {
    const bad = [
      '', '   ', '[]', '{}', '{"schemaVersion":2}', '{"schemaVersion":1,}', '{"schemaVersion":1,"schemaVersion":1}', '{"schemaVersion":1} x',
      '// a\n{"schemaVersion":1}', '{"schemaVersion":1,"a":NaN}', "{'schemaVersion':1}", '{schemaVersion:1}', '\ufeff{"schemaVersion":1}',
      '{"schemaVersion":01}', 'null', '"text"', '1', '{"schemaVersion":1.0}', '{"schemaVersion":"1"}', '{"schemaVersion":1',
    ]
    for (const text of bad) expect(parseAppConfig(text)).toBeNull()
  })

  it('refuses a file of the wrong size or encoding, and takes one of exactly the limit', () => {
    expect(parseAppConfig(' '.repeat(MAX_CONFIG_BYTES + 1))).toBeNull()
    const padded = (length: number) => `{"schemaVersion":1}`.padEnd(length, ' ')
    expect(parseAppConfig(padded(MAX_CONFIG_BYTES))).not.toBeNull()
    expect(parseAppConfig(padded(MAX_CONFIG_BYTES + 1))).toBeNull()
    // Bad bytes arrive as the replacement character; neither they nor a file that holds one are taken.
    expect(parseAppConfig('\ufffd(')).toBeNull()
    expect(parseAppConfig('{"schemaVersion":1,"a":"\ufffd"}')).toBeNull()
    expect(parseAppConfig('\ufffd\ufffd')).toBeNull()
    // The same character written as an escape is only a character.
    expect(parseAppConfig('{"schemaVersion":1,"a":"\\ufffd"}')).not.toBeNull()
  })

  it('counts the size in bytes, not characters: Hindi takes three bytes a letter', () => {
    const body = (letters: number) => `{"schemaVersion":1,"x":"${'\u0915'.repeat(letters)}"}`
    // 5400 letters are 16200 bytes, with the rest under the limit; 5500 are 16500 bytes, over it, though far fewer than 16384 characters.
    expect(parseAppConfig(body(5400))).not.toBeNull()
    expect(body(5500).length).toBeLessThan(MAX_CONFIG_BYTES)
    expect(parseAppConfig(body(5500))).toBeNull()
  })

  it('never throws, whatever it is given', () => {
    const odd = ['\ud800', '{"schemaVersion":1,"a":"\ud800"}', '{"schemaVersion":1,"a":"\\ud800"}', '\u0000', '{"schemaVersion":1,"a":"\\u00"}', '9'.repeat(5000)]
    for (const text of odd) expect(() => parseAppConfig(text)).not.toThrow()
    expect(parseAppConfig(`{"schemaVersion":1,"a":${'9'.repeat(400)}}`)?.rejected).toEqual([])
  })
})

describe('what the file says about a notice', () => {
  const notice = (parts: string): Notice => parse(noticePart('n', 'info', parts)).notice as Notice

  it('is for the builds and versions and times it names', () => {
    const forPlay = notice(',"build":"play","minVersionCode":10,"maxVersionCode":20,"until":"2026-12-01T00:00:00Z"')
    const before = Date.UTC(2026, 10, 30, 23, 59, 59)
    const after = Date.UTC(2026, 11, 1)
    const at = (playBuild: boolean, versionCode: number, now: number) => noticeApplies(forPlay, { playBuild, versionCode, now })
    expect(at(true, 10, before)).toBe(true)
    expect(at(true, 20, before)).toBe(true)
    expect(at(false, 15, before)).toBe(false)
    expect(at(true, 9, before)).toBe(false)
    expect(at(true, 21, before)).toBe(false)
    expect(at(true, 15, after)).toBe(false)
  })

  it('is for every build, version and moment when it names none', () => {
    const open = notice('')
    for (const playBuild of [true, false]) expect(noticeApplies(open, { playBuild, versionCode: 1, now: NOW_FAR })).toBe(true)
    expect(noticeApplies(notice(',"build":"direct"'), { playBuild: false, versionCode: 1, now: 0 })).toBe(true)
    expect(noticeApplies(notice(',"build":"direct"'), { playBuild: true, versionCode: 1, now: 0 })).toBe(false)
  })

  it('has a least version only, or a most only', () => {
    expect(noticeApplies(notice(',"minVersionCode":12'), { playBuild: true, versionCode: 11, now: 0 })).toBe(false)
    expect(noticeApplies(notice(',"minVersionCode":12'), { playBuild: true, versionCode: 9999, now: 0 })).toBe(true)
    expect(noticeApplies(notice(',"maxVersionCode":12'), { playBuild: true, versionCode: 13, now: 0 })).toBe(false)
    expect(noticeApplies(notice(',"maxVersionCode":12'), { playBuild: true, versionCode: 1, now: 0 })).toBe(true)
  })

  it('is shown in the language of the screen, and in English where it has no Hindi', () => {
    const both = parse(
      '"notice":{"id":"n","level":"info","title":{"en":"T","hi":"\\u091f"},"body":{"en":"B","hi":"\\u092c"}}',
    ).notice as Notice
    expect(noticeTitle(both, 'en')).toBe('T')
    expect(noticeTitle(both, 'hi')).toBe('ट')
    expect(noticeBody(both, 'hi')).toBe('ब')
    const english = notice('')
    expect(noticeTitle(english, 'hi')).toBe('T')
    expect(noticeBody(english, 'hi')).toBe('B')
  })
})

describe('the publisher\'s name', () => {
  it('is shown exactly when the website\'s switch says so, in every build', () => {
    const off = parse('"features":{"sourceName":false}')
    const on = parse('"features":{"sourceName":true}')
    for (const variant of ['play', 'preview', 'e2e'] as const) {
      setVariant(variant)
      expect(showsSourceName(off)).toBe(false)
      expect(showsSourceName(on)).toBe(true)
      expect(showsSourceName(DEFAULT_APP_CONFIG)).toBe(false)
    }
  })

  it('is off when the file says nothing about it, as on the website itself', () => {
    expect(showsSourceName(parse(''))).toBe(false)
    expect(showsSourceName(parse('"features":{"ads":false}'))).toBe(false)
    expect(showsSourceName(parse('"features":{"sourceName":"yes"}'))).toBe(false)
  })
})

describe('the sites and pages a link may open', () => {
  it('are few', () => {
    const site = PRODUCTION_SITE
    for (const good of [
      site, `${site}/contact`, `${site}/privacy`, 'https://play.google.com/store/apps/details?id=com.plaxlabs.news',
      'https://github.com/RichardHenryJames/plax', 'https://t.me/plax',
    ]) {
      expect(allowedLink(good)).toBe(true)
    }
    for (const bad of [
      null, '', 'http://github.com/x', 'https://example.com/', 'https://github.com.evil.example/x', 'https://github.com:444/x',
      'https://user@github.com/x', 'https://github.com/x#y', 'https://GITHUB.com/x', 'https://github.com/a b', 'https://github.com/../x',
      'https://github.com//x', 'https://github.com/%2e%2e/x', `${site}/../x`, 'https://plax-rouge.vercel.app/other',
      'https://play.google.com/store/apps/details?id=a', 'https://play.google.com/store/apps/details?id=com.a&x=1', 'javascript:alert(1)',
      'intent://x#Intent;end', 'market://details?id=com.plaxlabs.news', 'https://github.com/\n', `https://${'a'.repeat(200)}`,
    ]) {
      expect(allowedLink(bad)).toBe(false)
    }
  })

  it('are the sites the website lists, and no others', () => {
    for (const host of LINK_HOSTS) expect(allowedLink(`https://${host}/x`)).toBe(true)
    expect(LINK_HOSTS).toHaveLength(12)
  })
})

describe('text that is not plain', () => {
  it('is not taken', () => {
    expect(plain('Hello world', 20, false)).toBe(true)
    expect(plain('\u0928\u092e\u0938\u094d\u0924\u0947', 20, false)).toBe(true)
    expect(plain('a\nb', 20, true)).toBe(true)
    for (const bad of ['', ' a', 'a ', 'a\nb', 'a\tb', 'a\u200bb', 'a\u00a0b', 'a\u202eb', 'a\u2028b', 'a\u0000b', '\ue000', '\ud800', '\u00ad', 'a\u2060b']) {
      expect(plain(bad, 20, false)).toBe(false)
    }
    expect(plain('a'.repeat(21), 20, false)).toBe(false)
    expect(plain('l\nl\nl\nl\nl\nl\nl\nl', 40, true)).toBe(false)
    expect(plain('l\nl\nl\nl\nl\nl\nl', 40, true)).toBe(true)
  })
})

describe('an emoji', () => {
  it('is an emoji and nothing else', () => {
    expect(emoji('\ud83d\udcf0')).toBe(true)
    expect(emoji('\u2328\ufe0f')).toBe(true)
    expect(emoji('\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67')).toBe(true)
    for (const bad of [null, '', 'A', '1', '\u200d\ud83d\udcf0', '\ud83d\udcf0 ', 'x\ud83d\udcf0', '\u0928']) expect(emoji(bad)).toBe(false)
  })
})
