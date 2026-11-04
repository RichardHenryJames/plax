// The Stocks topic: stock-market news from around the world, read from the markets and business desks of outlets in every region.
//
// Each feed below was fetched on 4 November 2026, with the User-Agent the server sends, and kept only if it answered with fresh items
// that carry a description of their own (the app needs a headline of 12 characters and a description of 40). Some sites answer a
// browser and not a reader that says who it is (Nasdaq never answered, Business Standard refuses), and are not here.
//
// A feed that is about the markets gives all its stories; the business desk of a general outlet gives only the stories that are
// about shares, markets, companies' results or investing (isStockStory), so a page of Stocks is never a page of property prices
// and recipes. Server side only: the browser needs just the section's name (lib/news-chips.ts).

export type StockRegion =
  | 'United States'
  | 'Canada'
  | 'United Kingdom and Ireland'
  | 'Europe'
  | 'India'
  | 'Asia and Pacific'
  | 'Middle East and Africa'
  | 'Latin America'
  | 'Global'

export interface StockFeed {
  /** The outlet, as the card names it. Several feeds of one outlet share a name, so one outlet never fills a page. */
  name: string
  url: string
  region: StockRegion
  /** The feed is about the markets: every story in it is kept. Otherwise it is a business desk and the stories are filtered. */
  markets: boolean
  /** How many of its newest items are read (STOCK_FEED_ITEMS when not said). */
  max?: number
}

/** How many of a feed's newest items are read, unless the feed says otherwise. */
export const STOCK_FEED_ITEMS = 40
/** A feed that has not answered in this long is given up on; the pool must be ready within the sources' deadline (lib/deadline.ts). */
export const STOCK_FEED_TIMEOUT_MS = 6000
/** The pool does not wait for the feeds that are slow: once this long has passed and this share of the feeds has answered (or failed), it goes ahead. */
export const STOCK_SETTLE_MS = 4000
export const STOCK_SETTLE_SHARE = 0.9
/** Stories older than this are left out: a feed's oldest items can be weeks old, and market news is stale in days. */
export const STOCK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** The most stories the pool holds (the newest), so that it stays well inside what the server's data cache can keep. */
export const STOCK_POOL_MAX = 1200
/** The most stories of one outlet in the pool: a feed that publishes hundreds a day would otherwise be most of it. */
export const STOCK_OUTLET_MAX = 130
/** The most text of a story the pool keeps; a card holds about this much (lib/story-order.ts), so more would only weigh down the cache. */
export const STOCK_TEXT_MAX = 600
/** The stream groups its stories by age (see newsOrder): the last 6 hours, up to a day, up to 3 days, and older, so that this morning's lead. */
export const STOCK_AGE_STEPS_MS = [6, 24, 72].map((hours) => hours * 60 * 60 * 1000)
/** The most stories of one outlet on a page of the stream: fewer than the News has, because the Stocks feed has many more outlets to show. */
export const STOCK_PER_PAGE_OUTLET = 4

const CNBC = (id: number) => `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=${id}`

export const STOCK_FEEDS: StockFeed[] = [
  // United States
  { name: 'CNBC', url: CNBC(15839069), region: 'United States', markets: true },
  { name: 'CNBC', url: CNBC(15839135), region: 'United States', markets: true },
  { name: 'CNBC', url: CNBC(10000664), region: 'United States', markets: false },
  { name: 'CNBC', url: CNBC(100003114), region: 'United States', markets: false },
  { name: 'CNBC', url: CNBC(10001147), region: 'United States', markets: false },
  { name: 'CNBC', url: CNBC(20910258), region: 'United States', markets: false },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', region: 'United States', markets: true },
  { name: 'The Wall Street Journal', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', region: 'United States', markets: true, max: 60 },
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', region: 'United States', markets: true },
  // Templated notes (dividends declared, earnings due on Wednesday) for thousands of companies: a taste, not a quarter of the feed.
  { name: 'MarketBeat', url: 'https://www.marketbeat.com/rss.ashx?type=headlines', region: 'United States', markets: true, max: 25 },
  { name: 'The Motley Fool', url: 'https://www.fool.com/feeds/index.aspx', region: 'United States', markets: true, max: 50 },
  { name: 'InvestorPlace', url: 'https://investorplace.com/feed/', region: 'United States', markets: true, max: 50 },
  { name: 'Benzinga', url: 'https://www.benzinga.com/feed', region: 'United States', markets: true },
  { name: 'Business Insider', url: 'https://markets.businessinsider.com/rss/news', region: 'United States', markets: true },
  { name: 'Fortune', url: 'https://fortune.com/feed/', region: 'United States', markets: false },
  { name: 'Kiplinger', url: 'https://www.kiplinger.com/feed/all', region: 'United States', markets: false, max: 50 },
  { name: 'Fox Business', url: 'https://moxie.foxbusiness.com/google-publisher/latest.xml', region: 'United States', markets: false },
  { name: 'NBC News', url: 'https://feeds.nbcnews.com/nbcnews/public/business', region: 'United States', markets: false },
  { name: 'CBS MoneyWatch', url: 'https://www.cbsnews.com/latest/rss/moneywatch', region: 'United States', markets: false },
  // Canada
  { name: 'The Globe and Mail', url: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business/', region: 'Canada', markets: false, max: 100 },
  // United Kingdom and Ireland
  { name: 'This is Money', url: 'https://www.thisismoney.co.uk/money/markets/index.rss', region: 'United Kingdom and Ireland', markets: true, max: 80 },
  { name: 'The Guardian', url: 'https://www.theguardian.com/business/stock-markets/rss', region: 'United Kingdom and Ireland', markets: true },
  { name: 'The Guardian', url: 'https://www.theguardian.com/uk/business/rss', region: 'United Kingdom and Ireland', markets: false },
  { name: 'The Guardian', url: 'https://www.theguardian.com/business/economics/rss', region: 'United Kingdom and Ireland', markets: false },
  { name: 'Financial Times', url: 'https://www.ft.com/markets?format=rss', region: 'United Kingdom and Ireland', markets: true },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', region: 'United Kingdom and Ireland', markets: false },
  { name: 'City A.M.', url: 'https://www.cityam.com/feed/', region: 'United Kingdom and Ireland', markets: false },
  { name: 'The Independent', url: 'https://www.independent.co.uk/news/business/rss', region: 'United Kingdom and Ireland', markets: false },
  { name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/business.xml', region: 'United Kingdom and Ireland', markets: false },
  { name: 'Evening Standard', url: 'https://www.standard.co.uk/business/rss', region: 'United Kingdom and Ireland', markets: false },
  { name: 'RTÉ', url: 'https://www.rte.ie/news/rss/business-headlines.xml', region: 'United Kingdom and Ireland', markets: false },
  // Europe
  { name: 'CNBC', url: CNBC(19794221), region: 'Europe', markets: false },
  { name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-bus', region: 'Europe', markets: false },
  { name: 'France 24', url: 'https://www.france24.com/en/business/rss', region: 'Europe', markets: false },
  // India
  { name: 'The Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', region: 'India', markets: true, max: 50 },
  { name: 'The Economic Times', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms', region: 'India', markets: true, max: 50 },
  { name: 'The Economic Times', url: 'https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms', region: 'India', markets: false, max: 50 },
  { name: 'The Economic Times', url: 'https://economictimes.indiatimes.com/wealth/rssfeeds/837555174.cms', region: 'India', markets: false, max: 50 },
  { name: 'Mint', url: 'https://www.livemint.com/rss/markets', region: 'India', markets: true },
  { name: 'Mint', url: 'https://www.livemint.com/rss/companies', region: 'India', markets: false },
  { name: 'Mint', url: 'https://www.livemint.com/rss/money', region: 'India', markets: false },
  { name: 'The Hindu BusinessLine', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss', region: 'India', markets: true, max: 60 },
  { name: 'The Hindu BusinessLine', url: 'https://www.thehindubusinessline.com/companies/feeder/default.rss', region: 'India', markets: false, max: 60 },
  { name: 'The Hindu BusinessLine', url: 'https://www.thehindubusinessline.com/economy/feeder/default.rss', region: 'India', markets: false, max: 60 },
  { name: 'CNBC-TV18', url: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml', region: 'India', markets: true, max: 100 },
  { name: 'NDTV Profit', url: 'https://feeds.feedburner.com/ndtvprofit-latest', region: 'India', markets: true },
  // Asia and Pacific
  { name: 'CNBC', url: CNBC(19832390), region: 'Asia and Pacific', markets: false },
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/92/feed', region: 'Asia and Pacific', markets: false, max: 50 },
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', region: 'Asia and Pacific', markets: false, max: 50 },
  { name: 'The Straits Times', url: 'https://www.straitstimes.com/news/business/rss.xml', region: 'Asia and Pacific', markets: false },
  { name: 'ABC News Australia', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', region: 'Asia and Pacific', markets: false },
  { name: 'The Sydney Morning Herald', url: 'https://www.smh.com.au/rss/business.xml', region: 'Asia and Pacific', markets: false },
  { name: 'NZ Herald', url: 'https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/business/?outputType=xml', region: 'Asia and Pacific', markets: false },
  { name: 'Japan Today', url: 'https://japantoday.com/category/business/feed', region: 'Asia and Pacific', markets: false },
  { name: 'Bangkok Post', url: 'https://www.bangkokpost.com/rss/data/business.xml', region: 'Asia and Pacific', markets: false },
  { name: 'The Daily Star', url: 'https://www.thedailystar.net/business/rss.xml', region: 'Asia and Pacific', markets: false },
  // Middle East and Africa
  { name: 'Moneyweb', url: 'https://www.moneyweb.co.za/feed/', region: 'Middle East and Africa', markets: false },
  { name: 'BusinessDay', url: 'https://businessday.ng/feed/', region: 'Middle East and Africa', markets: false },
  // Latin America
  { name: 'Buenos Aires Times', url: 'https://www.batimes.com.ar/feed', region: 'Latin America', markets: false, max: 100 },
  { name: 'MercoPress', url: 'https://en.mercopress.com/rss', region: 'Latin America', markets: false },
  { name: 'The Rio Times', url: 'https://www.riotimesonline.com/feed/', region: 'Latin America', markets: false },
  { name: 'Mexico News Daily', url: 'https://mexiconewsdaily.com/feed/', region: 'Latin America', markets: false },
  // Everywhere
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', region: 'Global', markets: false, max: 30 },
]

// What makes a story one for a stock-market reader: the places and instruments (shares, bonds, funds, the indexes), what happens to
// them (results, offers, dividends) and who and what moves them (investors, analysts, central banks, rates, oil, inflation). A word
// stands alone: "share" is in "shareholder" but not in "shareware". A plain "market" is not enough (the housing market is not one),
// "markets" and "stock market" are. Few words and exact ones: a business desk has plenty of stories, and one that does not belong
// is worse than one that is left out.
const STOCK_WORDS = [
  'stocks?', 'shares', 'share (?:price|prices|market|sale|sales|buybacks?|offering)', 'equit(?:y|ies)', 'bonds?', 'etfs?', 'mutual funds?',
  'hedge funds?', 'index funds?', 'private equity', 'futures', 'commodit(?:y|ies)', 'forex', 'currenc(?:y|ies)', 'markets', 'stock markets?',
  'stock exchange', 'bourses?', 'bull market', 'bear market', 'wall street', 'nasdaq', 'nyse', 'dow jones', 'dow', 's&p(?: 500)?', 'russell 2000',
  'ftse(?: 100| 250)?', 'dax', 'cac 40', 'stoxx', 'nikkei', 'topix', 'hang seng', 'kospi', 'asx', 'tsx', 'sensex', 'nifty', 'bse', 'nse', 'sgx',
  'ipos?', 'initial public offering', 'earnings', 'dividends?', 'buybacks?', 'stock split', 'quarterly (?:results|profit|earnings|revenue)',
  'q[1-4] (?:results|earnings)', 'profit warning', 'price targets?', 'investors?', 'investing', 'traders?', 'trading (?:session|day|volume|desk|halt)',
  'analysts?', 'brokerages?', 'fund managers?', 'fed', 'federal reserve', 'central banks?', 'interest rates?', 'rate (?:cut|cuts|hike|hikes|decision)s?',
  'inflation', '(?:treasury|bond|gilt) yields?', 'yields', 'oil prices?', 'crude', 'brent', 'opec', 'gold (?:price|prices|rates?)', 'rupee',
  'takeover', 'mergers?', 'acquisitions?', 'buyout', 'profits?', 'revenues?',
]
const STOCK_STORY = new RegExp(`(?:^|[^\\w-])(?:${STOCK_WORDS.join('|')})(?![\\w-])`, 'i')

/** Whether a story (its headline and the text under it) is about the markets, companies' results or investing. */
export function isStockStory(title: string, text = ''): boolean {
  return STOCK_STORY.test(title) || STOCK_STORY.test(text)
}

// Stories that are about the markets in name only: a "price prediction for 2030" is written for search engines, not as news.
const STOCK_FILLER = /\bprice predictions?\b/i

/** Whether the pool has waited long enough for the feeds that have not answered: some hang for a minute at a time. */
export function settled(answered: number, total: number, elapsedMs: number): boolean {
  return answered >= total || (elapsedMs >= STOCK_SETTLE_MS && answered >= total * STOCK_SETTLE_SHARE)
}

export interface StockStory {
  title: string
  content: string
  source: string
  url?: string
  publishedAt?: number
}

const wordsOf = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The page's address without what only tracks a visit, so that one story reached through two feeds is one story. */
function addressOf(url: string | undefined): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return ''
  }
}

/** A text cut at the end of a word, with an ellipsis, when it is longer than `max`. */
export function clip(text: string, max = STOCK_TEXT_MAX): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * The pool from what each feed answered: the stories of the last week (with no time, or a time in the future, a story is not
 * placed: it would lead or sink the feed), the business desks' stories filtered to those about the markets, one telling of each
 * story, no more than STOCK_OUTLET_MAX of an outlet and STOCK_POOL_MAX in all, newest first. Does not change what it is given.
 */
export function pickStocks<T extends StockStory>(answers: { feed: StockFeed; stories: T[] }[], now = Date.now()): T[] {
  const addresses = new Set<string>()
  const headlines = new Set<string>()
  const perOutlet = new Map<string, number>()
  const chosen: T[] = []
  const all = answers
    .flatMap(({ feed, stories }) => stories.map((story) => ({ story, markets: feed.markets })))
    .filter(({ story, markets }) => {
      const at = story.publishedAt
      if (at === undefined || now - at > STOCK_MAX_AGE_MS || at - now > 60 * 60 * 1000) return false
      if (STOCK_FILLER.test(story.title)) return false
      return markets || isStockStory(story.title, story.content)
    })
    .sort((a, b) => (b.story.publishedAt ?? 0) - (a.story.publishedAt ?? 0))
  for (const { story } of all) {
    const address = addressOf(story.url)
    const headline = wordsOf(story.title)
    if ((address && addresses.has(address)) || headlines.has(headline)) continue
    const outlet = perOutlet.get(story.source) ?? 0
    if (outlet >= STOCK_OUTLET_MAX) continue
    if (address) addresses.add(address)
    headlines.add(headline)
    perOutlet.set(story.source, outlet + 1)
    chosen.push({ ...story, content: clip(story.content) })
    if (chosen.length >= STOCK_POOL_MAX) break
  }
  return chosen
}

/** How many feeds and outlets each region has. */
export function stockCoverage(feeds: StockFeed[] = STOCK_FEEDS): Record<string, { feeds: number; outlets: number }> {
  const out: Record<string, { feeds: number; outlets: Set<string> }> = {}
  for (const feed of feeds) {
    const region = (out[feed.region] ??= { feeds: 0, outlets: new Set() })
    region.feeds++
    region.outlets.add(feed.name)
  }
  return Object.fromEntries(Object.entries(out).map(([region, { feeds: n, outlets }]) => [region, { feeds: n, outlets: outlets.size }]))
}
