import type { Lang } from '../../i18n'
import { fakeClock } from '../../platform/clock'
import type { KeyValueStore } from '../../platform/storage'
import { flushPromises } from '../../test/helpers'
import { NO_CLOUD, type Cloud, type CloudSink } from '../cloud'
import { FeedLoadError, type FeedRequest, type FeedSource } from '../feed-api'
import { FeedCache } from '../feed-cache'
import { FeedEngine, type FeedState } from '../feed-engine'
import { writeInterests } from '../interests'
import { Prefs } from '../prefs'
import { SavedStories } from '../saved-stories'
import { SeenFile } from '../seen-file'
import { SeenStore } from '../seen-store'
import { isCaughtUp, makeStory, type Story } from '../story'
import { BUILT_IN_TOPICS, type Topic } from '../topic'

export const HOUR = 3_600_000
export const PUBLISHED = 1_780_000_000_000

export function story(id: string, title: string = `Headline ${id}`, published: number = PUBLISHED, extra: Partial<Story> = {}): Story {
  return makeStory({
    id,
    title,
    content: `A short body for ${id} with enough words.`,
    category: 'news',
    source: 'Publisher',
    sourceUrl: `https://example.com/${id}`,
    readTime: '1 min',
    publishedAt: published,
    ...extra,
  })
}

/** Stories named prefix1 ... prefixN. Their headlines share no distinctive words, so none counts as another's event. */
export function stories(prefix: string, count: number): Story[] {
  return Array.from({ length: count }, (_unused, index) => story(`${prefix}${index + 1}`))
}

export const ids = (list: readonly Story[]): string[] => list.map((item) => item.id)

/** Five words that no other index shares, so that unrelated test stories never count as one event (DuplicatesTest.headline). */
export function headline(index: number): string {
  return Array.from({ length: 5 }, (_unused, part) => `${(index * 7919 + (part + 1) * 104729).toString(36)}q`).join(' ')
}

export interface MemoryStore extends KeyValueStore {
  readonly data: Map<string, string>
  /** Every key written, in order. */
  readonly writes: string[]
  /** Reads of the keys that match fail, as a store that cannot be read does. */
  failReads(match: (key: string) => boolean): void
  /** Writes (and removals) of the keys that match fail, as a store with no room does. */
  failWrites(match: (key: string) => boolean): void
  /** Reads and writes of the keys that match wait until the returned function is called, as a slow phone does. */
  gate(match: (key: string) => boolean): () => void
  /** Everything works again. */
  heal(): void
}

export function memoryStore(initial: Record<string, string> = {}): MemoryStore {
  const data = new Map(Object.entries(initial))
  const writes: string[] = []
  const gates: { match: (key: string) => boolean; open: Promise<void> }[] = []
  let reads: (key: string) => boolean = () => false
  let blocked: (key: string) => boolean = () => false
  const waitFor = (key: string) => Promise.all(gates.filter((gate) => gate.match(key)).map((gate) => gate.open))
  return {
    data,
    writes,
    failReads: (match) => {
      reads = match
    },
    failWrites: (match) => {
      blocked = match
    },
    gate: (match) => {
      let release: () => void = () => undefined
      gates.push({ match, open: new Promise<void>((resolve) => (release = resolve)) })
      return () => release()
    },
    heal: () => {
      reads = () => false
      blocked = () => false
    },
    async getItem(key) {
      await waitFor(key)
      if (reads(key)) throw new Error('unreadable')
      return data.has(key) ? (data.get(key) as string) : null
    },
    async setItem(key, value) {
      await waitFor(key)
      if (blocked(key)) throw new Error('no room')
      writes.push(key)
      data.set(key, value)
    },
    async removeItem(key) {
      await waitFor(key)
      if (blocked(key)) throw new Error('no room')
      data.delete(key)
    },
  }
}

/** The account's side of the feed, which records what the feed tells it and can tell the feed what the account holds. */
export class FakeCloud implements Cloud {
  readonly saves: { story: Story; added: boolean }[] = []
  readonly interestChoices: ReadonlySet<string>[] = []
  readonly listening: (CloudSink | null)[] = []
  sink: CloudSink | null = null

  saved(story: Story, added: boolean): void {
    this.saves.push({ story, added })
  }

  interests(topics: ReadonlySet<string>): void {
    this.interestChoices.push(topics)
  }

  listen(sink: CloudSink | null): void {
    this.sink = sink
    this.listening.push(sink)
  }
}

export interface PendingLoad {
  readonly request: FeedRequest
  readonly signal: AbortSignal | undefined
  /** The engine gave this request up. */
  readonly cancelled: boolean
  resolve(page: Story[]): void
  fail(key: FeedLoadError['key']): void
}

/** A feed the test answers by hand, request by request, like FeedFlowTest's FakeSource. */
export class FakeSource implements FeedSource {
  readonly calls: PendingLoad[] = []

  load(request: FeedRequest, signal?: AbortSignal): Promise<Story[]> {
    return new Promise<Story[]>((resolve, reject) => {
      this.calls.push({
        request,
        signal,
        get cancelled() {
          return signal?.aborted === true
        },
        resolve,
        fail: (key) => reject(new FeedLoadError(key)),
      })
    })
  }

  get last(): PendingLoad {
    return this.calls[this.calls.length - 1]
  }
}

/** Timers a test moves by hand. */
export function fakeTimers() {
  let now = 0
  let next = 1
  const timers = new Map<number, { at: number; callback: () => void }>()
  return {
    setTimer: (callback: () => void, ms: number): unknown => {
      const id = next++
      timers.set(id, { at: now + ms, callback })
      return id
    },
    clearTimer: (handle: unknown): void => {
      timers.delete(handle as number)
    },
    advance(ms: number): void {
      const until = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
        if (due === undefined) break
        now = Math.max(now, due[1].at)
        timers.delete(due[0])
        due[1].callback()
      }
      now = until
    },
    get pending(): number {
      return timers.size
    },
  }
}

export interface RigOptions {
  store?: MemoryStore
  clock?: ReturnType<typeof fakeClock>
  /** Pages in the cache, by their key: { 'news-en': stories } */
  cache?: Record<string, Story[]>
  /** Stories the reader has seen already. */
  seen?: Story[]
  saved?: Story[]
  interests?: string[]
  forYou?: boolean
  language?: Lang
  topics?: readonly Topic[]
  cloud?: Cloud
  hasSection?: (id: string) => boolean
  /** Nothing counts as read unless a test lowers these, so stories never vanish by accident. */
  dwellMs?: number
  glanceMs?: number
  /** Leaves the engine unstarted. */
  unstarted?: boolean
}

export interface Rig {
  engine: FeedEngine
  source: FakeSource
  store: MemoryStore
  clock: ReturnType<typeof fakeClock>
  timers: ReturnType<typeof fakeTimers>
  errors: unknown[]
  options: RigOptions
  state(): FeedState
  /** The stories on the pager, without the caught-up card. */
  real(): Story[]
  /** Lets everything that can run, run. */
  settle(): Promise<void>
  /** Time passes: the clock and the timers move, and what is due runs. */
  pass(ms: number): Promise<void>
  /** Answers the last request with a first page and waits for it to be shown. */
  loadFirstPage(page: Story[]): Promise<void>
  /** Ends this engine the way leaving the app for good does, and starts another on the same phone. */
  relaunch(): Promise<Rig>
}

const rigs: Rig[] = []

/** What a test that made an engine checks at its end: nothing inside the engine failed. */
export function engineErrors(): unknown[] {
  return rigs.splice(0).flatMap((rig) => rig.errors)
}

export async function makeRig(options: RigOptions = {}): Promise<Rig> {
  const store = options.store ?? memoryStore()
  const clock = options.clock ?? fakeClock()
  const topics = options.topics ?? BUILT_IN_TOPICS
  const source = new FakeSource()
  const timers = fakeTimers()
  const errors: unknown[] = []

  const cache = new FeedCache(store, clock)
  for (const [key, page] of Object.entries(options.cache ?? {})) await cache.write(key, page)
  if (options.seen !== undefined) {
    const seen = new SeenStore()
    for (const item of options.seen) seen.mark(item, clock())
    await new SeenFile(store).write(seen)
  }
  if (options.saved !== undefined) await new SavedStories(store).write(options.saved)
  if (options.interests !== undefined) await writeInterests(store, options.interests, topics)
  if (options.forYou !== undefined) await new Prefs(store).setForYou(options.forYou)
  if (options.language !== undefined) await new Prefs(store).setLanguage(options.language)

  const engine = new FeedEngine({
    source,
    storage: store,
    clock,
    cloud: options.cloud ?? NO_CLOUD,
    topics: () => topics,
    hasSection: options.hasSection,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    lang: 'en',
    dwellMs: options.dwellMs ?? 600_000,
    glanceMs: options.glanceMs ?? 600_000,
    onError: (error) => errors.push(error),
  })

  const rig: Rig = {
    engine,
    source,
    store,
    clock,
    timers,
    errors,
    options,
    state: () => engine.getState(),
    real: () => engine.getState().stories.filter((item) => !isCaughtUp(item)),
    settle: () => flushPromises(),
    async pass(ms) {
      clock.advance(ms)
      timers.advance(ms)
      await flushPromises()
    },
    async loadFirstPage(page) {
      await flushPromises()
      source.last.resolve(page)
      await flushPromises()
    },
    async relaunch() {
      engine.background()
      await engine.dispose()
      return makeRig({ ...options, store, clock, cache: undefined, seen: undefined, saved: undefined, interests: undefined, forYou: undefined, language: undefined })
    },
  }
  rigs.push(rig)
  if (!options.unstarted) {
    await engine.start()
    await flushPromises()
  }
  return rig
}
