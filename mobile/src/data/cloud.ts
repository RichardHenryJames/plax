import type { Story } from './story'

/**
 * Where a signed-in account meets the feed: what the reader changes on the phone goes out, and what the account holds comes in. The feed
 * engine (feed-engine.ts) holds a Cloud and knows nothing else about accounts; the account module (src/account) provides the real one.
 * A port of FeedViewModel.Cloud of the native app.
 */
export interface CloudSink {
  /** The topics the account holds, for the For you feed. */
  cloudInterests(topics: ReadonlySet<string>): void
  /** The stories the account has saved. */
  cloudSaved(stories: readonly Story[]): void
}

export interface Cloud {
  /** The reader saved (added) or removed (not added) a story on the phone. */
  saved(story: Story, added: boolean): void
  /** The reader chose these topics for For you. */
  interests(topics: ReadonlySet<string>): void
  /** Receives what the account holds until replaced; null stops delivery. */
  listen(sink: CloudSink | null): void
}

/** Nobody is signed in: nothing goes out and nothing comes in. */
export const NO_CLOUD: Cloud = {
  saved: () => undefined,
  interests: () => undefined,
  listen: () => undefined,
}
