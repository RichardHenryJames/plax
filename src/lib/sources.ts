import { RawContent } from './types'

// ─── Wikipedia "Did You Know" & Random Articles ───
// Free, no API key, generous limits

export async function fetchWikipediaContent(count: number = 10): Promise<RawContent[]> {
  const results: RawContent[] = []
  
  try {
    // Fetch random articles
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/random/summary`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    )
    
    if (!response.ok) return results
    const data = await response.json()
    
    if (data.extract && data.extract.length > 100) {
      results.push({
        title: data.title,
        content: data.extract,
        url: data.content_urls?.desktop?.page,
        source: 'Wikipedia',
        category: categorizeWikipedia(data.description || data.title),
      })
    }
  } catch (error) {
    console.error('Wikipedia fetch error:', error)
  }

  // Fetch "On this day" facts
  try {
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()
    
    const response = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/${month}/${day}`,
      { 
        next: { revalidate: 3600 }, // Cache for 1 hour
        headers: { 'Accept': 'application/json' }
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      if (data.selected) {
        data.selected.slice(0, 3).forEach((event: any, i: number) => {
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
  if (desc.includes('computer') || desc.includes('software') || desc.includes('programming')) return 'programming'
  if (desc.includes('econom') || desc.includes('business')) return 'finance'
  if (desc.includes('art') || desc.includes('painter') || desc.includes('artist')) return 'art'
  if (desc.includes('space') || desc.includes('planet') || desc.includes('star')) return 'space'
  return 'science' // default
}

// ─── Hacker News Top Stories ───
// Free, no API key, no limits

export async function fetchHackerNews(count: number = 10): Promise<RawContent[]> {
  const results: RawContent[] = []
  
  try {
    // Get top story IDs
    const idsResponse = await fetch(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { next: { revalidate: 600 } } // Cache for 10 minutes
    )
    
    if (!idsResponse.ok) return results
    const ids: number[] = await idsResponse.json()
    
    // Fetch top N stories
    const storyPromises = ids.slice(0, count).map(async (id) => {
      const res = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        { next: { revalidate: 600 } }
      )
      return res.ok ? res.json() : null
    })
    
    const stories = await Promise.all(storyPromises)
    
    stories.forEach((story) => {
      if (story && story.title && story.type === 'story') {
        // Only include stories with substantial engagement
        if (story.score > 100) {
          results.push({
            title: story.title,
            content: story.text || `${story.title} — A trending discussion on Hacker News with ${story.score} points and ${story.descendants || 0} comments.`,
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
  if (t.includes('ai') || t.includes('gpt') || t.includes('llm') || t.includes('machine learning')) return 'technology'
  if (t.includes('rust') || t.includes('python') || t.includes('javascript') || t.includes('code') || t.includes('programming')) return 'programming'
  if (t.includes('startup') || t.includes('funding') || t.includes('vc') || t.includes('business')) return 'business'
  if (t.includes('crypto') || t.includes('bitcoin') || t.includes('finance')) return 'finance'
  if (t.includes('space') || t.includes('nasa') || t.includes('mars')) return 'space'
  if (t.includes('health') || t.includes('medical') || t.includes('brain')) return 'health'
  if (t.includes('science') || t.includes('research') || t.includes('study')) return 'science'
  return 'technology' // default for HN
}

// ─── Quotable API (Free Quotes) ───
// Completely free, no limits

export async function fetchQuotes(count: number = 5): Promise<RawContent[]> {
  const results: RawContent[] = []
  
  try {
    const response = await fetch(
      `https://api.quotable.io/quotes/random?limit=${count}`,
      { next: { revalidate: 1800 } } // Cache for 30 minutes
    )
    
    if (!response.ok) return results
    const quotes = await response.json()
    
    quotes.forEach((quote: any) => {
      results.push({
        title: '',
        content: `"${quote.content}"`,
        author: quote.author,
        source: 'Quotable',
        category: 'philosophy',
      })
    })
  } catch (error) {
    console.error('Quotable fetch error:', error)
  }
  
  return results
}

// ─── Reddit (via old.reddit.com JSON - no auth needed) ───
// Free, but rate limited. We use caching heavily.

export async function fetchReddit(subreddits: string[] = ['todayilearned', 'explainlikeimfive', 'Showerthoughts']): Promise<RawContent[]> {
  const results: RawContent[] = []
  
  for (const subreddit of subreddits) {
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=5`,
        { 
          next: { revalidate: 900 }, // Cache for 15 minutes
          headers: { 'User-Agent': 'Plax/1.0' }
        }
      )
      
      if (!response.ok) continue
      const data = await response.json()
      
      if (data.data?.children) {
        data.data.children.forEach((child: any) => {
          const post = child.data
          if (post.selftext || post.title) {
            // Skip very short content
            const content = post.selftext || post.title
            if (content.length > 50) {
              results.push({
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
    } catch (error) {
      console.error(`Reddit r/${subreddit} fetch error:`, error)
    }
  }
  
  return results
}

function cleanRedditTitle(title: string): string {
  // Remove "TIL" prefix and clean up
  return title
    .replace(/^TIL\s*/i, '')
    .replace(/^ELI5:\s*/i, '')
    .replace(/^Showerthought:\s*/i, '')
    .trim()
}

// ─── Aggregate all sources ───
export async function fetchAllContent(): Promise<RawContent[]> {
  const [wikipedia, hn, quotes, reddit] = await Promise.all([
    fetchWikipediaContent(5),
    fetchHackerNews(8),
    fetchQuotes(4),
    fetchReddit(['todayilearned', 'explainlikeimfive', 'Showerthoughts', 'science']),
  ])
  
  return [...wikipedia, ...hn, ...quotes, ...reddit]
}
