import { AdBar, MAX_RETRIES, MAX_WIDTH_DP, MIN_SCREEN_HEIGHT_DP, RETRY_MS, SETTLE_MS, type AdBarOptions, type AdBarState } from '../ad-bar'
import { SERVED_MS } from '../ad-room'
import { fakeClock } from '../../platform/clock'
import { DEFAULT_BANNER_DP, NEVER_SERVED } from '../served'
import { FakeNetwork, memoryServed, settle } from './helpers'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const PHONE = { widthDp: 411, heightDp: 891 }

// The strip at the foot of the screen, as AdsDeviceTest.java describes it on a real screen: it takes no room until its ad arrives, a
// strip served an ad lately keeps its room from the start, one not served for a week waits, the retry after a miss is a minute apart,
// at most three, and nothing is asked before consent.
describe('the ad strip', () => {
  let network: FakeNetwork
  let clock: ReturnType<typeof fakeClock>
  let memory: ReturnType<typeof memoryServed>
  let atRest: boolean

  beforeEach(() => {
    jest.useFakeTimers()
    network = new FakeNetwork()
    network.bannerOn = true
    clock = fakeClock(NOW)
    memory = memoryServed()
    atRest = true
  })

  const make = (options: Partial<AdBarOptions> = {}) => new AdBar({ network, clock, memory, screen: PHONE, still: () => atRest, ...options })
  const state = (bar: AdBar): AdBarState => bar.store.getState()
  /** Consent is settled; a story is on the screen. */
  const live = async (bar: AdBar) => {
    bar.show(true)
    bar.ready()
    await settle()
  }
  /** Everything the strip ever put on the screen, in order. */
  const watch = (bar: AdBar) => {
    const seen: AdBarState[] = []
    bar.store.subscribe(() => seen.push(bar.store.getState()))
    return seen
  }

  it('asks for nothing before the reader has given consent', async () => {
    const bar = make()
    bar.show(true)
    await settle()
    expect(state(bar)).toMatchObject({ requested: false, visible: false, request: 0 })
    expect(memory.reads).toBe(0)
    bar.ready()
    await settle()
    expect(state(bar)).toMatchObject({ requested: true, visible: false, request: 1 })
  })

  it('does not ask until a story is on the screen', async () => {
    const bar = make()
    bar.ready()
    await settle()
    expect(state(bar).requested).toBe(false)
    bar.show(true)
    expect(state(bar).requested).toBe(true)
  })

  describe('whose ad never comes', () => {
    it('takes no room and shows nothing, not even for a moment, and asks only once because the retry is a minute away', async () => {
      const bar = make()
      const seen = watch(bar)
      await live(bar)
      bar.failed(state(bar).request)
      await jest.advanceTimersByTimeAsync(RETRY_MS - 1)
      expect(seen.some((moment) => moment.visible)).toBe(false)
      expect(state(bar)).toMatchObject({ requested: false, visible: false, request: 1 })
    })

    it('asks again a minute later, up to three times, and then leaves the reader alone', async () => {
      const bar = make()
      await live(bar)
      for (let request = 1; request <= 1 + MAX_RETRIES; request++) {
        expect(state(bar)).toMatchObject({ requested: true, request })
        bar.failed(request)
        expect(state(bar).requested).toBe(false)
        await jest.advanceTimersByTimeAsync(RETRY_MS - 1)
        expect(state(bar).request).toBe(request)
        await jest.advanceTimersByTimeAsync(1)
      }
      // The fourth request, the third retry, also brought no ad: nothing more is asked for.
      expect(state(bar)).toMatchObject({ requested: false, request: 1 + MAX_RETRIES })
      await jest.advanceTimersByTimeAsync(60 * RETRY_MS)
      expect(state(bar).request).toBe(1 + MAX_RETRIES)
      bar.show(false)
      bar.show(true)
      expect(state(bar).request).toBe(1 + MAX_RETRIES)
      expect(jest.getTimerCount()).toBe(0)
    })

    it('takes no room for a retry, which shows nothing until its ad comes', async () => {
      memory.record = { at: NOW - HOUR, heightDp: 56 }
      const bar = make()
      const seen = watch(bar)
      await live(bar)
      // The strip served lately keeps its room while the first ad is on the way ...
      expect(state(bar).visible).toBe(true)
      bar.failed(1)
      // ... gives it back when none comes ...
      expect(state(bar).visible).toBe(false)
      await jest.advanceTimersByTimeAsync(RETRY_MS)
      // ... and does not show it again for the retry.
      expect(state(bar)).toMatchObject({ requested: true, request: 2, visible: false })
      bar.loaded(2, { width: 411, height: 56 })
      expect(state(bar).visible).toBe(true)
      expect(seen.filter((moment) => moment.visible && moment.request === 2)).not.toHaveLength(0)
    })

    it('does not ask sooner than a minute after a miss when the reader leaves the story and comes back', async () => {
      const bar = make()
      await live(bar)
      bar.failed(1)
      bar.show(false)
      bar.show(true)
      expect(state(bar)).toMatchObject({ requested: false, request: 1 })
      await jest.advanceTimersByTimeAsync(RETRY_MS)
      expect(state(bar)).toMatchObject({ requested: true, request: 2 })
    })

    it('asks when the reader comes back to the story, if the retry came while they were away', async () => {
      const bar = make()
      await live(bar)
      bar.failed(1)
      bar.show(false)
      await jest.advanceTimersByTimeAsync(RETRY_MS)
      expect(state(bar)).toMatchObject({ requested: false, request: 1 })
      bar.show(true)
      expect(state(bar)).toMatchObject({ requested: true, request: 2 })
    })
  })

  describe('whose ad is on the way', () => {
    it('takes no room while it is on the way and makes room, once, when it arrives', async () => {
      const bar = make()
      const seen = watch(bar)
      await live(bar)
      expect(state(bar)).toMatchObject({ requested: true, visible: false })
      bar.loaded(1, { width: 411, height: 56 })
      expect(state(bar)).toMatchObject({ visible: true, heightDp: 56 })
      expect(seen.filter((moment, index) => moment.visible && !(seen[index - 1]?.visible ?? false))).toHaveLength(1)
    })

    it('has the height of the ad it holds, rounded up, and keeps the standard one while no ad has said', async () => {
      const bar = make()
      expect(state(bar).heightDp).toBe(DEFAULT_BANNER_DP)
      await live(bar)
      bar.loaded(1, { width: 411, height: 50.2 })
      expect(state(bar).heightDp).toBe(51)
    })

    it('learns the height of an adaptive banner as soon as the library says it, before the ad', async () => {
      const bar = make()
      await live(bar)
      bar.sized(1, { width: 411, height: 60 })
      expect(state(bar)).toMatchObject({ heightDp: 60, visible: false })
    })

    it('ignores a height that cannot be a banner', async () => {
      const bar = make()
      await live(bar)
      bar.sized(1, { width: 411, height: 60 })
      for (const height of [0, 5, 29, 201, 9999, Number.NaN, -60]) bar.sized(1, { width: 411, height: height })
      expect(state(bar).heightDp).toBe(60)
    })

    it('keeps its ad and its room when a refresh finds none', async () => {
      const bar = make()
      await live(bar)
      bar.loaded(1, { width: 411, height: 56 })
      bar.failed(1)
      expect(state(bar)).toMatchObject({ requested: true, visible: true })
      expect(jest.getTimerCount()).toBe(0)
    })

    it('answers to its own banner only: what an earlier banner says afterwards is ignored', async () => {
      const bar = make()
      await live(bar)
      bar.failed(1)
      await jest.advanceTimersByTimeAsync(RETRY_MS)
      expect(state(bar).request).toBe(2)
      bar.loaded(1, { width: 411, height: 56 })
      bar.sized(1, { width: 411, height: 90 })
      bar.failed(1)
      expect(state(bar)).toMatchObject({ requested: true, visible: false, heightDp: DEFAULT_BANNER_DP, request: 2 })
      bar.loaded(2)
      expect(state(bar).visible).toBe(true)
    })

    it('ignores an answer when no banner has been asked for', () => {
      const bar = make()
      bar.loaded(0, { width: 411, height: 56 })
      bar.failed(0)
      bar.sized(0, { width: 411, height: 56 })
      expect(state(bar)).toMatchObject({ requested: false, visible: false, request: 0 })
    })
  })

  describe('served lately', () => {
    it('keeps its room from the start, so the story does not jump when the ad comes', async () => {
      memory.record = { at: NOW - DAY, heightDp: 56 }
      const bar = make()
      const seen = watch(bar)
      await live(bar)
      // Its room is there before its ad has come, with the height the last ad had.
      expect(state(bar)).toMatchObject({ visible: true, requested: true, heightDp: 56 })
      const before = state(bar)
      bar.loaded(1, { width: 411, height: 56 })
      // Still there, and the story did not move when the ad came.
      expect(state(bar)).toMatchObject({ visible: true, heightDp: before.heightDp })
      expect(seen.filter((moment) => !moment.visible && moment.requested)).toHaveLength(0)
    })

    it('keeps its room for a strip served a week less a moment ago, and not for one served a week ago', async () => {
      memory.record = { at: NOW - SERVED_MS + 1, heightDp: 56 }
      const kept = make()
      await live(kept)
      expect(state(kept).visible).toBe(true)

      memory.record = { at: NOW - SERVED_MS, heightDp: 56 }
      const waits = make()
      await live(waits)
      expect(state(waits).visible).toBe(false)
    })

    it('waits for its ad again when it was not served for a week', async () => {
      memory.record = { at: NOW - 8 * DAY, heightDp: 56 }
      const bar = make()
      await live(bar)
      expect(state(bar)).toMatchObject({ requested: true, visible: false })
      bar.loaded(1, { width: 411, height: 56 })
      expect(state(bar).visible).toBe(true)
    })

    it('takes no room for a clock that was set back since the ad came', async () => {
      memory.record = { at: NOW + HOUR, heightDp: 56 }
      const bar = make()
      await live(bar)
      expect(state(bar).visible).toBe(false)
    })

    it('uses the time of the phone at the moment the strip was made, not as time passes', async () => {
      memory.record = { at: NOW - 7 * DAY + 1000, heightDp: 56 }
      const bar = make()
      await live(bar)
      clock.advance(10_000)
      bar.show(false)
      bar.show(true)
      expect(state(bar).visible).toBe(true)
    })
  })

  describe('and what it remembers', () => {
    it('keeps the time and the height of an ad that arrives, once for the session', async () => {
      const bar = make()
      await live(bar)
      bar.loaded(1, { width: 411, height: 56 })
      await settle()
      expect(memory.writes).toEqual([{ at: NOW, heightDp: 56 }])
      // A refresh brings another ad: the time is not kept again.
      clock.advance(HOUR)
      bar.loaded(1, { width: 411, height: 56 })
      await settle()
      expect(memory.writes).toHaveLength(1)
    })

    it('keeps the next start from waiting: what was kept is what the next strip reads', async () => {
      const first = make()
      await live(first)
      first.loaded(1, { width: 411, height: 60 })
      await settle()
      clock.advance(HOUR)
      const next = make()
      await live(next)
      expect(state(next)).toMatchObject({ visible: true, heightDp: 60 })
    })

    it('does not read what it kept before consent is settled, nor twice', async () => {
      const bar = make()
      bar.show(true)
      await settle()
      expect(memory.reads).toBe(0)
      bar.ready()
      bar.ready()
      await settle()
      expect(memory.reads).toBe(1)
    })

    it('asks for nothing until it has read what it kept', async () => {
      let answer: (value: typeof NEVER_SERVED) => void = () => undefined
      const slow = { read: () => new Promise<typeof NEVER_SERVED>((resolve) => (answer = resolve)), write: async () => undefined }
      const bar = make({ memory: slow })
      bar.show(true)
      bar.ready()
      await settle()
      expect(state(bar).requested).toBe(false)
      answer({ at: NOW - HOUR, heightDp: 58 })
      await settle()
      expect(state(bar)).toMatchObject({ requested: true, visible: true, heightDp: 58 })
    })

    it('takes what cannot be read as a strip never served', async () => {
      memory.failRead = true
      const bar = make()
      await live(bar)
      expect(state(bar)).toMatchObject({ requested: true, visible: false, heightDp: DEFAULT_BANNER_DP })
    })

    it('does not mind a write that fails', async () => {
      memory.failWrite = true
      const bar = make()
      await live(bar)
      expect(() => bar.loaded(1, { width: 411, height: 56 })).not.toThrow()
      await settle()
      expect(state(bar).visible).toBe(true)
    })

    it('does not mind a place to keep things that throws at once', async () => {
      const throwing = {
        read: () => {
          throw new Error('at once')
        },
        write: () => {
          throw new Error('at once')
        },
      }
      const bar = make({ memory: throwing })
      await live(bar)
      bar.loaded(1)
      await settle()
      expect(state(bar)).toMatchObject({ requested: true, visible: true })
    })
  })

  describe('with the stories', () => {
    it('goes with the stories and comes back with them, and is not asked for again', async () => {
      const bar = make()
      await live(bar)
      bar.loaded(1, { width: 411, height: 56 })
      expect(state(bar).visible).toBe(true)
      bar.show(false)
      expect(state(bar)).toMatchObject({ visible: false, requested: true })
      bar.show(true)
      expect(state(bar)).toMatchObject({ visible: true, request: 1 })
    })

    it('shows nothing before a story is shown, even with its ad', async () => {
      const bar = make()
      bar.ready()
      await settle()
      expect(state(bar).requested).toBe(false)
      bar.show(true)
      bar.loaded(1)
      bar.show(false)
      expect(state(bar).visible).toBe(false)
    })
  })

  describe('on a screen', () => {
    it('has none where the build has none', async () => {
      network.bannerOn = false
      const bar = make()
      await live(bar)
      expect(bar.enabled()).toBe(false)
      expect(state(bar)).toMatchObject({ requested: false, visible: false, request: 0 })
    })

    it('has none on a screen shorter than 500 dp, and has one when it is upright again, with the same banner', async () => {
      const bar = make()
      await live(bar)
      bar.loaded(1, { width: 411, height: 56 })
      expect(state(bar).visible).toBe(true)
      bar.screen(891, 411)
      expect(bar.enabled()).toBe(false)
      expect(state(bar)).toMatchObject({ visible: false, requested: true })
      bar.screen(411, 891)
      expect(state(bar)).toMatchObject({ visible: true, request: 1 })
    })

    it('needs 500 dp of height exactly', async () => {
      expect(MIN_SCREEN_HEIGHT_DP).toBe(500)
      const bar = make({ screen: { widthDp: 411, heightDp: MIN_SCREEN_HEIGHT_DP - 1 } })
      expect(bar.enabled()).toBe(false)
      bar.screen(411, MIN_SCREEN_HEIGHT_DP)
      expect(bar.enabled()).toBe(true)
    })

    it('has none until it knows the screen', async () => {
      const bar = new AdBar({ network, clock, memory, still: () => atRest })
      await live(bar)
      expect(bar.enabled()).toBe(false)
      expect(state(bar).requested).toBe(false)
      bar.screen(411, 891)
      expect(state(bar)).toMatchObject({ requested: true, request: 1 })
    })

    it('is as wide as the screen and no wider than the reading column', () => {
      expect(MAX_WIDTH_DP).toBe(640)
      expect(state(make({ screen: { widthDp: 411, heightDp: 891 } })).widthDp).toBe(411)
      expect(state(make({ screen: { widthDp: 411.7, heightDp: 891 } })).widthDp).toBe(411)
      expect(state(make({ screen: { widthDp: 1280, heightDp: 800 } })).widthDp).toBe(640)
      const bar = make()
      bar.screen(360, 780)
      expect(state(bar).widthDp).toBe(360)
      bar.screen(-5, 780)
      expect(state(bar).widthDp).toBe(0)
    })

    it('ignores a screen it already has, and tells nobody', () => {
      const bar = make()
      let told = 0
      bar.store.subscribe(() => told++)
      bar.screen(PHONE.widthDp, PHONE.heightDp)
      expect(told).toBe(0)
    })
  })

  describe('under a moving pager', () => {
    it('is never made to appear while the pager moves, and appears when it has stopped', async () => {
      const bar = make()
      await live(bar)
      atRest = false
      bar.loaded(1, { width: 411, height: 56 })
      expect(state(bar).visible).toBe(false)
      await jest.advanceTimersByTimeAsync(SETTLE_MS * 4)
      expect(state(bar).visible).toBe(false)
      atRest = true
      await jest.advanceTimersByTimeAsync(SETTLE_MS - 1)
      expect(state(bar).visible).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      expect(state(bar).visible).toBe(true)
      // Nothing is left to wait for.
      expect(jest.getTimerCount()).toBe(0)
    })

    it('is hidden at once, even while the pager moves', async () => {
      const bar = make()
      await live(bar)
      bar.loaded(1)
      expect(state(bar).visible).toBe(true)
      atRest = false
      bar.show(false)
      expect(state(bar).visible).toBe(false)
    })

    it('does not ask about the pager when it is not about to appear', async () => {
      const still = jest.fn(() => true)
      const bar = make({ still })
      await live(bar)
      expect(still).not.toHaveBeenCalled()
      bar.loaded(1)
      expect(still).toHaveBeenCalledTimes(1)
    })

    it('can be told which pager to watch later on', async () => {
      const bar = make()
      bar.setStill(() => false)
      await live(bar)
      bar.loaded(1)
      expect(state(bar).visible).toBe(false)
      bar.setStill(() => true)
      await jest.advanceTimersByTimeAsync(SETTLE_MS)
      expect(state(bar).visible).toBe(true)
    })

    it('forgets the wait when the stories go', async () => {
      const bar = make()
      await live(bar)
      atRest = false
      bar.loaded(1)
      expect(jest.getTimerCount()).toBe(1)
      bar.show(false)
      expect(jest.getTimerCount()).toBe(0)
    })

    it('does not wait for a pager that is at rest', async () => {
      const bar = make()
      await live(bar)
      bar.loaded(1)
      expect(jest.getTimerCount()).toBe(0)
    })

    it('takes a pager that is always at rest when it is told none', async () => {
      const bar = new AdBar({ network, clock, memory, screen: PHONE })
      await live(bar)
      bar.loaded(1)
      expect(state(bar).visible).toBe(true)
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  describe('when it is let go', () => {
    it('takes its banner away, forgets its timers and ignores what comes after', async () => {
      const bar = make()
      await live(bar)
      bar.failed(1)
      expect(jest.getTimerCount()).toBe(1)
      bar.destroy()
      expect(jest.getTimerCount()).toBe(0)
      expect(state(bar)).toMatchObject({ requested: false, visible: false })
      bar.show(true)
      bar.ready()
      bar.loaded(1)
      bar.sized(1, { width: 411, height: 90 })
      bar.screen(500, 900)
      await jest.advanceTimersByTimeAsync(10 * RETRY_MS)
      expect(state(bar)).toMatchObject({ requested: false, visible: false, request: 1 })
    })

    it('does not start when it is let go before consent', async () => {
      const bar = make()
      bar.show(true)
      bar.ready()
      bar.destroy()
      await settle()
      expect(state(bar).requested).toBe(false)
    })

    it('forgets a wait for the pager', async () => {
      const bar = make()
      await live(bar)
      atRest = false
      bar.loaded(1)
      bar.destroy()
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  it('does not tell its screen when nothing has changed', async () => {
    const bar = make()
    await live(bar)
    let told = 0
    bar.store.subscribe(() => told++)
    bar.show(true)
    bar.setStill(() => true)
    bar.screen(PHONE.widthDp, PHONE.heightDp)
    expect(told).toBe(0)
  })

  it('has the numbers of the native app', () => {
    expect(RETRY_MS).toBe(60_000)
    expect(MAX_RETRIES).toBe(3)
    expect(SETTLE_MS).toBe(250)
    expect(MAX_WIDTH_DP).toBe(640)
  })
})
