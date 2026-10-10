// Shared stories: the copy of a card that its story page is built from. Kept in the durable store (Supabase ai_cache,
// server-only), so the link keeps working after the story has left every feed, and after a server restart.
import { getDurable, listDurable, putDurable } from '@/lib/ai-cache'
import { shareId, type ShareCard, type ShareRecord } from '@/lib/share'

const KEY_PREFIX = 'share:v1:'
const keyFor = (sid: string) => `${KEY_PREFIX}${sid}`

/** The store could not be asked. Distinct from "no such story", which is an ordinary answer. */
export class ShareStoreUnavailable extends Error {
  constructor() {
    super('share store unavailable')
  }
}

/** The stored story, or null when there is none (or the name is not a story name). Throws when the store cannot be asked. */
export async function loadShare(sid: string): Promise<ShareRecord | null> {
  if (!/^[0-9a-f]{16}$/.test(sid)) return null
  const read = await getDurable<ShareRecord>(keyFor(sid))
  if (read.status === 'unavailable') throw new ShareStoreUnavailable()
  if (read.status !== 'found') return null
  const value = read.value
  return value && value.v === 1 && value.sid === sid && typeof value.content === 'string' ? value : null
}

/**
 * Stores the card for its story page and returns it. Null when the database did not take it, so no link is promised.
 * It is one write that leaves an existing page as it is: the same signature always means the same card, so there is
 * nothing to compare, and a read first would only cost the reader a second trip to the database.
 */
export async function saveShare(card: ShareCard, signature: string): Promise<ShareRecord | null> {
  const sid = shareId(signature)
  const record: ShareRecord = { v: 1, sid, ...card, createdAt: Date.now() }
  return (await putDurable(keyFor(sid), record, { keepExisting: true })) ? record : null
}

/** The most recently shared stories, for the sitemap. */
export async function recentShares(limit: number): Promise<ShareRecord[]> {
  const rows = await listDurable<ShareRecord>(KEY_PREFIX, limit)
  return rows.filter((row) => row && row.v === 1 && typeof row.sid === 'string')
}
