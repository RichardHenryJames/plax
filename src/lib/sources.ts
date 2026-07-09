import { RawContent, CATEGORY_MAP, TOPIC_SUBREDDITS, TOPIC_WIKI_QUERIES } from './types'

// ─── HTML Cleaning (for HN and Reddit raw content) ───

function stripHtml(html: string): string {
  return html
    // Replace <p> and <br> with newlines
    .replace(/<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove all other HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Wikipedia Random Articles (truly random each call) ───

export async function fetchWikipediaContent(count: number = 12): Promise<RawContent[]> {
  const results: RawContent[] = []

  // ONE request for `count` random articles via generator=random — far fewer HTTP
  // calls than N parallel /random/summary fetches. Those bursts get rate-limited
  // (429) from shared serverless IPs (Vercel) → an EMPTY Wikipedia feed. A single
  // batched call is reliable. (extracts API caps at 20 intros per query.)
  try {
    const grnlimit = Math.min(Math.max(count, 1), 20)
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json' +
      `&generator=random&grnnamespace=0&grnlimit=${grnlimit}` +
      '&prop=extracts|info|description&exintro=1&explaintext=1&inprop=url&origin=*'
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
    })
    if (r.ok) {
      const data = await r.json()
      const pages = data?.query?.pages || {}
      for (const key of Object.keys(pages)) {
        const p = pages[key]
        const extract: string = (p?.extract || '').trim()
        // Skip stubs + the boring biography/place/species/media/product entries.
        if (!extract || extract.length < 120) continue
        if (isLowQualityWikipedia(p.description || '', p.title || '', extract)) continue
        results.push({
          title: p.title,
          content: trimToSentence(extract, 700),
          url: p.fullurl || `https://en.wikipedia.org/?curid=${p.pageid}`,
          source: 'Wikipedia',
          category: categorizeWikipedia(p.description || p.title),
        })
      }
    }
  } catch (error) {
    console.error('Wikipedia random error:', error)
  }

  // Fetch "On this day" facts
  try {
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()

    const response = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/${month}/${day}`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.selected) {
        data.selected.slice(0, 5).forEach((event: any) => {
          if (event.text) {
            results.push({
              title: `On This Day in ${event.year}`,
              content: event.text,
              url: event.pages?.[0]?.content_urls?.desktop?.page,
              source: 'Wikipedia - On This Day',
              category: 'history',
            })
          }
        })
      }
    }
  } catch (error) {
    console.error('Wikipedia On This Day error:', error)
  }

  return results
}

function categorizeWikipedia(description: string): string {
  const desc = description.toLowerCase()
  if (desc.includes('physic') || desc.includes('quantum')) return 'physics'
  if (desc.includes('biolog') || desc.includes('species') || desc.includes('animal')) return 'nature'
  if (desc.includes('math') || desc.includes('theorem')) return 'math'
  if (desc.includes('philosoph')) return 'philosophy'
  if (desc.includes('psycholog')) return 'psychology'
  if (desc.includes('histor') || desc.includes('war') || desc.includes('empire')) return 'history'
  if (desc.includes('computer') || desc.includes('software') || desc.includes('programming') ||
    desc.includes('algorithm') || desc.includes('engineer') || desc.includes('internet') ||
    desc.includes('digital') || desc.includes('database') || desc.includes('cryptograph'))
    return 'programming'
  if (desc.includes('econom') || desc.includes('business')) return 'finance'
  if (desc.includes('art') || desc.includes('painter') || desc.includes('artist')) return 'art'
  if (desc.includes('space') || desc.includes('planet') || desc.includes('star')) return 'space'
  return 'science' // default
}

// True for the boring random-Wikipedia stubs we don't want as reading cards:
// individual people, tiny geographic places, administrative units, sports/season
// pages, single crime/disaster events, and media/product entries. Uses the
// Wikidata short description (very reliable signal) plus title/extract heuristics.
function isLowQualityWikipedia(description: string, title: string, extract: string): boolean {
  const d = description.toLowerCase()

  // People (roles in the description = it's a biography, which makes a dull card)
  if (/\b(footballer|football player|basketball player|baseball player|cricketer|rugby player|tennis player|golfer|athlete|swimmer|boxer|wrestler|cyclist|racing driver|racecar driver|jockey|politician|senator|congressman|governor|mayor|minister|diplomat|actor|actress|singer|rapper|musician|drummer|guitarist|pianist|composer|dj|painter|sculptor|illustrator|photographer|architect|novelist|poet|playwright|author|writer|journalist|blogger|bishop|archbishop|priest|pastor|rabbi|imam|saint|monk|nun|general|colonel|admiral|soldier|officer|pilot|aviator|flying ace|lawyer|judge|physician|surgeon|nurse|businessperson|businessman|businesswoman|entrepreneur|ceo|model|youtuber|streamer|influencer|chef|monarch|king|queen|emperor|prince|princess|duke|duchess|earl|nobleman|noblewoman|aristocrat)\b/.test(d))
    return true
  if (/\bborn \d{3,4}\b/.test(d) || /\(\d{4}[-–]/.test(title)) return true

  // Biography openers in the extract (catches people whose Wikidata description is
  // empty): "Name (born 1987)…", "(1901–1980)…", or "… was an American politician".
  const head = extract.slice(0, 180)
  if (/\(born \d|\(\d{3,4}\s*[–-]\s*\d{3,4}\)|\bb\.\s*\d{4}\b/i.test(head)) return true
  if (/\b(is|was) (a|an|the) [a-z-]+ (politician|footballer|player|actor|actress|singer|musician|writer|author|poet|painter|general|officer|bishop|saint|monarch|king|queen|emperor|businessman|businesswoman|lawyer|physician)\b/i.test(head))
    return true

  // Place/geography openers in the extract (catches stubs whose Wikidata
  // description is empty — e.g. "Samowicze is a village in eastern Poland").
  if (/\b(is|was) (a|an) [a-z\s,'-]*?\b(village|hamlet|town|city|municipality|commune|comune|locality|settlement|county|district|province|region|neighbou?rhood|suburb|civil parish|rural locality|census-designated place|unincorporated community)\b/i.test(head))
    return true
  if (/\b(is|was) (a|an) [a-z\s,'-]*?\b(river|creek|stream|mountain|peak|hill|lake|reservoir|island|islet|bay|glacier|railway station|airport|airfield)\b/i.test(head))
    return true

  // Media / creative-work openers in the extract (catches albums, songs, films,
  // shows, games with empty Wikidata descriptions — e.g. "X is the ninth studio
  // album by…", "Y is a 2019 film…", "Z is a video game developed by…").
  if (/\b(is|was) (a|an|the) [a-z0-9\s,'-]*?\b(studio album|live album|compilation album|album|extended play|ep|song|single|soundtrack|mixtape)\b\s+(by|from|released|recorded)/i.test(head))
    return true
  if (/\b(is|was) (a|an|the) \d{4}\s+[a-z\s-]*?\b(film|movie|television film|documentary|short film)\b/i.test(head))
    return true
  if (/\b(is|was) (a|an|the) [a-z\s-]*?\b(television series|tv series|television sitcom|sitcom|miniseries|web series|anime television|drama series|reality (television|show)|video game|role-playing game|first-person shooter|comic book|manga|graphic novel)\b/i.test(head))
    return true

  // Geographic / administrative stubs ("village in India", "commune in France"…)
  if (/\b(village|hamlet|town|city|municipality|commune|comune|locality|settlement|county|district|province|prefecture|region|department|census-designated|unincorporated|neighborhood|suburb|civil parish|ward)\b.*\b(in|of)\b/.test(d))
    return true
  if (/\b(river|creek|stream|mountain|peak|hill|lake|reservoir|island|islet|bay|glacier|valley|railway station|metro station|airport|airfield|air base|highway|road|bridge)\b/.test(d))
    return true

  // Sports seasons, teams, competitions, and single events
  if (/\b(season|football club|f\.c\.|sports team|squad|roster|tournament|championship|league|olympic|world cup|grand prix)\b/.test(d))
    return true

  // Taxonomy / species stubs (a single moth species = boring card)
  if (/\b(genus|species|moth|beetle|spider|butterfly|fungus|mollusc|snail|orchid|plant in|family of)\b/.test(d))
    return true

  // Media & product entries (films, shows, albums, games, phones, companies…)
  if (/\b(film|movie|documentary|television series|tv series|tv program|sitcom|miniseries|web series|anime|manga|album|studio album|ep by|song by|single by|soundtrack|band|musical group|video game|board game|mobile app|software|operating system|programming library|smartphone|mobile phone|product|brand|manufacturer|company|corporation|automobile|car model|magazine|newspaper|comic|novel by)\b/.test(d))
    return true

  // Disambiguation & list pages
  if (/may refer to:?$/i.test(extract)) return true
  if (/^(List of|Lists of|Index of|Outline of) /i.test(title)) return true

  return false
}

// ─── Wikipedia topic search (on-topic articles for the user's selected topics) ───
// Reddit blocks datacenter IPs (Vercel), so niche topics need a reliable on-topic
// source. Wikipedia's search generator returns real articles matching a query and
// is never IP-blocked, so this guarantees relevant content for every picked topic.
export async function fetchWikipediaByTopics(
  categories: string[],
  perTopic: number = 5
): Promise<RawContent[]> {
  if (!categories.length) return []

  // Keep the total Wikipedia search requests small (≤6) so we never trigger rate
  // limits from shared serverless IPs. Few topics → 2 seed terms each (variety);
  // many topics → 1 term each, capped at 6 topics.
  const MAX_REQUESTS = 6
  const cats = categories.slice(0, MAX_REQUESTS)
  const useTwoTerms = cats.length * 2 <= MAX_REQUESTS

  const perCat = await Promise.all(
    cats.map(async (category) => {
      const queries = TOPIC_WIKI_QUERIES[category]
      if (!queries || !queries.length) return [] as RawContent[]
      // Pick DISTINCT random seed terms so we don't get near-identical articles
      // from one term (e.g. five "Public Health Service" variants).
      const shuffled = [...queries].sort(() => Math.random() - 0.5)
      const nTerms = useTwoTerms ? Math.min(2, shuffled.length) : 1
      const terms = shuffled.slice(0, nTerms)
      const perTerm = Math.max(2, Math.ceil(perTopic / terms.length))
      const batches = await Promise.all(
        terms.map((term) => fetchWikiSearch(term, perTerm, category))
      )
      return batches.flat()
    })
  )

  // Flatten + dedupe by title.
  const seen = new Set<string>()
  const merged: RawContent[] = []
  for (const arr of perCat) {
    for (const item of arr) {
      const k = item.title.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(item)
    }
  }
  return merged
}

// One Wikipedia full-text search → intro extracts, tagged with the given category.
async function fetchWikiSearch(
  term: string,
  limit: number,
  category: string
): Promise<RawContent[]> {
  const offset = Math.floor(Math.random() * 8) // vary results across refreshes
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=0&gsrsearch=' +
    encodeURIComponent(term) +
    `&gsrlimit=${limit}&gsroffset=${offset}` +
    '&prop=extracts|info|description&exintro=1&explaintext=1&inprop=url&redirects=1&origin=*'
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
    })
    if (!r.ok) return []
    const data = await r.json()
    const pages = data?.query?.pages
    if (!pages) return []
    const out: RawContent[] = []
    for (const key of Object.keys(pages)) {
      const p = pages[key]
      const extract: string = (p?.extract || '').trim()
      // Skip stubs, disambiguation, list, and biography/media/product entries so
      // topic results are substantive concept articles, not a person or a phone.
      if (!extract || extract.length < 140) continue
      if (isLowQualityWikipedia(p.description || '', p.title || '', extract)) continue
      out.push({
        title: p.title,
        content: trimToSentence(extract, 700),
        url: p.fullurl || `https://en.wikipedia.org/?curid=${p.pageid}`,
        source: 'Wikipedia',
        category,
      })
    }
    return out
  } catch {
    return []
  }
}

// Trim text to <= max chars, cutting cleanly at the last sentence boundary.
function trimToSentence(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (lastStop > max * 0.5) return slice.slice(0, lastStop + 1)
  return slice.trim() + '…'
}

// ─── Hacker News (random slice from top + new + best stories) ───

export async function fetchHackerNews(count: number = 15): Promise<RawContent[]> {
  const results: RawContent[] = []

  try {
    // Fetch from multiple HN feeds for variety
    const feeds = ['topstories', 'newstories', 'beststories']
    const feedPromises = feeds.map((feed) =>
      fetch(`https://hacker-news.firebaseio.com/v0/${feed}.json`, { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : [])
        .catch(() => [])
    )
    const feedResults = await Promise.all(feedPromises)
    const allIds: number[] = [...new Set(feedResults.flat())] // merge & deduplicate IDs

    // Pick a RANDOM slice instead of always the first N — this is key for freshness
    const shuffled = allIds.sort(() => Math.random() - 0.5)
    const selectedIds = shuffled.slice(0, count)

    // Fetch stories in parallel
    const storyPromises = selectedIds.map(async (id) => {
      try {
        const res = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { cache: 'no-store' }
        )
        return res.ok ? res.json() : null
      } catch {
        return null
      }
    })

    const stories = await Promise.all(storyPromises)

    stories.forEach((story) => {
      if (story && story.title && story.type === 'story') {
        if (story.score > 20) {
          results.push({
            title: story.title,
            content: story.text
              ? stripHtml(story.text)
              : `${story.title} — A trending discussion on Hacker News with ${story.score} points and ${story.descendants || 0} comments.`,
            url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
            author: story.by,
            source: 'Hacker News',
            category: categorizeHN(story.title),
          })
        }
      }
    })
  } catch (error) {
    console.error('Hacker News fetch error:', error)
  }

  return results
}

function categorizeHN(title: string): string {
  const t = title.toLowerCase()
  if (
    t.includes('rust') || t.includes('python') || t.includes('javascript') ||
    t.includes('typescript') || t.includes('code') || t.includes('programming') ||
    t.includes('compiler') || t.includes('git') || t.includes('linux') ||
    t.includes('api') || t.includes('database') || t.includes('sql') ||
    t.includes('open source') || t.includes('github') || t.includes('docker') ||
    t.includes('kubernetes') || t.includes('golang') || t.includes('java ') ||
    t.includes('c++') || t.includes('swift') || t.includes('react') ||
    t.includes('node') || t.includes('algorithm') || t.includes('debug') ||
    t.includes('server') || t.includes('deploy') || t.includes('framework') ||
    t.includes('library') || t.includes('engineer') || t.includes('developer') ||
    t.includes('backend') || t.includes('frontend') || t.includes('fullstack') ||
    t.includes('devops') || t.includes('bug') || t.includes('kernel') ||
    t.includes('cpu') || t.includes('gpu') || t.includes('wasm')
  )
    return 'programming'
  if (t.includes('ai') || t.includes('gpt') || t.includes('llm') || t.includes('machine learning') || t.includes('neural'))
    return 'technology'
  if (t.includes('startup') || t.includes('funding') || t.includes('vc') || t.includes('business'))
    return 'business'
  if (t.includes('crypto') || t.includes('bitcoin') || t.includes('finance')) return 'finance'
  if (t.includes('space') || t.includes('nasa') || t.includes('mars')) return 'space'
  if (t.includes('health') || t.includes('medical') || t.includes('brain')) return 'health'
  if (t.includes('science') || t.includes('research') || t.includes('study')) return 'science'
  return 'technology' // default for HN
}

// ─── ZenQuotes API (Free Quotes — replaces deprecated Quotable) ───
// Free, no API key, returns 50 quotes per request

export async function fetchQuotes(count: number = 5): Promise<RawContent[]> {
  const results: RawContent[] = []

  try {
    const response = await fetch('https://zenquotes.io/api/quotes', {
      cache: 'no-store',
    })

    if (!response.ok) return results
    const quotes = await response.json()

    if (Array.isArray(quotes)) {
      quotes.slice(0, count).forEach((quote: any) => {
        if (quote.q && quote.a) {
          results.push({
            title: '',
            content: `"${quote.q}"`,
            author: quote.a,
            source: 'ZenQuotes',
            category: 'philosophy',
          })
        }
      })
    }
  } catch (error) {
    console.error('ZenQuotes fetch error:', error)
  }

  return results
}

// ─── Reddit (via old.reddit.com JSON) ───
// Can be rate-limited / blocked from server IPs. Best-effort only.

export async function fetchReddit(
  subreddits: string[] = ['todayilearned', 'explainlikeimfive', 'Showerthoughts']
): Promise<RawContent[]> {
  // Fetch all subreddits in parallel
  const subPromises = subreddits.map((subreddit) =>
    fetch(`https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=5`, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Plax/1.0)',
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        if (!response.ok) return []
        const data = await response.json()
        const items: RawContent[] = []
        if (data.data?.children) {
          data.data.children.forEach((child: any) => {
            const post = child.data
            if (post.selftext || post.title) {
              const rawContent = post.selftext || post.title
              const content = stripHtml(rawContent)
              if (content.length > 50) {
                items.push({
                  title: cleanRedditTitle(post.title),
                  content,
                  url: `https://reddit.com${post.permalink}`,
                  author: `u/${post.author}`,
                  source: `Reddit r/${subreddit}`,
                  category: CATEGORY_MAP[subreddit] || 'science',
                })
              }
            }
          })
        }
        return items
      })
      .catch((error) => {
        console.error(`Reddit r/${subreddit} fetch error:`, error)
        return [] as RawContent[]
      })
  )
  const subResults = await Promise.all(subPromises)
  return subResults.flat()
}

function cleanRedditTitle(title: string): string {
  return title
    .replace(/^TIL\s*/i, '')
    .replace(/^ELI5:\s*/i, '')
    .replace(/^Showerthought:\s*/i, '')
    .trim()
}

// ─── Aggregate all sources (each one is independently error-safe) ───
export async function fetchAllContent(categories: string[] = []): Promise<RawContent[]> {
  // Base subreddits (broad coverage) + topic-specific subreddits for the user's
  // selected categories, so niche picks (health, books, finance…) get real
  // on-topic content instead of leaning on random Wikipedia/quotes.
  const baseSubs = [
    'todayilearned', 'explainlikeimfive', 'Showerthoughts', 'science',
    'space', 'history', 'philosophy', 'psychology', 'AskScience',
    'Futurology', 'LifeProTips', 'YouShouldKnow',
  ]
  const topicSubs = categories.flatMap((c) => TOPIC_SUBREDDITS[c] || [])
  const subreddits = [...new Set([...topicSubs, ...baseSubs])].slice(0, 18)

  // For the no-topic feed (new user / cleared filters) seed the topic search with
  // a broadly-interesting default set so first impressions are curated-quality,
  // not random-stub roulette.
  const DEFAULT_TOPICS = ['science', 'history', 'psychology', 'technology', 'space', 'philosophy']
  const topicsForSearch = categories.length ? categories : DEFAULT_TOPICS

  // Use Promise.allSettled so one failing source doesn't kill the rest
  const results = await Promise.allSettled([
    fetchWikipediaContent(18),   // ~18 random (most are stubs → filtered) + 5 On This Day
    fetchHackerNews(15),         // ~15 from random slice of top/new/best
    fetchQuotes(10),             // ~10 quotes
    fetchReddit(subreddits),     // topic-aware subreddit set
    fetchWikipediaByTopics(topicsForSearch), // on-topic articles (defaults when no picks)
  ])

  const all: RawContent[] = []
  const sourceNames = ['Wikipedia', 'HackerNews', 'Quotes', 'Reddit', 'WikipediaTopics']

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[Plax Sources] ${sourceNames[i]}: ${result.value.length} items`)
      all.push(...result.value)
    } else {
      console.error(`[Plax Sources] ${sourceNames[i]} failed:`, result.reason)
    }
  })

  console.log(`[Plax Sources] Total: ${all.length} items from ${sourceNames.length} sources`)
  return all
}
