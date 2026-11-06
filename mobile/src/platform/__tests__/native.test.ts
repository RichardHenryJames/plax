import { confirm, readLegacyPreferences, tick } from '../native'

jest.mock('expo', () => ({
  requireOptionalNativeModule: () => (globalThis as { __plaxNative?: unknown }).__plaxNative ?? null,
}))

const provide = (module: unknown) => {
  ;(globalThis as { __plaxNative?: unknown }).__plaxNative = module
}

afterEach(() => provide(undefined))

describe('the app’s own native module', () => {
  it('reads the native app’s settings file', async () => {
    provide({ readLegacyPreferences: jest.fn(async () => '<map><int name="theme" value="2" /></map>') })
    expect(await readLegacyPreferences()).toBe('<map><int name="theme" value="2" /></map>')
  })

  it('has no settings to give when the file is not there, when the call fails, or when the module is not part of the build', async () => {
    provide({ readLegacyPreferences: jest.fn(async () => null) })
    expect(await readLegacyPreferences()).toBeNull()
    provide({
      readLegacyPreferences: jest.fn(async () => {
        throw new Error('denied')
      }),
    })
    expect(await readLegacyPreferences()).toBeNull()
    provide(undefined)
    expect(await readLegacyPreferences()).toBeNull()
  })

  it('ticks and confirms through the module', () => {
    const module = { tick: jest.fn(), confirm: jest.fn() }
    provide(module)
    tick()
    tick()
    confirm()
    expect(module.tick).toHaveBeenCalledTimes(2)
    expect(module.confirm).toHaveBeenCalledTimes(1)
  })

  it('never throws for feedback: a phone that cannot tick just does not', () => {
    provide({
      tick: () => {
        throw new Error('no vibrator')
      },
      confirm: () => {
        throw new Error('no vibrator')
      },
    })
    expect(() => tick()).not.toThrow()
    expect(() => confirm()).not.toThrow()
    provide(undefined)
    expect(() => tick()).not.toThrow()
    expect(() => confirm()).not.toThrow()
  })
})
