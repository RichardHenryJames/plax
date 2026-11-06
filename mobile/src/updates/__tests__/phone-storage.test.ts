import { fakeClock } from '@/platform/clock'
import { storage } from '@/platform/storage'
import { HOUR } from '@/config/limits'
import type { UpdatesModule } from '../ota'
import { OTA_CHECK_INTERVAL, createOtaManager } from '../ota'
import { createUpdateManager, type UpdateHost } from '../update-manager'
import { NOW, RELEASE } from './helpers'

// The same engines on the phone's own storage (AsyncStorage, as the tests see it), not on the tests' stand-in.

const quiet: UpdateHost = { idle: () => true, offer: () => undefined, say: () => undefined, openListing: () => undefined }

describe('on the phone\'s own storage', () => {
  it('the update manager remembers when it looked and what the reader put off, across starts', async () => {
    const clock = fakeClock(NOW)
    let asked = 0
    const make = () =>
      createUpdateManager({
        storage,
        clock,
        feed: async () => {
          asked++
          return RELEASE
        },
        installed: 4,
        sdk: 36,
        openUrl: async () => true,
        looksForUpdates: () => true,
      })
    const offers: number[] = []
    const host: UpdateHost = { ...quiet, offer: (release) => void offers.push(release.versionCode) }
    const first = make()
    await first.attach(host)
    expect(offers).toEqual([RELEASE.versionCode])
    await first.dismiss(RELEASE)
    clock.advance(HOUR)
    const second = make()
    await second.attach(host)
    // Not asked again within the day, and the release that was put off an hour ago is not offered.
    expect(asked).toBe(1)
    expect(offers).toEqual([RELEASE.versionCode])
  })

  it('the over-the-air policy remembers when it looked, across starts', async () => {
    const clock = fakeClock(NOW)
    let looked = 0
    const updates: UpdatesModule = {
      isEnabled: true,
      channel: 'production',
      runtimeVersion: '2.0.0',
      updateId: null,
      isEmbeddedLaunch: true,
      checkForUpdateAsync: async () => {
        looked++
        return { isAvailable: false }
      },
      fetchUpdateAsync: async () => ({ isNew: false }),
      reloadAsync: async () => undefined,
    }
    await createOtaManager({ updates, clock, storage }).check()
    expect(looked).toBe(1)
    const next = createOtaManager({ updates, clock, storage })
    await next.check()
    expect(looked).toBe(1)
    clock.advance(OTA_CHECK_INTERVAL)
    await next.check()
    expect(looked).toBe(2)
  })
})
