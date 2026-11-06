import type { FeedState } from '../feed-engine'
import { feedBanner } from '../feed-banner'
import { NEWS_TOPIC } from '../topic'
import { caughtUp } from '../story'
import { engineErrors, makeRig, stories, story } from './helpers'

afterEach(() => {
  expect(engineErrors()).toEqual([])
})

const base = (over: Partial<FeedState> = {}): FeedState => ({
  screen: 'feed',
  topic: NEWS_TOPIC,
  lang: 'en',
  section: '',
  stories: stories('n', 5),
  savedIds: new Set(),
  loading: false,
  refreshing: false,
  saving: false,
  storageReady: true,
  exhausted: false,
  fresh: false,
  feedError: null,
  storageError: null,
  notice: null,
  position: 0,
  earlier: 0,
  interests: new Set(),
  ready: true,
  ...over,
})

describe('the line over the stories', () => {
  it('says nothing when there is nothing to say', () => {
    expect(feedBanner(base(), 0)).toBeNull()
  })

  it('says a lost connection is being offline with the last stories loaded, and that tapping tries again', () => {
    expect(feedBanner(base({ feedError: 'network_error' }), 0)).toEqual({ key: 'offline_cached', retryable: true })
  })

  it('says the other failures as they are, and that tapping tries again', () => {
    for (const key of ['rate_error', 'service_error', 'invalid_feed'] as const) expect(feedBanner(base({ feedError: key }), 0)).toEqual({ key, retryable: true })
  })

  it('puts a failure of the saved stories first, which tapping cannot mend', () => {
    expect(feedBanner(base({ storageError: 'storage_error', feedError: 'network_error' }), 0)).toEqual({ key: 'storage_error', retryable: false })
    expect(feedBanner(base({ storageError: 'save_error' }), 0)).toEqual({ key: 'save_error', retryable: false })
    expect(feedBanner(base({ storageError: 'save_error', screen: 'saved' }), 0)).toEqual({ key: 'save_error', retryable: false })
    expect(feedBanner(base({ storageError: 'save_error', stories: [] }), 0)).toEqual({ key: 'save_error', retryable: false })
  })

  it('says more stories are being found when the reader is not told by the spinner', () => {
    expect(feedBanner(base({ loading: true }), 0)).toEqual({ key: 'loading_more', retryable: false })
    expect(feedBanner(base({ loading: true, refreshing: true }), 0)).toBeNull()
  })

  it('puts a failure before the news that more are being found', () => {
    expect(feedBanner(base({ loading: true, feedError: 'rate_error' }), 0)).toEqual({ key: 'rate_error', retryable: true })
  })

  it('says the end has come at the last story of a feed that has no caught-up card', () => {
    expect(feedBanner(base({ exhausted: true }), 4)).toEqual({ key: 'end_feed', retryable: false })
    expect(feedBanner(base({ exhausted: true }), 3)).toBeNull()
    expect(feedBanner(base({ exhausted: true }), 9)).toEqual({ key: 'end_feed', retryable: false })
  })

  it('does not say it when the caught-up card says it', () => {
    expect(feedBanner(base({ exhausted: true, stories: [...stories('n', 4), caughtUp()] }), 4)).toBeNull()
  })

  it('says nothing on a screen that is not a feed, or when there are no stories', () => {
    for (const screen of ['topics', 'saved'] as const) expect(feedBanner(base({ screen, feedError: 'network_error', loading: true }), 0)).toBeNull()
    expect(feedBanner(base({ stories: [], feedError: 'network_error' }), 0)).toBeNull()
    expect(feedBanner(base({ stories: [], loading: true }), 0)).toBeNull()
  })

  it('is the same in For you as in the feed', () => {
    expect(feedBanner(base({ screen: 'forYou', feedError: 'network_error' }), 0)).toEqual({ key: 'offline_cached', retryable: true })
  })
})

describe('the line over the stories of the engine', () => {
  it('tells the reader the last stories are shown when the network is down, and the next try is a tap', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    expect(feedBanner(t.state(), t.engine.currentPosition())).toBeNull()
    t.source.last.fail('network_error')
    await t.settle()
    expect(feedBanner(t.state(), 0)).toEqual({ key: 'offline_cached', retryable: true })
    t.engine.retry()
    expect(feedBanner(t.state(), 0)).toBeNull()
  })

  it('tells the reader that more are being found while the engine asks, and when the end of a section has come', async () => {
    const page = Array.from({ length: 4 }, (_unused, index) => story(`s${index}`, `Headline s${index}`, 1_780_000_000_000, { section: 'india' }))
    const t = await makeRig()
    await t.loadFirstPage(page)
    t.engine.more()
    expect(feedBanner(t.state(), 0)).toEqual({ key: 'loading_more', retryable: false })
    t.source.last.resolve([])
    await t.settle()
    expect(isCaughtUpShown(t.state())).toBe(true)
    expect(feedBanner(t.state(), 4)).toBeNull()
    t.engine.section('india')
    expect(feedBanner(t.state(), 3)).toEqual({ key: 'end_feed', retryable: false })
    expect(feedBanner(t.state(), 1)).toBeNull()
  })

  it('tells the reader the saved stories are not available when they cannot be read', async () => {
    const t = await makeRig({ unstarted: true })
    t.store.failReads((key) => key === 'plax.saved-stories')
    await t.engine.start()
    await t.settle()
    expect(feedBanner(t.state(), 0)).toEqual({ key: 'storage_error', retryable: false })
  })
})

const isCaughtUpShown = (state: FeedState): boolean => state.stories.some((item) => item.id === '__caught_up__')
