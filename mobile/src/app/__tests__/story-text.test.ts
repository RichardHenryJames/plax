import { DEFAULT_APP_CONFIG } from '../../config/app-config'
import { makeStory } from '../../data/story'
import { translate, type Lang, type StringKey } from '../../i18n'
import { ageText, dayAndMonth, readTimeText, storyCredit, storyTag } from '../story-text'

const tFor =
  (lang: Lang) =>
  (key: StringKey, ...args: (string | number)[]) =>
    translate(lang, key, ...args)
const en = tFor('en')
const hi = tFor('hi')

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const now = new Date(2026, 10, 6, 12, 0, 0).getTime()

describe('the tag over a story', () => {
  it('is the website’s name for the section, in capitals', () => {
    expect(storyTag(makeStory({ id: 'a', section: 'india' }), DEFAULT_APP_CONFIG, 'en', en)).toBe('INDIA')
    expect(storyTag(makeStory({ id: 'a', section: 'tech' }), DEFAULT_APP_CONFIG, 'en', en)).toBe('TECH')
  })

  it('is the name of the topic when the story has no section', () => {
    expect(storyTag(makeStory({ id: 'a', category: 'space' }), DEFAULT_APP_CONFIG, 'en', en)).toBe('SPACE')
    expect(storyTag(makeStory({ id: 'a', category: 'math' }), DEFAULT_APP_CONFIG, 'en', en)).toBe('MATHEMATICS')
  })

  it('is in Hindi for a reader of Hindi', () => {
    const tag = storyTag(makeStory({ id: 'a', section: 'india' }), DEFAULT_APP_CONFIG, 'hi', hi)
    expect(tag).toBe(DEFAULT_APP_CONFIG.sections.find((section) => section.id === 'india')?.hi.toUpperCase())
    expect(tag).not.toBe('INDIA')
  })

  it('prefers the section to the category', () => {
    expect(storyTag(makeStory({ id: 'a', category: 'space', section: 'world' }), DEFAULT_APP_CONFIG, 'en', en)).toBe('WORLD')
  })

  it('is the key as the feed wrote it when nothing names it', () => {
    expect(storyTag(makeStory({ id: 'a', category: 'gardening' }), DEFAULT_APP_CONFIG, 'en', en)).toBe('GARDENING')
  })

  it('is Headlines for a story that says nothing at all', () => {
    expect(storyTag(makeStory({ id: 'a', category: '' }), DEFAULT_APP_CONFIG, 'en', en)).toBe('HEADLINES')
  })

  it('follows the website’s list of sections and topics, not only the built-in ones', () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      sections: [{ id: 'sport', en: 'Sport', hi: 'खेल' }],
      topics: [{ id: 'cooking', emoji: '🍳', en: 'Cooking', hi: 'खाना' }],
    }
    expect(storyTag(makeStory({ id: 'a', section: 'sport' }), config, 'en', en)).toBe('SPORT')
    expect(storyTag(makeStory({ id: 'a', category: 'cooking' }), config, 'en', en)).toBe('COOKING')
    expect(storyTag(makeStory({ id: 'a', category: 'space' }), config, 'en', en)).toBe('SPACE')
  })
})

describe('how long ago a story was published', () => {
  it('says nothing when the feed gave no time, or a time to come', () => {
    expect(ageText(0, now, en, 'en')).toBe('')
    expect(ageText(now + 5 * MINUTE, now, en, 'en')).toBe('')
  })

  it('says just now for the first minute', () => {
    expect(ageText(now - 30_000, now, en, 'en')).toBe('Just now')
    expect(ageText(now, now, en, 'en')).toBe('Just now')
  })

  it('counts minutes, then hours', () => {
    expect(ageText(now - MINUTE, now, en, 'en')).toBe('1 min ago')
    expect(ageText(now - 59 * MINUTE - 59_000, now, en, 'en')).toBe('59 min ago')
    expect(ageText(now - HOUR, now, en, 'en')).toBe('1 h ago')
    expect(ageText(now - 23 * HOUR - 59 * MINUTE, now, en, 'en')).toBe('23 h ago')
  })

  it('gives the date from a day on', () => {
    expect(ageText(new Date(2026, 10, 5, 11, 0, 0).getTime(), now, en, 'en')).toBe('5 Nov')
    expect(ageText(new Date(2026, 0, 2, 11, 0, 0).getTime(), now, en, 'en')).toBe('2 Jan')
  })

  it('speaks Hindi to a reader of Hindi', () => {
    expect(ageText(now - 5 * MINUTE, now, hi, 'hi')).toBe('5 मिनट पहले')
    expect(ageText(now - 3 * HOUR, now, hi, 'hi')).toBe('3 घंटे पहले')
    expect(ageText(now - 30_000, now, hi, 'hi')).toBe(hi('just_now'))
  })
})

describe('the date of an older story', () => {
  it('is the day and the short month', () => {
    expect(dayAndMonth(5, 10, 'en')).toBe('5 Nov')
    expect(dayAndMonth(31, 11, 'en')).toBe('31 Dec')
  })

  it('is written in the letters of Hindi for Hindi', () => {
    const text = dayAndMonth(5, 10, 'hi')
    expect(text).toMatch(/^5 /)
    expect(text).toMatch(/\p{Script=Devanagari}/u)
  })

  it('falls back to the English month where the engine has no locale data', () => {
    const spy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('11/05')
    try {
      expect(dayAndMonth(5, 10, 'en')).toBe('5 Nov')
    } finally {
      spy.mockRestore()
    }
  })

  it('falls back to the English month where there is no Intl at all', () => {
    const spy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(() => {
      throw new RangeError('no locale')
    })
    try {
      expect(dayAndMonth(9, 2, 'hi')).toBe('9 Mar')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('the reading time', () => {
  const story = (readTime: string) => makeStory({ id: 'a', readTime })

  it('is in seconds under a minute', () => {
    expect(readTimeText(story('13s'), en)).toBe('13 sec')
    expect(readTimeText(story('59 secs'), en)).toBe('59 sec')
  })

  it('is in minutes from a minute on, never less than one, rounded', () => {
    expect(readTimeText(story('60s'), en)).toBe('1 min')
    expect(readTimeText(story('90s'), en)).toBe('2 min')
    expect(readTimeText(story('2 min'), en)).toBe('2 min')
    expect(readTimeText(story('14 minutes'), en)).toBe('14 min')
  })

  it('is as written when it has another form, or none', () => {
    expect(readTimeText(story('quick read'), en)).toBe('quick read')
    expect(readTimeText(story(''), en)).toBe('')
  })

  it('is in Hindi for Hindi', () => {
    expect(readTimeText(story('2 min'), hi)).toBe(hi('read_minutes', 2))
  })
})

describe('the line beside the tag', () => {
  const story = makeStory({ id: 'a', source: 'The Hindu', publishedAt: now - 3 * HOUR, readTime: '2 min' })
  const options = { lang: 'en' as Lang, now, namesSource: false, roomy: true }

  it('is the age and the reading time, with no publisher’s name, when the website does not name it', () => {
    expect(storyCredit(story, en, options)).toBe('3\u00a0h\u00a0ago · 2\u00a0min')
    expect(storyCredit(story, en, options)).not.toContain('Hindu')
  })

  it('starts with the publisher when the website says to name it', () => {
    expect(storyCredit(story, en, { ...options, namesSource: true })).toBe('The Hindu · 3\u00a0h\u00a0ago · 2\u00a0min')
  })

  it('says the source is not listed when it is to be named and the story has none', () => {
    expect(storyCredit(makeStory({ id: 'a', publishedAt: now - 3 * HOUR }), en, { ...options, namesSource: true, roomy: false })).toBe('Source not listed · 3\u00a0h\u00a0ago')
  })

  it('leaves the reading time out on a narrow page', () => {
    expect(storyCredit(story, en, { ...options, roomy: false })).toBe('3\u00a0h\u00a0ago')
  })

  it('is empty for a story with neither a time nor a reading time', () => {
    expect(storyCredit(makeStory({ id: 'a' }), en, options)).toBe('')
  })

  it('keeps the parts after the source whole', () => {
    const parts = storyCredit(story, en, options).split(' · ')
    expect(parts).toHaveLength(2)
    for (const part of parts) expect(part).not.toMatch(/ /)
  })
})
