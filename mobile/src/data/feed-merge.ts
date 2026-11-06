import { hasImage, type Story } from './story'
import type { SeenStore } from './seen-store'
import { CLOSE_MS, printOf, sameEvent, type Print } from './similarity'

/**
 * Turns a fresh page from the server into what the reader should see, without repeats (the native app's FeedMerge.java): which
 * stories are new, which the reader has seen already and are withheld until they ask for them, and which are new to the screen.
 */
export interface MergeResult {
  /** Stories to show, new ones first. */
  readonly visible: Story[]
  /** Stories already seen, withheld until the reader asks for them. */
  readonly earlier: Story[]
  /** Stories that were not on screen before this merge, to offer as "new stories". */
  readonly fresh: Story[]
}

/** The most stories withheld: the reader is only offered the newest of what they have seen. */
export const EARLIER_LIMIT = 200

const sameMoment = (a: Print, b: Print): boolean => a.published <= 0 || b.published <= 0 || Math.abs(a.published - b.published) <= CLOSE_MS

/** Collapses stories about one event within a batch, keeping the first (or a pictured one if equally old). */
export function cluster(stories: readonly Story[]): Story[] {
  const kept: Story[] = []
  const prints: Print[] = []
  for (const story of stories) {
    const print = printOf(story)
    const index = prints.findIndex((other) => sameEvent(print, other))
    if (index < 0) {
      kept.push(story)
      prints.push(print)
    } else if (!hasImage(kept[index]) && hasImage(story) && sameMoment(print, prints[index])) {
      kept[index] = story
      prints[index] = print
    }
  }
  return kept
}

/** True when the list already holds this story or another outlet's version of the same event. */
export function covers(list: readonly Story[], story: Story): boolean {
  const print = printOf(story)
  return list.some((other) => other.id === story.id || sameEvent(print, printOf(other)))
}

function distinct(stories: readonly Story[]): Story[] {
  const ids = new Set<string>()
  const unique: Story[] = []
  for (const story of stories) {
    if (ids.has(story.id)) continue
    ids.add(story.id)
    unique.push(story)
  }
  return unique
}

const cap = (stories: Story[]): Story[] => (stories.length > EARLIER_LIMIT ? stories.slice(0, EARLIER_LIMIT) : stories)

/**
 * A new first page: unseen stories lead, followed by anything the reader still has on screen but has not viewed. Viewed stories move
 * to `earlier`.
 */
export function replacePage(visible: readonly Story[], earlier: readonly Story[], page: readonly Story[], seen: SeenStore, now: number): MergeResult {
  const unseen: Story[] = []
  const seenPage: Story[] = []
  for (const story of cluster(page)) (seen.contains(story, now) ? seenPage : unseen).push(story)
  const leftover: Story[] = []
  const viewed: Story[] = []
  for (const story of visible) (seen.contains(story, now) ? viewed : leftover).push(story)

  const next = [...unseen]
  for (const story of leftover) if (!covers(unseen, story)) next.push(story)
  const fresh = unseen.filter((story) => !covers(visible, story))
  return { visible: next, earlier: cap(distinct([...seenPage, ...viewed, ...earlier])), fresh }
}

/** An older page: its unseen stories follow the current ones. */
export function appendPage(visible: readonly Story[], earlier: readonly Story[], page: readonly Story[], seen: SeenStore, now: number): MergeResult {
  const fresh: Story[] = []
  const seenPage: Story[] = []
  for (const story of cluster(page)) {
    if (seen.contains(story, now) || covers(earlier, story)) seenPage.push(story)
    else if (!covers(visible, story)) fresh.push(story)
  }
  return { visible: [...visible, ...fresh], earlier: cap(distinct([...earlier, ...seenPage])), fresh }
}
