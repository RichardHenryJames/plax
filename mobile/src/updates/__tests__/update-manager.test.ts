import { fakeClock } from '@/platform/clock'
import { flushPromises, setVariant } from '@/test/helpers'
import { DAY, HOUR } from '@/config/limits'
import type { Feed, Release } from '../apk-updates'
import { createUpdateManager, type UpdateHost, type UpdateManager, type UpdateMessage } from '../update-manager'
import { NEWER, NOW, RELEASE, deferred, memoryStorage, type MemoryStorage } from './helpers'

const INSTALLED = 4
const ANDROID = 36

interface Screen extends UpdateHost {
  idle(): boolean
  open: boolean
  offers: Release[]
  said: UpdateMessage[]
  listings: number
}

/** A screen the manager shows things on: it can be made busy (a sheet is open) and it keeps what it was shown. */
function screen(): Screen {
  const shown: Screen = {
    open: false,
    offers: [],
    said: [],
    listings: 0,
    idle: () => !shown.open,
    offer: (release) => void shown.offers.push(release),
    say: (message) => void shown.said.push(message),
    openListing: () => void shown.listings++,
  }
  return shown
}

type Answer = () => Promise<Release | null>

interface Options {
  /** What the phone kept from earlier starts. */
  memory?: { lastCheck?: number; dismissedVersion?: number; dismissedAt?: number }
  /** The Google Play build: it never looks for updates. */
  store?: boolean
  storage?: MemoryStorage
  clock?: ReturnType<typeof fakeClock>
}

function setup(options: Options = {}) {
  const storage = options.storage ?? memoryStorage()
  for (const [name, value] of Object.entries(options.memory ?? {})) storage.data.set(`plax.updates.${name}`, String(value))
  const clock = options.clock ?? fakeClock(NOW)
  const requests: [number, number][] = []
  let answer: Answer = async () => null
  const feed: Feed = (installed, android) => {
    requests.push([installed, android])
    return answer()
  }
  const opened: string[] = []
  let browser: () => Promise<boolean | void> = async () => true
  const manager: UpdateManager = createUpdateManager({
    storage,
    clock,
    feed,
    installed: INSTALLED,
    sdk: ANDROID,
    openUrl: async (url) => {
      opened.push(url)
      return browser()
    },
    looksForUpdates: () => options.store !== true,
  })
  const kept = (name: 'lastCheck' | 'dismissedVersion' | 'dismissedAt') => Number(storage.data.get(`plax.updates.${name}`) ?? 0)
  return {
    manager,
    storage,
    clock,
    requests,
    opened,
    kept,
    answerWith(next: Answer) {
      answer = next
    },
    browserWith(next: () => Promise<boolean | void>) {
      browser = next
    },
  }
}

const found = (release: Release | null): Answer => async () => release
const failing = (message = 'offline'): Answer => async () => {
  throw new Error(message)
}

describe('a first launch', () => {
  it('looks for an update and offers it', async () => {
    const { manager, requests, kept, answerWith } = setup()
    answerWith(found(RELEASE))
    const shown = screen()
    const attached = manager.attach(shown)
    // The request is not made, nor anything shown, before the caller has let go of the thread.
    expect(requests).toHaveLength(0)
    expect(shown.offers).toEqual([])
    await attached
    expect(shown.offers).toEqual([RELEASE])
    expect(requests[0]).toEqual([INSTALLED, ANDROID])
    expect(kept('lastCheck')).toBe(NOW)
    expect(shown.said).toEqual([])
  })

  it('does not ask the website again within a day', async () => {
    const { manager, requests, kept } = setup({ memory: { lastCheck: NOW - HOUR } })
    const shown = screen()
    await manager.attach(shown)
    expect(requests).toHaveLength(0)
    expect(shown.offers).toEqual([])
    expect(shown.said).toEqual([])
    expect(kept('lastCheck')).toBe(NOW - HOUR)
  })

  it('counts a check when it starts, so a failure is not retried before the day is up', async () => {
    const { manager, requests, kept, answerWith, clock } = setup()
    const gate = deferred<Release | null>()
    answerWith(() => gate.promise)
    const shown = screen()
    const attached = manager.attach(shown)
    await flushPromises()
    expect(kept('lastCheck')).toBe(NOW)
    gate.reject(new Error('offline'))
    await attached
    expect(requests).toHaveLength(1)
    // An automatic check says nothing when it fails.
    expect(shown.said).toEqual([])
    expect(shown.offers).toEqual([])
    clock.set(NOW + HOUR)
    await manager.attach(screen())
    expect(requests).toHaveLength(1)
    clock.set(NOW + DAY)
    await manager.attach(screen())
    expect(requests).toHaveLength(2)
  })

  it('is not silenced by a clock that went backwards', async () => {
    const { manager, requests, kept } = setup({ memory: { lastCheck: NOW + 5 * HOUR } })
    await manager.attach(screen())
    expect(requests).toHaveLength(1)
    expect(kept('lastCheck')).toBe(NOW)
  })

  it('does not look, nor remember that it did, in a build that Google Play updates', async () => {
    const { manager, requests, kept, answerWith } = setup({ store: true })
    answerWith(found(RELEASE))
    const shown = screen()
    expect(manager.storeBuild()).toBe(true)
    await manager.attach(shown)
    expect(requests).toHaveLength(0)
    expect(kept('lastCheck')).toBe(0)
    expect(shown.offers).toEqual([])
    expect(shown.listings).toBe(0)
  })
})

describe('a release that is known', () => {
  it('is offered again when the screen is recreated, with no new request', async () => {
    const { manager, requests, answerWith } = setup()
    answerWith(found(RELEASE))
    const first = screen()
    await manager.attach(first)
    expect(first.offers).toEqual([RELEASE])
    manager.detach(first)
    const second = screen()
    await manager.attach(second)
    expect(second.offers).toEqual([RELEASE])
    expect(requests).toHaveLength(1)
  })

  it('is kept in the state the screens read, until the reader puts it off', async () => {
    const { manager, answerWith } = setup()
    answerWith(found(RELEASE))
    const seen: (Release | null)[] = []
    manager.store.subscribe(() => seen.push(manager.store.getState().available))
    await manager.attach(screen())
    expect(manager.store.getState().available).toEqual(RELEASE)
    await manager.dismiss(RELEASE)
    expect(manager.store.getState().available).toBeNull()
    expect(seen).toContain(RELEASE)
    expect(seen[seen.length - 1]).toBeNull()
  })

  it('is told apart from one that was only dismissed: dismissing a different release forgets nothing', async () => {
    const { manager, kept, answerWith } = setup()
    answerWith(found(NEWER))
    const shown = screen()
    await manager.attach(shown)
    expect(shown.offers).toEqual([NEWER])
    await manager.dismiss(RELEASE)
    expect(kept('dismissedVersion')).toBe(RELEASE.versionCode)
    manager.detach(shown)
    const next = screen()
    await manager.attach(next)
    // The newer release is still known and was not the one put off.
    expect(next.offers).toEqual([NEWER])
  })
})

describe('Later and Download', () => {
  it('silence the offer for a day, but a newer release comes at once', async () => {
    const { manager, kept, clock, answerWith, requests } = setup()
    answerWith(found(RELEASE))
    const shown = screen()
    await manager.attach(shown)
    clock.advance(23 * HOUR)
    await manager.dismiss(shown.offers[0])
    expect(kept('dismissedVersion')).toBe(RELEASE.versionCode)
    expect(kept('dismissedAt')).toBe(NOW + 23 * HOUR)
    // Nothing is known any more, and the day since the check is not up.
    await manager.attach(shown)
    expect(shown.offers).toHaveLength(1)

    // The next check, a day after the last, finds the same release an hour after it was put off.
    clock.advance(HOUR)
    await manager.attach(shown)
    expect(requests).toHaveLength(2)
    expect(shown.offers).toHaveLength(1)

    // A newer release is offered at once.
    clock.advance(DAY)
    answerWith(found(NEWER))
    await manager.attach(shown)
    expect(shown.offers).toEqual([RELEASE, NEWER])

    // And after a day the same one is offered again.
    await manager.dismiss(NEWER)
    clock.advance(DAY)
    answerWith(found(NEWER))
    await manager.attach(shown)
    expect(shown.offers).toEqual([RELEASE, NEWER, NEWER])
  })

  it('are remembered for the next start', async () => {
    const first = setup({ memory: { dismissedVersion: RELEASE.versionCode, dismissedAt: NOW - HOUR } })
    first.answerWith(found(RELEASE))
    const shown = screen()
    await first.manager.attach(shown)
    expect(first.requests).toHaveLength(1)
    expect(shown.offers).toEqual([])
    await first.manager.dismiss(NEWER)
    const second = setup({ storage: first.storage, clock: first.clock })
    second.answerWith(found(NEWER))
    await second.manager.load()
    // Dismissed a moment ago, at the start before: not offered, and the website is not asked again within the day.
    const later = screen()
    await second.manager.attach(later)
    expect(second.requests).toHaveLength(0)
    expect(later.offers).toEqual([])
  })

  it('count a download as an answer: it opens the exact file in the browser, once, and puts the offer off', async () => {
    const { manager, opened, kept, answerWith, clock } = setup()
    answerWith(found(RELEASE))
    const shown = screen()
    await manager.attach(shown)
    await expect(manager.download(RELEASE)).resolves.toBe(true)
    expect(opened).toEqual([RELEASE.apkUrl])
    expect(kept('dismissedVersion')).toBe(RELEASE.versionCode)
    expect(kept('dismissedAt')).toBe(clock())
    expect(manager.store.getState().available).toBeNull()
    expect(shown.said).toEqual([])
  })

  it('count a browser that opens without saying so as opened', async () => {
    const { manager, browserWith, kept } = setup()
    browserWith(async () => undefined)
    await expect(manager.download(RELEASE)).resolves.toBe(true)
    expect(kept('dismissedVersion')).toBe(RELEASE.versionCode)
  })

  it('are not a download when there is no browser: the reader is told, and the offer stays', async () => {
    const { manager, kept, answerWith, browserWith } = setup()
    answerWith(found(RELEASE))
    const shown = screen()
    await manager.attach(shown)
    for (const failure of [async () => false, async () => Promise.reject(new Error('no browser'))]) {
      browserWith(failure)
      await expect(manager.download(RELEASE)).resolves.toBe(false)
    }
    expect(shown.said).toEqual(['update_no_browser', 'update_no_browser'])
    expect(kept('dismissedVersion')).toBe(0)
    expect(manager.store.getState().available).toEqual(RELEASE)
  })

  it('may be answered with no screen in front', async () => {
    const { manager, browserWith } = setup()
    browserWith(async () => false)
    await expect(manager.download(RELEASE)).resolves.toBe(false)
  })
})

describe('asking from the menu', () => {
  it('always ends in something visible', async () => {
    const { manager, requests, kept, answerWith } = setup({ memory: { lastCheck: NOW - HOUR } })
    const shown = screen()
    await manager.attach(shown)
    expect(requests).toHaveLength(0)

    await manager.check(true)
    // It ignores the daily limit, and with nothing newer it says so.
    expect(requests).toHaveLength(1)
    expect(shown.said).toEqual(['update_current'])
    expect(shown.offers).toEqual([])
    expect(kept('lastCheck')).toBe(NOW)

    answerWith(failing('down'))
    await manager.check(true)
    expect(shown.said).toEqual(['update_current', 'update_failed'])

    answerWith(found(RELEASE))
    await manager.check(true)
    expect(shown.offers).toEqual([RELEASE])
    expect(shown.said).toHaveLength(2)
  })

  it('offers a release that was put off, where an automatic check does not', async () => {
    const { manager, requests, answerWith } = setup({ memory: { dismissedVersion: RELEASE.versionCode, dismissedAt: NOW - HOUR } })
    answerWith(found(RELEASE))
    const shown = screen()
    await manager.attach(shown)
    expect(requests).toHaveLength(1)
    expect(shown.offers).toEqual([])
    expect(shown.said).toEqual([])
    await manager.check(true)
    expect(shown.offers).toEqual([RELEASE])
  })

  it('makes a check that is already running report back, instead of being ignored', async () => {
    const { manager, requests, answerWith, clock } = setup()
    const gate = deferred<Release | null>()
    answerWith(() => gate.promise)
    const shown = screen()
    const attached = manager.attach(shown)
    const asked = manager.check(true)
    gate.resolve(null)
    await Promise.all([attached, asked])
    expect(requests).toHaveLength(1)
    expect(shown.said).toEqual(['update_current'])

    clock.set(NOW + DAY)
    answerWith(failing('down'))
    const later = screen()
    await Promise.all([manager.attach(later), manager.check(true)])
    expect(later.said).toEqual(['update_failed'])
    expect(requests).toHaveLength(2)
  })

  it('reaches a check that is only waiting for what was remembered to be read', async () => {
    const { manager, requests } = setup({ memory: { lastCheck: NOW - HOUR } })
    const shown = screen()
    // Not due: the automatic check would do nothing, but the reader's ask in the same moment is an ask.
    await Promise.all([manager.attach(shown), manager.check(true)])
    expect(requests).toHaveLength(1)
    expect(shown.said).toEqual(['update_current'])
  })

  it('does nothing without a screen', async () => {
    const { manager, requests } = setup()
    await manager.check(false)
    await manager.check(true)
    expect(requests).toHaveLength(0)
  })

  it('opens the listing instead, in a build Google Play updates, and says nothing else', async () => {
    const { manager, requests, kept, answerWith } = setup({ store: true })
    answerWith(found(RELEASE))
    const shown = screen()
    await manager.attach(shown)
    await manager.check(true)
    expect(shown.listings).toBe(1)
    expect(requests).toHaveLength(0)
    expect(shown.said).toEqual([])
    expect(kept('lastCheck')).toBe(0)
    await manager.check(false)
    expect(shown.listings).toBe(1)
    manager.detach(shown)
    await manager.check(true)
    // With no screen there is nowhere to open it.
    expect(shown.listings).toBe(1)
  })
})

describe('a check', () => {
  it('is silent when nothing is found or the network fails', async () => {
    const { manager, requests, answerWith, clock } = setup()
    const shown = screen()
    await manager.attach(shown)
    expect(shown.said).toEqual([])
    expect(shown.offers).toEqual([])
    clock.advance(DAY)
    answerWith(failing())
    await manager.attach(shown)
    expect(shown.said).toEqual([])
    expect(requests).toHaveLength(2)
  })

  it('is a failure, not a crash, when the request breaks in an unexpected way', async () => {
    const { manager, answerWith } = setup()
    answerWith(async () => {
      throw new TypeError('unexpected')
    })
    const shown = screen()
    await manager.attach(shown)
    await manager.check(true)
    expect(shown.said).toEqual(['update_failed'])
    answerWith(found(RELEASE))
    await manager.check(true)
    expect(shown.offers).toEqual([RELEASE])
  })

  it('is a failure when the request throws at once instead of failing later', async () => {
    const storage = memoryStorage()
    const manager = createUpdateManager({
      storage,
      clock: fakeClock(NOW),
      feed: () => {
        throw new Error('at once')
      },
      installed: INSTALLED,
      sdk: ANDROID,
      openUrl: async () => true,
      looksForUpdates: () => true,
    })
    const shown = screen()
    await manager.attach(shown)
    await manager.check(true)
    expect(shown.said).toEqual(['update_failed'])
    expect(manager.store.getState().checking).toBe(false)
  })

  it('does not cover an open sheet, even when asked, but comes back when the app is next in front', async () => {
    const { manager, requests, answerWith } = setup()
    answerWith(found(RELEASE))
    const shown = screen()
    shown.open = true
    await manager.attach(shown)
    expect(shown.offers).toEqual([])
    await manager.check(true)
    expect(shown.offers).toEqual([])
    shown.open = false
    manager.detach(shown)
    await manager.attach(shown)
    expect(shown.offers).toEqual([RELEASE])
    expect(requests).toHaveLength(2)
  })

  it('that finishes after the screen left says nothing, but is remembered', async () => {
    const { manager, requests, answerWith } = setup()
    const gate = deferred<Release | null>()
    answerWith(() => gate.promise)
    const shown = screen()
    const attached = manager.attach(shown)
    const asked = manager.check(true)
    manager.detach(shown)
    gate.resolve(RELEASE)
    await Promise.all([attached, asked])
    expect(shown.offers).toEqual([])
    // Not even the answer to a tap on a screen that is gone.
    expect(shown.said).toEqual([])
    const next = screen()
    await manager.attach(next)
    expect(next.offers).toEqual([RELEASE])
    expect(requests).toHaveLength(1)
  })

  it('is not started a second time while one is running', async () => {
    const { manager, requests, answerWith } = setup()
    const gate = deferred<Release | null>()
    answerWith(() => gate.promise)
    const shown = screen()
    const all = [manager.attach(shown), manager.attach(shown), manager.check(false)]
    expect(manager.store.getState().checking).toBe(false)
    await flushPromises()
    expect(manager.store.getState().checking).toBe(true)
    gate.resolve(null)
    await Promise.all(all)
    expect(requests).toHaveLength(1)
    expect(manager.store.getState().checking).toBe(false)
  })

  it('goes to the screen that is current when it finishes, not the one that started it', async () => {
    const { manager, requests, answerWith } = setup()
    const gate = deferred<Release | null>()
    answerWith(() => gate.promise)
    const gone = screen()
    const current = screen()
    const first = manager.attach(gone)
    const second = manager.attach(current)
    manager.detach(gone)
    gate.resolve(null)
    await Promise.all([first, second])
    expect(requests).toHaveLength(1)
    await manager.check(true)
    expect(current.said).toEqual(['update_current'])
    expect(gone.said).toEqual([])
  })

  it('changes the state the screens read while it runs', async () => {
    const { manager, answerWith } = setup()
    const gate = deferred<Release | null>()
    answerWith(() => gate.promise)
    const seen: boolean[] = []
    manager.store.subscribe(() => seen.push(manager.store.getState().checking))
    const attached = manager.attach(screen())
    await flushPromises()
    gate.resolve(RELEASE)
    await attached
    expect(seen).toEqual([true, false, false])
    expect(manager.store.getState().available).toEqual(RELEASE)
  })

  it('does not lose an ask that a screen makes while it is being told an answer: that ask is a check of its own', async () => {
    const { manager, requests, answerWith } = setup()
    answerWith(found(null))
    const shown = screen()
    let again = true
    shown.say = (message) => {
      shown.said.push(message)
      if (again) {
        again = false
        void manager.check(true)
      }
    }
    await manager.attach(shown)
    await manager.check(true)
    await flushPromises()
    expect(shown.said).toEqual(['update_current', 'update_current'])
    expect(requests).toHaveLength(3)
  })

  it('is not left running when a screen breaks while it is being told: the next ask is a check', async () => {
    const { manager, requests, answerWith } = setup()
    answerWith(found(RELEASE))
    const broken = screen()
    broken.offer = () => {
      throw new Error('the screen broke')
    }
    await expect(manager.attach(broken)).rejects.toThrow('the screen broke')
    expect(manager.store.getState().checking).toBe(false)
    manager.detach(broken)
    const next = screen()
    // It is not time again, the first check having been counted, and the release it found was kept.
    await expect(manager.attach(next)).resolves.toBe('skipped')
    expect(next.offers).toEqual([RELEASE])
    await expect(manager.check(true)).resolves.toBe('available')
    expect(requests).toHaveLength(2)
  })

  it('is not left running when the clock breaks: the manager is not stuck, and nothing is shown as running', async () => {
    const clock = fakeClock(NOW)
    let broken = true
    const flaky = Object.assign(
      () => {
        if (broken) {
          broken = false
          throw new Error('the clock broke')
        }
        return clock()
      },
      { advance: clock.advance, set: clock.set },
    )
    const { manager, requests } = setup({ clock: flaky })
    const shown = screen()
    await expect(manager.attach(shown)).rejects.toThrow('the clock broke')
    expect(manager.store.getState().checking).toBe(false)
    await expect(manager.check(true)).resolves.toBe('current')
    expect(requests).toHaveLength(1)
  })

  it('waits for what was remembered to be read, however soon it is asked', async () => {
    const storage = memoryStorage({ 'plax.updates.lastCheck': String(NOW - HOUR) })
    const slow = deferred<string | null>()
    const read = storage.getItem
    storage.getItem = (key) => (key === 'plax.updates.lastCheck' ? slow.promise : read(key))
    const { manager, requests } = setup({ storage })
    const attached = manager.attach(screen())
    await flushPromises()
    expect(requests).toHaveLength(0)
    slow.resolve(String(NOW - HOUR))
    await attached
    expect(requests).toHaveLength(0)
  })

  it('still works when the phone cannot keep or read what it remembers', async () => {
    const storage = memoryStorage()
    storage.failReads = true
    storage.failWrites = true
    const { manager, requests, answerWith } = setup({ storage })
    answerWith(found(RELEASE))
    const shown = screen()
    await manager.attach(shown)
    expect(shown.offers).toEqual([RELEASE])
    await manager.attach(shown)
    // Held in memory for this run: the check is not repeated, and the offer is made again when the screen comes back.
    expect(requests).toHaveLength(1)
    expect(shown.offers).toEqual([RELEASE, RELEASE])
  })
})

describe('which builds look for updates', () => {
  it('are the website\'s build and the test build, not the Google Play build, decided when asked and not before', async () => {
    const manager = createUpdateManager({
      storage: memoryStorage(),
      clock: fakeClock(NOW),
      feed: async () => RELEASE,
      installed: INSTALLED,
      sdk: ANDROID,
      openUrl: async () => true,
    })
    setVariant('preview')
    expect(manager.storeBuild()).toBe(false)
    const shown = screen()
    await manager.attach(shown)
    expect(shown.offers).toEqual([RELEASE])
    setVariant('play')
    expect(manager.storeBuild()).toBe(true)
    await manager.check(true)
    expect(shown.listings).toBe(1)
    // The test build looks at its own website, as the website's build does at the real one.
    setVariant('e2e')
    expect(manager.storeBuild()).toBe(false)
  })

  it('does not offer a release already known once the build is one that Google Play updates', async () => {
    const options: Options = {}
    const { manager, answerWith } = setup(options)
    answerWith(found(RELEASE))
    const shown = screen()
    await manager.attach(shown)
    expect(shown.offers).toEqual([RELEASE])
    options.store = true
    const next = screen()
    await manager.attach(next)
    expect(next.offers).toEqual([])
    expect(next.listings).toBe(0)
    await manager.check(true)
    expect(next.listings).toBe(1)
    expect(next.offers).toEqual([])
  })
})

describe('what a check ends in', () => {
  it('is available when a newer release is known, offered or not', async () => {
    const { manager, answerWith } = setup()
    answerWith(found(RELEASE))
    const shown = screen()
    shown.open = true
    await expect(manager.attach(shown)).resolves.toBe('available')
    expect(shown.offers).toEqual([])
    shown.open = false
    await expect(manager.check(true)).resolves.toBe('available')
    expect(shown.offers).toEqual([RELEASE])
  })

  it('is current when there is nothing newer, which the menu says as "Plax is up to date"', async () => {
    const { manager } = setup()
    const shown = screen()
    await expect(manager.attach(shown)).resolves.toBe('current')
    await expect(manager.check(true)).resolves.toBe('current')
    expect(shown.said).toEqual(['update_current'])
  })

  it('is failed when the website cannot be asked, which the menu says as "cannot check"', async () => {
    const { manager, answerWith } = setup()
    answerWith(failing())
    const shown = screen()
    await expect(manager.attach(shown)).resolves.toBe('failed')
    await expect(manager.check(true)).resolves.toBe('failed')
    expect(shown.said).toEqual(['update_failed'])
  })

  it('is skipped when nothing was looked for: it is not time, no screen is in front, or the build never looks', async () => {
    const due = setup({ memory: { lastCheck: NOW - HOUR } })
    await expect(due.manager.attach(screen())).resolves.toBe('skipped')
    await expect(setup().manager.check(true)).resolves.toBe('skipped')
    const store = setup({ store: true })
    const shown = screen()
    await expect(store.manager.attach(shown)).resolves.toBe('skipped')
    await expect(store.manager.check(true)).resolves.toBe('skipped')
    expect(shown.listings).toBe(1)
  })

  it('is the same for an ask that joined a check that was already running', async () => {
    const { manager, answerWith } = setup()
    const gate = deferred<Release | null>()
    answerWith(() => gate.promise)
    const shown = screen()
    const results = [manager.attach(shown), manager.check(true)]
    gate.resolve(RELEASE)
    await expect(Promise.all(results)).resolves.toEqual(['available', 'available'])
  })
})
