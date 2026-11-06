import type { Story } from '@/data/story'
import type { AuthConfig } from './auth-config'
import type { Tokens } from './auth-api'

/** The most stories the phone keeps saved, and the most the account is asked for (SavedStories.LIMIT of the native app). */
export const SAVED_STORIES_LIMIT = 200

/** What the signed-in reader keeps in their Plax account: their topics and their saved stories. Failures are AccountErrors. */
export interface CloudApi {
  topics(config: AuthConfig, tokens: Tokens): Promise<ReadonlySet<string>>
  saveTopics(config: AuthConfig, tokens: Tokens, topics: ReadonlySet<string>): Promise<void>
  bookmarks(config: AuthConfig, tokens: Tokens): Promise<Story[]>
  /** Saves stories to the account in one request; stories it already holds are left as they are. */
  addBookmarks(config: AuthConfig, tokens: Tokens, stories: readonly Story[]): Promise<void>
  removeBookmark(config: AuthConfig, tokens: Tokens, id: string): Promise<void>
}
