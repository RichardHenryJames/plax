import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HttpError, type RequestOptions } from '@/platform/http'
import { fakeClock } from '@/platform/clock'
import { E2E_SITE } from '@/build'
import { fakeFetch, flushPromises, setVariant } from '@/test/helpers'
import { DEFAULT_APP_CONFIG, MAX_CONFIG_BYTES, type AppConfig } from '../app-config'
import {
  CONFIG_CHECK_INTERVAL,
  CONFIG_FILE_KEY,
  CONFIG_RETRY_INTERVAL,
  configDue,
  createAppConfigStore,
  type AppConfigStore,
} from '../app-config-store'
import type { RequestFn } from '../site-file'
import { NOW, SITE, answer, configText, deferred, memoryStorage, site, type MemoryStorage } from './helpers'

const ADS_OFF = configText('"features":{"ads":false}')
const DEEPER_OFF = configText('"features":{"deeper":false}')

type Reply = string | Error | ReturnType<typeof answer>

/** A store whose website is under the test's control: what it answers, how often it was asked and what it was asked. */
function setup(options: { kept?: string; reply?: Reply; storage?: MemoryStorage; clock?: ReturnType<typeof fakeClock> } = {}) {
  const storage = options.storage ?? memoryStorage(options.kept === undefined ? {} : { [CONFIG_FILE_KEY]: options.kept })
  const clock = options.clock ?? fakeClock(NOW)
  const asked: { url: string; options: RequestOptions | undefined }[] = []
  let reply: Reply = options.reply ?? ADS_OFF
  const request: RequestFn = async (url, requestOptions) => {
    asked.push({ url, options: requestOptions })
    if (reply instanceof Error) throw reply
    return typeof reply === 'string' ? answer(reply) : reply
  }
  const store = createAppConfigStore({ request, storage, clock, site })
  return {
    store,
    storage,
    clock,
    asked,
    /** Starts listening, as a screen does; returns what the listener is told, in order. */
    listen() {
      const told: AppConfig[] = []
      store.subscribe((config) => told.push(config))
      return told
    },
    answerWith(next: Reply) {
      reply = next
    },
  }
}

const memoryOf = (storage: MemoryStorage, name: 'attempted' | 'succeeded') => Number(storage.data.get(`plax.config.${name}`) ?? 0)

describe('what is in force', () => {
  it('is the built-in configuration when nothing is kept', async () => {
    const { store, storage } = setup()
    await store.load()
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
    expect(store.store.getState().origin).toBe('built-in')
    expect(storage.removed).toEqual([])
  })

  it('is the built-in configuration before the file kept has been read', () => {
    const { store } = setup({ kept: ADS_OFF })
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
  })

  it('is the file kept from last time, from the start', async () => {
    const { store } = setup({ kept: ADS_OFF })
    await store.load()
    expect(store.active().features.ads).toBe(false)
    expect(store.active().features.deeper).toBe(true)
    expect(store.store.getState().origin).toBe('kept')
  })

  it('tells a listener that was already there when the file kept has been read, and one that comes later nothing', async () => {
    const early = setup({ kept: ADS_OFF })
    const toldEarly = early.listen()
    await early.store.load()
    expect(toldEarly).toEqual([early.store.active()])
    const late = setup({ kept: ADS_OFF })
    await late.store.load()
    expect(late.listen()).toEqual([])
  })

  it('deletes a file kept that is no longer good, and the built-in values stay', async () => {
    const { store, storage } = setup({ kept: '{"schemaVersion":9}' })
    await store.load()
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
    expect(storage.data.has(CONFIG_FILE_KEY)).toBe(false)
    expect(storage.removed).toEqual([CONFIG_FILE_KEY])
  })

  it('keeps a file it could not read, and the built-in values stay', async () => {
    const storage = memoryStorage({ [CONFIG_FILE_KEY]: ADS_OFF })
    storage.failReads = true
    const { store } = setup({ storage })
    await store.load()
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
    expect(storage.removed).toEqual([])
    expect(storage.data.get(CONFIG_FILE_KEY)).toBe(ADS_OFF)
  })

  it('survives a file kept that cannot be deleted', async () => {
    const storage = memoryStorage({ [CONFIG_FILE_KEY]: 'not json' })
    storage.failRemoves = true
    const { store } = setup({ storage })
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
  })

  it('reads the file kept once, however often it is asked to', async () => {
    const storage = memoryStorage({ [CONFIG_FILE_KEY]: ADS_OFF })
    const reads = jest.spyOn(storage, 'getItem')
    const { store } = setup({ storage })
    await Promise.all([store.load(), store.load()])
    await store.load()
    expect(reads.mock.calls.filter(([key]) => key === CONFIG_FILE_KEY)).toHaveLength(1)
  })

  it('can be forced to a configuration, and back to the built-in one, for a test', () => {
    const { store } = setup()
    const other: AppConfig = { ...DEFAULT_APP_CONFIG, adPageEvery: 9 }
    store.force(other)
    expect(store.active()).toBe(other)
    store.force(null)
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
    expect(store.store.getState().origin).toBe('built-in')
  })
})

describe('asking the website', () => {
  it('takes a file it sends, keeps it, puts it in force and announces it', async () => {
    const { store, storage, asked, listen, clock } = setup()
    await store.load()
    const told = listen()
    const result = await store.refresh()
    expect(result).toBe('changed')
    expect(asked).toHaveLength(1)
    expect(store.active().features.ads).toBe(false)
    expect(told).toHaveLength(1)
    expect(told[0]).toBe(store.active())
    expect(storage.data.get(CONFIG_FILE_KEY)).toBe(ADS_OFF)
    expect(store.store.getState().origin).toBe('website')
    expect(memoryOf(storage, 'attempted')).toBe(clock())
    expect(memoryOf(storage, 'succeeded')).toBe(clock())
  })

  it('asks the website\'s file at the address of this build, and sends nothing about the reader', async () => {
    const { store, asked } = setup()
    await store.refresh()
    expect(asked).toHaveLength(1)
    expect(asked[0].url).toBe(`${SITE}/app-config.json`)
    const options = asked[0].options as RequestOptions
    expect(options.method).toBeUndefined()
    expect(options.body).toBeUndefined()
    expect(options.headers).toEqual({ Accept: 'application/json', 'Cache-Control': 'no-store' })
    expect(options.timeoutMs).toBe(8000)
    expect(options.maxChars).toBe(MAX_CONFIG_BYTES)
  })

  it('does not write a file that says nothing new, nor announce it, but counts the answer', async () => {
    const { store, storage, listen, clock } = setup({ kept: ADS_OFF })
    await store.load()
    const told = listen()
    const result = await store.refresh({ force: true })
    expect(result).toBe('unchanged')
    expect(storage.writes.filter((key) => key === CONFIG_FILE_KEY)).toEqual([])
    expect(told).toEqual([])
    expect(memoryOf(storage, 'succeeded')).toBe(clock())
  })

  it('announces a changed file once, and what the website says now replaces what it said', async () => {
    const { store, storage, listen, answerWith } = setup()
    const told = listen()
    await store.refresh({ force: true })
    answerWith(DEEPER_OFF)
    await store.refresh({ force: true })
    expect(told).toHaveLength(2)
    expect(store.active().features.ads).toBe(true)
    expect(store.active().features.deeper).toBe(false)
    expect(storage.writes.filter((key) => key === CONFIG_FILE_KEY)).toHaveLength(2)
    expect(storage.data.get(CONFIG_FILE_KEY)).toBe(DEEPER_OFF)
  })

  it('takes the file kept when it is asked before anything has loaded it', async () => {
    const { store, listen } = setup({ kept: ADS_OFF, reply: ADS_OFF })
    const told = listen()
    expect(await store.refresh({ force: true })).toBe('unchanged')
    expect(store.active().features.ads).toBe(false)
    // Told once: of the file kept, which was read first. The same file from the website says nothing new.
    expect(told).toHaveLength(1)
  })

  it('tells the screens through its store, when what is in force changes', async () => {
    const { store, answerWith } = setup()
    const seen: boolean[] = []
    store.store.subscribe(() => seen.push(store.store.getState().config.features.ads))
    await store.refresh({ force: true })
    answerWith(DEEPER_OFF)
    await store.refresh({ force: true })
    expect(seen).toEqual([false, true])
  })

  it.each([
    ['the website is offline', new HttpError('network')],
    ['it is too slow', new HttpError('timeout')],
    ['the answer is too long', new HttpError('too-large', 200)],
    ['the address is refused', new HttpError('insecure')],
    ['something unexpected is thrown', new TypeError('anything')],
  ])('changes nothing when %s', async (_name, failure) => {
    const { store, storage, listen, answerWith, clock } = setup({ kept: ADS_OFF })
    await store.load()
    const told = listen()
    answerWith(failure)
    await expect(store.refresh({ force: true })).resolves.toBe('failed')
    expect(store.active().features.ads).toBe(false)
    expect(storage.data.get(CONFIG_FILE_KEY)).toBe(ADS_OFF)
    expect(told).toEqual([])
    expect(memoryOf(storage, 'succeeded')).toBe(0)
    expect(memoryOf(storage, 'attempted')).toBe(clock())
  })

  it('changes nothing for an answer that is not a usable file', async () => {
    const { store, storage, listen, answerWith, clock } = setup({ kept: ADS_OFF })
    await store.load()
    const told = listen()
    for (const bad of ['{"schemaVersion":2}', 'not json', '', configText('"features":{"ads":false}') + ' trailing', '[]', 'null']) {
      answerWith(bad)
      clock.advance(CONFIG_CHECK_INTERVAL)
      expect(await store.refresh()).toBe('failed')
      expect(store.active().features.ads).toBe(false)
      expect(storage.data.get(CONFIG_FILE_KEY)).toBe(ADS_OFF)
    }
    expect(told).toEqual([])
    expect(memoryOf(storage, 'succeeded')).toBe(0)
  })

  it('refuses an answer that is not status 200, whatever it holds', async () => {
    const { store, storage, answerWith } = setup()
    for (const status of [201, 204, 301, 302, 304, 401, 404, 429, 500, 503]) {
      answerWith(answer(ADS_OFF, { status }))
      expect(await store.refresh({ force: true })).toBe('failed')
    }
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
    expect(storage.data.has(CONFIG_FILE_KEY)).toBe(false)
  })

  it('refuses an answer that is not JSON', async () => {
    const { store, answerWith } = setup()
    for (const type of ['text/html', 'text/plain', 'application/octet-stream', 'application/xml', 'application/jsonp', 'image/png', 'json', '', null]) {
      answerWith(answer(ADS_OFF, { type }))
      expect(await store.refresh({ force: true })).toBe('failed')
    }
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
  })

  it('takes the usual forms of the JSON type', async () => {
    for (const type of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', 'application/json;charset=UTF-8']) {
      const { store, answerWith } = setup()
      answerWith(answer(ADS_OFF, { type }))
      expect(await store.refresh({ force: true })).toBe('changed')
    }
  })

  it('refuses an answer longer than the limit, counted in bytes', async () => {
    const { store, answerWith } = setup()
    const padded = (length: number) => ADS_OFF.padEnd(length, ' ')
    answerWith(answer(padded(MAX_CONFIG_BYTES + 1)))
    expect(await store.refresh({ force: true })).toBe('failed')
    answerWith(answer(padded(MAX_CONFIG_BYTES)))
    expect(await store.refresh({ force: true })).toBe('changed')
    // Fewer characters than the limit, more bytes than it.
    const hindi = `{"schemaVersion":1,"x":"${'\u0915'.repeat(5500)}"}`
    expect(hindi.length).toBeLessThan(MAX_CONFIG_BYTES)
    answerWith(answer(hindi))
    expect(await store.refresh({ force: true })).toBe('failed')
  })

  it('still has a file in force for now when it could not be written', async () => {
    const storage = memoryStorage()
    storage.failWrites = true
    const { store, listen } = setup({ storage })
    const told = listen()
    expect(await store.refresh({ force: true })).toBe('changed')
    expect(store.active().features.ads).toBe(false)
    expect(told).toHaveLength(1)
    expect(storage.data.has(CONFIG_FILE_KEY)).toBe(false)
  })

  it('is asked at most every three hours, and a failed ask is not repeated for half an hour', async () => {
    const { store, asked, clock, answerWith } = setup()
    await store.refresh()
    expect(asked).toHaveLength(1)
    clock.advance(CONFIG_CHECK_INTERVAL - 1)
    expect(await store.refresh()).toBe('skipped')
    expect(asked).toHaveLength(1)
    clock.advance(1)
    answerWith(new HttpError('network'))
    await store.refresh()
    expect(asked).toHaveLength(2)
    clock.advance(CONFIG_RETRY_INTERVAL - 1)
    expect(await store.refresh()).toBe('skipped')
    expect(asked).toHaveLength(2)
    clock.advance(1)
    await store.refresh()
    expect(asked).toHaveLength(3)
  })

  it('is asked again at once by the reader or the owner, with force', async () => {
    const { store, asked } = setup()
    await store.refresh()
    await store.refresh({ force: true })
    expect(asked).toHaveLength(2)
  })

  it('counts an ask when it starts, so that a slow one is not asked twice', async () => {
    const reply = deferred<ReturnType<typeof answer>>()
    const storage = memoryStorage()
    const clock = fakeClock(NOW)
    let calls = 0
    const store = createAppConfigStore({
      request: () => {
        calls++
        return reply.promise
      },
      storage,
      clock,
      site,
    })
    const first = store.refresh()
    await flushPromises()
    expect(memoryOf(storage, 'attempted')).toBe(NOW)
    expect(calls).toBe(1)
    reply.resolve(answer(ADS_OFF))
    await first
  })

  it('does not run two asks at the same time', async () => {
    const reply = deferred<ReturnType<typeof answer>>()
    let calls = 0
    const store = createAppConfigStore({
      request: () => {
        calls++
        return reply.promise
      },
      storage: memoryStorage(),
      clock: fakeClock(NOW),
      site,
    })
    const first = store.refresh({ force: true })
    const results = await Promise.all([store.refresh({ force: true }), store.refresh({ force: true })])
    expect(results).toEqual(['busy', 'busy'])
    expect(calls).toBeLessThanOrEqual(1)
    reply.resolve(answer(ADS_OFF))
    expect(await first).toBe('changed')
    expect(calls).toBe(1)
    // And once it has answered, another may start.
    expect(await store.refresh({ force: true })).toBe('unchanged')
    expect(calls).toBe(2)
  })

  it('does not stay busy after a failure', async () => {
    const { store, answerWith, asked } = setup()
    answerWith(new Error('boom'))
    expect(await store.refresh({ force: true })).toBe('failed')
    answerWith(ADS_OFF)
    expect(await store.refresh({ force: true })).toBe('changed')
    expect(asked).toHaveLength(2)
  })

  it('remembers when it asked, so that the next start does not ask again at once', async () => {
    const first = setup()
    await first.store.refresh()
    expect(first.asked).toHaveLength(1)
    const second = setup({ storage: first.storage, clock: first.clock })
    await second.store.load()
    // The file kept is in force from the start, and the website is not asked again within three hours.
    expect(second.store.active().features.ads).toBe(false)
    expect(await second.store.refresh()).toBe('skipped')
    expect(second.asked).toHaveLength(0)
    first.clock.advance(CONFIG_CHECK_INTERVAL)
    expect(await second.store.refresh()).toBe('unchanged')
    expect(second.asked).toHaveLength(1)
  })

  it('asks when the times kept are not numbers', async () => {
    const storage = memoryStorage({ 'plax.config.attempted': 'soon', 'plax.config.succeeded': '' })
    const { store, asked } = setup({ storage })
    await store.refresh()
    expect(asked).toHaveLength(1)
  })

  it('does not tell a listener that has left', async () => {
    const { store, listen } = setup()
    const told = listen()
    const other: AppConfig[] = []
    const stop = store.subscribe((config) => other.push(config))
    stop()
    await store.refresh({ force: true })
    expect(other).toEqual([])
    expect(told).toHaveLength(1)
  })

  it('asks the address of the test build over plain http, and the other builds only over https', async () => {
    setVariant('e2e')
    const { calls } = fakeFetch({ [`${E2E_SITE}/app-config.json`]: { body: ADS_OFF } })
    const test = createAppConfigStore({ storage: memoryStorage(), clock: fakeClock(NOW), site: () => E2E_SITE })
    expect(await test.refresh({ force: true })).toBe('changed')
    expect(calls.map((call) => call.url)).toEqual([`${E2E_SITE}/app-config.json`])
    setVariant('play')
    const real = fakeFetch({})
    const refused = createAppConfigStore({ storage: memoryStorage(), clock: fakeClock(NOW), site: () => E2E_SITE })
    expect(await refused.refresh({ force: true })).toBe('failed')
    expect(real.fetch).not.toHaveBeenCalled()
  })

  it('works through the real request: a file, JSON, no cookie or identifier sent', async () => {
    setVariant('preview')
    const { calls } = fakeFetch({ [`${SITE}/app-config.json`]: { body: ADS_OFF } })
    const store = createAppConfigStore({ storage: memoryStorage(), clock: fakeClock(NOW), site })
    expect(await store.refresh()).toBe('changed')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ url: `${SITE}/app-config.json`, method: 'GET', body: undefined })
    expect(calls[0].headers).toEqual({ Accept: 'application/json', 'Cache-Control': 'no-store' })
  })

  it('refuses a real answer that is too long, and one that is not JSON', async () => {
    setVariant('preview')
    fakeFetch({ [`${SITE}/app-config.json`]: { body: ADS_OFF.padEnd(MAX_CONFIG_BYTES + 1, ' ') } })
    const store = createAppConfigStore({ storage: memoryStorage(), clock: fakeClock(NOW), site })
    expect(await store.refresh({ force: true })).toBe('failed')
    fakeFetch({ [`${SITE}/app-config.json`]: { body: ADS_OFF, headers: { 'content-type': 'text/html' } } })
    expect(await store.refresh({ force: true })).toBe('failed')
    fakeFetch({ [`${SITE}/app-config.json`]: { networkError: true } })
    expect(await store.refresh({ force: true })).toBe('failed')
    expect(store.active()).toBe(DEFAULT_APP_CONFIG)
  })
})

describe('the file the website publishes', () => {
  const published = readFileSync(join(__dirname, '..', '..', '..', '..', 'public', 'app-config.json'), 'utf8')

  it('is taken whole as the website serves it, kept as it was received, and says nothing new the second time', async () => {
    setVariant('preview')
    fakeFetch({ [`${SITE}/app-config.json`]: { body: published, headers: { 'content-type': 'application/json; charset=utf-8' } } })
    const storage = memoryStorage()
    const store = createAppConfigStore({ storage, clock: fakeClock(NOW), site })
    expect(await store.refresh()).toBe('changed')
    expect(store.active()).toEqual(DEFAULT_APP_CONFIG)
    expect(storage.data.get(CONFIG_FILE_KEY)).toBe(published)
    expect(await store.refresh({ force: true })).toBe('unchanged')
    // And the next start has it at once.
    const next = createAppConfigStore({ storage, clock: fakeClock(NOW), site })
    await next.load()
    expect(next.store.getState().origin).toBe('kept')
    expect(next.active()).toEqual(DEFAULT_APP_CONFIG)
  })
})

describe('configDue', () => {
  it('lets a clock that went backwards ask again', () => {
    expect(configDue(1_000, 5_000, 5_000)).toBe(true)
    expect(configDue(1_000, 0, 0)).toBe(true)
  })

  it('does not ask when the website answered a minute ago, or not yet three hours ago', () => {
    expect(configDue(60_000, 0, 1)).toBe(false)
    expect(configDue(CONFIG_CHECK_INTERVAL - 1, 0, 1)).toBe(false)
    expect(configDue(CONFIG_CHECK_INTERVAL + 1, 0, 1)).toBe(true)
  })

  it('does not ask within half an hour of the last ask, whatever the last answer', () => {
    const asked = 1_000_000
    expect(configDue(asked + CONFIG_RETRY_INTERVAL - 1, asked, 0)).toBe(false)
    expect(configDue(asked + CONFIG_RETRY_INTERVAL, asked, 0)).toBe(true)
  })

  it('asks three hours after the last answer and half an hour after the last ask, never before either', () => {
    const answered = 1_000_000
    expect(configDue(answered + CONFIG_CHECK_INTERVAL, answered, answered)).toBe(true)
    expect(configDue(answered + CONFIG_CHECK_INTERVAL, answered + CONFIG_CHECK_INTERVAL - 1, answered)).toBe(false)
    expect(configDue(answered + CONFIG_CHECK_INTERVAL + CONFIG_RETRY_INTERVAL, answered + CONFIG_CHECK_INTERVAL, answered)).toBe(true)
  })
})

describe('an app-wide store as the screens use it', () => {
  it('has a store a screen can read the configuration from', async () => {
    const { store } = setup()
    const reading: AppConfigStore['store'] = store.store
    expect(reading.getState().config).toBe(DEFAULT_APP_CONFIG)
    await store.refresh({ force: true })
    expect(reading.getState().config.features.ads).toBe(false)
  })
})
