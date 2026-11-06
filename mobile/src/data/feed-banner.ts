import type { StringKey } from '../i18n'
import type { FeedState } from './feed-engine'
import { isCaughtUp } from './story'

/** The line over the stories: why they are not as they should be, or that more are on their way. */
export interface Banner {
  readonly key: StringKey
  /** Tapping the line tries again (it names a failure to load stories). */
  readonly retryable: boolean
}

/**
 * What the line over a feed says (MainActivity.banner of the native app). A failure of the storage comes first; then, on a feed with
 * stories, a failure to load them (a lost connection is "you are offline, showing the last stories we loaded"), else that more are
 * being found, else that the reader has reached the end. `position` is where the reader is now: engine.currentPosition().
 */
export function feedBanner(state: FeedState, position: number): Banner | null {
  if (state.storageError !== null) return { key: state.storageError, retryable: false }
  const browsing = (state.screen === 'feed' || state.screen === 'forYou') && state.stories.length > 0
  if (!browsing) return null
  const failure = state.feedError === 'network_error' ? 'offline_cached' : state.feedError
  if (failure !== null) return { key: failure, retryable: true }
  if (state.loading && !state.refreshing) return { key: 'loading_more', retryable: false }
  const atEnd = position >= state.stories.length - 1
  if (state.exhausted && atEnd && !state.stories.some(isCaughtUp)) return { key: 'end_feed', retryable: false }
  return null
}
