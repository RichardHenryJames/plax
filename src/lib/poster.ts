// What stands in for the picture of a story that has none: the name of Plax, set like a masthead over a soft wash, with the story's
// section under it. (It used to be the name of the story's outlet, which put a publisher's name large over every card without a
// picture of its own; the publisher is named, small, in the line above the headline, which is where Google Play asks an aggregator to
// say where a story comes from. Before that it was a sign: the flag of India, a globe for the world. The flag is not drawn at all by
// Windows, which showed "IN" in a box, and a globe on a news story looked like a placeholder, which it was.) The app draws the same
// poster (StoryAdapter, StoryPage). Pure, so it can be tested without a browser.

/** The masthead: Plax, whatever outlet the story comes from. */
export const POSTER_NAME = 'Plax'

export function posterName(): string {
  return POSTER_NAME
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
