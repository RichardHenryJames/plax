// Server-only: signs the cards the feed serves and checks the ones that come back for sharing. Uses Node's crypto, so it
// must never be imported by code that runs in the browser (share.ts holds everything the browser needs).
import { createHmac, timingSafeEqual } from 'node:crypto'
// The explicit extension lets the unit tests load this file straight under Node.
import { signingString, SIGNATURE_PATTERN, type ShareCard } from './share.ts'

/**
 * The signing key. A dedicated SHARE_SECRET wins when it is set; otherwise one is derived from the Supabase service key,
 * which is already a server-only secret in this deployment, so sharing needs no new setting. Deriving (an HMAC with a
 * fixed label) means the service key itself is never used to sign anything. Null when neither exists: cards then carry
 * no signature, and every client falls back to sharing the publisher's address.
 */
export function signingKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.SHARE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || secret.length < 16) return null
  return createHmac('sha256', secret).update('plax-share-key-v1').digest()
}

/** 128 bits of HMAC-SHA256, as 32 lower-case hex characters. */
export function signCard(card: ShareCard, key: Buffer | null = signingKey()): string | null {
  if (!key) return null
  return createHmac('sha256', key).update(signingString(card)).digest('hex').slice(0, 32)
}

export function verifyCard(card: ShareCard, signature: string, key: Buffer | null = signingKey()): boolean {
  if (!key || !SIGNATURE_PATTERN.test(signature)) return false
  const expected = signCard(card, key)
  if (!expected) return false
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'))
}
