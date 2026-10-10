// The browser's side of sharing a story as a Plax link (the rules themselves are in share.ts).
//
// A card the feed served carries a signature. Sharing sends the card, exactly as the feed served it, to the server,
// which stores a story page and names its address. Anything that goes wrong simply yields no link, and the caller
// shares the publisher's link as it always did, so sharing never stops working.
import { shareId, SIGNATURE_PATTERN, type ShareCard } from './share.ts'

/** The parts of a card this needs. `originalTitle` and `originalContent` are the feed's own words, before any translation. */
export interface Shareable {
  id: string
  title?: string
  content: string
  originalTitle?: string
  originalContent?: string
  source?: string
  sourceUrl?: string
  image?: string
  publishedAt?: number
  category: string
  section?: string
  sig?: string
}

export type ShareBody = ShareCard & { sig: string }

/**
 * The card as the feed served it, with its signature, or null when it cannot become a Plax link: it was not signed
 * (older cached cards, quotes) or it has no publisher link to point back to. A translated card is shared by its
 * original words, because the signature covers those.
 */
export function shareBody(card: Shareable): ShareBody | null {
  if (!card.sig || !SIGNATURE_PATTERN.test(card.sig) || !card.sourceUrl) return null
  return {
    id: card.id,
    title: card.originalTitle ?? card.title ?? '',
    content: card.originalContent ?? card.content,
    source: card.source,
    sourceUrl: card.sourceUrl,
    image: card.image,
    publishedAt: card.publishedAt,
    category: card.category,
    section: card.section,
    sig: card.sig,
  }
}

/** What a saved copy of a card must keep so that it can be shared later: everything the signature covers. */
export function signedFields(card: Shareable): { image?: string; publishedAt?: number; section?: string; sig?: string } {
  return card.sig ? { image: card.image, publishedAt: card.publishedAt, section: card.section, sig: card.sig } : {}
}

/** The address the server named, if it really is the story address of this card. */
export function storyAddress(url: unknown, id: unknown, body: ShareBody): string | null {
  if (typeof url !== 'string' || id !== shareId(body.sig)) return null
  try {
    const address = new URL(url)
    const named = /\/s\/[^/]*$/.test(address.pathname) && address.pathname.endsWith(`-${id}`)
    return (address.protocol === 'https:' || address.protocol === 'http:') && named ? address.toString() : null
  } catch {
    return null
  }
}

const made = new Map<string, string>()

/**
 * How long a reader waits for the link at most. The first request to a cold server can take a couple of seconds, and a
 * slow connection adds to that; giving up too early would silently lose the page for the very shares that are slow.
 */
export const SHARE_WAIT_MS = 6000

/** Whether this session already made the card's link, so that sharing it again needs no wait at all. */
export function knownShareLink(body: ShareBody): string | null {
  return made.get(body.sig) ?? null
}

/**
 * Asks the server to make the card's story page and returns its address, or null if that did not work out in time
 * (or the caller gave up by aborting `signal`). The address is the server's own, checked against the card's signature
 * before it is trusted. A first request to a cold server can take a couple of seconds, so the limit is generous.
 */
export async function createShareLink(
  body: ShareBody,
  options: { endpoint: string; fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal }
): Promise<string | null> {
  const known = made.get(body.sig)
  if (known) return known
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? SHARE_WAIT_MS)
  const giveUp = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', giveUp)
  try {
    const response = await (options.fetcher ?? fetch)(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const answer = (await response.json()) as { url?: unknown; id?: unknown } | null
    const address = storyAddress(answer?.url, answer?.id, body)
    if (address) {
      if (made.size >= 200) made.clear()
      made.set(body.sig, address)
    }
    return address
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', giveUp)
  }
}

/** Forgets what this session made. For tests. */
export function resetShareLinks(): void {
  made.clear()
}
