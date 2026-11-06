/**
 * A story as the feed serves it and as the phone keeps it (saved, cached, shared): plain text and numbers, no behaviour. The rules
 * about a story (its body without the headline repeated, its reading time, its link) are the functions below. A port of Story.java of
 * the native app (1.7.1), with the same rules and test cases.
 */
export interface Story {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly category: string
  readonly section: string
  readonly source: string
  readonly sourceUrl: string
  readonly image: string
  readonly readTime: string
  /** Milliseconds since 1970, or 0 when the feed gave no time. */
  readonly publishedAt: number
  /** The server's signature over the story as it served it (32 lower-case hexadecimal digits), or '' when it has none. */
  readonly sig: string
}

const MINIMUM_BODY = 12

export const CAUGHT_UP_ID = '__caught_up__'

/** A story made from the fields given; the rest are empty (the category is "news"). */
export function makeStory(fields: Partial<Story> & { id: string }): Story {
  return {
    id: fields.id,
    title: fields.title ?? '',
    content: fields.content ?? '',
    category: fields.category ?? 'news',
    section: fields.section ?? '',
    source: fields.source ?? '',
    sourceUrl: fields.sourceUrl ?? '',
    image: fields.image ?? '',
    readTime: fields.readTime ?? '',
    publishedAt: fields.publishedAt ?? 0,
    sig: fields.sig ?? '',
  }
}

/** The server's signature over a story as it served it: 32 lower-case hexadecimal characters. */
export function isSignature(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)
}

const CAUGHT_UP: Story = Object.freeze(makeStory({ id: CAUGHT_UP_ID }))

/** Marks the end of the new stories. It is shown like a card but is never a real story. */
export const caughtUp = (): Story => CAUGHT_UP

export const isCaughtUp = (story: Story): boolean => story.id === CAUGHT_UP_ID

/**
 * The full-page ad that stands between stories, after every fifth one. Like the caught-up card it is a page of the pager but never a
 * story: the feed engine never holds one (the pager's list is made from the engine's with the ads put in), so it is never read,
 * saved or shared.
 */
export const adStory = (ordinal: number): Story => makeStory({ id: `__ad_${ordinal}__` })

export const isAd = (story: Story): boolean => story.id.startsWith('__ad_') && story.id.endsWith('__') && story.id.length > 6

/** The number of the slot an ad page stands in, from 1, or 0 for anything else. */
export function adOrdinal(story: Story): number {
  if (!isAd(story)) return 0
  const digits = story.id.slice(5, -2)
  return /^\d+$/.test(digits) ? Number(digits) : 0
}

/** What two stories with the same headline have in common, for finding repeats: the headline in lower case with its spaces collapsed. */
export function headlineKey(story: Story): string {
  return story.title.trim() === '' ? story.id : story.title.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** What sets a repeated headline apart from the text after it: a colon, full stop, bar, dash, ellipsis or danda. */
const AFTER_HEADLINE = /^(?:\s*[:.|\u2013\u2014\u2026\u0964]|\s+-)[\s:.|\u2013\u2014\u2026\u0964-]*/

const comparable = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').replace(/[.\u2026\s]+$/, '')

/**
 * Body text without the headline repeated: the feed often returns it again as the whole text, or as a first sentence set apart by a
 * separator. A sentence that merely begins with the headline stays whole, so "Evolution" over "Evolution is the change in..." never
 * becomes "is the change in...".
 */
export function bodyOf(story: Story): string {
  const text = story.content.trim()
  const lead = story.title.trim()
  if (lead === '') return text
  if (comparable(text) === comparable(lead)) return ''
  if (text.length > lead.length && text.slice(0, lead.length).toLowerCase() === lead.toLowerCase()) {
    const separator = AFTER_HEADLINE.exec(text.slice(lead.length))
    if (separator) {
      const rest = text.slice(lead.length + separator[0].length).trim()
      return rest.length < MINIMUM_BODY ? '' : rest
    }
  }
  return text
}

/** An https address with a host, and no user name, password or port. Anything else is not a link the app opens or loads. */
export function isWebLink(value: string): boolean {
  if (!/^https:\/\/[^\s]+$/i.test(value)) return false
  const authority = /^https:\/\/([^/?#]*)/i.exec(value)?.[1] ?? ''
  if (authority === '' || authority.includes('@') || /:\d*$/.test(authority)) return false
  try {
    const address = new URL(value)
    return address.protocol === 'https:' && address.hostname !== '' && address.username === '' && address.password === ''
  } catch {
    return false
  }
}

const READ_TIME = /^(\d{1,4})\s*(s|secs?|seconds?|m|mins?|minutes?)$/i

/** The reading time from the feed ("13s", "30 sec", "2 min") in seconds, or -1 when it has another form. */
export function readSeconds(story: Story): number {
  const time = READ_TIME.exec(story.readTime.trim())
  if (!time) return -1
  const amount = Number(time[1])
  return time[2].toLowerCase().startsWith('m') ? amount * 60 : amount
}

export const hasSource = (story: Story): boolean => isWebLink(story.sourceUrl)

export const hasImage = (story: Story): boolean => isWebLink(story.image)

/** The publisher's host without a leading www., or '' when the story has no usable link. */
export function sourceHost(story: Story): string {
  if (!hasSource(story)) return ''
  const host = new URL(story.sourceUrl).hostname.toLowerCase()
  return host.startsWith('www.') ? host.slice(4) : host
}
