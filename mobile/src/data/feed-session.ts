import type { Lang } from '../i18n'
import { caughtUp, type Story } from './story'

/** How long the page of a session may be shown from the cache: news goes stale quickly, the other topics hardly at all. */
export const NEWS_CACHE_MS = 2 * 3_600_000
export const EVERGREEN_CACHE_MS = 7 * 24 * 3_600_000

/**
 * What the engine holds per feed the reader has opened (a topic in a language, or a choice of topics for For you): its stories, the
 * ones withheld because they were seen, where the reader was in each section, and what has been asked of the server.
 */
export class Session {
  /** A single topic can ask the server for a live refresh; a personalised mix cannot. */
  readonly single: boolean
  readonly news: boolean
  stories: readonly Story[] = []
  /** Stories the reader has seen, withheld until they ask for them. */
  earlier: readonly Story[] = []
  /** The earlier stories the reader asked for: they follow the caught-up card. */
  revealed: readonly Story[] = []
  /** A fresher page the reader was told about and has not taken yet. */
  pending: readonly Story[] | null = null
  readonly positions = new Map<string, number>()
  exhausted = false
  networkDone = false
  /** When the first page last arrived, or null if it never did. */
  loadedAt: number | null = null
  shownAt = 0

  private shownMemo: { stories: readonly Story[]; section: string; list: readonly Story[] } | null = null
  private itemsMemo: { shown: readonly Story[]; revealed: readonly Story[]; list: readonly Story[] } | null = null

  constructor(
    /** The key of this feed's page in the cache. */
    readonly key: string,
    /** The topics asked for, separated by commas. Empty for For you with no topic chosen. */
    readonly categories: string,
    readonly lang: Lang,
  ) {
    this.single = categories !== '' && !categories.includes(',')
    this.news = categories.split(',').includes('news')
  }

  cacheLimit(): number {
    return this.news ? NEWS_CACHE_MS : EVERGREEN_CACHE_MS
  }

  /** Everything the reader has not been shown: the seen stories, and the ones they brought back. */
  withheld(): readonly Story[] {
    return this.revealed.length === 0 ? this.earlier : [...this.earlier, ...this.revealed]
  }

  /** The stories of one section ('' is all). The same list for as long as nothing changes. */
  shown(section: string): readonly Story[] {
    if (section === '') return this.stories
    const memo = this.shownMemo
    if (memo !== null && memo.stories === this.stories && memo.section === section) return memo.list
    const list = this.stories.filter((story) => story.section === section)
    this.shownMemo = { stories: this.stories, section, list }
    return list
  }

  /** What the pager shows: the stories, and with the marker the caught-up card and the earlier stories that follow it. */
  items(section: string, marker: boolean): readonly Story[] {
    const shown = this.shown(section)
    if (!marker) return shown
    const memo = this.itemsMemo
    if (memo !== null && memo.shown === shown && memo.revealed === this.revealed) return memo.list
    const list = [...shown, caughtUp(), ...this.revealed]
    this.itemsMemo = { shown, revealed: this.revealed, list }
    return list
  }
}
