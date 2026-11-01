// What stands in for the picture of a story that has none, as in the app (StoryAdapter.emoji): the sign of its news section
// (India is the flag), else its topic's own emoji, else a spark. Pure, so it can be tested without a browser.

/** The news sections' signs. They are the app's too: poster.test.mjs fails if the two drift apart. */
export const SECTION_POSTERS: Record<string, string> = {
  india: '\u{1F1EE}\u{1F1F3}',
  world: '\u{1F30D}',
  tech: '\u{1F4BB}',
  business: '\u{1F4BC}',
  science: '\u{1F52C}',
}

/** The sign for a story's poster: `key` is its section, else its category; `topicEmoji` is that topic's own emoji, when it has one. */
export function posterEmoji(key: string, topicEmoji?: string): string {
  return SECTION_POSTERS[key] ?? topicEmoji ?? '\u2728'
}

/**
 * Whether a card is drawn with a poster in place of a picture: every story that has no picture, or whose picture could not be
 * loaded, as in the app, so that all of them keep the same rhythm. A quote is its own picture, and while the card is being
 * made ready nothing but the shimmer is drawn.
 */
export function wantsPoster(card: { type?: string; image?: string }, state: { translating: boolean; imageFailed: boolean }): boolean {
  if (state.translating || card.type === 'quote') return false
  return !card.image || state.imageFailed
}
