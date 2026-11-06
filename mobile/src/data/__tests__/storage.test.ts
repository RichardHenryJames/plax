import { fakeClock } from '../../platform/clock'
import { CACHE_ENTRIES, FeedCache, categoriesCacheKey, entryAge, topicCacheKey } from '../feed-cache'
import { CACHE_LIMIT, MAX_BYTES, SAVED_LIMIT, encodeCache, encodeSaved } from '../feed-parser'
import { SAVED_KEY, SavedStories, SavedStoriesError } from '../saved-stories'
import { SEEN_KEY, SeenFile } from '../seen-file'
import { SeenStore } from '../seen-store'
import { hexHash, javaHash } from '../java-text'
import { makeStory } from '../story'
import { BUILT_IN_TOPICS, NEWS_TOPIC } from '../topic'
import { HOUR, headline, ids, memoryStore, story, stories } from './helpers'

const fixture = () => makeStory({ id: 'fixture', title: 'A saved story', content: 'A local reading fixture.', category: 'news', section: 'world', source: 'Fixture publisher', sourceUrl: 'https://example.com/story', readTime: '1 min' })

/** A story with every field as long as it may be, so that a hundred of them are more than the phone keeps. */
const heavy = (index: number) =>
  makeStory({ id: `heavy-${index}`, title: 't'.repeat(2000), content: 'c'.repeat(8000), category: 'news', source: 's'.repeat(200), sourceUrl: `https://example.com/${'a'.repeat(4000)}`, image: `https://example.com/${'b'.repeat(4000)}` })

describe('the keys of the cache', () => {
  it('name the page of a topic and a language, as the native app did', () => {
    expect(topicCacheKey(NEWS_TOPIC, 'en')).toBe('news-en')
    expect(topicCacheKey({ id: 'science' }, 'hi')).toBe('science-hi')
  })

  it('are stable for a choice of interests, differ between choices and languages, and are safe to write', () => {
    expect(categoriesCacheKey('history,science', 'hi')).toBe(categoriesCacheKey('history,science', 'hi'))
    expect(categoriesCacheKey('history,science', 'hi')).not.toBe(categoriesCacheKey('history,space', 'hi'))
    expect(categoriesCacheKey('history,science', 'hi')).not.toBe(categoriesCacheKey('history,science', 'en'))
    expect(categoriesCacheKey('history,science', 'hi')).toMatch(/^[a-z0-9-]{1,60}$/)
    expect(categoriesCacheKey('science,space', 'en')).toBe('foryou-en-a3456bbe')
    expect(categoriesCacheKey('none', 'en')).toBe('foryou-en-33af38')
  })

  it('are made of the hash that Java makes of a string', () => {
    expect(javaHash('hello')).toBe(99162322)
    expect(javaHash('')).toBe(0)
    expect(javaHash('science,space')).toBe(-1555731522)
    expect(hexHash('hello')).toBe('5e918d2')
    expect(hexHash('science,space')).toBe('a3456bbe')
  })

  it('are all different for the built-in topics and both languages', () => {
    const keys = BUILT_IN_TOPICS.flatMap((topic) => [topicCacheKey(topic, 'en'), topicCacheKey(topic, 'hi')])
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]{1,60}$/)
  })
})

describe('the feed cache', () => {
  it('keeps a page and gives it back, with its age, and keeps languages, topics and interests apart', async () => {
    const clock = fakeClock()
    const store = memoryStore()
    const cache = new FeedCache(store, clock)
    const news = topicCacheKey(NEWS_TOPIC, 'en')
    expect(await cache.read(news)).toBeNull()
    await cache.write(news, [fixture()])
    clock.advance(5 * 60_000)
    const entry = await new FeedCache(store, clock).read(news)
    expect(entry?.stories).toEqual([fixture()])
    expect(entryAge(entry!, clock())).toBe(5 * 60_000)
    expect(await cache.read(topicCacheKey(NEWS_TOPIC, 'hi'))).toBeNull()
    expect(await cache.read(topicCacheKey({ id: 'science' }, 'en'))).toBeNull()
    expect(await cache.read(categoriesCacheKey('science,space', 'en'))).toBeNull()
    await cache.write(categoriesCacheKey('science,space', 'en'), [fixture()])
    expect(await cache.read(categoriesCacheKey('science,space', 'en'))).not.toBeNull()
  })

  it('is never older than nothing', () => {
    expect(entryAge({ stories: [], savedAt: 1000 }, 500)).toBe(0)
    expect(entryAge({ stories: [], savedAt: 1000 }, 1000 + HOUR)).toBe(HOUR)
  })

  it('refuses a key that is not a safe name', async () => {
    const cache = new FeedCache(memoryStore(), fakeClock())
    for (const key of ['../escape', 'News-en', 'a b', '', 'x'.repeat(61), 'a/b', 'a.json']) {
      await expect(cache.read(key)).rejects.toThrow('Invalid cache key')
      await expect(cache.write(key, [fixture()])).rejects.toThrow('Invalid cache key')
    }
    await expect(cache.read('x'.repeat(60))).resolves.toBeNull()
  })

  it('drops a damaged page and removes it so that it cannot fail again', async () => {
    const store = memoryStore()
    const cache = new FeedCache(store, fakeClock())
    await cache.write('news-en', [fixture()])
    const name = [...store.data.keys()].find((key) => key.endsWith('news-en')) as string
    store.data.set(name, '{bad json')
    expect(await cache.read('news-en')).toBeNull()
    expect(store.data.has(name)).toBe(false)
  })

  it('drops a page of another schema, with no time, or too long', async () => {
    const store = memoryStore()
    const cache = new FeedCache(store, fakeClock())
    await cache.write('news-en', [fixture()])
    const name = [...store.data.keys()].find((key) => key.endsWith('news-en')) as string
    for (const text of ['{"schema":2,"savedAt":5,"stories":[]}', encodeCache([fixture()]), `{"schema":1,"savedAt":5,"stories":[]}${' '.repeat(MAX_BYTES)}`]) {
      store.data.set(name, text)
      expect(await cache.read('news-en')).toBeNull()
      expect(store.data.has(name)).toBe(false)
    }
  })

  it('does not hold an empty page: an empty one is not cached and does not replace the one before it', async () => {
    const store = memoryStore()
    const cache = new FeedCache(store, fakeClock())
    await cache.write('news-en', [])
    expect(await cache.read('news-en')).toBeNull()
    expect(store.writes).toEqual([])
    await cache.write('news-en', [fixture()])
    await cache.write('news-en', [])
    expect((await cache.read('news-en'))?.stories).toEqual([fixture()])
    store.data.set([...store.data.keys()].find((key) => key.endsWith('news-en')) as string, encodeCache([], 5))
    expect(await cache.read('news-en')).toBeNull()
  })

  it('keeps the first hundred stories of a longer page', async () => {
    const cache = new FeedCache(memoryStore(), fakeClock())
    await cache.write('news-en', stories('s', 130))
    const entry = await cache.read('news-en')
    expect(entry?.stories).toHaveLength(CACHE_LIMIT)
    expect(ids(entry!.stories)[0]).toBe('s1')
    expect(ids(entry!.stories)[99]).toBe('s100')
  })

  it('does not keep a page larger than a megabyte, and the one before it stays', async () => {
    const cache = new FeedCache(memoryStore(), fakeClock())
    await cache.write('news-en', [fixture()])
    const huge = Array.from({ length: 100 }, (_unused, index) => heavy(index))
    expect(encodeCache(huge, 1).length).toBeGreaterThan(MAX_BYTES)
    await cache.write('news-en', huge)
    expect((await cache.read('news-en'))?.stories).toEqual([fixture()])
  })

  it('keeps at most 40 pages and lets go of the one written longest ago', async () => {
    const store = memoryStore()
    const cache = new FeedCache(store, fakeClock())
    expect(CACHE_ENTRIES).toBe(40)
    for (let index = 0; index < 45; index++) await cache.write(`topic${index}-en`, [fixture()])
    for (let index = 0; index < 5; index++) expect(await cache.read(`topic${index}-en`)).toBeNull()
    for (let index = 5; index < 45; index++) expect(await cache.read(`topic${index}-en`)).not.toBeNull()
    expect([...store.data.keys()].filter((key) => key.startsWith('plax.feed.entry.'))).toHaveLength(40)
    // Writing a page again makes it the newest.
    await cache.write('topic5-en', [fixture()])
    await cache.write('topic45-en', [fixture()])
    expect(await cache.read('topic5-en')).not.toBeNull()
    expect(await cache.read('topic6-en')).toBeNull()
  })

  it('writes pages that are written together one after the other, so that none is lost', async () => {
    const cache = new FeedCache(memoryStore(), fakeClock())
    await Promise.all(Array.from({ length: 12 }, (_unused, index) => cache.write(`t${index}-en`, [fixture()])))
    for (let index = 0; index < 12; index++) expect(await cache.read(`t${index}-en`)).not.toBeNull()
    await Promise.all(Array.from({ length: 50 }, (_unused, index) => cache.write(`u${index}-en`, [fixture()])))
    let kept = 0
    for (let index = 0; index < 12; index++) kept += (await cache.read(`t${index}-en`)) === null ? 0 : 1
    for (let index = 0; index < 50; index++) kept += (await cache.read(`u${index}-en`)) === null ? 0 : 1
    expect(kept).toBe(CACHE_ENTRIES)
  })

  it('reads as nothing when the store cannot be read, and leaves the page alone', async () => {
    const store = memoryStore()
    const cache = new FeedCache(store, fakeClock())
    await cache.write('news-en', [fixture()])
    store.failReads(() => true)
    expect(await cache.read('news-en')).toBeNull()
    store.heal()
    expect(await cache.read('news-en')).not.toBeNull()
  })

  it('lets the caller see a write that failed, and holds on to the page before it', async () => {
    const store = memoryStore()
    const cache = new FeedCache(store, fakeClock())
    await cache.write('news-en', [fixture()])
    store.failWrites(() => true)
    await expect(cache.write('news-en', stories('n', 3))).rejects.toThrow('no room')
    store.heal()
    expect((await cache.read('news-en'))?.stories).toEqual([fixture()])
    // And the next write is not blocked by the one that failed.
    await cache.write('news-en', stories('n', 3))
    expect(ids((await cache.read('news-en'))!.stories)).toEqual(['n1', 'n2', 'n3'])
  })

  it('writes the time it was cached at', async () => {
    const clock = fakeClock(1_800_000_000_000)
    const store = memoryStore()
    await new FeedCache(store, clock).write('news-en', [fixture()])
    clock.advance(HOUR)
    expect((await new FeedCache(store, clock).read('news-en'))?.savedAt).toBe(1_800_000_000_000)
  })

  it('goes on when the index of the pages is damaged', async () => {
    const store = memoryStore({ 'plax.feed.index': '{not json' })
    const cache = new FeedCache(store, fakeClock())
    await cache.write('news-en', [fixture()])
    expect(await cache.read('news-en')).not.toBeNull()
    expect(JSON.parse(store.data.get('plax.feed.index') as string)).toEqual(['news-en'])
    store.data.set('plax.feed.index', '{"a":1}')
    await cache.write('science-en', [fixture()])
    expect(JSON.parse(store.data.get('plax.feed.index') as string)).toEqual(['science-en'])
    store.data.set('plax.feed.index', JSON.stringify(['ok-en', 5, '../bad', 'also-ok']))
    await cache.write('news-en', [fixture()])
    expect(JSON.parse(store.data.get('plax.feed.index') as string)).toEqual(['ok-en', 'also-ok', 'news-en'])
  })
})

describe('the saved stories', () => {
  it('persist without an account, and can be removed', async () => {
    const store = memoryStore()
    const saved = new SavedStories(store)
    expect(await saved.read()).toEqual([])
    await saved.write([fixture()])
    expect(await new SavedStories(store).read()).toEqual([fixture()])
    await saved.write([])
    expect(await new SavedStories(store).read()).toEqual([])
  })

  it('keep their order', async () => {
    const saved = new SavedStories(memoryStore())
    await saved.write(stories('s', 5))
    expect(ids(await saved.read())).toEqual(['s1', 's2', 's3', 's4', 's5'])
  })

  it('are never silently replaced when the file is damaged: reading it fails and it is left as it is', async () => {
    const store = memoryStore({ [SAVED_KEY]: '{bad json' })
    await expect(new SavedStories(store).read()).rejects.toThrow()
    expect(store.data.get(SAVED_KEY)).toBe('{bad json')
    for (const text of ['', '{"schema":2,"stories":[]}', '[]', 'null', '{"schema":1,"stories":[{"id":"a"}]}']) {
      store.data.set(SAVED_KEY, text)
      await expect(new SavedStories(store).read()).rejects.toThrow()
    }
  })

  it('keep what they had when a write is too big: more than 200 stories, or more than a megabyte', async () => {
    const store = memoryStore()
    const saved = new SavedStories(store)
    await saved.write([fixture()])
    const tooMany = Array.from({ length: SAVED_LIMIT + 1 }, (_unused, index) => story(`s${index}`))
    await expect(saved.write(tooMany)).rejects.toThrow(SavedStoriesError)
    expect(await saved.read()).toEqual([fixture()])
    const tooLarge = Array.from({ length: SAVED_LIMIT }, (_unused, index) => heavy(index))
    expect(encodeSaved(tooLarge).length).toBeGreaterThan(MAX_BYTES)
    await expect(saved.write(tooLarge)).rejects.toThrow(SavedStoriesError)
    expect(await saved.read()).toEqual([fixture()])
  })

  it('hold 200 stories', async () => {
    const saved = new SavedStories(memoryStore())
    await saved.write(Array.from({ length: SAVED_LIMIT }, (_unused, index) => story(`s${index}`)))
    expect(await saved.read()).toHaveLength(SAVED_LIMIT)
  })

  it('keep what they had when the store fails, and say so', async () => {
    const store = memoryStore()
    const saved = new SavedStories(store)
    await saved.write([fixture()])
    store.failWrites(() => true)
    await expect(saved.write(stories('n', 2))).rejects.toThrow('no room')
    store.heal()
    expect(await saved.read()).toEqual([fixture()])
    store.failReads(() => true)
    await expect(saved.read()).rejects.toThrow('unreadable')
  })

  it('are kept under the key they are given, and by default where the engine keeps them', async () => {
    const store = memoryStore()
    await new SavedStories(store).write([fixture()])
    expect([...store.data.keys()]).toEqual([SAVED_KEY])
    await new SavedStories(store, 'other').write([])
    expect(await new SavedStories(store, 'other').read()).toEqual([])
    expect(await new SavedStories(store).read()).toEqual([fixture()])
  })
})

describe('the seen history file', () => {
  it('is empty before the first launch, and keeps what was seen across launches', async () => {
    const store = memoryStore()
    const now = 1_800_000_000_000
    expect((await new SeenFile(store).read(now)).size).toBe(0)
    const seen = new SeenStore()
    expect(seen.mark(fixture(), now)).toBe(true)
    await new SeenFile(store).write(seen)
    const reloaded = await new SeenFile(store).read(now)
    expect(reloaded.contains(fixture(), now)).toBe(true)
    expect(reloaded.size).toBe(1)
  })

  it('rejects a damaged history, or one that is too long', async () => {
    const store = memoryStore({ [SEEN_KEY]: '{bad json' })
    await expect(new SeenFile(store).read(1)).rejects.toThrow()
    store.data.set(SEEN_KEY, `{"schema":1,"seen":[]}${' '.repeat(MAX_BYTES)}`)
    await expect(new SeenFile(store).read(1)).rejects.toThrow('storage limit')
    store.data.set(SEEN_KEY, '{"schema":2,"seen":[]}')
    await expect(new SeenFile(store).read(1)).rejects.toThrow()
  })

  it('can be deleted', async () => {
    const store = memoryStore({ [SEEN_KEY]: '{bad json' })
    await new SeenFile(store).delete()
    expect(store.data.has(SEEN_KEY)).toBe(false)
    expect((await new SeenFile(store).read(1)).size).toBe(0)
  })

  it('says so when it cannot be written', async () => {
    const store = memoryStore()
    store.failWrites(() => true)
    await expect(new SeenFile(store).write(new SeenStore())).rejects.toThrow('no room')
  })

  it('holds a full history, which is smaller than the most a file may be', async () => {
    const store = memoryStore()
    const seen = new SeenStore()
    for (let index = 0; index < 1500; index++) seen.mark(makeStory({ id: `${'i'.repeat(190)}${index}`.slice(0, 200), title: `${headline(index)} ${'w'.repeat(200)}`, content: 'c', category: 'news' }), 1_800_000_000_000 + index)
    await new SeenFile(store).write(seen)
    expect((store.data.get(SEEN_KEY) as string).length).toBeLessThan(MAX_BYTES)
    expect((await new SeenFile(store).read(1_800_000_000_000 + 2000)).size).toBe(1500)
  })
})
