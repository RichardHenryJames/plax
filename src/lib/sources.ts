import { RawContent, CATEGORY_MAP } from './types'

// ─── Wikipedia Random Articles (truly random each call) ───

export async function fetchWikipediaContent(count: number = 12): Promise<RawContent[]> {
  const results: RawContent[] = []

  // Fetch many random articles in parallel (each call = genuinely different article)
  const articlePromises = Array.from({ length: count }, () =>
    fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return null
        const data = await r.json()
        if (data.extract && data.extract.length > 100) {
          return {
            title: data.title,
            content: data.extract,
            url: data.content_urls?.desktop?.page,
            source: 'Wikipedia',
            category: categorizeWikipedia(data.description || data.title),
          } as RawContent
        }
        return null
      })
      .catch(() => null)
  )
  const articles = await Promise.all(articlePromises)
  articles.forEach((a) => { if (a) results.push(a) })

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
            content:
              story.text ||
              `${story.title} — A trending discussion on Hacker News with ${story.score} points and ${story.descendants || 0} comments.`,
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
              const content = post.selftext || post.title
              if (content.length > 50) {
                items.push({
                  title: cleanRedditTitle(post.title),
                  content: post.selftext || post.title,
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
export async function fetchAllContent(): Promise<RawContent[]> {
  // Use Promise.allSettled so one failing source doesn't kill the rest
  const results = await Promise.allSettled([
    fetchWikipediaContent(12),   // ~12 truly random articles + 5 On This Day
    fetchHackerNews(15),         // ~15 from random slice of top/new/best
    fetchQuotes(10),             // ~10 quotes
    fetchReddit([                // ~20 from many subreddits
      'todayilearned', 'explainlikeimfive', 'Showerthoughts', 'science',
      'space', 'history', 'philosophy', 'psychology', 'AskScience',
      'Futurology', 'LifeProTips', 'YouShouldKnow',
    ]),
  ])

  const all: RawContent[] = []
  const sourceNames = ['Wikipedia', 'HackerNews', 'Quotes', 'Reddit']

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
