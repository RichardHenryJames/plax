import { CAUGHT_UP_ID, isCaughtUp } from '../story'
import { FeedCache, topicCacheKey } from '../feed-cache'
import { SEEN_KEY, SeenFile } from '../seen-file'
import { readInterests } from '../interests'
import { Prefs } from '../prefs'
import { BUILT_IN_TOPICS, NEWS_TOPIC, topicById } from '../topic'
import { HOUR, PUBLISHED, engineErrors, ids, makeRig, memoryStore, stories, story } from './helpers'

// The cache-first, never-repeat behaviour of the feed, driven with a controllable network: a port of FeedFlowTest, the device test of
// the native app's FeedViewModel, case by case.

const SCIENCE = topicById(BUILT_IN_TOPICS, 'science')!

afterEach(() => {
  expect(engineErrors()).toEqual([])
})

describe('the feed engine as a reader sees it', () => {
  it('draws cached stories before the network answers', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    expect(ids(t.state().stories)).toEqual(['c1', 'c2', 'c3'])
    // The network request must be running in the background.
    expect(t.state().loading).toBe(true)
    expect(t.state().refreshing).toBe(true)
    expect(t.state().fresh).toBe(false)
    expect(t.state().ready).toBe(true)
    expect(t.source.calls).toHaveLength(1)
    expect(t.source.calls[0].request.categories).toBe('news')
  })

  it('puts fresh stories first, with the unread cached ones after them, when the reader has not moved', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.source.last.resolve(stories('f', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['f1', 'f2', 'c1', 'c2', 'c3'])
    expect(t.state().loading).toBe(false)
    expect(t.state().fresh).toBe(false)
    expect(t.state().position).toBe(0)
  })

  it('offers fresh stories instead of a swap to a reader who moved on', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.engine.position(1)
    t.source.last.resolve(stories('f', 2))
    await t.settle()
    expect(t.state().fresh).toBe(true)
    expect(ids(t.state().stories)).toEqual(['c1', 'c2', 'c3'])
    t.engine.applyFresh()
    expect(ids(t.state().stories)).toEqual(['f1', 'f2', 'c1', 'c2', 'c3'])
    expect(t.state().fresh).toBe(false)
    expect(t.state().position).toBe(0)
  })

  it('does not interrupt the reader with a refresh that finds nothing new', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.engine.position(1)
    t.source.last.resolve(stories('c', 3))
    await t.settle()
    expect(t.state().loading).toBe(false)
    // Identical stories must not trigger a new-stories offer.
    expect(t.state().fresh).toBe(false)
    expect(ids(t.state().stories)).toEqual(['c1', 'c2', 'c3'])
    expect(t.state().position).toBe(1)
  })

  it('keeps the cached stories offline, and explains why', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.source.last.fail('network_error')
    await t.settle()
    expect(t.state().feedError).toBe('network_error')
    expect(t.state().stories).toHaveLength(3)
    expect(t.state().loading).toBe(false)
    expect(t.state().refreshing).toBe(false)
  })

  it('shows loading, then stories, on the first run, and caches the page as it came', async () => {
    const t = await makeRig()
    expect(t.state().ready).toBe(true)
    expect(t.state().stories).toEqual([])
    expect(t.state().loading).toBe(true)
    expect(t.state().feedError).toBeNull()
    t.source.last.resolve(stories('n', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['n1', 'n2'])
    const cached = await new FeedCache(t.store, t.clock).read(topicCacheKey(NEWS_TOPIC, 'en'))
    expect(ids(cached!.stories)).toEqual(['n1', 'n2'])
  })

  it('does not show an expired cache as current news', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('old', 3) }, unstarted: true })
    t.clock.advance(3 * HOUR)
    await t.engine.start()
    await t.settle()
    expect(t.state().ready).toBe(true)
    expect(t.state().stories).toEqual([])
    expect(t.state().loading).toBe(true)
  })

  it('makes revisiting a topic instant, and keeps the reader\u2019s place', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(4)
    t.engine.topic(SCIENCE)
    expect(t.state().topic).toBe(SCIENCE)
    expect(t.state().stories).toEqual([])
    expect(t.state().loading).toBe(true)
    expect(t.source.last.request.categories).toBe('science')
    t.source.last.resolve(stories('s', 2))
    await t.settle()
    expect(t.state().stories).toHaveLength(2)
    t.engine.topic(NEWS_TOPIC)
    expect(t.state().stories).toHaveLength(12)
    expect(t.state().position).toBe(4)
    expect(t.state().loading).toBe(false)
    // Returning to a fresh topic must not hit the network again.
    expect(t.source.calls).toHaveLength(2)
  })

  it('loads more without asking the reader when the end of the feed nears', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(7)
    // Four or more stories from the end nothing is requested yet.
    expect(t.source.calls).toHaveLength(1)
    t.engine.position(8)
    // Within four stories of the end the next page is requested.
    expect(t.source.calls).toHaveLength(2)
    expect(t.source.last.request.excluded).toHaveLength(12)
    t.source.last.resolve(stories('m', 5))
    await t.settle()
    expect(t.state().stories).toHaveLength(17)
    expect(t.engine.currentPosition()).toBe(8)
  })

  it('keeps the position when the reader leaves the feed and comes back', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(3)
    t.engine.screen('topics')
    t.engine.screen('feed')
    expect(t.state().position).toBe(3)
  })

  it('does not let a stale answer replace a newly selected topic', async () => {
    const t = await makeRig()
    await t.settle()
    const newsCall = t.source.calls[0]
    t.engine.topic(SCIENCE)
    // The abandoned request is cancelled.
    expect(newsCall.cancelled).toBe(true)
    newsCall.resolve(stories('late', 3))
    await t.settle()
    expect(t.state().stories).toEqual([])
    expect(t.state().topic).toBe(SCIENCE)
    t.source.last.resolve(stories('s', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['s1', 's2'])
  })

  it('loads the feed of the language the reader switches to, and remembers the other', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('en', 4))
    t.engine.language('hi')
    expect(t.source.last.request.lang).toBe('hi')
    expect(t.state().stories).toEqual([])
    t.source.last.resolve(stories('hi', 3))
    await t.settle()
    expect(t.state().stories).toHaveLength(3)
    t.engine.language('en')
    expect(ids(t.state().stories)).toEqual(['en1', 'en2', 'en3', 'en4'])
    expect(t.source.calls).toHaveLength(2)
  })

  it('puts new stories first on a refresh, and starts at the top', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(4)
    t.engine.refresh()
    expect(t.source.last.request.refresh).toBe(true)
    expect(t.state().refreshing).toBe(true)
    expect(t.state().stories).toHaveLength(12)
    t.source.last.resolve(stories('r', 3))
    await t.settle()
    expect(ids(t.state().stories).slice(0, 3)).toEqual(['r1', 'r2', 'r3'])
    // Stories not yet read stay available after the new ones.
    expect(t.state().stories).toHaveLength(15)
    expect(t.state().position).toBe(0)
    expect(t.state().refreshing).toBe(false)
  })

  it('says so, and leaves the list alone, when a refresh finds nothing new', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 4))
    t.engine.position(2)
    t.engine.refresh()
    t.source.last.resolve(stories('n', 4))
    await t.settle()
    expect(t.state().loading).toBe(false)
    expect(t.state().notice).toBe('no_new_stories')
    expect(ids(t.state().stories)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(t.state().position).toBe(2)
  })

  it('excludes the stories shown when it asks for more, and ends with the caught-up card', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 6))
    t.engine.more()
    expect(t.source.last.request.excluded).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'])
    t.source.last.resolve(stories('m', 2))
    await t.settle()
    expect(t.state().stories).toHaveLength(8)
    t.engine.more()
    t.source.last.resolve([])
    await t.settle()
    expect(t.state().exhausted).toBe(true)
    expect(t.state().loading).toBe(false)
    expect(t.state().stories).toHaveLength(9)
    // The caught-up card closes the list.
    expect(isCaughtUp(t.state().stories[8])).toBe(true)
    expect(t.real()).toHaveLength(8)
    expect(t.state().earlier).toBe(0)
  })

  it('can retry a failure', async () => {
    const t = await makeRig()
    await t.settle()
    t.source.last.fail('service_error')
    await t.settle()
    expect(t.state().feedError).toBe('service_error')
    t.engine.retry()
    expect(t.source.calls).toHaveLength(2)
    expect(t.state().feedError).toBeNull()
    expect(t.state().loading).toBe(true)
    t.source.last.resolve(stories('n', 2))
    await t.settle()
    expect(t.state().stories).toHaveLength(2)
  })

  it('shows only a section without changing the feed', async () => {
    const t = await makeRig()
    const page = ['india', 'world', 'india'].map((section, index) => story(`s${index}`, `Headline s${index}`, PUBLISHED, { section }))
    await t.loadFirstPage(page)
    t.engine.section('india')
    expect(ids(t.state().stories)).toEqual(['s0', 's2'])
    t.engine.section('tech')
    expect(t.state().stories).toEqual([])
    t.engine.section('')
    expect(t.state().stories).toHaveLength(3)
  })

  it('does not bring back the stories the reader looked at on the next launch', async () => {
    const t = await makeRig({ dwellMs: 40, glanceMs: 20 })
    await t.loadFirstPage(stories('n', 6))
    await t.pass(200)
    t.engine.position(1)
    await t.pass(200)
    t.engine.background()
    await t.settle()
    const history = await new SeenFile(t.store).read(t.clock())
    expect(history.contains(story('n1'), t.clock())).toBe(true)
    expect(history.contains(story('n2'), t.clock())).toBe(true)
    const next = await t.relaunch()
    expect(ids(next.real())).toEqual(['n3', 'n4', 'n5', 'n6'])
    // The two read stories are withheld, not lost.
    expect(next.state().earlier).toBe(2)
  })

  it('still counts a story that was only glanced at as new', async () => {
    const t = await makeRig({ dwellMs: 400, glanceMs: 300 })
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(1)
    t.engine.position(2)
    t.engine.position(3)
    await t.pass(700)
    t.engine.background()
    await t.settle()
    const seen = await new SeenFile(t.store).read(t.clock())
    expect(seen.contains(story('n4'), t.clock())).toBe(true)
    // A story flicked past in an instant is not read.
    expect(seen.contains(story('n2'), t.clock())).toBe(false)
    expect(seen.contains(story('n3'), t.clock())).toBe(false)
    expect(seen.contains(story('n1'), t.clock())).toBe(false)
  })

  it('shows the caught-up card instead of repeating when a feed was read entirely', async () => {
    const page = stories('n', 3)
    const t = await makeRig({ cache: { 'news-en': page }, seen: page })
    expect(t.state().ready).toBe(true)
    // Everything cached was read, so none of it is drawn.
    expect(t.real()).toEqual([])
    expect(t.state().loading).toBe(true)
    t.source.last.resolve(page)
    await t.settle()
    // Older stories are asked for without the ones already read.
    expect(t.source.calls).toHaveLength(2)
    expect(t.source.last.request.excluded).toEqual(expect.arrayContaining(['n1', 'n2', 'n3']))
    t.source.last.resolve([])
    await t.settle()
    expect(t.state().stories).toHaveLength(1)
    expect(isCaughtUp(t.state().stories[0])).toBe(true)
    expect(t.state().loading).toBe(false)
    expect(t.state().earlier).toBe(3)
    expect(t.state().exhausted).toBe(true)
  })

  it('finds older stories further down the server\u2019s list when the page is all read', async () => {
    const page = stories('n', 3)
    const t = await makeRig({ seen: page })
    t.source.last.resolve(page)
    await t.settle()
    expect(t.source.calls).toHaveLength(2)
    t.source.last.resolve(stories('older', 2))
    await t.settle()
    expect(ids(t.real())).toEqual(['older1', 'older2'])
    expect(t.state().loading).toBe(false)
    expect(t.state().earlier).toBe(3)
    expect(t.state().exhausted).toBe(false)
  })

  it('does not show another outlet\u2019s version of a story that was read', async () => {
    const read = story('a', 'Lena Okafor wins Nobel Peace Prize', PUBLISHED)
    const t = await makeRig({ seen: [read] })
    const sameEvent = story('b', 'South African human rights lawyer Lena Okafor wins the Nobel Peace Prize', PUBLISHED + HOUR)
    const other = story('c', 'Glacier survey finds Himalayan ice melting faster than models predicted', PUBLISHED + HOUR)
    t.source.last.resolve([sameEvent, other])
    await t.settle()
    expect(ids(t.real())).toEqual(['c'])
    expect(t.state().earlier).toBe(1)
  })

  it('lets the reader read the earlier stories again after the caught-up card', async () => {
    const page = [story('old', 'Harbour bridge reopens after three year repair programme', PUBLISHED), story('newer', 'Council approves riverside housing development despite objections', PUBLISHED + HOUR)]
    const t = await makeRig({ seen: page })
    t.source.last.resolve(page)
    await t.settle()
    expect(t.source.calls).toHaveLength(2)
    t.source.last.resolve([])
    await t.settle()
    expect(t.state().stories).toHaveLength(1)
    expect(t.state().loading).toBe(false)
    t.engine.revealEarlier()
    expect(ids(t.state().stories)).toEqual([CAUGHT_UP_ID, 'newer', 'old'])
    // The reader lands on the first earlier story.
    expect(t.state().position).toBe(1)
    expect(t.state().earlier).toBe(0)
  })

  it('shows the caught-up card and the reason when offline with only read stories', async () => {
    const page = stories('n', 3)
    const t = await makeRig({ cache: { 'news-en': page }, seen: page })
    expect(t.state().earlier).toBe(3)
    t.source.last.fail('network_error')
    await t.settle()
    expect(t.state().feedError).toBe('network_error')
    expect(t.state().stories).toHaveLength(1)
    expect(isCaughtUp(t.state().stories[0])).toBe(true)
  })

  it('is never blocked by a damaged history', async () => {
    const store = memoryStore({ [SEEN_KEY]: 'not json' })
    const t = await makeRig({ store })
    await t.loadFirstPage(stories('n', 3))
    expect(t.real()).toHaveLength(3)
    // The damaged history was dropped.
    expect(store.data.has(SEEN_KEY)).toBe(false)
  })

  it('starts from the newest stories after the reader has been away for a while', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(3)
    t.engine.background()
    t.clock.advance(31 * 60_000)
    t.engine.foreground()
    // A new visit starts at the top.
    expect(t.state().position).toBe(0)
    await t.settle()
    expect(t.source.calls).toHaveLength(2)
    // Reopening asks for the first page, not the next one.
    expect(t.source.last.request.excluded).toEqual([])
  })

  it('keeps the place after a short break, and checks quietly for new stories after a medium one', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 12))
    t.engine.position(3)
    t.engine.background()
    t.clock.advance(60_000)
    t.engine.foreground()
    // No request within two minutes.
    expect(t.source.calls).toHaveLength(1)
    expect(t.state().stories).toHaveLength(12)
    t.engine.background()
    t.clock.advance(5 * 60_000)
    t.engine.foreground()
    await t.settle()
    expect(t.source.calls).toHaveLength(2)
    // The reader keeps their place while the check runs.
    expect(t.state().position).toBe(3)
    expect(t.state().stories).toHaveLength(12)
  })

  it('asks for all the chosen topics at once in For you, and never forces a live refresh', async () => {
    const t = await makeRig({ interests: ['space', 'science'], forYou: true })
    expect(t.source.calls).toHaveLength(1)
    expect(t.state().screen).toBe('forYou')
    expect(t.source.calls[0].request.categories).toBe('science,space')
    t.source.last.resolve(stories('y', 3))
    await t.settle()
    expect(t.state().stories).toHaveLength(3)
    t.engine.refresh()
    expect(t.source.last.request.categories).toBe('science,space')
    // A mixed feed must not ask the server for a slow live refresh.
    expect(t.source.last.request.refresh).toBe(false)
  })

  it('makes no request in For you until the reader chooses topics', async () => {
    const t = await makeRig()
    await t.loadFirstPage(stories('n', 2))
    t.engine.screen('forYou')
    expect(t.state().interests.size).toBe(0)
    expect(t.state().stories).toEqual([])
    expect(t.state().loading).toBe(false)
    expect(t.source.calls).toHaveLength(1)
    t.engine.setInterests(['history', 'bogus'])
    expect([...t.state().interests]).toEqual(['history'])
    await t.settle()
    expect([...(await readInterests(t.store, BUILT_IN_TOPICS))]).toEqual(['history'])
    expect(t.source.last.request.categories).toBe('history')
    expect(t.state().loading).toBe(true)
    t.source.last.resolve(stories('h', 2))
    await t.settle()
    expect(ids(t.state().stories)).toEqual(['h1', 'h2'])
    t.engine.refresh()
    // One topic may use a live refresh.
    expect(t.source.last.request.refresh).toBe(true)
  })

  it('remembers the chosen feed for the next launch', async () => {
    const t = await makeRig({ interests: ['space'] })
    t.engine.screen('forYou')
    await t.settle()
    expect(await new Prefs(t.store).forYou()).toBe(true)
    t.engine.screen('feed')
    await t.settle()
    expect(await new Prefs(t.store).forYou()).toBe(false)
  })

  it('carries what was seen across topics and the For you feed', async () => {
    const t = await makeRig({ dwellMs: 40, glanceMs: 20, interests: ['science'] })
    const shared = story('shared', 'Glacier survey finds Himalayan ice melting faster than models predicted', PUBLISHED)
    await t.loadFirstPage([shared, story('other', 'Council approves riverside housing development despite objections', PUBLISHED)])
    await t.pass(200)
    t.engine.screen('forYou')
    await t.settle()
    expect(t.source.calls).toHaveLength(2)
    t.source.last.resolve([
      story('again', 'Himalayan glacier survey finds ice melting faster than models predicted', PUBLISHED + HOUR),
      story('fresh', 'Central bank holds interest rates steady citing inflation worries', PUBLISHED + HOUR),
    ])
    await t.settle()
    // Only the unread story.
    expect(ids(t.real())).toEqual(['fresh'])
  })
})
