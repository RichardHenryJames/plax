import type { Lang, StringKey } from '../i18n'
import { isLang } from '../i18n'
import type { Clock } from '../platform/clock'
import type { KeyValueStore } from '../platform/storage'
import { createStore, type Store } from '../state/store'
import { NO_CLOUD, type Cloud, type CloudSink } from './cloud'
import { FeedLoadError, type FeedRequest, type FeedSource } from './feed-api'
import { FeedCache, categoriesCacheKey, entryAge, topicCacheKey } from './feed-cache'
import { EARLIER_LIMIT, appendPage, replacePage, type MergeResult } from './feed-merge'
import { isStorable } from './feed-parser'
import { Session } from './feed-session'
import { categories as joinCategories, readInterests, sameInterests, sanitize, writeInterests } from './interests'
import { detectLanguage } from './language'
import { Lru } from './lru'
import { Prefs } from './prefs'
import { SAVED_LIMIT, SavedStories } from './saved-stories'
import { SeenFile } from './seen-file'
import { SeenStore } from './seen-store'
import { SerialQueue } from './serial-queue'
import { isAd, isCaughtUp, type Story } from './story'
import { NEWS_TOPIC, type Topic } from './topic'

/**
 * The state of the reader's screens, and the rules that keep it: which stories the feed shows and in what order, what has been seen,
 * what is saved, what is asked of the server and when. Stories are drawn from memory or the on-device cache first and refreshed in
 * the background, so a topic or language the reader has seen is never a spinner. Stories the reader has already looked at are
 * withheld, so opening the app again shows what is new, not a replay. A port of FeedViewModel.java of the native app (1.7.1).
 *
 * A screen draws from `store` (useStore(engine.store, selector)) and calls the actions; it needs nothing else. The engine never holds
 * the full-page ads: the pager's list is made from `state.stories` with the ads put in, so that an ad is never read, saved or shared.
 */

export type Screen = 'feed' | 'forYou' | 'topics' | 'saved'

export interface FeedState {
  readonly screen: Screen
  readonly topic: Topic
  readonly lang: Lang
  /** The section the news is narrowed to, or '' for all. */
  readonly section: string
  /** What the pager shows: in a feed it ends with the caught-up card when there is nothing newer; on Saved it is the saved stories. */
  readonly stories: readonly Story[]
  readonly savedIds: ReadonlySet<string>
  readonly loading: boolean
  /** Stories are shown while newer ones are looked for. */
  readonly refreshing: boolean
  readonly saving: boolean
  /** The saved stories have been read, so that they can be changed. */
  readonly storageReady: boolean
  /** The server has no older stories to give this feed. */
  readonly exhausted: boolean
  /** Newer stories were found while the reader read: offer "New stories", which applyFresh() takes. */
  readonly fresh: boolean
  /** Why stories could not be loaded: network_error, rate_error, service_error or invalid_feed. A screen with stories shows network_error as offline_cached. */
  readonly feedError: StringKey | null
  /** Why the saved stories could not be read (storage_error) or changed (save_error). */
  readonly storageError: StringKey | null
  /** Something to tell the reader once (saved_notice, removed_notice, saved_limit, no_new_stories); acknowledgeNotice() clears it. */
  readonly notice: StringKey | null
  /** Where the reader was when this state was published. Paging does not publish: engine.currentPosition() is the live one. */
  readonly position: number
  /** How many stories the reader has seen and can go back over after the caught-up card. */
  readonly earlier: number
  /** The topics the reader chose for For you. */
  readonly interests: ReadonlySet<string>
  /** The first screen is decided: cached stories are drawn, or the cache and the network have answered. The splash screen waits for it. */
  readonly ready: boolean
}

export interface FeedEngineOptions {
  source: FeedSource
  /** The phone's plain storage: the saved stories, the history, the cache and the settings are kept in it. */
  storage: KeyValueStore
  clock: Clock
  /** The time of a clock that never jumps (performance.now()), for how long a story has been on screen. Default: `clock`. */
  uptime?: Clock
  /** The account's side of the feed. Default: nobody is signed in. See also setCloud(). */
  cloud?: Cloud
  /** The topics the reader is offered now (the website's list, or the built-in one). */
  topics: () => readonly Topic[]
  /** Whether this is a section the news can be narrowed to. Default: the six sections the app was made with ('' is always one). */
  hasSection?: (id: string) => boolean
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** The language until the reader's own is read. Default: the phone's. */
  lang?: Lang
  /** How long a story is on screen before it counts as read, and the shortest glance that still counts when the reader moves on. */
  dwellMs?: number
  glanceMs?: number
  /** Told of a failure inside the engine (never with story text). Nothing by default. */
  onError?: (error: unknown) => void
  /** Replaceable parts, for a test that makes one of them fail. */
  cache?: FeedCache
  savedStories?: SavedStories
  history?: SeenFile
  prefs?: Prefs
}

/** After this long on a story that is still the one in view, the first page found by the cache is replaced without asking the reader. */
export const SWAP_WINDOW_MS = 1500
export const REVISIT_AFTER_MS = 2 * 60_000
/** Away this long, the app starts over from the newest stories instead of resuming where the reader stopped. */
export const NEW_SESSION_AFTER_MS = 30 * 60_000
export const STORY_LIMIT = 180
export const MORE_ATTEMPTS = 3
export const EXCLUDE_LIMIT = 200
export const DWELL_MS = 1200
export const GLANCE_MS = 500
export const SEEN_FLUSH_MS = 3000
/** How long a change to the saved stories that arrives while another is being written waits before it is tried again. */
export const MERGE_RETRY_MS = 250

const SESSIONS_KEPT = 8
const BUILT_IN_SECTIONS: readonly string[] = ['us', 'india', 'world', 'tech', 'business', 'science']

/** replace: the first page, to be shown; revalidate: the first page again, found quietly; more: the page after the ones loaded. */
type Kind = 'replace' | 'revalidate' | 'more'

interface Model {
  interests: ReadonlySet<string>
  screen: Screen
  /** The feed the reader is in when they are not on Topics or Saved. */
  feed: 'feed' | 'forYou'
  topic: Topic
  lang: Lang
  section: string
  loading: boolean
  replacing: boolean
  saving: boolean
  storageReady: boolean
  closed: boolean
  ready: boolean
  lastForced: boolean
  foreground: boolean
  flushQueued: boolean
  kind: Kind
  feedError: StringKey | null
  storageError: StringKey | null
  notice: StringKey | null
  position: number
  savedPosition: number
  /** Counts the requests and opens, so that an answer to one that was given up is recognised and dropped. */
  generation: number
  awaySince: number | null
  viewing: Story | null
  viewingSince: number
  request: AbortController | null
}

/** At most STORY_LIMIT stories are held for a feed. */
const cap = (stories: readonly Story[]): readonly Story[] => (stories.length > STORY_LIMIT ? stories.slice(0, STORY_LIMIT) : stories)

function minus(stories: readonly Story[], removed: readonly Story[]): readonly Story[] {
  if (removed.length === 0) return stories
  const ids = new Set(removed.map((story) => story.id))
  return stories.filter((story) => !ids.has(story.id))
}

export class FeedEngine {
  readonly store: Store<FeedState>

  private readonly source: FeedSource
  private readonly storage: KeyValueStore
  private readonly clock: Clock
  private readonly uptime: Clock
  private readonly topics: () => readonly Topic[]
  private readonly hasSection: (id: string) => boolean
  private readonly setTimer: (callback: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly dwellMs: number
  private readonly glanceMs: number
  private readonly onError: (error: unknown) => void
  private readonly cache: FeedCache
  private readonly savedStories: SavedStories
  private readonly history: SeenFile
  private readonly prefs: Prefs
  private readonly disk: SerialQueue
  private readonly sessions = new Lru<string, Session>(SESSIONS_KEPT)
  private cloud: Cloud
  private seen = new SeenStore()
  private seenDirty = false
  private session: Session
  private saved: readonly Story[] = []
  private savedIdsMemo: { list: readonly Story[]; ids: ReadonlySet<string> } | null = null
  private remoteSaved: readonly Story[] | null = null
  private started = false
  private dwellTimer: unknown = null
  private flushTimer: unknown = null
  private readonly mergeTimers = new Set<unknown>()
  private readonly m: Model

  private readonly sink: CloudSink = {
    cloudInterests: (topics) => this.defer(() => this.applyInterests(sanitize(topics, this.topics()), false)),
    cloudSaved: (stories) => this.defer(() => this.mergeSaved(stories)),
  }

  constructor(options: FeedEngineOptions) {
    this.source = options.source
    this.storage = options.storage
    this.clock = options.clock
    this.uptime = options.uptime ?? options.clock
    this.topics = options.topics
    this.hasSection = options.hasSection ?? ((id) => id === '' || BUILT_IN_SECTIONS.includes(id))
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
    this.dwellMs = options.dwellMs ?? DWELL_MS
    this.glanceMs = options.glanceMs ?? GLANCE_MS
    this.onError = options.onError ?? (() => undefined)
    this.cache = options.cache ?? new FeedCache(options.storage, options.clock)
    this.savedStories = options.savedStories ?? new SavedStories(options.storage)
    this.history = options.history ?? new SeenFile(options.storage)
    this.prefs = options.prefs ?? new Prefs(options.storage)
    this.cloud = options.cloud ?? NO_CLOUD
    this.disk = new SerialQueue(this.onError)
    this.m = {
      interests: new Set(),
      screen: 'feed',
      feed: 'feed',
      topic: NEWS_TOPIC,
      lang: options.lang ?? detectLanguage(),
      section: '',
      loading: false,
      replacing: false,
      saving: false,
      storageReady: false,
      closed: false,
      ready: false,
      lastForced: false,
      foreground: true,
      flushQueued: false,
      kind: 'replace',
      feedError: null,
      storageError: null,
      notice: null,
      position: 0,
      savedPosition: 0,
      generation: 0,
      awaySince: null,
      viewing: null,
      viewingSince: 0,
      request: null,
    }
    this.session = this.feedSession()
    this.store = createStore(this.snapshot())
  }

  getState(): FeedState {
    return this.store.getState()
  }

  /**
   * Where the reader is now. The position in a published state is where the reader was when it was published: paging does not
   * publish, so a screen made again from the last state would otherwise put the reader back on an old story.
   */
  currentPosition(): number {
    return this.m.position
  }

  /**
   * Reads the settings, the seen history and the saved stories, and opens the first screen: the feed the reader last used, from the
   * cache while the network answers. Resolves once that has begun, not when the stories have arrived (watch `ready` for that). Run an
   * import of the native app's data (legacy-import.ts) before it, so that what it reads is what was imported.
   */
  async start(): Promise<void> {
    if (this.started || this.m.closed) return
    this.started = true
    const [language, interests, forYou] = await Promise.all([this.prefs.language(), readInterests(this.storage, this.topics()), this.prefs.forYou()])
    if (this.m.closed) return
    if (language !== null) this.m.lang = language
    this.m.interests = interests
    this.m.feed = forYou && interests.size > 0 ? 'forYou' : 'feed'
    this.m.screen = this.m.feed
    this.session = this.feedSession()
    this.cloud.listen(this.sink)
    // The history is read before the cache so the first page is already filtered when it is drawn.
    this.io(() => this.loadHistory())
    this.open()
    this.io(() => this.loadSaved())
  }

  /** Lets go of everything: the request in flight, the timers and the account. What was queued to be written is still written. */
  dispose(): Promise<void> {
    if (this.m.closed) return this.disk.drained()
    this.leave()
    this.m.closed = true
    this.m.generation++
    this.cloud.listen(null)
    this.cancelRequest()
    this.cancelDwell()
    if (this.flushTimer !== null) this.clearTimer(this.flushTimer)
    this.flushTimer = null
    for (const timer of this.mergeTimers) this.clearTimer(timer)
    this.mergeTimers.clear()
    this.io(() => this.writeSeen())
    return this.disk.close()
  }

  /** Where the signed-in account meets the feed: replaces the one before it (NO_CLOUD when nobody is signed in). */
  setCloud(cloud: Cloud): void {
    if (cloud === this.cloud) return
    this.cloud.listen(null)
    this.cloud = cloud
    if (this.started && !this.m.closed) cloud.listen(this.sink)
  }

  // ─── Actions ───

  screen(destination: Screen): void {
    const m = this.m
    if (m.closed || m.screen === destination) return
    this.savePosition()
    this.leave()
    m.screen = destination
    m.notice = null
    if (destination === 'feed' || destination === 'forYou') {
      m.feed = destination
      this.remember(this.prefs.setForYou(destination === 'forYou'))
      const next = this.feedSession()
      if (next !== this.session || (next.stories.length === 0 && !m.loading)) {
        this.session = next
        this.open()
      } else {
        this.restorePosition()
        this.publish()
      }
    } else {
      this.restorePosition()
      this.publish()
    }
    this.track()
  }

  topic(selected: Topic): void {
    const m = this.m
    if (m.closed) return
    this.savePosition()
    this.leave()
    m.screen = 'feed'
    m.feed = 'feed'
    this.remember(this.prefs.setForYou(false))
    if (m.topic.id !== selected.id) {
      m.topic = selected
      m.section = ''
    }
    const next = this.topicSession()
    if (next !== this.session) {
      this.session = next
      this.open()
    } else {
      this.restorePosition()
      this.publish()
    }
    this.track()
  }

  language(selected: Lang): void {
    const m = this.m
    if (m.closed || !isLang(selected) || selected === m.lang) return
    this.savePosition()
    this.leave()
    m.lang = selected
    m.section = ''
    this.remember(this.prefs.setLanguage(selected))
    this.session = this.feedSession()
    this.open()
    this.track()
  }

  /** Narrows the news to one of the website's sections ('' is all). One the website no longer lists is ignored, as the menu may have been open while its list changed. */
  section(selected: string): void {
    if (this.m.closed || !this.hasSection(selected)) return
    this.savePosition()
    this.m.section = selected
    this.restorePosition()
    this.m.notice = null
    this.publish()
    this.track()
  }

  /** Looks for newer stories and puts them first. A reader who is up to date is told so (no_new_stories). */
  refresh(): void {
    const m = this.m
    if (m.closed || this.session.categories === '') return
    if (!this.feeding()) {
      m.screen = m.feed
      this.restorePosition()
    }
    this.begin('replace', true)
  }

  retry(): void {
    const m = this.m
    if (m.closed || this.session.categories === '') return
    if (m.kind === 'more' && this.session.stories.length > 0) this.more()
    else this.begin(this.session.stories.length === 0 ? 'replace' : 'revalidate', m.lastForced)
  }

  /** Takes the reader's choice of topics for For you (only the topics on offer are kept). */
  setInterests(selected: Iterable<string>): void {
    if (this.m.closed) return
    this.applyInterests(sanitize(selected, this.topics()), true)
  }

  /** Asks for the page after the ones loaded. The pager does this by itself when it nears the end. */
  more(): void {
    const m = this.m
    if (m.closed || m.loading || this.session.exhausted || !this.feeding() || this.session.categories === '') return
    this.fetchMore(this.session, 0)
  }

  /** Called when the reader pages. Deliberately does not publish: paging must not make every screen draw again. */
  position(next: number): void {
    const m = this.m
    if (m.closed || !Number.isInteger(next) || next < 0 || next === m.position) return
    m.position = next
    if (this.feeding()) this.session.positions.set(m.section, next)
    else if (m.screen === 'saved') m.savedPosition = next
    this.track()
    if (this.feeding() && !m.loading && m.feedError === null && !this.session.exhausted && next >= this.items().length - 4) this.more()
  }

  /** Swaps in the fresher page the reader was told about, merged with what has been read since. */
  applyFresh(): void {
    const target = this.session
    if (this.m.closed || target.pending === null) return
    this.install(target, replacePage(target.stories, target.withheld(), target.pending, this.seen, this.clock()))
    this.m.position = 0
    this.publish()
    this.track()
  }

  /** Lets the reader go back over stories already seen; they follow the caught-up card. */
  revealEarlier(): void {
    const m = this.m
    const target = this.session
    if (m.closed || !this.feeding() || m.section !== '' || target.earlier.length === 0) return
    // Newest first; stories published at the same time keep the order they had.
    const all = [...target.revealed, ...target.earlier]
      .map((story, index) => ({ story, index }))
      .sort((a, b) => b.story.publishedAt - a.story.publishedAt || a.index - b.index)
      .map(({ story }) => story)
    target.revealed = all.length > EARLIER_LIMIT ? all.slice(0, EARLIER_LIMIT) : all
    target.earlier = []
    m.position = target.stories.length + 1
    target.positions.set(m.section, m.position)
    this.publish()
    this.track()
  }

  /** Called when the app leaves the screen: the story in view is counted, and the history is written out now. */
  background(): void {
    const m = this.m
    if (m.closed) return
    this.leave()
    m.foreground = false
    m.awaySince = this.clock()
    this.io(() => this.writeSeen())
  }

  /** Called when the app returns. After a long absence it starts again from the newest stories. */
  foreground(): void {
    const m = this.m
    if (m.closed || m.foreground) return
    m.foreground = true
    const away = m.awaySince === null ? 0 : this.clock() - m.awaySince
    m.awaySince = null
    if (away >= NEW_SESSION_AFTER_MS) this.newSession()
    else if (away >= REVISIT_AFTER_MS && this.feeding() && !m.loading && this.session.categories !== '') this.begin('revalidate', false)
    this.track()
  }

  /** Saves the story, or removes it from the saved stories when it is saved. */
  toggleSaved(story: Story): void {
    const m = this.m
    if (!m.storageReady || m.saving || m.closed || isCaughtUp(story) || isAd(story)) return
    const updated = this.saved.filter((item) => item.id !== story.id)
    const removed = updated.length !== this.saved.length
    if (!removed) {
      if (updated.length >= SAVED_LIMIT) {
        m.notice = 'saved_limit'
        this.publish()
        return
      }
      // What could not be read back would make every saved story unreadable, so it is not written.
      if (!isStorable(story)) {
        m.storageError = 'save_error'
        this.publish()
        return
      }
      updated.unshift(story)
    }
    this.save(updated, removed ? 'removed_notice' : 'saved_notice', () => this.cloud.saved(story, !removed))
  }

  clearSaved(): void {
    const m = this.m
    if (!m.storageReady || m.saving || m.closed) return
    const removed = this.saved
    this.save([], 'removed_notice', () => {
      for (const story of removed) this.cloud.saved(story, false)
    })
  }

  /** The reader has been told. */
  acknowledgeNotice(): void {
    if (this.m.notice === null) return
    this.m.notice = null
    this.publish()
  }

  // ─── Loading ───

  private io(task: () => Promise<void> | void): void {
    this.disk.run(task)
  }

  /** Runs after the caller is done, like a message posted to the main thread. */
  private defer(task: () => void): void {
    Promise.resolve()
      .then(() => {
        if (!this.m.closed) task()
      })
      .catch(this.onError)
  }

  /** A write to the settings that nothing waits for: if it fails the setting is the one before. */
  private remember(write: Promise<void>): void {
    write.catch(() => undefined)
  }

  private async loadHistory(): Promise<void> {
    try {
      this.seen = await this.history.read(this.clock())
    } catch {
      await this.history.delete().catch(() => undefined)
      this.seen = new SeenStore()
    }
  }

  private async loadSaved(): Promise<void> {
    let loaded: readonly Story[]
    try {
      loaded = await this.savedStories.read()
    } catch {
      if (this.m.closed) return
      this.m.storageError = 'storage_error'
      this.publish()
      return
    }
    if (this.m.closed) return
    this.saved = loaded
    this.m.storageReady = true
    const waiting = this.remoteSaved
    this.remoteSaved = null
    if (waiting !== null) this.mergeSaved(waiting)
    else this.publish()
  }

  private feeding(): boolean {
    return this.m.screen === 'feed' || this.m.screen === 'forYou'
  }

  private feedSession(): Session {
    return this.m.feed === 'forYou' ? this.forYouSession() : this.topicSession()
  }

  private topicSession(): Session {
    const { topic, lang } = this.m
    return this.sessions.getOrCreate(`${topic.id}:${lang}`, () => new Session(topicCacheKey(topic, lang), topic.id, lang))
  }

  private forYouSession(): Session {
    const { lang } = this.m
    const categories = joinCategories(this.m.interests)
    return this.sessions.getOrCreate(
      `foryou:${lang}:${categories}`,
      () => new Session(categoriesCacheKey(categories === '' ? 'none' : categories, lang), categories, lang),
    )
  }

  private applyInterests(clean: ReadonlySet<string>, push: boolean): void {
    const m = this.m
    if (m.closed || sameInterests(clean, m.interests)) return
    m.interests = clean
    this.remember(writeInterests(this.storage, clean, this.topics()))
    if (push) this.cloud.interests(clean)
    if (m.feed === 'forYou') {
      this.savePosition()
      this.leave()
      this.session = this.forYouSession()
      this.open()
      this.track()
    } else {
      this.publish()
    }
  }

  private fetchMore(target: Session, attempt: number): void {
    const m = this.m
    if (m.closed) return
    this.cancelRequest()
    const expected = ++m.generation
    m.loading = true
    m.replacing = false
    m.feedError = null
    m.kind = 'more'
    if (attempt === 0) this.publish()
    this.ask(
      { categories: target.categories, lang: target.lang, excluded: this.excluded(target), refresh: false },
      (page) => {
        if (!m.closed && expected === m.generation) this.mergeMore(target, page, attempt, expected)
      },
      (key) => {
        if (m.closed || expected !== m.generation) return
        m.loading = false
        m.feedError = key
        this.publish()
      },
    )
  }

  /** What the server should leave out: everything already shown or withheld, then the latest seen. */
  private excluded(target: Session): string[] {
    const ids = new Set<string>()
    for (const story of target.stories) ids.add(story.id)
    for (const story of target.earlier) ids.add(story.id)
    for (const story of target.revealed) ids.add(story.id)
    for (const id of this.seen.recentIds(EXCLUDE_LIMIT)) ids.add(id)
    const list = [...ids]
    return list.length > EXCLUDE_LIMIT ? list.slice(0, EXCLUDE_LIMIT) : list
  }

  private mergeMore(target: Session, page: Story[], attempt: number, expected: number): void {
    const shownNow = target.stories
    const withheld = target.withheld()
    this.io(() => {
      const merged = appendPage(shownNow, withheld, page, this.seen, this.clock())
      if (!this.m.closed && expected === this.m.generation) this.applyMore(target, page, merged, attempt)
    })
  }

  private applyMore(target: Session, page: Story[], merged: MergeResult, attempt: number): void {
    target.stories = cap(merged.visible)
    target.earlier = minus(merged.earlier, target.revealed)
    const grew = merged.fresh.length > 0
    if (page.length === 0) {
      target.exhausted = true
    } else if (!grew && attempt + 1 < MORE_ATTEMPTS) {
      this.fetchMore(target, attempt + 1)
      return
    } else if (!grew || target.stories.length >= STORY_LIMIT) {
      target.exhausted = true
    }
    this.m.loading = false
    this.publish()
    this.track()
  }

  private items(): readonly Story[] {
    return this.m.screen === 'saved' ? this.saved : this.session.items(this.m.section, this.marker(this.session))
  }

  /** The caught-up card: nothing newer remains, or the network is down and only seen stories are left. */
  private marker(target: Session): boolean {
    const holdsStories = target.stories.length > 0 || target.earlier.length > 0 || target.revealed.length > 0
    const offline = this.m.feedError !== null && target.stories.length === 0
    return this.m.section === '' && holdsStories && (target.exhausted || offline)
  }

  private savePosition(): void {
    const m = this.m
    if (this.feeding()) this.session.positions.set(m.section, m.position)
    else if (m.screen === 'saved') m.savedPosition = m.position
  }

  private restorePosition(): void {
    const m = this.m
    if (this.feeding()) m.position = this.session.positions.get(m.section) ?? 0
    else if (m.screen === 'saved') m.position = m.savedPosition
    else m.position = 0
  }

  /** Shows what the session already holds, otherwise reads the on-device cache while the network runs. */
  private open(): void {
    const m = this.m
    this.cancelRequest()
    m.generation++
    this.restorePosition()
    const target = this.session
    if (target.categories === '') {
      m.loading = false
      m.replacing = false
      m.feedError = null
      m.ready = true
      this.publish()
      return
    }
    if (target.stories.length > 0 || target.loadedAt !== null) {
      m.loading = false
      m.feedError = null
      m.ready = true
      this.publish()
      if (target.loadedAt === null || this.clock() - target.loadedAt > REVISIT_AFTER_MS) this.begin('revalidate', false)
      return
    }
    target.networkDone = false
    const expected = this.beginRequest('replace', false)
    this.publish()
    if (m.closed) return
    this.io(async () => {
      const entry = await this.cache.read(target.key).catch(() => null)
      const now = this.clock()
      const usable = entry !== null && entryAge(entry, now) <= target.cacheLimit()
      const merged = usable ? replacePage([], [], entry.stories, this.seen, now) : null
      if (m.closed || expected !== m.generation) return
      if (merged !== null && !target.networkDone && target.stories.length === 0) {
        target.earlier = merged.earlier
        if (merged.visible.length > 0) {
          target.stories = cap(merged.visible)
          target.shownAt = this.uptime()
        }
      }
      m.ready = true
      this.publish()
      this.track()
    })
  }

  private begin(next: Kind, forced: boolean): void {
    this.beginRequest(next, forced)
    this.publish()
  }

  /** Starts a first-page request; the caller publishes. */
  private beginRequest(next: Kind, forced: boolean): number {
    const m = this.m
    this.cancelRequest()
    const expected = ++m.generation
    const target = this.session
    m.loading = true
    m.replacing = true
    m.feedError = null
    m.notice = null
    m.kind = next
    m.lastForced = forced
    this.ask(
      { categories: target.categories, lang: target.lang, excluded: [], refresh: forced && target.single },
      (page) => {
        if (m.closed || expected !== m.generation) return
        target.networkDone = true
        m.ready = true
        this.firstPage(target, page, forced, expected)
      },
      (key) => {
        if (m.closed || expected !== m.generation) return
        target.networkDone = true
        m.ready = true
        m.loading = false
        m.replacing = false
        m.feedError = key
        this.publish()
      },
    )
    return expected
  }

  private firstPage(target: Session, page: Story[], forced: boolean, expected: number): void {
    const shownNow = target.stories
    const withheld = target.withheld()
    this.io(async () => {
      const merged = replacePage(shownNow, withheld, page, this.seen, this.clock())
      if (!this.m.closed && expected === this.m.generation) this.applyFirst(target, page, merged, forced)
      // The page is cached as it came, so what has been read is filtered out afresh at every launch.
      if (page.length > 0) await this.cache.write(target.key, page).catch(() => undefined)
    })
  }

  private applyFirst(target: Session, page: Story[], merged: MergeResult, forced: boolean): void {
    const m = this.m
    const showing = target.stories.length > 0
    const news = merged.fresh.length > 0
    const idle = target === this.session && this.feeding() && m.position === 0 && target.pending === null && this.uptime() - target.shownAt < SWAP_WINDOW_MS
    const wasExhausted = target.exhausted
    target.loadedAt = this.clock()
    m.loading = false
    m.replacing = false
    m.feedError = null
    const install = !showing || (news && (forced || idle))
    if (install) {
      this.install(target, merged)
      // With nothing new on the first page, what was already known about the end of the list still holds.
      target.exhausted = page.length === 0 || (!news && wasExhausted)
      if (target === this.session) m.position = 0
    } else if (news) {
      target.pending = page
    }
    if (forced && !news && target === this.session) m.notice = 'no_new_stories'
    // A page the reader has already seen entirely may still hide stories further down the server's list.
    if (install && merged.visible.length === 0 && page.length > 0 && !target.exhausted) this.fetchMore(target, 0)
    else this.publish()
    this.track()
  }

  private install(target: Session, merged: MergeResult): void {
    target.stories = cap(merged.visible)
    target.earlier = merged.earlier
    target.revealed = []
    target.positions.clear()
    target.pending = null
    target.shownAt = this.uptime()
  }

  /** Asks the source for a page and says what came of it. An answer to a request that was given up is dropped by the callers. */
  private ask(feed: FeedRequest, loaded: (page: Story[]) => void, failed: (key: StringKey) => void): void {
    const controller = new AbortController()
    this.m.request = controller
    const pending = new Promise<Story[]>((resolve) => resolve(this.source.load(feed, controller.signal)))
    pending
      .then(
        (page) => loaded(page),
        (error: unknown) => failed(error instanceof FeedLoadError ? error.key : 'network_error'),
      )
      .catch(this.onError)
  }

  private cancelRequest(): void {
    const request = this.m.request
    if (request !== null) {
      this.m.request = null
      request.abort()
    }
  }

  private newSession(): void {
    const m = this.m
    this.cancelRequest()
    m.generation++
    this.sessions.clear()
    m.section = ''
    m.notice = null
    m.screen = m.feed
    m.position = 0
    this.session = this.feedSession()
    this.open()
  }

  // ─── What the reader has seen ───

  /** The story in view counts as read once it has been on screen for a moment, or when the reader moves on after a glance. */
  private track(): void {
    const m = this.m
    const current = m.foreground && this.feeding() ? this.currentStory() : null
    if (current === null ? m.viewing === null : m.viewing !== null && m.viewing.id === current.id) return
    this.leave()
    if (current !== null) {
      m.viewing = current
      m.viewingSince = this.uptime()
      this.dwellTimer = this.setTimer(() => {
        this.dwellTimer = null
        if (m.viewing !== null) this.markSeen(m.viewing)
      }, this.dwellMs)
    }
  }

  private currentStory(): Story | null {
    const shown = this.session.shown(this.m.section)
    return this.m.position >= 0 && this.m.position < shown.length ? shown[this.m.position] : null
  }

  private cancelDwell(): void {
    if (this.dwellTimer !== null) this.clearTimer(this.dwellTimer)
    this.dwellTimer = null
  }

  private leave(): void {
    const m = this.m
    this.cancelDwell()
    if (m.viewing !== null && this.uptime() - m.viewingSince >= this.glanceMs) this.markSeen(m.viewing)
    m.viewing = null
  }

  private markSeen(story: Story): void {
    const at = this.clock()
    this.io(() => {
      if (this.seen.mark(story, at)) this.seenDirty = true
    })
    if (this.m.flushQueued) return
    this.m.flushQueued = true
    this.flushTimer = this.setTimer(() => {
      this.m.flushQueued = false
      this.flushTimer = null
      this.io(() => this.writeSeen())
    }, SEEN_FLUSH_MS)
  }

  private async writeSeen(): Promise<void> {
    if (!this.seenDirty) return
    try {
      await this.history.write(this.seen)
      this.seenDirty = false
    } catch {
      // A history that cannot be written is only forgotten at the next launch, and tried again at the next flush.
    }
  }

  // ─── Saved stories ───

  /** Adds bookmarks that exist only in the signed-in account; stories already saved on this phone are kept. */
  private mergeSaved(remote: readonly Story[]): void {
    const m = this.m
    if (m.closed) return
    if (!m.storageReady) {
      this.remoteSaved = remote
      return
    }
    if (m.saving) {
      const timer = this.setTimer(() => {
        this.mergeTimers.delete(timer)
        this.mergeSaved(remote)
      }, MERGE_RETRY_MS)
      this.mergeTimers.add(timer)
      return
    }
    const have = new Set(this.saved.map((story) => story.id))
    const updated = [...this.saved]
    for (const story of remote) {
      if (updated.length >= SAVED_LIMIT) break
      // A story the phone could not read back after saving it would make every saved story unreadable, so it is left out.
      if (have.has(story.id) || !isStorable(story)) continue
      have.add(story.id)
      updated.push(story)
    }
    if (updated.length !== this.saved.length) this.save(updated, null, () => undefined)
  }

  private save(updated: readonly Story[], success: StringKey | null, done: () => void): void {
    const m = this.m
    m.saving = true
    m.notice = null
    this.publish()
    this.io(async () => {
      try {
        await this.savedStories.write(updated)
      } catch {
        if (!m.closed) {
          m.saving = false
          m.storageError = 'save_error'
          this.publish()
        }
        return
      }
      if (m.closed) return
      this.saved = [...updated]
      m.saving = false
      m.storageError = null
      const last = Math.max(0, this.saved.length - 1)
      if (m.screen === 'saved') m.position = Math.min(m.position, last)
      m.savedPosition = Math.min(m.savedPosition, last)
      m.notice = success
      this.publish()
      done()
    })
  }

  // ─── The published state ───

  private savedIds(): ReadonlySet<string> {
    const memo = this.savedIdsMemo
    if (memo !== null && memo.list === this.saved) return memo.ids
    const ids = new Set(this.saved.map((story) => story.id))
    this.savedIdsMemo = { list: this.saved, ids }
    return ids
  }

  private snapshot(): FeedState {
    const m = this.m
    const items = this.items()
    const feeding = this.feeding()
    const session = this.session
    return {
      screen: m.screen,
      topic: m.topic,
      lang: m.lang,
      section: m.section,
      stories: items,
      savedIds: this.savedIds(),
      loading: m.loading,
      refreshing: m.loading && m.replacing && feeding && items.length > 0,
      saving: m.saving,
      storageReady: m.storageReady,
      exhausted: session.exhausted,
      fresh: feeding && session.pending !== null,
      feedError: m.feedError,
      storageError: m.storageError,
      notice: m.notice,
      position: m.position,
      earlier: feeding ? session.earlier.length : 0,
      interests: m.interests,
      ready: m.ready,
    }
  }

  private publish(): void {
    this.store.replaceState(this.snapshot())
  }
}

