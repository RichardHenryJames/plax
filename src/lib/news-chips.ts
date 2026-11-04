// Which feeds the News section chips (US, India, World, ...) belong to, and what a chosen chip does when the reader moves on.
//
// The stories of the Stocks topic are news cards too (their category is 'news', so everything that treats news as news treats
// them so: the layout, the ordering, the article openings), filed under a section of their own that is not one of the chips.
// No imports: the browser reads this, and so do the tests.

export const STOCKS_SECTION = 'stocks'

/** How a story of the Stocks topic is tagged, on its card and on its shared page. */
export const STOCKS_TAG = { id: STOCKS_SECTION, label: 'Stocks', labelHi: 'शेयर बाज़ार' }

interface CardLike {
  category?: string
  section?: string
}

/** A story of the general news: a news card that is not one of the Stocks topic. */
export const isGeneralNews = (card: CardLike | null | undefined): boolean => !!card && card.category === 'news' && card.section !== STOCKS_SECTION

/** Whether a feed has the general news in it, which is what the chips narrow. */
export const feedHasNews = (categories: readonly string[]): boolean => categories.includes('news')

/** Whether a feed's stories go stale within hours (news and stocks), so that a page kept from an earlier visit is not drawn as current for long. */
export const feedIsTimely = (categories: readonly string[]): boolean => categories.some((topic) => topic === 'news' || topic === STOCKS_SECTION)

/** The chip that stays chosen when the reader moves from one topic to another: only the same topic keeps it. */
export const sectionAfterTopicChange = (chosen: string | null, from: string | null, to: string | null): string | null => (from === to ? chosen : null)
