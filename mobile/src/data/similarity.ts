import { CLOSE_MS, KEY_LIMIT, MIN_SHARED, WINDOW_MS, printOf as fingerprint, printOfHeadline, sameEvent, sameEventAt, type Print } from '@shared/story-engine'
import type { Story } from './story'

/**
 * When two stories are the same event, judged from their headlines alone (the native app's Similarity.java). The rules themselves
 * (the distinctive words, the stop words, the windows of time and the shares of words that must agree) are the website's own module
 * story-engine.ts, the same code the website decides with, so that a reader sees the same repeats in the app and on the website.
 * What this file adds is a fingerprint kept per story: a story never changes, so its headline is reduced once and not on every
 * comparison, and a page of stories is compared with a long history thousands of times.
 */
export { CLOSE_MS, KEY_LIMIT, MIN_SHARED, WINDOW_MS, printOfHeadline, sameEvent, sameEventAt }
export type { Print }

const fingerprints = new WeakMap<Story, Print>()

/** A story's fingerprint: its headline (the first sentence of its text when it has none) and its publish time. */
export function printOf(story: Story): Print {
  let print = fingerprints.get(story)
  if (print === undefined) {
    print = fingerprint(story)
    fingerprints.set(story, print)
  }
  return print
}

/** Whether two stories are one event. Without both publish times only the wording decides. */
export function sameStory(a: Story, b: Story): boolean {
  return sameEvent(printOf(a), printOf(b))
}
