import type { Lang } from '../i18n'
import { HINDI_SHARE, devanagariShare } from './devanagari'
import { Lru } from './lru'
import { isAd, isCaughtUp, type Story } from './story'
import { TranslateError, type TranslateSource } from './translate-api'

/**
 * What a page shows in place of a story's own words in Hindi: a placeholder while the translation is on its way, or the translation.
 * A story that needs none has no Translation, and is shown as it is.
 */
export type Translation =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly title: string; readonly content: string }

/** The least text a story has to have to be worth translating (as on the website). */
export const MIN_CHARS = 40
/** Tries for one story before it is shown in the words it came in. */
export const MAX_ATTEMPTS = 3
/** The wait before the second and the third try. */
export const RETRY_DELAYS_MS: readonly number[] = [1_500, 4_000]
/** Translations asked for at the same time. */
export const CONCURRENCY = 3
/** Translations kept for the next time a story is on the screen. */
export const KEEP = 200
/** How long a story that could not be translated is left alone, shown in its own words, before the next visit to it asks again. */
export const FAILED_FOR_MS = 120_000

const PENDING: Translation = Object.freeze({ status: 'pending' })

const needed = new WeakMap<Story, boolean>()

/**
 * Whether a story has to be translated to be read in this language. Only Hindi has translations: the feed of Hindi has stories of its own
 * for almost every topic, but for some (Stocks, Books) it has only the English ones, and the page would be a Hindi menu and tag over an
 * English story. Ads and the caught-up page are not stories, and a story that is Hindi already, or has next to no text or no letters in
 * it, is shown as it is.
 */
export function needsTranslation(story: Story, lang: Lang): boolean {
  if (lang !== 'hi') return false
  const known = needed.get(story)
  if (known !== undefined) return known
  let answer = false
  if (!isAd(story) && !isCaughtUp(story) && story.content.trim().length >= MIN_CHARS) {
    const share = devanagariShare(story.content)
    answer = share !== null && share < HINDI_SHARE
  }
  needed.set(story, answer)
  return answer
}

const keyOf = (story: Story, lang: Lang): string => `${story.id}|${lang}`

/** One story that is waiting for its turn, being translated, or waiting to try again. */
interface Job {
  readonly key: string
  readonly story: Story
  readonly lang: Lang
  attempts: number
  /** Set while the request is out. */
  controller?: AbortController
  /** Set while the job waits to try again. */
  cancelRetry?: () => void
}

export interface TranslationsOptions {
  readonly source: TranslateSource
  readonly now?: () => number
  /** Runs `callback` after `ms`; the function it gives back cancels it. */
  readonly after?: (callback: () => void, ms: number) => () => void
  readonly concurrency?: number
  readonly attempts?: number
  readonly retryDelaysMs?: readonly number[]
  readonly keep?: number
  readonly failedForMs?: number
}

const defaultAfter = (callback: () => void, ms: number): (() => void) => {
  const timer = setTimeout(callback, ms)
  return () => clearTimeout(timer)
}

/**
 * The translations of the stories the reader is reading, in Hindi. The page asks `view` what to show for a story; the feed view tells `want`
 * which stories the reader is at and near, and the ones that need it are asked for, the nearest first, a few at a time. What is written is
 * kept; a request that fails is tried again twice, and then the story is shown in its own words rather than left waiting. Nothing here
 * touches the feed, the saved stories or the history of what has been read: a translation is only what a page shows, so the story that
 * is saved, shared or opened is always the feed's own.
 */
export class Translations {
  private readonly source: TranslateSource
  private readonly now: () => number
  private readonly after: (callback: () => void, ms: number) => () => void
  private readonly concurrency: number
  private readonly attempts: number
  private readonly retryDelays: readonly number[]
  private readonly failedFor: number
  private readonly done: Lru<string, Translation>
  private readonly jobs = new Map<string, Job>()
  private readonly failed = new Map<string, number>()
  private order: string[] = []
  private lang: Lang = 'en'
  private version = 0
  private readonly listeners = new Set<() => void>()

  constructor(options: TranslationsOptions) {
    this.source = options.source
    this.now = options.now ?? Date.now
    this.after = options.after ?? defaultAfter
    this.concurrency = Math.max(1, options.concurrency ?? CONCURRENCY)
    this.attempts = Math.max(1, options.attempts ?? MAX_ATTEMPTS)
    this.retryDelays = options.retryDelaysMs ?? RETRY_DELAYS_MS
    this.failedFor = options.failedForMs ?? FAILED_FOR_MS
    this.done = new Lru(options.keep ?? KEEP)
  }

  /** For useSyncExternalStore: told when what a page should show may have changed. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** For useSyncExternalStore: a number that changes whenever a `view` may answer differently. */
  readonly getVersion = (): number => this.version

  /**
   * What to show for a story: nothing (as it is) when it needs no translation or could not be translated; the placeholder while the
   * translation is wanted and not yet there; the translation when it is. The same story gives the same object until that changes,
   * so a page that is shown it is drawn again only when it did.
   */
  view(story: Story, lang: Lang): Translation | undefined {
    if (!needsTranslation(story, lang)) return undefined
    const key = keyOf(story, lang)
    const ready = this.done.get(key)
    if (ready !== undefined) return ready
    if (this.failed.has(key)) return undefined
    return PENDING
  }

  /**
   * The stories the reader is at and near, the one in view first, in the language of the feed. Those that need a translation and do not have
   * one are asked for; a story that was waiting and is no longer near is let go, so that nothing is asked for that nobody will read.
   */
  want(stories: readonly Story[], lang: Lang): void {
    if (lang !== this.lang) this.changeLanguage(lang)
    if (lang !== 'hi') return
    let changed = false
    const wanted: string[] = []
    for (const story of stories) {
      if (!needsTranslation(story, lang)) continue
      const key = keyOf(story, lang)
      if (this.done.has(key)) continue
      const gaveUp = this.failed.get(key)
      if (gaveUp !== undefined) {
        // A story that could not be translated is shown as it came, and is asked for again on a later visit, not at once.
        if (this.now() - gaveUp < this.failedFor) continue
        this.failed.delete(key)
        changed = true
      }
      wanted.push(key)
      if (!this.jobs.has(key)) this.jobs.set(key, { key, story, lang, attempts: 0 })
    }
    for (const [key, job] of this.jobs) {
      if (wanted.includes(key) || job.controller !== undefined) continue
      job.cancelRetry?.()
      this.jobs.delete(key)
    }
    this.order = wanted
    this.pump()
    if (changed) this.notify()
  }

  /** Abandons everything that is on its way, and asks for nothing more until the feed view tells which stories are wanted again. */
  stop(): void {
    this.abortAll()
    this.order = []
  }

  private changeLanguage(lang: Lang): void {
    this.abortAll()
    this.order = []
    this.failed.clear()
    this.lang = lang
  }

  private abortAll(): void {
    for (const job of this.jobs.values()) {
      job.cancelRetry?.()
      job.controller?.abort()
    }
    this.jobs.clear()
  }

  /** Starts the waiting jobs, in the order the reader will reach them, until as many are out as are allowed. */
  private pump(): void {
    let out = 0
    for (const job of this.jobs.values()) if (job.controller !== undefined) out++
    for (const key of this.order) {
      if (out >= this.concurrency) return
      const job = this.jobs.get(key)
      if (job === undefined || job.controller !== undefined || job.cancelRetry !== undefined) continue
      this.run(job)
      out++
    }
  }

  private run(job: Job): void {
    const controller = new AbortController()
    job.controller = controller
    job.attempts += 1
    let request: Promise<{ title: string; content: string }>
    try {
      request = this.source.translate(job.story, job.lang, controller.signal)
    } catch (error) {
      request = Promise.reject(error)
    }
    void request.then(
      (translated) => this.succeeded(job, translated),
      (error: unknown) => this.failedTry(job, error),
    )
  }

  private succeeded(job: Job, translated: { title: string; content: string }): void {
    job.controller = undefined
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key)
    // What was written is kept even when the reader has gone elsewhere: it is there when they come back.
    this.done.set(job.key, Object.freeze({ status: 'ready', title: translated.title !== '' ? translated.title : job.story.title, content: translated.content }))
    this.notify()
    this.pump()
  }

  private failedTry(job: Job, error: unknown): void {
    job.controller = undefined
    if (this.jobs.get(job.key) !== job) {
      this.pump()
      return
    }
    if (error instanceof TranslateError && error.aborted) {
      this.jobs.delete(job.key)
      this.pump()
      return
    }
    if (job.attempts >= this.attempts) {
      this.jobs.delete(job.key)
      this.failed.set(job.key, this.now())
      this.notify()
      this.pump()
      return
    }
    const wait = this.retryDelays[Math.min(job.attempts - 1, this.retryDelays.length - 1)] ?? 0
    job.cancelRetry = this.after(() => {
      job.cancelRetry = undefined
      this.pump()
    }, wait)
    this.pump()
  }

  private notify(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }
}
