import type { KeyValueStore } from '../platform/storage'
import { MAX_BYTES, SAVED_LIMIT, encodeSaved, parseSaved } from './feed-parser'
import type { Story } from './story'

export { SAVED_LIMIT }

/** Where the phone keeps the saved stories. (The native app's file of the same content is saved-stories.json: see legacy-import.ts.) */
export const SAVED_KEY = 'plax.saved-stories'

/** The saved stories do not fit what the phone keeps: too many, or too large. The message never holds any story. */
export class SavedStoriesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SavedStoriesError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * The stories the reader saved, in plain storage: they are public stories, not a credential. A port of SavedStories.java. A damaged
 * file is never silently replaced: reading it fails, the engine says so and writes nothing. A write that fails leaves what was there
 * as it was.
 */
export class SavedStories {
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = SAVED_KEY,
  ) {}

  /** No stories when nothing was saved yet; throws when what is saved is damaged or cannot be read. */
  async read(): Promise<Story[]> {
    const text = await this.store.getItem(this.key)
    return text === null ? [] : parseSaved(text)
  }

  async write(stories: readonly Story[]): Promise<void> {
    if (stories.length > SAVED_LIMIT) throw new SavedStoriesError('Saved story limit reached')
    const text = encodeSaved(stories)
    if (text.length > MAX_BYTES) throw new SavedStoriesError('Saved stories exceed storage limit')
    await this.store.setItem(this.key, text)
  }
}
