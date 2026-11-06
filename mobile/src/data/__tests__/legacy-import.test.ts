import { fakeClock } from '../../platform/clock'
import { LEGACY_DONE_KEY, LEGACY_LOCALE_FILE, LEGACY_SAVED_FILE, LEGACY_SEEN_FILE, importLegacyData, parseLegacyLocale, parseLegacyPreferences, type LegacyFiles } from '../legacy-import'
import { INTERESTS_KEY, readInterests } from '../interests'
import { PREF_KEYS, Prefs } from '../prefs'
import { SAVED_KEY, SavedStories } from '../saved-stories'
import { SEEN_KEY, SeenFile } from '../seen-file'
import { SeenStore } from '../seen-store'
import { encodeSaved } from '../feed-parser'
import { BUILT_IN_TOPICS, type Topic } from '../topic'
import { HOUR, headline, ids, memoryStore, story } from './helpers'

const NOW = 1_800_000_000_000

/** The files directory of the native app, as the lead's reader of it would answer. */
function filesOf(files: Record<string, string | null | Error>, preferences?: string | null | Error): LegacyFiles {
  const reader: LegacyFiles = {
    async readText(name) {
      const value = files[name]
      if (value instanceof Error) throw value
      return value ?? null
    },
  }
  if (preferences !== undefined) {
    reader.readPreferences = async () => {
      if (preferences instanceof Error) throw preferences
      return preferences
    }
  }
  return reader
}

const nativeSeen = (...entries: { id: string; k: string; p?: number; t?: number; n?: boolean }[]) =>
  JSON.stringify({ schema: 1, seen: entries.map((entry) => ({ id: entry.id, k: entry.k, p: entry.p ?? NOW - HOUR, t: entry.t ?? NOW - HOUR, n: entry.n ?? true })) })

const PREFERENCES = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="interests">space,history,nonsense</string>
    <int name="theme" value="2" />
    <boolean name="for_you" value="true" />
    <long name="banner_served_at" value="1790000000000" />
</map>
`

describe('importing the data of the native app', () => {
  it('brings in the saved stories, keeping their order and every field', async () => {
    const store = memoryStore()
    const legacy = [story('a', 'A "quoted" headline', 1_780_000_000_000, { sig: '45cf1f8654294cfdfa03b1376166de5b', section: 'india' }), story('b', ''), story('c')]
    const result = await importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: encodeSaved(legacy) }), storage: store, clock: fakeClock(NOW) })
    expect(result).toEqual({ ran: true, saved: 3, seen: 0, settings: 0, done: true })
    expect(await new SavedStories(store).read()).toEqual(legacy)
  })

  it('brings in the seen history, so that what was read is not shown again', async () => {
    const store = memoryStore()
    const text = nativeSeen({ id: 'bbc-1', k: 'lena okafor wins nobel peace prize' }, { id: 'quote', k: 'doubt is not a pleasant condition', p: 0, n: false })
    const result = await importLegacyData({ files: filesOf({ [LEGACY_SEEN_FILE]: text }), storage: store, clock: fakeClock(NOW) })
    expect(result).toMatchObject({ ran: true, seen: 2, done: true })
    const seen = await new SeenFile(store).read(NOW)
    expect(seen.size).toBe(2)
    expect(seen.contains(story('other', 'South African lawyer Lena Okafor wins the Nobel Peace Prize', NOW - HOUR), NOW)).toBe(true)
  })

  it('merges into what the phone has already, without exceeding the limit of 200 and without repeats', async () => {
    const store = memoryStore()
    await new SavedStories(store).write(Array.from({ length: 150 }, (_unused, index) => story(`mine${index}`, headline(index))))
    const legacy = [...Array.from({ length: 80 }, (_unused, index) => story(`old${index}`, headline(1000 + index))), story('mine5', 'same id')]
    const result = await importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: encodeSaved(legacy.slice(0, 80)) }), storage: store, clock: fakeClock(NOW) })
    expect(result.saved).toBe(50)
    const merged = await new SavedStories(store).read()
    expect(merged).toHaveLength(200)
    expect(ids(merged).slice(0, 2)).toEqual(['mine0', 'mine1'])
    expect(ids(merged)[150]).toBe('old0')
    expect(new Set(ids(merged)).size).toBe(200)

    const again = memoryStore()
    await new SavedStories(again).write([story('mine5')])
    await importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: encodeSaved([story('mine5', 'older copy'), story('x')]) }), storage: again, clock: fakeClock(NOW) })
    expect(ids(await new SavedStories(again).read())).toEqual(['mine5', 'x'])
    expect((await new SavedStories(again).read())[0].title).toBe('Headline mine5')
  })

  it('merges the seen history with the phone\u2019s own', async () => {
    const store = memoryStore()
    const mine = new SeenStore()
    mine.mark(story('mine', headline(1)), NOW - 2 * HOUR)
    await new SeenFile(store).write(mine)
    const result = await importLegacyData({ files: filesOf({ [LEGACY_SEEN_FILE]: nativeSeen({ id: 'old', k: headline(2) }) }), storage: store, clock: fakeClock(NOW) })
    expect(result.seen).toBe(1)
    expect((await new SeenFile(store).read(NOW)).recentIds(5)).toEqual(['old', 'mine'])
  })

  it('runs once: the next time it does nothing, whatever the files hold', async () => {
    const store = memoryStore()
    const files = filesOf({ [LEGACY_SAVED_FILE]: encodeSaved([story('a')]) })
    expect(await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })).toMatchObject({ ran: true, saved: 1, done: true })
    expect(store.data.has(LEGACY_DONE_KEY)).toBe(true)
    await new SavedStories(store).write([])
    const again = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(again).toEqual({ ran: false, saved: 0, seen: 0, settings: 0, done: true })
    expect(await new SavedStories(store).read()).toEqual([])
  })

  it('is done at once, and marked, when the native app left nothing', async () => {
    const store = memoryStore()
    const result = await importLegacyData({ files: filesOf({}), storage: store, clock: fakeClock(NOW) })
    expect(result).toEqual({ ran: true, saved: 0, seen: 0, settings: 0, done: true })
    expect(store.data.has(LEGACY_DONE_KEY)).toBe(true)
    expect(store.data.has(SAVED_KEY)).toBe(false)
    expect(store.data.has(SEEN_KEY)).toBe(false)
  })

  it('does not import a file that is damaged, and leaves what the phone has as it is', async () => {
    const store = memoryStore()
    await new SavedStories(store).write([story('mine')])
    const files = filesOf({
      [LEGACY_SAVED_FILE]: '{bad json',
      [LEGACY_SEEN_FILE]: '{"schema":2,"seen":[]}',
      [LEGACY_LOCALE_FILE]: 'not what AppCompat writes',
    })
    const result = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(result).toEqual({ ran: true, saved: 0, seen: 0, settings: 0, done: true })
    expect(ids(await new SavedStories(store).read())).toEqual(['mine'])
    expect(store.data.has(SEEN_KEY)).toBe(false)
  })

  it('does not import what the app would not read back: more than 200 stories, a story with no text, or an id twice', async () => {
    const tooMany = JSON.stringify({ schema: 1, stories: Array.from({ length: 201 }, (_unused, index) => ({ id: `s${index}`, title: 'T', content: 'C', category: 'news' })) })
    const noText = JSON.stringify({ schema: 1, stories: [{ id: 'a', title: 'T', content: '', category: 'news' }] })
    const twice = JSON.stringify({ schema: 1, stories: [{ id: 'a', title: 'T', content: 'C', category: 'news' }, { id: 'a', title: 'T', content: 'C', category: 'news' }] })
    for (const text of [tooMany, noText, twice]) {
      const store = memoryStore()
      const result = await importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: text }), storage: store, clock: fakeClock(NOW) })
      expect(result.saved).toBe(0)
      expect(store.data.has(SAVED_KEY)).toBe(false)
    }
  })

  it('reads the copy the native app keeps while it writes, which it reads first, and falls back to the file when that one is damaged', async () => {
    const store = memoryStore()
    const files = filesOf({ [`${LEGACY_SAVED_FILE}.bak`]: encodeSaved([story('backup')]), [LEGACY_SAVED_FILE]: '{half written' })
    await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(ids(await new SavedStories(store).read())).toEqual(['backup'])

    const other = memoryStore()
    await importLegacyData({ files: filesOf({ [`${LEGACY_SAVED_FILE}.bak`]: '{bad', [LEGACY_SAVED_FILE]: encodeSaved([story('base')]) }), storage: other, clock: fakeClock(NOW) })
    expect(ids(await new SavedStories(other).read())).toEqual(['base'])
  })

  it('imports the saved stories again at the next launch when the phone could not be written, and not before the others are done', async () => {
    const store = memoryStore()
    const files = filesOf({ [LEGACY_SAVED_FILE]: encodeSaved([story('a')]), [LEGACY_SEEN_FILE]: nativeSeen({ id: 'x', k: headline(5) }) })
    store.failWrites((key) => key === SAVED_KEY)
    const first = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(first).toMatchObject({ ran: true, saved: 0, seen: 1, done: false })
    expect(store.data.has(LEGACY_DONE_KEY)).toBe(false)
    store.heal()
    const second = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(second).toMatchObject({ ran: true, saved: 1, done: true })
    expect(ids(await new SavedStories(store).read())).toEqual(['a'])
    expect((await new SeenFile(store).read(NOW)).size).toBe(1)
  })

  it('leaves the import for the next launch, and changes nothing, when the saved stories of the phone are damaged', async () => {
    const store = memoryStore({ [SAVED_KEY]: '{bad json' })
    const result = await importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: encodeSaved([story('a')]) }), storage: store, clock: fakeClock(NOW) })
    expect(result).toMatchObject({ saved: 0, done: false })
    expect(store.data.get(SAVED_KEY)).toBe('{bad json')
    expect(store.data.has(LEGACY_DONE_KEY)).toBe(false)
  })

  it('replaces a damaged history of the phone, which the engine would start again anyway', async () => {
    const store = memoryStore({ [SEEN_KEY]: '{bad json' })
    const result = await importLegacyData({ files: filesOf({ [LEGACY_SEEN_FILE]: nativeSeen({ id: 'x', k: headline(5) }) }), storage: store, clock: fakeClock(NOW) })
    expect(result).toMatchObject({ seen: 1, done: true })
    expect((await new SeenFile(store).read(NOW)).size).toBe(1)
  })

  it('never throws, whatever the files or the phone do', async () => {
    const throwing = filesOf({ [LEGACY_SAVED_FILE]: new Error('disk'), [LEGACY_SEEN_FILE]: new Error('disk'), [LEGACY_LOCALE_FILE]: new Error('disk') }, new Error('disk'))
    const result = await importLegacyData({ files: throwing, storage: memoryStore(), clock: fakeClock(NOW) })
    expect(result).toEqual({ ran: true, saved: 0, seen: 0, settings: 0, done: true })

    const broken = memoryStore()
    broken.failReads(() => true)
    await expect(importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: encodeSaved([story('a')]) }), storage: broken, clock: fakeClock(NOW) })).resolves.toMatchObject({ ran: false })

    const noRoom = memoryStore()
    noRoom.failWrites(() => true)
    await expect(importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: encodeSaved([story('a')]) }), storage: noRoom, clock: fakeClock(NOW) })).resolves.toMatchObject({ ran: true, saved: 0, done: false })
  })
})

describe('importing the settings of the native app', () => {
  it('takes the language AppCompat kept, the theme, the feed last used and the topics', async () => {
    const store = memoryStore()
    const files = filesOf({ [LEGACY_LOCALE_FILE]: `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><locales application_locales="hi" />` }, PREFERENCES)
    const result = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(result).toMatchObject({ settings: 4, done: true })
    const prefs = new Prefs(store)
    expect([await prefs.language(), await prefs.theme(), await prefs.forYou()]).toEqual(['hi', 'dark', true])
    expect([...(await readInterests(store, BUILT_IN_TOPICS))]).toEqual(['history', 'space'])
    expect(store.data.get(INTERESTS_KEY)).toBe('history,space')
  })

  it('does not take over what the reader has set on this phone already', async () => {
    const store = memoryStore({ [PREF_KEYS.theme]: 'light', [PREF_KEYS.language]: 'en' })
    const files = filesOf({ [LEGACY_LOCALE_FILE]: '<locales application_locales="hi" />' }, PREFERENCES)
    const result = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(result.settings).toBe(2)
    const prefs = new Prefs(store)
    expect([await prefs.language(), await prefs.theme(), await prefs.forYou()]).toEqual(['en', 'light', true])
  })

  it('takes only the topics the website lists', async () => {
    const store = memoryStore()
    const cricket: Topic = { id: 'cricket', emoji: 'x', en: 'Cricket', hi: 'x' }
    await importLegacyData({ files: filesOf({}, '<map><string name="interests">cricket,space</string></map>'), storage: store, clock: fakeClock(NOW), topics: () => [cricket] })
    expect(store.data.get(INTERESTS_KEY)).toBe('cricket')
  })

  it('takes nothing of a file that has nothing it knows', async () => {
    const store = memoryStore()
    const result = await importLegacyData({ files: filesOf({ [LEGACY_LOCALE_FILE]: '<locales application_locales="" />' }, '<map><string name="interests">nonsense</string><int name="theme" value="7" /></map>'), storage: store, clock: fakeClock(NOW) })
    expect(result.settings).toBe(0)
    expect(store.data.has(INTERESTS_KEY)).toBe(false)
    expect(store.data.has(PREF_KEYS.theme)).toBe(false)
  })

  it('goes on without the settings file when the reader of the files has none', async () => {
    const store = memoryStore()
    const result = await importLegacyData({ files: filesOf({ [LEGACY_SAVED_FILE]: encodeSaved([story('a')]) }), storage: store, clock: fakeClock(NOW) })
    expect(result).toMatchObject({ saved: 1, settings: 0, done: true })
  })

  it('is tried again when the settings could not be written', async () => {
    const store = memoryStore()
    store.failWrites((key) => key === PREF_KEYS.theme)
    const files = filesOf({}, PREFERENCES)
    const first = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(first.done).toBe(false)
    store.heal()
    const second = await importLegacyData({ files, storage: store, clock: fakeClock(NOW) })
    expect(second.done).toBe(true)
    expect(await new Prefs(store).theme()).toBe('dark')
  })
})

describe('reading the settings of the native app', () => {
  it('knows the language AppCompat wrote, the first of several', () => {
    expect(parseLegacyLocale(`<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><locales application_locales="hi" />`)).toBe('hi')
    expect(parseLegacyLocale('<locales application_locales="hi-IN,en-US" />')).toBe('hi')
    expect(parseLegacyLocale('<locales application_locales="en-GB" />')).toBe('en')
    expect(parseLegacyLocale('<locales application_locales="fr" />')).toBe('en')
    expect(parseLegacyLocale('<locales application_locales="" />')).toBeNull()
    expect(parseLegacyLocale('')).toBeNull()
    expect(parseLegacyLocale('<locales />')).toBeNull()
  })

  it('knows the theme, the feed and the topics the preferences file held', () => {
    expect(parseLegacyPreferences(PREFERENCES)).toEqual({ theme: 'dark', forYou: true, interests: ['space', 'history', 'nonsense'] })
    expect(parseLegacyPreferences('<map><int name="theme" value="0" /></map>')).toEqual({ theme: 'system' })
    expect(parseLegacyPreferences('<map><int name="theme" value="1" /></map>')).toEqual({ theme: 'light' })
    expect(parseLegacyPreferences('<map><boolean name="for_you" value="false" /></map>')).toEqual({ forYou: false })
    expect(parseLegacyPreferences('<map><string name="interests"></string></map>')).toEqual({ interests: [''] })
  })

  it('takes nothing from a theme it does not know, or from text that is not that file', () => {
    expect(parseLegacyPreferences('<map><int name="theme" value="9" /></map>')).toEqual({})
    expect(parseLegacyPreferences('')).toEqual({})
    expect(parseLegacyPreferences('{"theme":2}')).toEqual({})
    expect(parseLegacyPreferences('<map><int name="other" value="2" /></map>')).toEqual({})
  })
})
