import * as ExpoUpdates from 'expo-updates'
import { AppState } from 'react-native'
import { fakeClock } from '@/platform/clock'
import { HOUR } from '@/config/limits'
import { flushPromises } from '@/test/helpers'
import { OTA_CHECK_INTERVAL, createOtaManager, runtimeInfo, type AppStateSource, type OtaState, type OtaStatus, type UpdatesModule } from '../ota'
import { NOW, deferred, memoryStorage, type MemoryStorage } from './helpers'

interface CheckResult {
  isAvailable: boolean
  isRollBackToEmbedded?: boolean
}
interface FetchResult {
  isNew: boolean
  isRollBackToEmbedded?: boolean
}

/** The expo-updates module as the tests see it (__mocks__/expo-updates.ts): what the "server" answers is set in `state`. */
interface UpdatesMock extends UpdatesModule {
  checkForUpdateAsync: jest.Mock<Promise<CheckResult>, []>
  fetchUpdateAsync: jest.Mock<Promise<FetchResult>, []>
  reloadAsync: jest.Mock<Promise<void>, []>
  state: {
    isEnabled: boolean
    channel: string | null
    runtimeVersion: string | null
    updateId: string | null
    isEmbeddedLaunch: boolean
    check: CheckResult | Error
    fetch: FetchResult | Error
  }
}

const updates = require('expo-updates') as UpdatesMock

beforeEach(() => {
  Object.assign(updates.state, {
    isEnabled: true,
    channel: 'production',
    runtimeVersion: '2.0.0',
    updateId: null,
    isEmbeddedLaunch: true,
    check: { isAvailable: false },
    fetch: { isNew: false },
  })
  updates.checkForUpdateAsync.mockClear()
  updates.fetchUpdateAsync.mockClear()
  updates.reloadAsync.mockClear()
})

function setup(options: { storage?: MemoryStorage; clock?: ReturnType<typeof fakeClock>; module?: UpdatesModule } = {}) {
  const storage = options.storage ?? memoryStorage()
  const clock = options.clock ?? fakeClock(NOW)
  const ota = createOtaManager({ updates: options.module ?? updates, clock, storage })
  const statuses: OtaStatus[] = []
  ota.store.subscribe(() => statuses.push(ota.store.getState().status))
  return { ota, storage, clock, statuses }
}

const AVAILABLE = { isAvailable: true }
const NEW = { isNew: true }
const lastCheck = (storage: MemoryStorage) => Number(storage.data.get('plax.ota.lastCheck') ?? 0)

/** A plain module, for what the shared mock cannot do: a module that throws at once, or answers with a rollback. */
function plainModule(overrides: Partial<UpdatesModule> = {}): UpdatesModule {
  return {
    isEnabled: true,
    channel: 'production',
    runtimeVersion: '2.0.0',
    updateId: null,
    isEmbeddedLaunch: true,
    checkForUpdateAsync: async () => ({ isAvailable: false }),
    fetchUpdateAsync: async () => ({ isNew: false }),
    reloadAsync: async () => undefined,
    ...overrides,
  }
}

describe('what the module is', () => {
  it('is the real expo-updates module and React Native\'s AppState, as far as the policy uses them', () => {
    const module: UpdatesModule = ExpoUpdates
    const source: AppStateSource = AppState
    expect(module).toBeDefined()
    expect(source).toBeDefined()
  })
})

describe('updates that are off, as in a development build', () => {
  it('start disabled, and never ask anything', async () => {
    updates.state.isEnabled = false
    const { ota, storage } = setup()
    expect(ota.store.getState().status).toBe('disabled')
    await expect(ota.check()).resolves.toBe('disabled')
    await expect(ota.check({ force: true })).resolves.toBe('disabled')
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled()
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled()
    expect(lastCheck(storage)).toBe(0)
    expect(ota.store.getState().status).toBe('disabled')
  })

  it('do not restart the app', async () => {
    updates.state.isEnabled = false
    const { ota } = setup()
    await expect(ota.reloadNow()).resolves.toBe(false)
    expect(updates.reloadAsync).not.toHaveBeenCalled()
  })

  it('are noticed when they are switched on later, which only a test does', async () => {
    updates.state.isEnabled = false
    const { ota } = setup()
    expect(ota.store.getState().status).toBe('disabled')
    updates.state.isEnabled = true
    await expect(ota.check()).resolves.toBe('idle')
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
  })

  it('are not watched either', async () => {
    updates.state.isEnabled = false
    const { ota } = setup()
    const source = appStateSource()
    ota.watch(source)
    source.emit('active')
    await flushPromises()
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled()
  })
})

describe('a look', () => {
  it('finds nothing new: nothing is downloaded and the status is idle', async () => {
    const { ota, statuses } = setup()
    await expect(ota.check()).resolves.toBe('idle')
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled()
    expect(statuses).toEqual(['checking', 'idle'])
  })

  it('finds an update: downloads it, and it is ready for the next cold start without a restart', async () => {
    updates.state.check = AVAILABLE
    updates.state.fetch = NEW
    const { ota, statuses } = setup()
    await expect(ota.check()).resolves.toBe('ready')
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1)
    expect(updates.reloadAsync).not.toHaveBeenCalled()
    expect(statuses).toEqual(['checking', 'downloading', 'ready'])
    expect(ota.store.getState().status).toBe('ready')
  })

  it('is counted when it starts, with the time it started', async () => {
    const { ota, storage, clock } = setup()
    const gate = deferred<CheckResult>()
    updates.checkForUpdateAsync.mockImplementationOnce(() => gate.promise)
    const pending = ota.check()
    await flushPromises()
    expect(lastCheck(storage)).toBe(clock())
    expect(ota.store.getState().status).toBe('checking')
    gate.resolve({ isAvailable: false })
    await pending
  })

  it('is a rollback to the embedded bundle too: that is downloaded and made ready as well', async () => {
    const module = plainModule({
      checkForUpdateAsync: async () => ({ isAvailable: false, isRollBackToEmbedded: true }),
      fetchUpdateAsync: async () => ({ isNew: false, isRollBackToEmbedded: true }),
    })
    const { ota } = setup({ module })
    await expect(ota.check()).resolves.toBe('ready')
  })

  it('does not make an update ready that the server did not give', async () => {
    updates.state.check = AVAILABLE
    updates.state.fetch = { isNew: false }
    const { ota } = setup()
    await expect(ota.check()).resolves.toBe('error')
  })

  it('shows what runs now: the update, the channel and the runtime version', async () => {
    updates.state.updateId = '1234-abcd'
    updates.state.isEmbeddedLaunch = false
    updates.state.channel = 'production'
    updates.state.runtimeVersion = '2.0.0'
    const { ota } = setup()
    await ota.check()
    expect(ota.store.getState()).toEqual<OtaState>({
      status: 'idle',
      updateId: '1234-abcd',
      isEmbedded: false,
      channel: 'production',
      runtimeVersion: '2.0.0',
    })
  })

  it('shows what runs when the module has none of it, as a development build does', () => {
    updates.state.channel = null
    updates.state.runtimeVersion = null
    const { ota } = setup()
    expect(ota.store.getState()).toMatchObject({ updateId: null, channel: null, runtimeVersion: null })
  })

  it('sends nothing but what expo-updates sends of itself: it asks the module, with no argument', async () => {
    const { ota } = setup()
    await ota.check()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledWith()
  })
})

describe('how often it looks', () => {
  it('is at most once every three hours', async () => {
    const { ota, clock } = setup()
    await ota.check()
    clock.advance(OTA_CHECK_INTERVAL - 1)
    await expect(ota.check()).resolves.toBe('idle')
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    clock.advance(1)
    await ota.check()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2)
    clock.advance(OTA_CHECK_INTERVAL - 1)
    await ota.check()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2)
    expect(OTA_CHECK_INTERVAL).toBe(3 * HOUR)
  })

  it('is the same across starts of the app: a cold start within three hours does not look again', async () => {
    const first = setup()
    await first.ota.check()
    const second = setup({ storage: first.storage, clock: first.clock })
    await second.ota.load()
    await second.ota.check()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    first.clock.advance(OTA_CHECK_INTERVAL)
    await second.ota.check()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2)
  })

  it('is not silenced by a clock that went backwards', async () => {
    const storage = memoryStorage({ 'plax.ota.lastCheck': String(NOW + 10 * HOUR) })
    const { ota } = setup({ storage })
    await ota.check()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    expect(lastCheck(storage)).toBe(NOW)
  })

  it('can be asked for at once with force, which is not for an automatic look', async () => {
    const { ota } = setup()
    await ota.check()
    await ota.check({ force: true })
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2)
  })

  it('is not repeated within the three hours after a failure either: it is counted when it starts', async () => {
    updates.state.check = new Error('offline')
    const { ota, clock } = setup()
    await expect(ota.check()).resolves.toBe('error')
    clock.advance(HOUR)
    await expect(ota.check()).resolves.toBe('error')
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    clock.advance(2 * HOUR)
    updates.state.check = { isAvailable: false }
    await expect(ota.check()).resolves.toBe('idle')
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2)
  })

  it('waits for the time of the last look to be read, however soon it is asked', async () => {
    const storage = memoryStorage({ 'plax.ota.lastCheck': String(NOW - HOUR) })
    const slow = deferred<string | null>()
    storage.getItem = () => slow.promise
    const { ota } = setup({ storage })
    const pending = ota.check()
    await flushPromises()
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled()
    slow.resolve(String(NOW - HOUR))
    await pending
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled()
  })

  it('goes on when the phone cannot keep or read the time', async () => {
    const storage = memoryStorage()
    storage.failReads = true
    storage.failWrites = true
    const { ota, clock } = setup({ storage })
    await expect(ota.check()).resolves.toBe('idle')
    // Held in memory for this run.
    clock.advance(HOUR)
    await ota.check()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
  })
})

describe('two looks at the same time', () => {
  it('are never made: one look answers every ask made while it runs', async () => {
    const { ota } = setup()
    const gate = deferred<CheckResult>()
    updates.checkForUpdateAsync.mockImplementationOnce(() => gate.promise)
    const results = [ota.check(), ota.check(), ota.check({ force: true })]
    await flushPromises()
    gate.resolve({ isAvailable: false })
    expect(await Promise.all(results)).toEqual(['idle', 'idle', 'idle'])
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
  })

  it('are not made while a download runs either', async () => {
    updates.state.check = AVAILABLE
    const { ota, statuses } = setup()
    const gate = deferred<FetchResult>()
    updates.fetchUpdateAsync.mockImplementationOnce(() => gate.promise)
    const first = ota.check()
    await flushPromises()
    expect(ota.store.getState().status).toBe('downloading')
    const second = ota.check({ force: true })
    gate.resolve({ isNew: true })
    expect(await Promise.all([first, second])).toEqual(['ready', 'ready'])
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['checking', 'downloading', 'ready'])
  })

  it('do not leave a look stuck after a failure: the next may start', async () => {
    updates.state.check = new Error('down')
    const { ota } = setup()
    await expect(ota.check()).resolves.toBe('error')
    updates.state.check = { isAvailable: false }
    await expect(ota.check({ force: true })).resolves.toBe('idle')
  })
})

describe('a look that fails', () => {
  it('changes nothing: the error is the status, and what runs is what ran', async () => {
    updates.state.updateId = 'running-update'
    updates.state.isEmbeddedLaunch = false
    updates.state.check = new Error('offline')
    const { ota } = setup()
    await expect(ota.check()).resolves.toBe('error')
    expect(ota.store.getState()).toEqual<OtaState>({
      status: 'error',
      updateId: 'running-update',
      isEmbedded: false,
      channel: 'production',
      runtimeVersion: '2.0.0',
    })
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled()
    expect(updates.reloadAsync).not.toHaveBeenCalled()
  })

  it('never rejects, whatever fails', async () => {
    updates.state.check = AVAILABLE
    updates.state.fetch = new Error('half a download')
    await expect(setup().ota.check()).resolves.toBe('error')
    const thrown = plainModule({
      checkForUpdateAsync: () => {
        throw new TypeError('at once')
      },
    })
    await expect(setup({ module: thrown }).ota.check()).resolves.toBe('error')
  })

  it('never rejects when the clock breaks, and is not left running by it', async () => {
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
    const { ota } = setup({ clock: flaky })
    await expect(ota.check()).resolves.toBe('error')
    await expect(ota.check()).resolves.toBe('idle')
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
  })

  it('leaves an update that was already downloaded waiting for the restart', async () => {
    updates.state.check = AVAILABLE
    updates.state.fetch = NEW
    const { ota, clock } = setup()
    await expect(ota.check()).resolves.toBe('ready')
    clock.advance(OTA_CHECK_INTERVAL)
    updates.state.check = new Error('offline')
    await expect(ota.check()).resolves.toBe('ready')
    clock.advance(OTA_CHECK_INTERVAL)
    updates.state.check = { isAvailable: false }
    await expect(ota.check()).resolves.toBe('ready')
    clock.advance(OTA_CHECK_INTERVAL)
    updates.state.check = AVAILABLE
    updates.state.fetch = new Error('half a download')
    await expect(ota.check()).resolves.toBe('ready')
    clock.advance(OTA_CHECK_INTERVAL)
    updates.state.fetch = { isNew: false }
    await expect(ota.check()).resolves.toBe('ready')
  })

  it('is forgotten by the next good look', async () => {
    updates.state.check = new Error('offline')
    const { ota, clock } = setup()
    await ota.check()
    clock.advance(OTA_CHECK_INTERVAL)
    updates.state.check = AVAILABLE
    updates.state.fetch = NEW
    await expect(ota.check()).resolves.toBe('ready')
  })
})

describe('restarting now', () => {
  it('runs the newest bundle on the phone, at the reader\'s asking and not before', async () => {
    updates.state.check = AVAILABLE
    updates.state.fetch = NEW
    const { ota } = setup()
    await ota.check()
    expect(updates.reloadAsync).not.toHaveBeenCalled()
    await expect(ota.reloadNow()).resolves.toBe(true)
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1)
  })

  it('says false, and never throws, when the module cannot restart the app', async () => {
    updates.reloadAsync.mockImplementationOnce(() => Promise.reject(new Error('cannot')))
    await expect(setup().ota.reloadNow()).resolves.toBe(false)
    updates.reloadAsync.mockImplementationOnce(() => {
      throw new Error('at once')
    })
    await expect(setup().ota.reloadNow()).resolves.toBe(false)
  })

  it('does not restart in the middle of a look: the download would be lost', async () => {
    const { ota } = setup()
    const gate = deferred<CheckResult>()
    updates.checkForUpdateAsync.mockImplementationOnce(() => gate.promise)
    const pending = ota.check()
    await flushPromises()
    await expect(ota.reloadNow()).resolves.toBe(false)
    gate.resolve({ isAvailable: false })
    await pending
    expect(updates.reloadAsync).not.toHaveBeenCalled()
  })
})

/** An AppState the test moves: what the policy listens to. */
function appStateSource() {
  const listeners = new Set<(state: string) => void>()
  let removed = 0
  const source: AppStateSource & { emit(state: string): void; removed(): number; listeners(): number } = {
    addEventListener: (type, listener) => {
      expect(type).toBe('change')
      listeners.add(listener)
      return {
        remove: () => {
          removed++
          listeners.delete(listener)
        },
      }
    },
    emit: (state) => listeners.forEach((listener) => listener(state)),
    removed: () => removed,
    listeners: () => listeners.size,
  }
  return source
}

describe('watching the app', () => {
  it('looks when the app opens and when it comes to the front, and at no other change', async () => {
    const { ota, clock } = setup()
    const source = appStateSource()
    ota.watch(source)
    await flushPromises()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    clock.advance(OTA_CHECK_INTERVAL)
    source.emit('background')
    source.emit('inactive')
    await flushPromises()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
    source.emit('active')
    await flushPromises()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2)
  })

  it('still looks at most once every three hours, however often the app comes to the front', async () => {
    const { ota } = setup()
    const source = appStateSource()
    ota.watch(source)
    for (let time = 0; time < 5; time++) {
      source.emit('background')
      source.emit('active')
    }
    await flushPromises()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
  })

  it('stops when told to', async () => {
    const { ota, clock } = setup()
    const source = appStateSource()
    const stop = ota.watch(source)
    expect(source.listeners()).toBe(1)
    stop()
    expect(source.removed()).toBe(1)
    expect(source.listeners()).toBe(0)
    clock.advance(OTA_CHECK_INTERVAL)
    source.emit('active')
    await flushPromises()
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
  })
})

describe('which bundle is running', () => {
  it('is read from the module as it is now, for the About screen', () => {
    updates.state.updateId = 'abc'
    updates.state.isEmbeddedLaunch = false
    const { ota } = setup()
    expect(ota.getRuntimeInfo()).toEqual({ enabled: true, updateId: 'abc', isEmbedded: false, channel: 'production', runtimeVersion: '2.0.0' })
    updates.state.updateId = 'def'
    expect(ota.getRuntimeInfo().updateId).toBe('def')
  })

  it('says so when updates are off or the bundle is the embedded one', () => {
    updates.state.isEnabled = false
    expect(runtimeInfo(updates)).toEqual({ enabled: false, updateId: null, isEmbedded: true, channel: 'production', runtimeVersion: '2.0.0' })
  })

  it('is told by runtimeInfo for any module', () => {
    expect(runtimeInfo(plainModule({ channel: null, runtimeVersion: null }))).toEqual({
      enabled: true,
      updateId: null,
      isEmbedded: true,
      channel: null,
      runtimeVersion: null,
    })
  })
})
