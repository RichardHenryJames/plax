import type { KeyValueStore } from '../platform/storage'
import { MAX_BYTES } from './feed-parser'
import { SeenStore } from './seen-store'

/** Where the phone keeps the seen history. */
export const SEEN_KEY = 'plax.seen-stories'

/** The seen history across launches. It is a convenience: a damaged file just means starting over (the engine deletes it then). */
export class SeenFile {
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = SEEN_KEY,
  ) {}

  /** An empty history when nothing was saved yet; throws when what is saved is damaged or too large. */
  async read(now: number): Promise<SeenStore> {
    const text = await this.store.getItem(this.key)
    if (text === null) return new SeenStore()
    if (text.length > MAX_BYTES) throw new Error('Seen history exceeds storage limit')
    return SeenStore.fromJson(text, now)
  }

  async write(seen: SeenStore): Promise<void> {
    const text = seen.toJson()
    if (text.length > MAX_BYTES) throw new Error('Seen history exceeds storage limit')
    await this.store.setItem(this.key, text)
  }

  async delete(): Promise<void> {
    await this.store.removeItem(this.key)
  }
}
