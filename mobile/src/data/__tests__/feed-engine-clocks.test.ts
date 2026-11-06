import { fakeClock } from '../../platform/clock'
import { flushPromises } from '../../test/helpers'
import { FeedCache } from '../feed-cache'
import { DWELL_MS, FeedEngine, GLANCE_MS, SEEN_FLUSH_MS, SWAP_WINDOW_MS } from '../feed-engine'
import { SAVED_KEY, SavedStories } from '../saved-stories'
import { SEEN_KEY, SeenFile } from '../seen-file'
import { makeStory } from '../story'
import { BUILT_IN_TOPICS } from '../topic'
import { FakeSource, engineErrors, fakeTimers, makeRig, memoryStore, stories, story } from './helpers'

afterEach(() => {
  expect(engineErrors()).toEqual([])
})

const DAY = 86_400_000

/** An engine whose phone has two clocks: the date, which the reader can set, and the uptime, which only moves forward. */
async function launch(options: { cached?: boolean; glanceMs?: number; dwellMs?: number } = {}) {
  const wall = fakeClock()
  const uptime = fakeClock(0)
  const timers = fakeTimers()
  const store = memoryStore()
  const errors: unknown[] = []
  if (options.cached === true) await new FeedCache(store, wall).write('news-en', stories('c', 3))
  const source = new FakeSource()
  const engine = new FeedEngine({
    source,
    storage: store,
    clock: wall,
    uptime,
    topics: () => BUILT_IN_TOPICS,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    lang: 'en',
    dwellMs: options.dwellMs ?? 600_000,
    glanceMs: options.glanceMs ?? 600_000,
    onError: (error) => errors.push(error),
  })
  await engine.start()
  await flushPromises()
  const history = async () => new SeenFile(store).read(wall())
  return { engine, source, store, wall, uptime, errors, history }
}

describe('the engine with a clock that does not jump', () => {
  it('swaps in fresh stories while the cached ones are new by the uptime, though the date was set a day forward', async () => {
    const t = await launch({ cached: true })
    t.wall.advance(DAY)
    t.uptime.advance(SWAP_WINDOW_MS - 1)
    t.source.last.resolve(stories('f', 2))
    await flushPromises()
    expect(t.engine.getState().stories.map((item) => item.id)).toEqual(['f1', 'f2', 'c1', 'c2', 'c3'])
    expect(t.engine.getState().fresh).toBe(false)
    expect(t.errors).toEqual([])
    await t.engine.dispose()
  })

  it('offers fresh stories once the uptime says the cached ones were shown a while ago, though the date was set back', async () => {
    const t = await launch({ cached: true })
    t.wall.advance(-DAY)
    t.uptime.advance(SWAP_WINDOW_MS)
    t.source.last.resolve(stories('f', 2))
    await flushPromises()
    expect(t.engine.getState().stories.map((item) => item.id)).toEqual(['c1', 'c2', 'c3'])
    expect(t.engine.getState().fresh).toBe(true)
    expect(t.errors).toEqual([])
    await t.engine.dispose()
  })

  it('counts a glance by the uptime: a date set forward does not make a short look long', async () => {
    const t = await launch({ glanceMs: GLANCE_MS })
    t.source.last.resolve(stories('n', 3))
    await flushPromises()
    t.wall.advance(DAY)
    t.uptime.advance(GLANCE_MS - 1)
    t.engine.position(1)
    t.uptime.advance(GLANCE_MS)
    t.engine.background()
    await flushPromises()
    const seen = await t.history()
    expect(seen.contains(story('n1'), t.wall())).toBe(false)
    expect(seen.contains(story('n2'), t.wall())).toBe(true)
    expect(t.errors).toEqual([])
  })

  it('does not lose a glance because the date was set back', async () => {
    const t = await launch({ glanceMs: GLANCE_MS })
    t.source.last.resolve(stories('n', 3))
    await flushPromises()
    t.wall.advance(-DAY)
    t.uptime.advance(GLANCE_MS)
    t.engine.position(1)
    t.engine.background()
    await flushPromises()
    expect((await t.history()).contains(story('n1'), t.wall())).toBe(true)
    expect(t.errors).toEqual([])
  })

  it('uses the one clock for both when it is given no other', async () => {
    const t = await makeRig({ cache: { 'news-en': stories('c', 3) } })
    t.clock.advance(SWAP_WINDOW_MS - 1)
    t.source.last.resolve(stories('f', 2))
    await t.settle()
    expect(t.state().fresh).toBe(false)
  })
})

describe('the engine with the timers of the phone', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  const phone = async () => {
    const source = new FakeSource()
    const store = memoryStore()
    const engine = new FeedEngine({ source, storage: store, clock: () => Date.now(), topics: () => BUILT_IN_TOPICS, lang: 'en' })
    await engine.start()
    await jest.advanceTimersByTimeAsync(0)
    source.last.resolve(stories('n', 3))
    await jest.advanceTimersByTimeAsync(0)
    return { engine, source, store }
  }

  it('counts a story after 1.2 seconds on screen and writes the history 3 seconds after that', async () => {
    const { engine, store } = await phone()
    await jest.advanceTimersByTimeAsync(DWELL_MS - 1)
    expect(store.writes).not.toContain(SEEN_KEY)
    await jest.advanceTimersByTimeAsync(1)
    await jest.advanceTimersByTimeAsync(SEEN_FLUSH_MS - 1)
    expect(store.writes).not.toContain(SEEN_KEY)
    await jest.advanceTimersByTimeAsync(1)
    expect(store.writes).toContain(SEEN_KEY)
    expect((await new SeenFile(store).read(Date.now())).contains(story('n1'), Date.now())).toBe(true)
    await engine.dispose()
  })

  it('stops its timers when it is disposed, and still writes what the reader has seen', async () => {
    const { engine, store } = await phone()
    await jest.advanceTimersByTimeAsync(DWELL_MS)
    expect(jest.getTimerCount()).toBeGreaterThan(0)
    await engine.dispose()
    expect(jest.getTimerCount()).toBe(0)
    expect((await new SeenFile(store).read(Date.now())).contains(story('n1'), Date.now())).toBe(true)
  })

  it('stops the timer of a story in view when it is disposed', async () => {
    const { engine } = await phone()
    expect(jest.getTimerCount()).toBeGreaterThan(0)
    await engine.dispose()
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('a story that cannot be saved', () => {
  it('is not written, since it could not be read back and would make every saved story unreadable', async () => {
    const t = await makeRig({ saved: [story('kept')] })
    await t.loadFirstPage(stories('n', 2))
    const written = t.store.writes.filter((key) => key === SAVED_KEY).length
    t.engine.toggleSaved(makeStory({ id: 'textless', title: 'A title but no text', content: '', category: 'news' }))
    await t.settle()
    expect(t.state().storageError).toBe('save_error')
    expect(t.state().saving).toBe(false)
    expect([...t.state().savedIds]).toEqual(['kept'])
    expect((await new SavedStories(t.store).read()).map((item) => item.id)).toEqual(['kept'])
    expect(t.store.writes.filter((key) => key === SAVED_KEY)).toHaveLength(written)
  })

  it('leaves the reader free to save the next one, which clears the failure', async () => {
    const t = await makeRig({ saved: [story('kept')] })
    await t.loadFirstPage(stories('n', 2))
    t.engine.toggleSaved(makeStory({ id: 'textless', title: 'A title but no text', content: '', category: 'news' }))
    await t.settle()
    t.engine.toggleSaved(story('n1'))
    await t.settle()
    expect(t.state().storageError).toBeNull()
    expect(t.state().notice).toBe('saved_notice')
    expect([...t.state().savedIds]).toEqual(['n1', 'kept'])
  })
})
