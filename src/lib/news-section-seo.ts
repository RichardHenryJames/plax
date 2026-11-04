// What each news section's page says about itself: its title, description and the phrases it targets (app/headlines/[section]).
// One entry for every section of NEWS_SECTIONS: a section without an entry has no page, and news-sections.test.mjs fails if one is
// missing. `language` is the page's language tag, and `dates` how the stories' times are written on it (a US page writes them the
// way a US reader does, in Eastern time).

export interface NewsSectionSeo {
  title: string
  desc: string
  kw: string[]
  language: string
  dates: { locale: string; timeZone?: string; timeZoneName?: 'short' }
}

export const NEWS_SECTION_SEO: Record<string, NewsSectionSeo> = {
  us: {
    title: 'US News Today — Latest Headlines from the United States',
    desc: 'The latest US news today: national headlines, politics, the economy and the stories shaping America, summarized in seconds and updated all day on Plax.',
    kw: ['US news', 'US news today', 'United States news', 'American news', 'breaking US news', 'top US headlines', 'national news today', 'US politics news'],
    language: 'en-US',
    dates: { locale: 'en-US', timeZone: 'America/New_York', timeZoneName: 'short' },
  },
  india: {
    title: 'India News Today — Latest Headlines',
    desc: 'The latest India news today — top national headlines, politics, and current affairs, summarized clearly and updated continuously on Plax.',
    kw: ['India news', 'India news today', 'national news', 'latest India headlines', 'current affairs India'],
    language: 'en',
    dates: { locale: 'en-IN' },
  },
  world: {
    title: 'World News Today — Global Headlines',
    desc: 'The latest world news today — global headlines and international affairs, summarized clearly and updated continuously on Plax.',
    kw: ['world news', 'international news', 'global headlines', 'world news today'],
    language: 'en',
    dates: { locale: 'en-IN' },
  },
  tech: {
    title: 'Technology News Today — Latest Tech Headlines',
    desc: 'The latest technology news today — AI, gadgets, startups and the companies shaping the future, summarized clearly on Plax.',
    kw: ['technology news', 'tech news today', 'AI news', 'gadget news', 'startup news'],
    language: 'en',
    dates: { locale: 'en-IN' },
  },
  business: {
    title: 'Business News Today — Markets & Economy',
    desc: 'The latest business news today — markets, economy, companies and finance, summarized clearly and updated continuously on Plax.',
    kw: ['business news', 'market news', 'economy news', 'finance news today'],
    language: 'en',
    dates: { locale: 'en-IN' },
  },
  science: {
    title: 'Science News Today — Latest Discoveries',
    desc: 'The latest science news today — research, discoveries and breakthroughs, explained simply and updated continuously on Plax.',
    kw: ['science news', 'science news today', 'research news', 'scientific discoveries'],
    language: 'en',
    dates: { locale: 'en-IN' },
  },
}
