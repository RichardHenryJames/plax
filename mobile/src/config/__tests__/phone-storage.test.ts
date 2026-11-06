import { fakeClock } from '@/platform/clock'
import { storage } from '@/platform/storage'
import { fakeFetch, setVariant } from '@/test/helpers'
import { DEFAULT_APP_CONFIG, parseAppConfig } from '../app-config'
import { CONFIG_FILE_KEY, createAppConfigStore } from '../app-config-store'
import { createConfigPrompts } from '../config-prompts'
import { remembered } from '../remember'
import { NOW, SITE, configText, noticePart, site } from './helpers'

// The same engines on the phone's own storage (AsyncStorage, as the tests see it), not on the tests' stand-in.

describe('on the phone\'s own storage', () => {
  it('remembers values across starts', async () => {
    await remembered(storage, 'plax.phone-test', { count: 0, name: '' }).set({ count: 3, name: 'x' })
    const next = remembered(storage, 'plax.phone-test', { count: 0, name: '' })
    await next.load()
    expect(next.value).toEqual({ count: 3, name: 'x' })
  })

  it('keeps the website\'s file, and the next start has it at once', async () => {
    setVariant('preview')
    const file = configText('"features":{"ads":false}')
    fakeFetch({ [`${SITE}/app-config.json`]: { body: file } })
    const first = createAppConfigStore({ storage, clock: fakeClock(NOW), site })
    await first.load()
    expect(first.active()).toBe(DEFAULT_APP_CONFIG)
    expect(await first.refresh()).toBe('changed')
    expect(await storage.getItem(CONFIG_FILE_KEY)).toBe(file)
    const second = createAppConfigStore({ storage, clock: fakeClock(NOW), site })
    await second.load()
    expect(second.active().features.ads).toBe(false)
    expect(second.store.getState().origin).toBe('kept')
    // It does not ask again within three hours of the last answer.
    expect(await second.refresh()).toBe('skipped')
  })

  it('deletes a file kept that is no longer good', async () => {
    await storage.setItem(CONFIG_FILE_KEY, '{"schemaVersion":9}')
    const store = createAppConfigStore({ storage, clock: fakeClock(NOW), site })
    await store.load()
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
    expect(await storage.getItem(CONFIG_FILE_KEY)).toBeNull()
  })

  it('remembers a notice that was read, across starts', async () => {
    const config = parseAppConfig(configText(noticePart('n1', 'info')))?.config ?? DEFAULT_APP_CONFIG
    const first = createConfigPrompts({ storage, playBuild: true, installed: 20 })
    await first.load()
    const prompt = first.next(config, NOW)
    expect(prompt).not.toBeNull()
    await first.closed(prompt as NonNullable<typeof prompt>, true, NOW)
    const second = createConfigPrompts({ storage, playBuild: true, installed: 20 })
    await second.load()
    expect(second.next(config, NOW)).toBeNull()
  })
})
