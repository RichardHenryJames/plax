import { Prefs, PREF_KEYS, isThemeChoice } from '../prefs'
import { INTERESTS_KEY, categories, readInterests, sameInterests, sanitize, writeInterests } from '../interests'
import { ENGLISH, HINDI, detectLanguage, languageOf } from '../language'
import { BUILT_IN_TOPICS, type Topic } from '../topic'
import { memoryStore } from './helpers'

describe('the topics chosen for For you', () => {
  it('are the known topics, in a fixed order, without repeats or blanks', () => {
    expect([...sanitize(['space', ' science ', 'history', 'nonsense', '', null, 'space', undefined], BUILT_IN_TOPICS)]).toEqual(['history', 'science', 'space'])
    expect(categories(sanitize(['space', 'history', 'science'], BUILT_IN_TOPICS))).toBe('history,science,space')
  })

  it('leave out whatever is not exactly the id of a topic on offer', () => {
    expect(sanitize(['<script>', 'news,science'], BUILT_IN_TOPICS).size).toBe(0)
    expect(sanitize(['Science', 'SPACE', 'science '], BUILT_IN_TOPICS).size).toBe(1)
    expect(sanitize([], BUILT_IN_TOPICS).size).toBe(0)
    expect(sanitize([5 as unknown as string, {} as unknown as string, 'space'], BUILT_IN_TOPICS).has('space')).toBe(true)
  })

  it('are the topics on offer now, not the ones the app was made with', () => {
    const listed: Topic[] = [{ id: 'cricket', emoji: 'x', en: 'Cricket', hi: 'क्रिकेट' }, BUILT_IN_TOPICS[0]]
    expect([...sanitize(['cricket', 'news', 'space'], listed)]).toEqual(['cricket', 'news'])
    expect([...sanitize(['cricket'], BUILT_IN_TOPICS)]).toEqual([])
  })

  it('are sorted as strings are in Java, by their code units', () => {
    const listed: Topic[] = ['b', 'a', 'Z', 'aa', 'a1'].map((id) => ({ id, emoji: '', en: id, hi: id }))
    expect([...sanitize(['b', 'a', 'Z', 'aa', 'a1'], listed)]).toEqual(['Z', 'a', 'a1', 'aa', 'b'])
  })

  it('are the same choice when they hold the same topics', () => {
    expect(sameInterests(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(sameInterests(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    expect(sameInterests(new Set(['a', 'c']), new Set(['a', 'b']))).toBe(false)
    expect(sameInterests(new Set(), new Set())).toBe(true)
  })

  it('stay on the phone in a fixed order', async () => {
    const store = memoryStore()
    expect((await readInterests(store, BUILT_IN_TOPICS)).size).toBe(0)
    await writeInterests(store, ['space', 'history', 'nonsense'], BUILT_IN_TOPICS)
    expect([...(await readInterests(store, BUILT_IN_TOPICS))]).toEqual(['history', 'space'])
    expect(store.data.get(INTERESTS_KEY)).toBe('history,space')
    await writeInterests(store, [], BUILT_IN_TOPICS)
    expect((await readInterests(store, BUILT_IN_TOPICS)).size).toBe(0)
  })

  it('read only the topics on offer, and none when the phone cannot be read', async () => {
    const store = memoryStore({ [INTERESTS_KEY]: 'space,cricket,,nonsense' })
    expect([...(await readInterests(store, BUILT_IN_TOPICS))]).toEqual(['space'])
    store.failReads(() => true)
    expect((await readInterests(store, BUILT_IN_TOPICS)).size).toBe(0)
  })

  it('are not written when the phone has no room, and the caller sees it', async () => {
    const store = memoryStore()
    store.failWrites(() => true)
    await expect(writeInterests(store, ['space'], BUILT_IN_TOPICS)).rejects.toThrow('no room')
  })
})

describe('the settings of the phone', () => {
  it('remember the theme', async () => {
    const prefs = new Prefs(memoryStore())
    expect(await prefs.theme()).toBe('system')
    for (const theme of ['dark', 'light', 'system'] as const) {
      await prefs.setTheme(theme)
      expect(await prefs.theme()).toBe(theme)
    }
  })

  it('take an unknown theme for the phone\u2019s own', async () => {
    const store = memoryStore({ [PREF_KEYS.theme]: 'purple' })
    expect(await new Prefs(store).theme()).toBe('system')
    expect([isThemeChoice('dark'), isThemeChoice('light'), isThemeChoice('system'), isThemeChoice('Dark'), isThemeChoice(2), isThemeChoice(null)]).toEqual([true, true, true, false, false, false])
  })

  it('remember the language the reader chose, and have none before they did', async () => {
    const prefs = new Prefs(memoryStore())
    expect(await prefs.language()).toBeNull()
    await prefs.setLanguage('hi')
    expect(await prefs.language()).toBe('hi')
    await prefs.setLanguage('en')
    expect(await prefs.language()).toBe('en')
    expect(await new Prefs(memoryStore({ [PREF_KEYS.language]: 'fr' })).language()).toBeNull()
  })

  it('remember which feed the reader was last in', async () => {
    const prefs = new Prefs(memoryStore())
    expect(await prefs.forYou()).toBe(false)
    await prefs.setForYou(true)
    expect(await prefs.forYou()).toBe(true)
    await prefs.setForYou(false)
    expect(await prefs.forYou()).toBe(false)
    expect(await new Prefs(memoryStore({ [PREF_KEYS.forYou]: 'maybe' })).forYou()).toBe(false)
  })

  it('remember when an ad last arrived in the strip', async () => {
    const prefs = new Prefs(memoryStore())
    expect(await prefs.bannerServedAt()).toBe(0)
    await prefs.setBannerServedAt(1_800_000_000_000)
    expect(await prefs.bannerServedAt()).toBe(1_800_000_000_000)
    await prefs.setBannerServedAt(1_800_000_000_000.9)
    expect(await prefs.bannerServedAt()).toBe(1_800_000_000_000)
    await prefs.setBannerServedAt(-5)
    expect(await prefs.bannerServedAt()).toBe(0)
    for (const text of ['soon', '-1', '1.5', '']) expect(await new Prefs(memoryStore({ [PREF_KEYS.bannerServedAt]: text })).bannerServedAt()).toBe(0)
  })

  it('read as the defaults when the phone cannot be read, and say so when it cannot be written', async () => {
    const store = memoryStore({ [PREF_KEYS.theme]: 'dark', [PREF_KEYS.language]: 'hi', [PREF_KEYS.forYou]: 'true', [PREF_KEYS.bannerServedAt]: '5' })
    const prefs = new Prefs(store)
    store.failReads(() => true)
    expect([await prefs.theme(), await prefs.language(), await prefs.forYou(), await prefs.bannerServedAt()]).toEqual(['system', null, false, 0])
    store.heal()
    store.failWrites(() => true)
    await expect(prefs.setTheme('light')).rejects.toThrow('no room')
    await expect(prefs.setLanguage('en')).rejects.toThrow('no room')
    await expect(prefs.setForYou(true)).rejects.toThrow('no room')
    await expect(prefs.setBannerServedAt(1)).rejects.toThrow('no room')
    expect(await prefs.theme()).toBe('dark')
  })

  it('are kept apart from each other and from the topics', async () => {
    const store = memoryStore()
    const prefs = new Prefs(store)
    await prefs.setTheme('dark')
    await prefs.setLanguage('hi')
    await prefs.setForYou(true)
    await prefs.setBannerServedAt(7)
    await writeInterests(store, ['space'], BUILT_IN_TOPICS)
    expect(new Set(store.data.keys()).size).toBe(5)
    expect(Object.values(PREF_KEYS)).toHaveLength(4)
  })
})

describe('the reading language', () => {
  it('follows the locale: Hindi for a Hindi one, English for any other and for none', () => {
    expect(languageOf('hi-IN')).toBe(HINDI)
    expect(languageOf('hi')).toBe(HINDI)
    expect(languageOf('hi_IN')).toBe(HINDI)
    expect(languageOf('HI-in')).toBe(HINDI)
    expect(languageOf('hi-Latn-IN')).toBe(HINDI)
    expect(languageOf('fr-FR')).toBe(ENGLISH)
    expect(languageOf('en-US')).toBe(ENGLISH)
    expect(languageOf('he')).toBe(ENGLISH)
    expect(languageOf('hin')).toBe(ENGLISH)
    expect(languageOf('')).toBe(ENGLISH)
    expect(languageOf(null)).toBe(ENGLISH)
    expect(languageOf(undefined)).toBe(ENGLISH)
    expect(languageOf(42 as unknown as string)).toBe(ENGLISH)
  })

  it('is read from the phone\u2019s locale', () => {
    const locale = jest.spyOn(Intl, 'DateTimeFormat')
    const resolved = (tag: string) => ({ resolvedOptions: () => ({ locale: tag }) }) as unknown as Intl.DateTimeFormat
    locale.mockImplementation(() => resolved('hi-IN'))
    expect(detectLanguage()).toBe('hi')
    locale.mockImplementation(() => resolved('en-GB'))
    expect(detectLanguage()).toBe('en')
    locale.mockRestore()
  })

  it('is English when the locale cannot be told', () => {
    const locale = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectLanguage()).toBe('en')
    locale.mockRestore()
    const nothing = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({ resolvedOptions: () => ({}) }) as unknown as Intl.DateTimeFormat)
    expect(detectLanguage()).toBe('en')
    nothing.mockRestore()
  })

  it('has a language on this machine', () => {
    expect(['en', 'hi']).toContain(detectLanguage())
  })
})
