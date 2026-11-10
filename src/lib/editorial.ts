// What the editorial policy page (app/editorial-policy) says about where Plax's stories come from, in a file of its own so that a test can
// compare it with what the server really reads (lib/types.ts, lib/stocks.ts, lib/sources.ts): a name listed here has to be one of the feeds, so
// the page can say less than the whole truth (the Stocks feed alone reads more than forty publishers) but never more.
export interface SourceGroup {
  heading: string
  names: string[]
}

export const SOURCE_GROUPS: SourceGroup[] = [
  { heading: 'India', names: ['The Hindu', 'NDTV', 'India Today'] },
  {
    heading: 'The world and the United States',
    names: ['BBC News', 'Al Jazeera', 'NPR', 'PBS NewsHour', 'CBS News', 'NBC News', 'ABC News', 'The Hill', 'The Guardian', 'DW', 'France 24', 'Sky News'],
  },
  {
    heading: 'Technology, science and space',
    names: ['The Verge', 'TechCrunch', 'Ars Technica', 'Wired', 'Engadget', 'Science Daily', 'Phys.org', 'Live Science', 'NASA', 'Space.com', 'Hacker News'],
  },
  {
    heading: 'Business and markets',
    names: ['CNBC', 'Bloomberg', 'The Wall Street Journal', 'Financial Times', 'MarketWatch', 'Fortune', 'Business Insider', 'The Hindu BusinessLine', 'The Economic Times', 'Mint', 'NDTV Profit', 'CNBC-TV18'],
  },
  { heading: 'In Hindi', names: ['BBC Hindi', 'Dainik Bhaskar', 'NDTV Hindi'] },
  {
    heading: 'Reference and open sources',
    names: ['Wikipedia', 'arXiv', 'Open Library', 'Project Gutenberg', 'The Metropolitan Museum of Art'],
  },
]

/** How a name above is spelled in the code, where that is not the name itself (the Hindi feeds are named in Devanagari there). */
export const NAME_IN_CODE: Record<string, string> = {
  'BBC Hindi': 'BBC हिंदी',
  'Dainik Bhaskar': 'दैनिक भास्कर',
  'NDTV Hindi': 'NDTV हिंदी',
  'The Metropolitan Museum of Art': 'The Met',
}
