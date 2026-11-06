import { fakeClock } from '../../platform/clock'
import { FeedCache, categoriesCacheKey, topicCacheKey } from '../feed-cache'
import { DWELL_MS, EXCLUDE_LIMIT, FeedEngine, GLANCE_MS, MORE_ATTEMPTS, NEW_SESSION_AFTER_MS, REVISIT_AFTER_MS, SEEN_FLUSH_MS, STORY_LIMIT, SWAP_WINDOW_MS } from '../feed-engine'
import { SEEN_KEY, SeenFile } from '../seen-file'
import { Prefs } from '../prefs'
import { CAUGHT_UP_ID, isCaughtUp } from '../story'
import { BUILT_IN_TOPICS, NEWS_TOPIC, topicById, type Topic } from '../topic'
import { HOUR, PUBLISHED, FakeSource, engineErrors, fakeTimers, headline, ids, makeRig, memoryStore, stories, story } from './helpers'

const SCIENCE = topicById(BUILT_IN_TOPICS, 'science')!
const SPACE = topicById(BUILT_IN_TOPICS, 'space')!
const MINUTE = 60_000

afterEach(() => {
  expect(engineErrors()).toEqual([])
})

/** Stories whose headlines share no words, so that none counts as another's event however many there are. */
const distinct = (prefix: string, count: number, published = PUBLISHED) => Array.from({ length: count }, (_unused, index) => story(`${prefix}${index + 1}`, headline(index + (prefix.charCodeAt(0) - 96) * 10_000), published))

describe('the constants of the engine', () => {
  it('are those of the native app', () => {
    expect([SWAP_WINDOW_MS, REVISIT_AFTER_MS, NEW_SESSION_AFTER_MS, STORY_LIMIT, MORE_ATTEMPTS, EXCLUDE_LIMIT, DWELL_MS, GLANCE_MS, SEEN_FLUSH_MS]).toEqual([
      1500,
      2 * MINUTE,
      30 * MINUTE,
      180,
      3,
      200,
      1200,
      500,
      3000,
    ])
  })
})

describe('starting', () => {
  it('has a state to draw before it is started, and asks for nothing', async () => {
    const t = await makeRig({ unstarted: true })
    expect(t.state()).toMatchObject({
      screen: 'feed',
      topic: NEWS_TOPIC,
      lang: 'en',
      section: '',
      stories: [],
      loading: false,
      refreshing: false,
      saving: false,
      storageReady: false,
      exhausted: false,
      fresh: false,
      feedError: null,
      storageError: null,
      notice: null,
      position: 0,
      earlier: 0,
      ready: false,
    })
    expect(t.state().savedIds.size).toBe(0)
    expect(t.state().interests.size).toBe(0)
    expect(t.source.calls).toEqual([])
  })

  it('opens the first screen from the cache while the network runs, and reads the saved stories', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 2) }, saved: [story('kept')] })
    expect(t.state().ready).toBe(true)
    expect(t.state().storageReady).toBe(true)
    expect([...t.state().savedIds]).toEqual(['kept'])
    expect(ids(t.state().stories)).toEqual(['c1', 'c2'])
  })

  it('is started once', async () => {
    const t = await makeRig()
    await t.engine.start()
    await t.engine.start()
    await t.settle()
    expect(t.source.calls).toHaveLength(1)
  })

  it('reads the language the reader chose, and asks for the feed of it', async () => {
    const t = await makeRig({ language: 'hi', cache: { 'news-hi': stories('h', 2), 'news-en': stories('e', 2) } })
    expect(t.state().lang).toBe('hi')
    expect(t.source.last.request.lang).toBe('hi')
    expect(ids(t.state().stories)).toEqual(['h1', 'h2'])
    expect(t.source.calls).toHaveLength(1)
  })

  it('takes the language it is given when the reader never chose one', async () => {
    const t = await makeRig()
    expect(t.state().lang).toBe('en')
    expect(t.source.last.request.lang).toBe('en')
  })

  it('takes the language of the phone when it is given none', async () => {
    const source = new FakeSource()
    const timers = fakeTimers()
    const engine = new FeedEngine({ source, storage: memoryStore(), clock: fakeClock(), topics: () => BUILT_IN_TOPICS, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
    expect(['en', 'hi']).toContain(engine.getState().lang)
    await engine.dispose()
  })

  it('opens For you when the reader last used it and has chosen topics', async () => {
    const t = await makeRig({ interests: ['science'], forYou: true })
    expect(t.state().screen).toBe('forYou')
    expect([...t.state().interests]).toEqual(['science'])
    expect(t.source.last.request.categories).toBe('science')
  })

  it('opens the feed when the reader last used For you but has no topics', async () => {
    const t = await makeRig({ forYou: true })
    expect(t.state().screen).toBe('feed')
    expect(t.source.last.request.categories).toBe('news')
  })

  it('opens the feed when the reader has topics but last used the feed', async () => {
    const t = await makeRig({ interests: ['science'], forYou: false })
    expect(t.state().screen).toBe('feed')
    expect([...t.state().interests]).toEqual(['science'])
  })

  it('reads only the topics the website lists', async () => {
    const cricket: Topic = { id: 'cricket', emoji: 'x', en: 'Cricket', hi: 'x' }
    const t = await makeRig({ topics: [NEWS_TOPIC, cricket], interests: ['cricket', 'space'], forYou: true })
    expect([...t.state().interests]).toEqual(['cricket'])
    expect(t.source.last.request.categories).toBe('cricket')
  })

  it('starts with what it has when the phone cannot be read, and says the saved stories are unavailable', async () => {
    const store = memoryStore()
    store.failReads(() => true)
    const t = await makeRig({ store })
    expect(t.state().ready).toBe(true)
    expect(t.state().storageReady).toBe(false)
    expect(t.state().storageError).toBe('storage_error')
    expect(t.source.calls).toHaveLength(1)
    t.source.last.resolve(stories('n', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['n1', 'n2'])
  })

  it('reads the history before the cache, so that the first page is drawn already filtered', async () => {
    const page = stories('c', 3)
    const t = await makeRig({ cache: { 'news-en': page }, seen: [page[0]], unstarted: true })
    const release = t.store.gate((key) => key === SEEN_KEY)
    await t.engine.start()
    await t.settle()
    // Nothing is drawn while the history is still being read.
    expect(t.state().stories).toEqual([])
    expect(t.state().ready).toBe(false)
    release()
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['c2', 'c3'])
    expect(t.state().earlier).toBe(1)
  })

  it('is ready when the network answers before the cache has been read, which it then does not draw', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) }, unstarted: true })
    const release = t.store.gate((key) => key.startsWith('plax.feed.entry.'))
    await t.engine.start()
    await t.settle()
    expect(t.state().ready).toBe(false)
    t.source.last.resolve(stories('f', 2))
    await t.settle()
    release()
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['f1', 'f2'])
    expect(t.state().ready).toBe(true)
  })

  it('is ready when the network fails before the cache has been read', async () => {
    const t = await makeRig()
    t.source.last.fail('network_error')
    await t.settle()
    expect(t.state().ready).toBe(true)
    expect(t.state().feedError).toBe('network_error')
  })

  it('is ready at once for For you with no topics, which asks for nothing', async () => {
    const t = await makeRig()
    await t.settle()
    t.source.last.fail('network_error')
    await t.settle()
    t.engine.screen('forYou')
    expect(t.state().ready).toBe(true)
    expect(t.state().feedError).toBeNull()
    expect(t.state().loading).toBe(false)
    expect(t.source.calls).toHaveLength(1)
  })
})

describe('the cache', () => {
  it('shows a page of a topic that is evergreen for a week, and of the news for two hours', async () => {
    const t = await makeRig({ cache: { 'science-en': stories('s', 2), 'news-en': stories('n', 2) }, unstarted: true })
    t.clock.advance(2 * HOUR)
    await t.engine.start()
    await t.settle()
    // The news page is exactly as old as it may be.
    expect(ids(t.state().stories)).toEqual(['n1', 'n2'])
    t.engine.topic(SCIENCE)
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['s1', 's2'])
  })

  it('does not show the news after two hours and a moment, but still shows a topic that is evergreen', async () => {
    const t = await makeRig({ cache: { 'science-en': stories('s', 2), 'news-en': stories('n', 2) }, unstarted: true })
    t.clock.advance(2 * HOUR + 1)
    await t.engine.start()
    await t.settle()
    expect(t.state().stories).toEqual([])
    t.engine.topic(SCIENCE)
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['s1', 's2'])
  })

  it('does not show a page of an evergreen topic after a week', async () => {
    const t = await makeRig({ cache: { 'science-en': stories('s', 2) }, unstarted: true })
    t.clock.advance(7 * 24 * HOUR)
    await t.engine.start()
    t.engine.topic(SCIENCE)
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['s1', 's2'])
    const late = await makeRig({ cache: { 'science-en': stories('s', 2) }, unstarted: true })
    late.clock.advance(7 * 24 * HOUR + 1)
    await late.engine.start()
    late.engine.topic(SCIENCE)
    await late.settle()
    expect(late.state().stories).toEqual([])
  })

  it('treats a choice of topics with the news in it as news, and any other as evergreen', async () => {
    const mixed = categoriesCacheKey('news,space', 'en')
    const calm = categoriesCacheKey('science,space', 'en')
    const t = await makeRig({ cache: { [mixed]: stories('m', 2), [calm]: stories('c', 2) }, interests: ['news', 'space'], forYou: true, unstarted: true })
    t.clock.advance(3 * HOUR)
    await t.engine.start()
    await t.settle()
    expect(t.state().stories).toEqual([])
    t.engine.setInterests(['science', 'space'])
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['c1', 'c2'])
  })

  it('keeps a page for each language', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('e', 2), 'news-hi': stories('h', 2) } })
    expect(ids(t.state().stories)).toEqual(['e1', 'e2'])
    t.engine.language('hi')
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['h1', 'h2'])
  })

  it('caches the first page of every feed as it came, but not an empty one', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    const cache = new FeedCache(t.store, t.clock)
    expect(ids((await cache.read(topicCacheKey(NEWS_TOPIC, 'en')))!.stories)).toEqual(['n1', 'n2', 'n3'])
    t.engine.topic(SCIENCE)
    t.source.last.resolve([])
    await t.settle()
    expect(await cache.read(topicCacheKey(SCIENCE, 'en'))).toBeNull()
  })

  it('caches the page as the server sent it, so that what was read is filtered out afresh at each launch', async () => {
    const t = await makeRig({ dwellMs: 40, glanceMs: 20 })
    await t.loadFirstPage(stories('n', 3))
    await t.pass(100)
    expect(ids((await new FeedCache(t.store, t.clock).read('news-en'))!.stories)).toEqual(['n1', 'n2', 'n3'])
  })

  it('shows the stories without the cache when the cache is damaged, and removes it', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 2) }, unstarted: true })
    const name = [...t.store.data.keys()].find((key) => key.endsWith('news-en')) as string
    t.store.data.set(name, '{not json')
    await t.engine.start()
    await t.settle()
    expect(t.state().ready).toBe(true)
    expect(t.state().stories).toEqual([])
    expect(t.state().loading).toBe(true)
    expect(t.store.data.has(name)).toBe(false)
  })

  it('shows the stories without the cache when the cache cannot be read', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 2) }, unstarted: true })
    t.store.failReads((key) => key.startsWith('plax.feed.entry.'))
    await t.engine.start()
    await t.settle()
    expect(t.state().ready).toBe(true)
    expect(t.state().stories).toEqual([])
    t.source.last.resolve(stories('n', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['n1', 'n2'])
  })

  it('shows the stories when the cache cannot be written', async () => {
    const t = await makeRig()
    t.store.failWrites((key) => key.startsWith('plax.feed.'))
    await t.loadFirstPage(stories('n', 2))
    expect(ids(t.state().stories)).toEqual(['n1', 'n2'])
    expect(t.state().feedError).toBeNull()
  })

  it('works for a topic whose id is not a safe name for the cache', async () => {
    const odd: Topic = { id: 'Odd_Id', emoji: 'x', en: 'Odd', hi: 'x' }
    const t = await makeRig({ topics: [NEWS_TOPIC, odd] })
    t.engine.topic(odd)
    await t.settle()
    expect(t.source.last.request.categories).toBe('Odd_Id')
    t.source.last.resolve(stories('o', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['o1', 'o2'])
  })
})

describe('what happens when the first page arrives', () => {
  it('swaps in fresh stories within 1.5 seconds of the cached ones being shown, and offers them after that', async () => {
    const quick = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    quick.clock.advance(SWAP_WINDOW_MS - 1)
    quick.source.last.resolve(stories('f', 2))
    await quick.settle()
    expect(ids(quick.state().stories)).toEqual(['f1', 'f2', 'c1', 'c2', 'c3'])
    expect(quick.state().fresh).toBe(false)

    const slow = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    slow.clock.advance(SWAP_WINDOW_MS)
    slow.source.last.resolve(stories('f', 2))
    await slow.settle()
    expect(ids(slow.state().stories)).toEqual(['c1', 'c2', 'c3'])
    expect(slow.state().fresh).toBe(true)
  })

  it('does not swap while the reader has a fresher page offered and has not taken it', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.engine.position(1)
    t.source.last.resolve(stories('f', 2))
    await t.settle()
    expect(t.state().fresh).toBe(true)
    t.engine.retry()
    t.source.last.resolve([...stories('f', 2), ...stories('g', 1)])
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['c1', 'c2', 'c3'])
    expect(t.state().fresh).toBe(true)
    t.engine.applyFresh()
    expect(ids(t.state().stories)).toEqual(['f1', 'f2', 'g1', 'c1', 'c2', 'c3'])
  })

  it('takes a refresh the reader asked for at once, wherever they are', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.source.last.resolve(stories('c', 3))
    await t.settle()
    t.engine.position(2)
    t.engine.refresh()
    t.source.last.resolve(stories('r', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['r1', 'r2', 'c1', 'c2', 'c3'])
    expect(t.state().position).toBe(0)
    expect(t.state().fresh).toBe(false)
  })

  it('does nothing when told to take fresh stories that were not offered', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    const before = t.state()
    t.engine.applyFresh()
    expect(t.state()).toBe(before)
  })

  it('shows the stories of a first page that has stories already seen last, and the others as earlier', async () => {
    const page = stories('n', 4)
    const t = await makeRig({ seen: [page[1], page[3]] })
    t.source.last.resolve(page)
    await t.settle()
    expect(ids(t.real())).toEqual(['n1', 'n3'])
    expect(t.state().earlier).toBe(2)
  })

  it('has no stories, and is exhausted, when the server has none', async () => {
    const t = await makeRig()
    await t.loadFirstPage([])
    expect(t.state().stories).toEqual([])
    expect(t.state().exhausted).toBe(true)
    expect(t.state().loading).toBe(false)
    expect(t.source.calls).toHaveLength(1)
  })

  it('holds a long first page to 180 stories', async () => {
    const t = await makeRig()
    await t.loadFirstPage(distinct('n', 200))
    expect(t.state().stories).toHaveLength(STORY_LIMIT)
    expect(ids(t.state().stories)[179]).toBe('n180')
  })

  it('merges the first page of a revalidation without moving the reader', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(2)
    t.engine.background()
    t.clock.advance(5 * MINUTE)
    t.engine.foreground()
    expect(t.state().loading).toBe(true)
    expect(t.state().refreshing).toBe(true)
    t.source.last.resolve([...stories('x', 2), ...stories('n', 12)])
    await t.settle()
    expect(t.state().fresh).toBe(true)
    expect(t.state().position).toBe(2)
    expect(ids(t.state().stories)).toEqual(ids(stories('n', 12)))
  })

  it('does not put the stories of a page that arrives late into a feed the reader has left', async () => {
    const t = await makeRig()
    await t.settle()
    const first = t.source.last
    t.engine.language('hi')
    first.resolve(stories('late', 2))
    await t.settle()
    expect(t.state().lang).toBe('hi')
    expect(t.state().stories).toEqual([])
    t.engine.language('en')
    await t.settle()
    expect(t.source.calls).toHaveLength(3)
    expect(t.state().stories).toEqual([])
  })
})

describe('coming back to a feed', () => {
  it('asks again after more than two minutes, and not before', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 6))
    t.engine.topic(SCIENCE)
    t.source.last.resolve(stories('s', 2))
    await t.settle()
    t.clock.advance(REVISIT_AFTER_MS)
    t.engine.topic(NEWS_TOPIC)
    expect(t.source.calls).toHaveLength(2)
    t.engine.topic(SCIENCE)
    t.clock.advance(1)
    t.engine.topic(NEWS_TOPIC)
    expect(t.source.calls).toHaveLength(3)
    expect(t.source.last.request).toEqual({ categories: 'news', lang: 'en', excluded: [], refresh: false })
    // The reader is shown the stories of the feed while it is asked.
    expect(t.state().stories).toHaveLength(6)
    expect(t.state().refreshing).toBe(true)
  })

  it('asks again for a feed that never got its first page', async () => {
    const t = await makeRig()
    await t.settle()
    t.source.last.fail('network_error')
    await t.settle()
    t.engine.topic(SCIENCE)
    t.source.last.fail('network_error')
    await t.settle()
    t.engine.topic(NEWS_TOPIC)
    expect(t.source.calls).toHaveLength(3)
    expect(t.state().feedError).toBeNull()
    expect(t.state().loading).toBe(true)
  })

  it('goes back to the feed of the screen it was on without asking for anything while the stories are fresh', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 6))
    t.engine.screen('saved')
    t.engine.screen('topics')
    t.engine.screen('feed')
    expect(t.source.calls).toHaveLength(1)
    expect(t.state().stories).toHaveLength(6)
  })

  it('keeps the feeds of the last eight topics and languages, and lets go of the one used longest ago', async () => {
    const topics = BUILT_IN_TOPICS.slice(0, 10)
    const t = await makeRig()
    await t.loadFirstPage(stories('t0-', 2))
    for (let index = 1; index < 9; index++) {
      t.engine.topic(topics[index])
      t.source.last.resolve(stories(`t${index}-`, 2))
      await t.settle()
    }
    expect(t.source.calls).toHaveLength(9)
    // The ninth topic made room by letting go of the first, news.
    t.engine.topic(topics[1])
    expect(t.source.calls).toHaveLength(9)
    t.engine.topic(NEWS_TOPIC)
    expect(t.source.calls).toHaveLength(10)
    expect(t.state().stories).toEqual([])
  })
})

describe('asking for more', () => {
  it('asks up to three times when a page brings nothing new, then says the end has come', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 6))
    t.engine.more()
    expect(t.source.calls).toHaveLength(2)
    expect(t.state().loading).toBe(true)
    expect(t.state().refreshing).toBe(false)
    t.source.last.resolve(stories('n', 6))
    await t.settle()
    expect(t.source.calls).toHaveLength(3)
    expect(t.state().loading).toBe(true)
    expect(t.state().exhausted).toBe(false)
    t.source.last.resolve(stories('n', 6))
    await t.settle()
    expect(t.source.calls).toHaveLength(4)
    t.source.last.resolve(stories('n', 6))
    await t.settle()
    expect(t.source.calls).toHaveLength(4)
    expect(t.state().exhausted).toBe(true)
    expect(t.state().loading).toBe(false)
    expect(t.state().stories).toHaveLength(7)
    expect(isCaughtUp(t.state().stories[6])).toBe(true)
  })

  it('stops asking as soon as a page brings something new', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 6))
    t.engine.more()
    t.source.last.resolve(stories('n', 6))
    await t.settle()
    t.source.last.resolve(stories('m', 2))
    await t.settle()
    expect(t.source.calls).toHaveLength(3)
    expect(t.state().loading).toBe(false)
    expect(t.state().exhausted).toBe(false)
    expect(ids(t.state().stories)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'm1', 'm2'])
  })

  it('says the end has come at once for an empty page', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.more()
    t.source.last.resolve([])
    await t.settle()
    expect(t.source.calls).toHaveLength(2)
    expect(t.state().exhausted).toBe(true)
  })

  it('does not ask again once the end has come, nor while it is asking, nor on a screen that is not a feed', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.more()
    t.engine.more()
    expect(t.source.calls).toHaveLength(2)
    t.source.last.resolve([])
    await t.settle()
    t.engine.more()
    expect(t.source.calls).toHaveLength(2)
    const other = await makeRig()
    await other.loadFirstPage(stories('n', 3))
    other.engine.screen('topics')
    other.engine.more()
    other.engine.screen('saved')
    other.engine.more()
    expect(other.source.calls).toHaveLength(1)
  })

  it('stops growing at 180 stories and says the end has come', async () => {
    const t = await makeRig()
    await t.loadFirstPage(distinct('n', 100))
    t.engine.more()
    t.source.last.resolve(distinct('m', 100))
    await t.settle()
    expect(t.state().stories).toHaveLength(STORY_LIMIT + 1)
    expect(t.real()).toHaveLength(STORY_LIMIT)
    expect(t.state().exhausted).toBe(true)
  })

  it('keeps the stories and tells the reader when asking for more fails, and tries more again on retry', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 6))
    t.engine.more()
    t.source.last.fail('rate_error')
    await t.settle()
    expect(t.state().feedError).toBe('rate_error')
    expect(t.state().loading).toBe(false)
    expect(t.state().stories).toHaveLength(6)
    t.engine.retry()
    expect(t.source.calls).toHaveLength(3)
    expect(t.source.last.request.excluded).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'])
    expect(t.state().feedError).toBeNull()
    t.source.last.resolve(stories('m', 1))
    await t.settle()
    expect(t.state().stories).toHaveLength(7)
  })

  it('does not ask for more of a For you feed with no topics', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.screen('forYou')
    t.engine.more()
    t.engine.refresh()
    t.engine.retry()
    expect(t.source.calls).toHaveLength(1)
  })

  it('leaves out what is shown, what is withheld and what was seen most recently, up to 200', async () => {
    const seen = stories('x', 100)
    const t = await makeRig({ seen })
    await t.loadFirstPage(distinct('n', 150))
    t.engine.more()
    const excluded = t.source.last.request.excluded
    expect(excluded).toHaveLength(EXCLUDE_LIMIT)
    expect(excluded.slice(0, 150)).toEqual(ids(distinct('n', 150)))
    expect(excluded.slice(150, 153)).toEqual(['x100', 'x99', 'x98'])
    expect(new Set(excluded).size).toBe(EXCLUDE_LIMIT)
  })

  it('does not hold a story twice, and does not show again one that the reader may go back to', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.more()
    t.source.last.resolve([...stories('n', 3), ...stories('m', 2)])
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['n1', 'n2', 'n3', 'm1', 'm2'])
  })

  it('asks for more on its own after the reader pages near the end of the stories shown', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(8)
    expect(t.source.calls).toHaveLength(2)
    // Not while it is already asking.
    t.engine.position(9)
    t.engine.position(10)
    expect(t.source.calls).toHaveLength(2)
    t.source.last.resolve(stories('m', 5))
    await t.settle()
    expect(t.state().stories).toHaveLength(17)
  })

  it('does not ask for more on its own while a failure is shown, nor once the end has come', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.more()
    t.source.last.fail('network_error')
    await t.settle()
    t.engine.position(9)
    expect(t.source.calls).toHaveLength(2)
    t.engine.retry()
    t.source.last.resolve([])
    await t.settle()
    t.engine.position(10)
    expect(t.source.calls).toHaveLength(3)
  })
})

describe('the caught-up card and the earlier stories', () => {
  const read = (count: number) => distinct('r', count)

  it('closes the list only when nothing newer is left, or the network is down and only seen stories are', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    expect(t.state().stories).toHaveLength(3)
    t.engine.more()
    t.source.last.resolve([])
    await t.settle()
    expect(t.state().stories).toHaveLength(4)
    expect(isCaughtUp(t.state().stories[3])).toBe(true)
  })

  it('has no card for an empty feed that has nothing earlier either', async () => {
    const t = await makeRig()
    await t.loadFirstPage([])
    expect(t.state().stories).toEqual([])
  })

  it('has no card while a section is chosen', async () => {
    const page = ['india', 'world'].map((section, index) => story(`s${index}`, `Headline s${index}`, PUBLISHED, { section }))
    const t = await makeRig()
    await t.loadFirstPage(page)
    t.engine.more()
    t.source.last.resolve([])
    await t.settle()
    expect(t.state().stories).toHaveLength(3)
    t.engine.section('india')
    expect(ids(t.state().stories)).toEqual(['s0'])
    t.engine.revealEarlier()
    expect(ids(t.state().stories)).toEqual(['s0'])
  })

  it('lets the reader go back over the seen stories, the newest first, and keeps the order of those published together', async () => {
    const page = [
      story('a', headline(1), PUBLISHED + 3 * HOUR),
      story('b', headline(2), PUBLISHED + HOUR),
      story('c', headline(3), PUBLISHED + 3 * HOUR),
      story('d', headline(4), PUBLISHED + 2 * HOUR),
      story('e', headline(5), 0),
    ]
    const t = await makeRig({ seen: page })
    t.source.last.resolve(page)
    await t.settle()
    t.source.last.resolve([])
    await t.settle()
    expect(t.state().earlier).toBe(5)
    t.engine.revealEarlier()
    expect(ids(t.state().stories)).toEqual([CAUGHT_UP_ID, 'a', 'c', 'd', 'b', 'e'])
    expect(t.state().position).toBe(1)
    expect(t.engine.currentPosition()).toBe(1)
    expect(t.state().earlier).toBe(0)
    // Nothing is left to go back over.
    const before = t.state()
    t.engine.revealEarlier()
    expect(t.state()).toBe(before)
  })

  it('goes back over more than one batch: what was shown stays, what was seen since is added', async () => {
    const first = read(3)
    const t = await makeRig({ seen: first })
    t.source.last.resolve(first)
    await t.settle()
    t.source.last.resolve([])
    await t.settle()
    t.engine.revealEarlier()
    expect(ids(t.state().stories)).toEqual([CAUGHT_UP_ID, 'r1', 'r2', 'r3'])
  })

  it('does not track the stories the reader goes back over as new reading', async () => {
    const page = read(2)
    const t = await makeRig({ seen: page, dwellMs: 40, glanceMs: 20 })
    t.source.last.resolve(page)
    await t.settle()
    t.source.last.resolve([])
    await t.settle()
    t.engine.revealEarlier()
    await t.pass(500)
    expect(t.timers.pending).toBe(0)
  })

  it('forgets the stories gone back over when new ones are taken', async () => {
    const page = read(2)
    const t = await makeRig({ seen: page })
    t.source.last.resolve(page)
    await t.settle()
    t.source.last.resolve([])
    await t.settle()
    t.engine.revealEarlier()
    t.engine.refresh()
    t.source.last.resolve([...page, story('fresh', headline(99))])
    await t.settle()
    expect(ids(t.real())).toEqual(['fresh'])
    expect(t.state().earlier).toBe(2)
  })

  it('counts the earlier stories only for a feed', async () => {
    const page = read(2)
    const t = await makeRig({ seen: page })
    t.source.last.resolve(page)
    await t.settle()
    expect(t.state().earlier).toBe(2)
    t.engine.screen('saved')
    expect(t.state().earlier).toBe(0)
    t.engine.screen('feed')
    expect(t.state().earlier).toBe(2)
  })

  it('withholds at most 200 of the stories the reader has seen', async () => {
    const page = distinct('n', 60)
    const t = await makeRig({ seen: [...page, ...distinct('o', 150)] })
    t.source.last.resolve(page)
    await t.settle()
    expect(t.state().earlier).toBe(60)
  })
})

describe('what the reader has looked at', () => {
  const dwellRig = async (over: { dwellMs?: number; glanceMs?: number } = {}) => {
    const source = new FakeSource()
    const timers = fakeTimers()
    const clock = fakeClock()
    const store = memoryStore()
    const errors: unknown[] = []
    const engine = new FeedEngine({ source, storage: store, clock, topics: () => BUILT_IN_TOPICS, setTimer: timers.setTimer, clearTimer: timers.clearTimer, lang: 'en', onError: (e) => errors.push(e), ...over })
    await engine.start()
    await new Promise((resolve) => setImmediate(resolve))
    source.last.resolve(stories('n', 12))
    await new Promise((resolve) => setImmediate(resolve))
    const pass = async (ms: number) => {
      clock.advance(ms)
      timers.advance(ms)
      await new Promise((resolve) => setImmediate(resolve))
    }
    const history = async () => new SeenFile(store).read(clock())
    return { engine, source, timers, clock, store, pass, history, errors }
  }

  it('counts a story as read after 1.2 seconds on screen, and writes the history 3 seconds after the first', async () => {
    const t = await dwellRig()
    await t.pass(DWELL_MS - 1)
    expect(t.store.data.has(SEEN_KEY)).toBe(false)
    await t.pass(1)
    // Marked, but not yet written.
    await t.pass(SEEN_FLUSH_MS - 1)
    expect(t.store.data.has(SEEN_KEY)).toBe(false)
    await t.pass(1)
    expect((await t.history()).contains(story('n1'), t.clock())).toBe(true)
    expect(t.errors).toEqual([])
  })

  it('writes the history once for the stories read within the same 3 seconds', async () => {
    const t = await dwellRig({ dwellMs: 100, glanceMs: 50 })
    await t.pass(100)
    t.engine.position(1)
    await t.pass(100)
    t.engine.position(2)
    await t.pass(100)
    expect(t.store.data.has(SEEN_KEY)).toBe(false)
    await t.pass(SEEN_FLUSH_MS)
    expect(t.store.writes.filter((key) => key === SEEN_KEY)).toHaveLength(1)
    const seen = await t.history()
    expect([1, 2, 3].map((index) => seen.contains(story(`n${index}`), t.clock()))).toEqual([true, true, true])
  })

  it('counts a story the reader moves on from after half a second, but not one left sooner', async () => {
    const t = await dwellRig()
    await t.pass(GLANCE_MS - 1)
    t.engine.position(1)
    await t.pass(GLANCE_MS)
    t.engine.position(2)
    t.engine.background()
    await t.pass(0)
    const seen = await t.history()
    expect(seen.contains(story('n1'), t.clock())).toBe(false)
    expect(seen.contains(story('n2'), t.clock())).toBe(true)
    expect(seen.contains(story('n3'), t.clock())).toBe(false)
  })

  it('writes the history when the app leaves the screen', async () => {
    const t = await dwellRig()
    await t.pass(DWELL_MS)
    expect(t.store.data.has(SEEN_KEY)).toBe(false)
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).contains(story('n1'), t.clock())).toBe(true)
  })

  it('counts nothing while the app is in the background, and counts the story in view again when it returns', async () => {
    const t = await dwellRig()
    await t.pass(GLANCE_MS - 1)
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).size).toBe(0)
    await t.pass(10 * MINUTE)
    expect(t.timers.pending).toBe(0)
    t.engine.foreground()
    expect(t.timers.pending).toBeGreaterThan(0)
    await t.pass(DWELL_MS)
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).contains(story('n1'), t.clock())).toBe(true)
  })

  it('does not count a story the reader leaves for another screen before half a second', async () => {
    const t = await dwellRig()
    await t.pass(GLANCE_MS - 1)
    t.engine.screen('topics')
    await t.pass(DWELL_MS * 2)
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).size).toBe(0)
  })

  it('counts nothing while the reader is on Topics or Saved', async () => {
    const t = await dwellRig()
    t.engine.screen('topics')
    await t.pass(DWELL_MS * 2)
    t.engine.screen('saved')
    await t.pass(DWELL_MS * 2)
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).size).toBe(0)
  })

  it('does not count the caught-up card, or what is past the stories', async () => {
    const t = await dwellRig()
    t.engine.more()
    t.source.last.resolve([])
    await t.pass(GLANCE_MS)
    t.engine.position(12)
    await t.pass(DWELL_MS * 2)
    t.engine.background()
    await t.pass(0)
    expect(t.errors).toEqual([])
    // The first story was left after a glance that counts; the card, which stands past the stories, is no story.
    const seen = await t.history()
    expect(seen.size).toBe(1)
    expect(seen.contains(story('n1'), t.clock())).toBe(true)
    expect(seen.contains(story('n12'), t.clock())).toBe(false)
  })

  it('counts a story once however often it is looked at', async () => {
    const t = await dwellRig({ dwellMs: 100, glanceMs: 50 })
    await t.pass(100)
    t.engine.position(1)
    t.engine.position(0)
    await t.pass(100)
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).size).toBe(1)
  })

  it('writes the history again at the next flush when writing it failed', async () => {
    const t = await dwellRig({ dwellMs: 100, glanceMs: 50 })
    t.store.failWrites((key) => key === SEEN_KEY)
    await t.pass(100)
    await t.pass(SEEN_FLUSH_MS)
    expect(t.store.data.has(SEEN_KEY)).toBe(false)
    t.store.heal()
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).contains(story('n1'), t.clock())).toBe(true)
    expect(t.errors).toEqual([])
  })

  it('moves the dwell to the story the reader is on when the topic or the language changes', async () => {
    const t = await dwellRig({ dwellMs: 100, glanceMs: 50 })
    t.engine.language('hi')
    await t.pass(0)
    expect(t.timers.pending).toBe(0)
    t.source.last.resolve(stories('h', 3))
    await t.pass(0)
    expect(t.timers.pending).toBeGreaterThan(0)
    t.engine.language('en')
    // The story of the feed that is back in view is counted too.
    expect(t.timers.pending).toBeGreaterThan(0)
    await t.pass(100)
    t.engine.background()
    await t.pass(0)
    expect((await t.history()).contains(story('n1'), t.clock())).toBe(true)
  })
})

describe('paging', () => {
  it('does not publish: the state is as it was, and the engine knows where the reader is', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    const heard = jest.fn()
    t.engine.store.subscribe(heard)
    t.engine.position(1)
    t.engine.position(2)
    expect(heard).not.toHaveBeenCalled()
    expect(t.state().position).toBe(0)
    expect(t.engine.currentPosition()).toBe(2)
    t.engine.screen('topics')
    expect(t.state().position).toBe(0)
    t.engine.screen('feed')
    expect(t.state().position).toBe(2)
  })

  it('ignores a place that is where it was, that is not a place, or that comes after the engine is gone', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(0)
    t.engine.position(-1)
    t.engine.position(1.5)
    t.engine.position(Number.NaN)
    expect(t.engine.currentPosition()).toBe(0)
    t.engine.position(3)
    await t.engine.dispose()
    t.engine.position(4)
    expect(t.engine.currentPosition()).toBe(3)
  })

  it('keeps the place in each section', async () => {
    const page = Array.from({ length: 8 }, (_unused, index) => story(`s${index}`, headline(index), PUBLISHED, { section: index % 2 === 0 ? 'india' : 'world' }))
    const t = await makeRig()
    await t.loadFirstPage(page)
    t.engine.position(3)
    t.engine.section('india')
    expect(t.state().position).toBe(0)
    t.engine.position(2)
    t.engine.section('world')
    expect(t.state().position).toBe(0)
    t.engine.section('')
    expect(t.state().position).toBe(3)
    t.engine.section('india')
    expect(t.state().position).toBe(2)
  })

  it('ignores a section the website does not list, and takes one it does', async () => {
    const t = await makeRig({ hasSection: (id) => id === '' || id === 'cricket' })
    await t.loadFirstPage(stories('n', 3))
    const before = t.state()
    t.engine.section('india')
    t.engine.section('nonsense')
    expect(t.state()).toBe(before)
    t.engine.section('cricket')
    expect(t.state().section).toBe('cricket')
    expect(t.state().stories).toEqual([])
  })

  it('takes the six sections the app was made with when it is not told which there are', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    for (const id of ['us', 'india', 'world', 'tech', 'business', 'science']) {
      t.engine.section(id)
      expect(t.state().section).toBe(id)
    }
    t.engine.section('sport')
    expect(t.state().section).toBe('science')
    t.engine.section('')
    expect(t.state().section).toBe('')
  })

  it('clears what the reader was told when a section is chosen', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.refresh()
    t.source.last.resolve(stories('n', 3))
    await t.settle()
    expect(t.state().notice).toBe('no_new_stories')
    t.engine.section('india')
    expect(t.state().notice).toBeNull()
  })

  it('does not ask for more on its own near the end of a section', async () => {
    const page = Array.from({ length: 12 }, (_unused, index) => story(`s${index}`, headline(index), PUBLISHED, { section: index < 6 ? 'india' : 'world' }))
    const t = await makeRig()
    await t.loadFirstPage(page)
    t.engine.section('india')
    t.engine.position(4)
    expect(t.source.calls).toHaveLength(2)
  })
})

describe('the screens', () => {
  it('does nothing when the screen is the one it is on', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    const before = t.state()
    t.engine.screen('feed')
    expect(t.state()).toBe(before)
  })

  it('clears what the reader was told when the screen changes', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.refresh()
    t.source.last.resolve(stories('n', 3))
    await t.settle()
    expect(t.state().notice).toBe('no_new_stories')
    t.engine.screen('topics')
    expect(t.state().notice).toBeNull()
  })

  it('goes to the feed when the reader chooses a topic from Topics or Saved or For you', async () => {
    const t = await makeRig({ interests: ['space'], forYou: true })
    t.source.last.resolve(stories('y', 2))
    await t.settle()
    t.engine.screen('topics')
    t.engine.topic(SCIENCE)
    expect(t.state().screen).toBe('feed')
    expect(t.state().topic).toBe(SCIENCE)
    await t.settle()
    expect(await new Prefs(t.store).forYou()).toBe(false)
    t.engine.screen('forYou')
    expect(t.state().screen).toBe('forYou')
    t.engine.topic(SCIENCE)
    expect(t.state().screen).toBe('feed')
  })

  it('shows the saved stories on Saved, and puts the feed back where it was', async () => {
    const t = await makeRig({ saved: [story('s1'), story('s2')] })
    await t.loadFirstPage(stories('n', 6))
    t.engine.position(4)
    t.engine.screen('saved')
    expect(ids(t.state().stories)).toEqual(['s1', 's2'])
    expect(t.state().position).toBe(0)
    t.engine.position(1)
    t.engine.screen('feed')
    expect(t.state().position).toBe(4)
    t.engine.screen('saved')
    expect(t.state().position).toBe(1)
  })

  it('goes back to the feed to refresh, when the reader asks from another screen', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.screen('topics')
    t.engine.refresh()
    expect(t.state().screen).toBe('feed')
    expect(t.state().refreshing).toBe(true)
    expect(t.source.last.request.refresh).toBe(true)
  })

  it('opens a feed that has no stories and is not loading when the reader goes to it', async () => {
    const t = await makeRig({ interests: ['space'] })
    await t.loadFirstPage(stories('n', 2))
    t.engine.screen('forYou')
    expect(t.source.calls).toHaveLength(2)
    expect(t.source.last.request.categories).toBe('space')
    expect(t.state().loading).toBe(true)
    t.engine.screen('feed')
    expect(ids(t.state().stories)).toEqual(['n1', 'n2'])
    expect(t.state().loading).toBe(false)
    // Leaving For you gave up its request, as every change of feed gives up the one before.
    expect(t.source.calls[1].cancelled).toBe(true)
    expect(t.source.calls).toHaveLength(2)
    t.engine.screen('forYou')
    expect(t.source.calls).toHaveLength(3)
    expect(t.source.last.request.categories).toBe('space')
  })

  it('starts again from the newest stories on the feed the reader last used after a long absence', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.topic(SCIENCE)
    t.source.last.resolve(stories('s', 4))
    await t.settle()
    t.engine.screen('saved')
    t.engine.background()
    t.clock.advance(NEW_SESSION_AFTER_MS)
    t.engine.foreground()
    expect(t.state().screen).toBe('feed')
    expect(t.state().topic).toBe(SCIENCE)
    expect(t.state().position).toBe(0)
    expect(t.state().section).toBe('')
    expect(t.source.last.request.categories).toBe('science')
    await t.settle()
    // Everything that was held is held again from the start.
    t.engine.topic(NEWS_TOPIC)
    expect(t.source.last.request.categories).toBe('news')
  })

  it('does not start again after a break of a little less than half an hour', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.background()
    t.clock.advance(NEW_SESSION_AFTER_MS - 1)
    t.engine.foreground()
    await t.settle()
    expect(t.state().stories).toHaveLength(12)
    expect(t.source.calls).toHaveLength(2)
    expect(t.source.last.request.excluded).toEqual([])
  })

  it('does not look for new stories when the reader returns to a screen that is not a feed, or while it is looking already', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.screen('saved')
    t.engine.background()
    t.clock.advance(5 * MINUTE)
    t.engine.foreground()
    expect(t.source.calls).toHaveLength(1)
    t.engine.screen('feed')
    t.engine.refresh()
    t.engine.background()
    t.clock.advance(5 * MINUTE)
    t.engine.foreground()
    expect(t.source.calls).toHaveLength(2)
  })

  it('comes to the foreground once for each time it went to the background', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.foreground()
    t.engine.foreground()
    expect(t.source.calls).toHaveLength(1)
    t.engine.background()
    t.clock.advance(5 * MINUTE)
    t.engine.foreground()
    t.engine.foreground()
    expect(t.source.calls).toHaveLength(2)
  })
})

describe('a failure', () => {
  it.each([
    ['network_error', 'network_error'],
    ['rate_error', 'rate_error'],
    ['service_error', 'service_error'],
    ['invalid_feed', 'invalid_feed'],
  ] as const)('of the kind %s is the string %s for the reader', async (kind, key) => {
    const t = await makeRig()
    await t.settle()
    t.source.last.fail(kind)
    await t.settle()
    expect(t.state().feedError).toBe(key)
    expect(t.state().loading).toBe(false)
    expect(t.state().ready).toBe(true)
  })

  it('that is not one the source reports is taken as no connection', async () => {
    const errors: unknown[] = []
    const source = { load: () => Promise.reject(new Error('anything')) }
    const timers = fakeTimers()
    const engine = new FeedEngine({ source, storage: memoryStore(), clock: fakeClock(), topics: () => BUILT_IN_TOPICS, setTimer: timers.setTimer, clearTimer: timers.clearTimer, lang: 'en', onError: (e) => errors.push(e) })
    await engine.start()
    await new Promise((resolve) => setImmediate(resolve))
    expect(engine.getState().feedError).toBe('network_error')
    expect(errors).toEqual([])
    await engine.dispose()
  })

  it('that a source makes by throwing at once is taken as no connection too', async () => {
    const errors: unknown[] = []
    const source = {
      load: (): Promise<never[]> => {
        throw new Error('anything')
      },
    }
    const timers = fakeTimers()
    const engine = new FeedEngine({ source, storage: memoryStore(), clock: fakeClock(), topics: () => BUILT_IN_TOPICS, setTimer: timers.setTimer, clearTimer: timers.clearTimer, lang: 'en', onError: (e) => errors.push(e) })
    await engine.start()
    await new Promise((resolve) => setImmediate(resolve))
    expect(engine.getState().feedError).toBe('network_error')
    expect(engine.getState().loading).toBe(false)
    expect(errors).toEqual([])
    await engine.dispose()
  })

  it('keeps the stories, and lets the reader try again', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.source.last.fail('service_error')
    await t.settle()
    expect(t.state().stories).toHaveLength(3)
    t.engine.retry()
    expect(t.state().feedError).toBeNull()
    expect(t.source.calls).toHaveLength(2)
    expect(t.source.last.request.refresh).toBe(false)
    t.source.last.resolve(stories('c', 3))
    await t.settle()
    expect(t.state().feedError).toBeNull()
  })

  it('is tried again as the reader asked for it, so that a refresh that failed is a refresh when retried', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.refresh()
    t.source.last.fail('network_error')
    await t.settle()
    t.engine.retry()
    expect(t.source.last.request.refresh).toBe(true)
  })

  it('is cleared when the reader asks for new stories', async () => {
    const t = await makeRig()
    await t.settle()
    t.source.last.fail('network_error')
    await t.settle()
    t.engine.refresh()
    expect(t.state().feedError).toBeNull()
    expect(t.state().loading).toBe(true)
  })

  it('does not stop the next request being taken', async () => {
    const t = await makeRig()
    await t.settle()
    t.source.last.fail('rate_error')
    await t.settle()
    t.engine.retry()
    t.source.last.resolve(stories('n', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['n1', 'n2'])
    expect(t.state().feedError).toBeNull()
  })
})

describe('the topics for For you', () => {
  it('are the known topics in a fixed order, and are kept', async () => {
    const t = await makeRig()
    t.engine.setInterests(['space', ' science ', 'nonsense', '', 'space'])
    expect([...t.state().interests]).toEqual(['science', 'space'])
    await t.settle()
    expect(t.store.data.get('plax.interests')).toBe('science,space')
  })

  it('change nothing when they are the same choice', async () => {
    const t = await makeRig({ interests: ['science', 'space'] })
    const heard = jest.fn()
    t.engine.store.subscribe(heard)
    t.engine.setInterests(['space', 'science'])
    t.engine.setInterests(['space', 'science', 'nonsense'])
    expect(heard).not.toHaveBeenCalled()
  })

  it('do not open For you when the reader is in the feed', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.setInterests(['space'])
    expect(t.state().screen).toBe('feed')
    expect(t.source.calls).toHaveLength(1)
    expect(ids(t.state().stories)).toEqual(['n1', 'n2', 'n3'])
  })

  it('ask for the new choice at once when the reader is in For you, and come back to the old one without asking', async () => {
    const t = await makeRig({ interests: ['science'], forYou: true })
    t.source.last.resolve(stories('a', 3))
    await t.settle()
    t.engine.setInterests(['science', 'space'])
    expect(t.source.last.request.categories).toBe('science,space')
    expect(t.state().stories).toEqual([])
    t.source.last.resolve(stories('b', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['b1', 'b2'])
    t.engine.setInterests(['science'])
    expect(ids(t.state().stories)).toEqual(['a1', 'a2', 'a3'])
    expect(t.source.calls).toHaveLength(2)
  })

  it('leave the reader with nothing to read, and no request, when they are all taken away', async () => {
    const t = await makeRig({ interests: ['science'], forYou: true })
    t.source.last.resolve(stories('a', 3))
    await t.settle()
    t.engine.setInterests([])
    expect(t.state().stories).toEqual([])
    expect(t.state().loading).toBe(false)
    expect(t.source.calls).toHaveLength(1)
    await t.settle()
    expect(t.store.data.get('plax.interests')).toBe('')
  })

  it('are the website\u2019s own topics, not only the ones the app was made with', async () => {
    const cricket: Topic = { id: 'cricket', emoji: 'x', en: 'Cricket', hi: 'x' }
    const t = await makeRig({ topics: [...BUILT_IN_TOPICS, cricket] })
    t.engine.setInterests(['cricket', SPACE.id])
    expect([...t.state().interests]).toEqual(['cricket', 'space'])
  })

  it('make a cache key of their own for each choice', async () => {
    const t = await makeRig({ interests: ['science', 'space'], forYou: true })
    t.source.last.resolve(stories('y', 2))
    await t.settle()
    expect(await new FeedCache(t.store, t.clock).read(categoriesCacheKey('science,space', 'en'))).not.toBeNull()
    expect(await new FeedCache(t.store, t.clock).read(categoriesCacheKey('science', 'en'))).toBeNull()
  })
})

describe('the language', () => {
  it('is remembered for the next launch, and is the feed of the language', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    t.engine.language('hi')
    await t.settle()
    expect(await new Prefs(t.store).language()).toBe('hi')
    expect(t.state().lang).toBe('hi')
    const next = await t.relaunch()
    expect(next.state().lang).toBe('hi')
    expect(next.source.last.request.lang).toBe('hi')
  })

  it('changes nothing when it is the language already, or not a language', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 3))
    const before = t.state()
    t.engine.language('en')
    t.engine.language('fr' as 'en')
    expect(t.state()).toBe(before)
    expect(t.source.calls).toHaveLength(1)
  })

  it('shows all the news again in the other language', async () => {
    const page = ['india', 'world'].map((section, index) => story(`s${index}`, headline(index), PUBLISHED, { section }))
    const t = await makeRig()
    await t.loadFirstPage(page)
    t.engine.section('india')
    t.engine.language('hi')
    expect(t.state().section).toBe('')
  })

  it('keeps the place in each language', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('en', 12))
    t.engine.position(5)
    t.engine.language('hi')
    t.source.last.resolve(stories('hi', 12))
    await t.settle()
    t.engine.position(2)
    t.engine.language('en')
    expect(t.state().position).toBe(5)
    t.engine.language('hi')
    expect(t.state().position).toBe(2)
  })
})

describe('letting go', () => {
  it('gives up the request in flight, stops the timers, and ignores the answer that comes', async () => {
    const t = await makeRig({ dwellMs: 40, glanceMs: 20 })
    await t.loadFirstPage(stories('n', 4))
    t.engine.refresh()
    const pending = t.source.last
    await t.engine.dispose()
    expect(pending.cancelled).toBe(true)
    expect(t.timers.pending).toBe(0)
    const before = t.state()
    pending.resolve(stories('late', 2))
    await t.settle()
    expect(t.state()).toBe(before)
  })

  it('counts the story in view and writes the history, whatever was queued', async () => {
    const t = await makeRig({ dwellMs: 1000, glanceMs: 20 })
    await t.loadFirstPage(stories('n', 4))
    await t.pass(100)
    await t.engine.dispose()
    expect((await new SeenFile(t.store).read(t.clock())).contains(story('n1'), t.clock())).toBe(true)
  })

  it('is no longer moved by the reader', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 4))
    await t.engine.dispose()
    const before = t.state()
    t.engine.topic(SCIENCE)
    t.engine.screen('saved')
    t.engine.language('hi')
    t.engine.section('india')
    t.engine.refresh()
    t.engine.retry()
    t.engine.more()
    t.engine.setInterests(['space'])
    t.engine.applyFresh()
    t.engine.revealEarlier()
    t.engine.background()
    t.engine.foreground()
    t.engine.toggleSaved(story('x'))
    t.engine.clearSaved()
    expect(t.state()).toBe(before)
    expect(t.source.calls).toHaveLength(1)
  })

  it('can be disposed more than once, and is not started after it', async () => {
    const t = await makeRig({ unstarted: true })
    await t.engine.dispose()
    await t.engine.dispose()
    await t.engine.start()
    await t.settle()
    expect(t.source.calls).toEqual([])
  })

  it('finishes what was queued before it resolves', async () => {
    const t = await makeRig({ dwellMs: 20, glanceMs: 10 })
    await t.loadFirstPage(stories('n', 4))
    await t.pass(50)
    await t.engine.dispose()
    expect(t.store.data.has(SEEN_KEY)).toBe(true)
  })

  it('hands over the feed to a new engine on the same phone, which shows what the first kept', async () => {
    const t = await makeRig({ saved: [story('kept')] })
    await t.loadFirstPage(stories('n', 4))
    const next = await t.relaunch()
    expect(ids(next.state().stories)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect([...next.state().savedIds]).toEqual(['kept'])
  })
})

describe('the state the screens draw from', () => {
  it('is the same list of stories for as long as the stories do not change', async () => {
    const t = await makeRig({ saved: [story('kept')] })
    await t.loadFirstPage(stories('n', 4))
    const before = t.state()
    t.engine.toggleSaved(before.stories[0])
    expect(t.state().saving).toBe(true)
    expect(t.state().stories).toBe(before.stories)
    await t.settle()
    expect(t.state().stories).toBe(before.stories)
    t.engine.acknowledgeNotice()
    expect(t.state().stories).toBe(before.stories)
  })

  it('has the same list with the caught-up card until the stories or the earlier ones change', async () => {
    const page = distinct('r', 2)
    const t = await makeRig({ seen: page })
    t.source.last.resolve(page)
    await t.settle()
    t.source.last.resolve([])
    await t.settle()
    const before = t.state().stories
    t.engine.screen('topics')
    t.engine.screen('feed')
    expect(t.state().stories).toBe(before)
    t.engine.revealEarlier()
    expect(t.state().stories).not.toBe(before)
  })

  it('tells that stories are being looked for while the ones shown stay', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 2) } })
    expect(t.state()).toMatchObject({ loading: true, refreshing: true })
    t.source.last.resolve(stories('c', 2))
    await t.settle()
    expect(t.state()).toMatchObject({ loading: false, refreshing: false })
    t.engine.more()
    expect(t.state()).toMatchObject({ loading: true, refreshing: false })
  })

  it('is never refreshing on a screen that is not a feed', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 2) }, saved: [story('s')] })
    t.engine.screen('saved')
    expect(t.state().loading).toBe(true)
    expect(t.state().refreshing).toBe(false)
    expect(t.state().fresh).toBe(false)
  })
})
