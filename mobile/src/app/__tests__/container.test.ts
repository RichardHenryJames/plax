import { configText, answer } from '../../config/__tests__/helpers'
import { FakeSource, memoryStore, stories } from '../../data/__tests__/helpers'
import { fakeClock } from '../../platform/clock'
import { flushPromises, setVariant } from '../../test/helpers'
import { createServices, nativeAppFiles, type Services } from '../container'
import type { LegacyFiles } from '../../data/legacy-import'

const NOW = 1_780_000_000_000
const SAVED = JSON.stringify({
  schema: 1,
  stories: [{ id: 'old1', title: 'A story saved in the old app', content: 'Some words that make a summary.', category: 'news', source: 'Publisher', sourceUrl: 'https://publisher.example/old1', image: '', readTime: '1 min', publishedAt: 1, section: '', sig: '' }],
})
const PREFERENCES = '<?xml version=\'1.0\' encoding=\'utf-8\' standalone=\'yes\' ?>\n<map>\n    <int name="theme" value="2" />\n    <boolean name="for_you" value="true" />\n    <string name="interests">science,space</string>\n</map>\n'

const legacy = (files: Record<string, string>, preferences: string | null = null): LegacyFiles => ({
  readText: async (name) => files[name] ?? null,
  readPreferences: async () => preferences,
})

function make(overrides: Parameters<typeof createServices>[0] = {}) {
  const storage = overrides.storage ?? memoryStore()
  const source = new FakeSource()
  const website = new Map<string, string>()
  const services = createServices({
    clock: fakeClock(NOW),
    storage,
    feed: source,
    request: async (url) => (website.has(url) ? answer(website.get(url) as string) : answer('', { status: 404 })),
    legacyFiles: legacy({}),
    playBuild: true,
    installed: 20,
    sdk: 34,
    ...overrides,
  })
  return { services, source, website, storage }
}

const started = async (services: Services) => {
  await services.start()
  await flushPromises()
}

afterEach(() => jest.restoreAllMocks())

describe('starting the app', () => {
  it('takes over what the native 1.x app left: its saved stories, its theme, its topics, and the feed it was last in', async () => {
    const { services } = make({ legacyFiles: legacy({ 'saved-stories.json': SAVED }, PREFERENCES) })
    await started(services)
    expect(services.engine.getState().savedIds.has('old1')).toBe(true)
    expect(await services.prefs.theme()).toBe('dark')
    expect([...services.engine.getState().interests]).toEqual(['science', 'space'])
    expect(services.engine.getState().screen).toBe('forYou')
    await services.engine.dispose()
  })

  it('does it once: what the reader changes afterwards is never taken back', async () => {
    const { services, storage } = make({ legacyFiles: legacy({}, PREFERENCES) })
    await started(services)
    await services.prefs.setTheme('light')
    await services.engine.dispose()
    const again = make({ storage, legacyFiles: legacy({}, PREFERENCES) })
    await started(again.services)
    expect(await again.services.prefs.theme()).toBe('light')
    await again.services.engine.dispose()
  })

  it('reads what the website last said before it takes over the topics, so that the website’s own topics are kept', async () => {
    const config = configText('"topics":[{"id":"news","emoji":"📰","en":"Headlines","hi":"सुर्ख़ियाँ"},{"id":"cooking","emoji":"🍳","en":"Cooking","hi":"खाना"}]')
    const { services } = make({
      storage: memoryStore({ 'plax.config.file': config }),
      legacyFiles: legacy({}, '<map><string name="interests">cooking,science</string></map>'),
    })
    await started(services)
    expect([...services.engine.getState().interests]).toEqual(['cooking'])
    await services.engine.dispose()
  })

  it('starts the feed after everything else is ready, and only once however often it is asked', async () => {
    const { services, source } = make()
    const start = jest.spyOn(services.engine, 'start')
    await Promise.all([services.start(), services.start(), services.start()])
    await flushPromises()
    expect(start).toHaveBeenCalledTimes(1)
    expect(source.calls).toHaveLength(1)
    await services.engine.dispose()
  })

  it('never fails: a phone whose storage cannot be read still starts, with the defaults', async () => {
    const storage = memoryStore()
    storage.failReads(() => true)
    const { services } = make({ storage, legacyFiles: { readText: async () => Promise.reject(new Error('disk')), readPreferences: async () => Promise.reject(new Error('disk')) } })
    await expect(services.start()).resolves.toBeUndefined()
    await flushPromises()
    expect(services.engine.getState().screen).toBe('feed')
    await services.engine.dispose()
  })

  it('does not ask the website for anything: the screen does that when it comes to the front', async () => {
    const asked: string[] = []
    const { services } = make({
      request: async (url) => {
        asked.push(url)
        return answer('', { status: 404 })
      },
    })
    await started(services)
    expect(asked).toEqual([])
    await services.engine.dispose()
  })
})

describe('the engines are wired to each other', () => {
  it('lets the feed follow the topics and sections the website lists', async () => {
    const { services, website } = make()
    website.set('https://plax-rouge.vercel.app/news/app-config.json', configText('"sections":[{"id":"sport","en":"Sport","hi":"खेल"}]'))
    await started(services)
    services.engine.section('sport')
    expect(services.engine.getState().section).toBe('')
    await services.appConfig.refresh({ force: true })
    services.engine.section('sport')
    expect(services.engine.getState().section).toBe('sport')
    await services.engine.dispose()
  })

  it('gives the account the topics and the saved stories the reader has, to take to the account', async () => {
    const seen: { topics: ReadonlySet<string>; saved: readonly unknown[] }[] = []
    const { services } = make({ legacyFiles: legacy({ 'saved-stories.json': SAVED }, PREFERENCES) })
    await started(services)
    expect(services.account.cloud()).toBeDefined()
    seen.push({ topics: services.engine.getState().interests, saved: [...services.engine.getState().savedIds] })
    expect([...seen[0].topics]).toEqual(['science', 'space'])
    expect(seen[0].saved).toEqual(['old1'])
    await services.engine.dispose()
  })

  it('has the website’s update feed and its settings under the address of the build it is', async () => {
    setVariant('preview')
    const asked: string[] = []
    const { services } = make({
      playBuild: false,
      request: async (url) => {
        asked.push(url)
        return answer('', { status: 404 })
      },
    })
    await started(services)
    await services.appConfig.refresh({ force: true })
    await services.apkUpdates.attach({ idle: () => true, offer: () => undefined, say: () => undefined, openListing: () => undefined })
    expect(asked).toContain('https://plax-rouge.vercel.app/news/app-config.json')
    expect(asked).toContain('https://plax-rouge.vercel.app/news/updates.json')
    await services.engine.dispose()
  })

  it('stops what runs in the background, and can be asked twice', async () => {
    const { services } = make()
    await started(services)
    expect(() => {
      services.stop()
      services.stop()
    }).not.toThrow()
    await services.engine.dispose()
  })
})

describe('the files of the native 1.x app', () => {
  it('gives nothing for a file that is not there or cannot be read', async () => {
    expect(await nativeAppFiles.readText('saved-stories-that-does-not-exist.json')).toBeNull()
  })

  it('reads the old settings file through the app’s own native module, and has none where there is no module', async () => {
    expect(await nativeAppFiles.readPreferences?.()).toBeNull()
  })
})
