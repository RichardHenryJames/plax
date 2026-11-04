// The order the news feed shows its stories in, and which telling of one event is the one kept.
//
// A card has room for about a screen of text under its headline and a picture above it, and it does not scroll: a story with a
// line of text leaves a hole on it, and a story with no picture shows a stand-in. So a story that fills a card goes before one
// that does not, and when several outlets tell the same event the telling with the most to show is the one a reader gets.
import { bodyWithoutHeadline } from './story-body.ts'

/** A story with this much text under its headline fills a card on a phone; with less it leaves room that nothing fills. */
export const FULL_BODY_CHARS = 380
/** About the most text a card holds (lib/lead.ts keeps no more), so a longer text is worth no more than this. */
const MOST_TEXT_CHARS = 600
/** What a picture is worth, against a text of that many characters. */
const PICTURE_WORTH = 250

export interface Story {
  title?: string
  content?: string
  image?: string
  source?: string
  category?: string
  publishedAt?: number
}

/** The characters of text a card shows under the headline. */
export const bodyChars = (story: Story) => [...bodyWithoutHeadline(story.title, story.content ?? '')].length

/** Whether the story fills a card. */
export const isFull = (story: Story) => bodyChars(story) >= FULL_BODY_CHARS

/** How much a story has to show: its text, up to what a card holds, and a picture. */
export const richness = (story: Story) => Math.min(bodyChars(story), MOST_TEXT_CHARS) + (story.image ? PICTURE_WORTH : 0)

/** The same stories, the ones with more to show first and the rest as they were: when outlets tell one event, the first is kept. */
export function richestFirst<T extends Story>(stories: T[]): T[] {
  return stories
    .map((story, index) => ({ story, index, worth: richness(story) }))
    .sort((a, b) => b.worth - a.worth || a.index - b.index)
    .map((entry) => entry.story)
}

/** At most this many stories of one outlet, in the order they come, so that no publisher fills the stream. */
export function capPerSource<T extends Story>(stories: T[], maxPerSource: number): T[] {
  const counts = new Map<string, number>()
  const out: T[] = []
  for (const story of stories) {
    const key = story.source || 'other'
    const count = counts.get(key) ?? 0
    if (count >= maxPerSource) continue
    counts.set(key, count + 1)
    out.push(story)
  }
  return out
}

/**
 * The newest `limit` stories with no outlet crowding out the rest: an outlet that publishes often (a feed of a hundred items) would
 * otherwise fill a page of headlines alone. The most one outlet may have is an even share of the page, at least `minPerSource`, so a
 * section with few outlets still fills its page. `stories` are newest first.
 */
export function diverse<T extends Story>(stories: T[], limit: number, minPerSource = 3): T[] {
  const outlets = new Set(stories.map((story) => story.source || 'other')).size
  if (outlets === 0) return []
  return capPerSource(stories, Math.max(minPerSource, Math.ceil(limit / outlets))).slice(0, limit)
}

/**
 * The news stream: the newest first, no more than `perSource` of one outlet, and the stories that fill a card before those that do
 * not. The stories that do not fill one are shown after all that do, so that a feed that has enough full ones never shows a card
 * with a hole in it, and one that has not still shows what it has.
 */
export function newsOrder<T extends Story>(cards: T[], perSource: number, limit: number): T[] {
  const newest = cards.filter((card) => card.category === 'news').sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
  const full = capPerSource(newest.filter(isFull), perSource)
  if (full.length >= limit) return full.slice(0, limit)
  return [...full, ...capPerSource(newest.filter((card) => !isFull(card)), perSource)].slice(0, limit)
}
