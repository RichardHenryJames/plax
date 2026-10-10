// The Plax story link: what a shared story is, how the server vouches for it, and what its address looks like.
//
// A card the feed serves carries `sig`, an HMAC the server computes over the card's own fields (share-sign.ts). When a
// reader shares a card, the client sends the card back; the server accepts it only if the signature matches, stores it,
// and the story page at /news/s/<slug>-<id> is built from that stored copy. So nobody can put words of their own on
// the site's domain: a card with a different headline, text or link no longer matches its signature.
//
// This file has no dependencies, so the browser, the server and the unit tests all use the same rules. The Android app
// follows the same canonical form (see ShareLinks.java): clients may trim text and decode "&amp;" in addresses, as the
// app's feed parser does, and the signature still matches because both sides canonicalise first.

export const SHARE_VERSION = 'plax-share-v1'

/** What identifies a story. These are the only fields the signature covers. */
export interface ShareCard {
  id: string
  title?: string
  content: string
  source?: string
  sourceUrl?: string
  image?: string
  publishedAt?: number
  category: string
  section?: string
}

/** Everything is trimmed and stripped of control characters (the separator below must never appear in a field). */
export function canonicalText(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
}

/** Feeds sometimes carry HTML-escaped ampersands in addresses, and the Android app decodes them, in this order. */
export function canonicalUrl(value: unknown): string {
  return canonicalText(value).split('&#038;').join('&').split('&#38;').join('&').split('&amp;').join('&')
}

export function signingString(card: ShareCard): string {
  const published = Number.isFinite(card.publishedAt) && (card.publishedAt as number) > 0 ? String(Math.trunc(card.publishedAt as number)) : '0'
  return [
    SHARE_VERSION,
    canonicalText(card.id),
    canonicalText(card.title),
    canonicalText(card.content),
    canonicalText(card.source),
    canonicalUrl(card.sourceUrl),
    canonicalUrl(card.image),
    published,
    canonicalText(card.category),
    canonicalText(card.section),
  ].join('\u0001')
}

/** The part of the signature that names a story in its address: 64 bits, public, and impossible to guess a match for. */
export const SHARE_ID_LENGTH = 16
export const SIGNATURE_PATTERN = /^[0-9a-f]{32}$/

export function shareId(signature: string): string {
  return signature.slice(0, SHARE_ID_LENGTH)
}

// ─── Addresses ───

/** Lower-case Latin words from the headline, at most 70 characters, for a readable address. */
export function slugify(title: string | undefined): string {
  const words = canonicalText(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!words) return 'story'
  if (words.length <= 70) return words
  const cut = words.slice(0, 70)
  const at = cut.lastIndexOf('-')
  return (at > 20 ? cut.slice(0, at) : cut).replace(/-+$/g, '')
}

/** "/s/<slug>-<id>", relative to the site's base path. */
export function sharePath(title: string | undefined, signature: string): string {
  return `/s/${slugify(title)}-${shareId(signature)}`
}

/** The last path segment back into its slug and id, or null when it is not a story address. */
export function parseShareSegment(segment: string): { slug: string; id: string } | null {
  const match = /^(?:(.*)-)?([0-9a-f]{16})$/.exec(segment)
  return match ? { slug: match[1] ?? '', id: match[2] } : null
}

// ─── What the server accepts and stores ───

export interface ShareRecord extends ShareCard {
  v: 1
  id: string
  /** The 16-character name in the story's address. */
  sid: string
  createdAt: number
}

const LIMITS = { id: 180, title: 2000, content: 8000, source: 200, url: 4096, category: 80, section: 40 }

function text(value: unknown, max: number, required = false): string | null {
  if (value === undefined || value === null) return required ? null : ''
  if (typeof value !== 'string') return null
  const clean = canonicalText(value)
  if (clean.length > max || (required && clean.length === 0)) return null
  return clean
}

function webAddress(value: unknown, protocols: string[]): string | null {
  const raw = text(value, LIMITS.url)
  if (raw === null) return null
  if (raw === '') return ''
  try {
    const url = new URL(canonicalUrl(raw))
    return protocols.includes(url.protocol) && url.hostname.length > 0 ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Reads what a client sent when sharing a card, or null when it is not a well-formed card. It does not decide whether
 * the card is genuine: that is the signature's job. Addresses are checked only so that nothing but a web address can
 * ever become a link or picture on the story page.
 */
export function readShareCard(body: unknown): { card: ShareCard; signature: string } | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const input = body as Record<string, unknown>
  const signature = typeof input.sig === 'string' ? input.sig.trim().toLowerCase() : ''
  if (!SIGNATURE_PATTERN.test(signature)) return null
  const id = text(input.id, LIMITS.id, true)
  const content = text(input.content, LIMITS.content, true)
  const category = text(input.category, LIMITS.category, true)
  const title = text(input.title, LIMITS.title)
  const source = text(input.source, LIMITS.source)
  const section = text(input.section, LIMITS.section)
  // A signature covers the exact text, so an address must be signed as the feed wrote it, not as the URL parser rewrites it.
  // A plain-http picture is accepted as part of a genuine card; the story page only ever shows https pictures.
  const sourceUrl = webAddress(input.sourceUrl, ['http:', 'https:'])
  const image = webAddress(input.image, ['http:', 'https:'])
  const published = input.publishedAt
  if (id === null || content === null || category === null || title === null || source === null || section === null
    || sourceUrl === null || image === null) return null
  if (published !== undefined && published !== null && (typeof published !== 'number' || !Number.isFinite(published) || published < 0)) return null
  return {
    signature,
    card: {
      id, title, content, source, section, category,
      sourceUrl: canonicalUrl(input.sourceUrl),
      image: canonicalUrl(input.image),
      publishedAt: typeof published === 'number' ? published : 0,
    },
  }
}

/** A short plain summary for a description or a preview: no line breaks, cut at a word. */
export function excerpt(value: string, max: number): string {
  const flat = canonicalText(value).replace(/\s+/g, ' ')
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s.,;:!?-]+$/, '')}…`
}

/** Hindi stories are recognised by their script, as the web card does, so a signature need not carry a language. */
export function isHindi(...parts: (string | undefined)[]): boolean {
  return /[\u0900-\u097F]/.test(parts.join(' '))
}

// The preview picture is drawn with a Latin-only font; Satori, which draws it, does not shape Devanagari correctly
// (vowel signs land on the wrong letter), so a card never draws any. Characters the font lacks are dropped.
const DRAWABLE = /[\u0020-\u007e\u00a0-\u00ff\u2010-\u2027\u2030-\u205e\u20ac\u2122]/

/**
 * The text as the preview picture can draw it, or null when too little of it could be drawn (a Hindi headline, say)
 * for what remains to say anything. The rupee sign is written "Rs" because the font has no glyph for it.
 */
export function latinCardText(value: string | undefined): string | null {
  const source = canonicalText(value).replace(/\s+/g, ' ').split('\u20b9').join('Rs ').replace(/Rs\s+(?=\d)/g, 'Rs ')
  if (source === '') return null
  let drawn = ''
  let lost = 0
  for (const character of source) {
    if (DRAWABLE.test(character)) drawn += character
    else lost += 1
  }
  const text = drawn.replace(/\s+/g, ' ').trim()
  return text === '' || lost > source.length * 0.15 ? null : text
}
