# Plax Technical Documentation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Onboarding  │  │    Feed      │  │    Card      │          │
│  │  Component   │  │  Component   │  │  Component   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│         └────────────┬────┴─────────────────┘                    │
│                      ▼                                           │
│  ┌─────────────────────────────────────────────────────┐        │
│  │               Zustand Store                          │        │
│  │  • selectedTopics  • bookmarkedIds  • engagements   │        │
│  │  • hasOnboarded    • currentCardIndex               │        │
│  └─────────────────────────┬───────────────────────────┘        │
│                            │ localStorage                        │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER                                 │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  /api/feed       │  │  /api/summarize  │                     │
│  │  Edge Runtime    │  │  Edge Runtime    │                     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
│           │                     │                                │
│           ▼                     ▼                                │
│  ┌─────────────────────────────────────────────────────┐        │
│  │               In-Memory Cache                        │        │
│  │  • 15-min TTL  • Category-keyed  • Auto-invalidate  │        │
│  └─────────────────────────┬───────────────────────────┘        │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTENT SOURCES                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │Wikipedia │  │   HN     │  │  Reddit  │  │ Quotable │        │
│  │   API    │  │   API    │  │   JSON   │  │   API    │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI LAYER                                    │
│  ┌─────────────────────────┐  ┌─────────────────────────┐       │
│  │     Gemini Flash        │  │    Groq (Fallback)      │       │
│  │  Primary summarizer     │  │   Llama 3.1 70B         │       │
│  │  1500 req/day free      │  │   14k req/day free      │       │
│  └─────────────────────────┘  └─────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### GET /api/feed

Returns personalized content feed.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `categories` | string | - | Comma-separated topic IDs to filter |
| `limit` | number | 30 | Max cards to return |
| `refresh` | boolean | false | Bypass cache |

**Response:**
```json
{
  "cards": [
    {
      "id": "wikipedia-sleep-lq3x7",
      "type": "microessay",
      "title": "Why Sleep Deprivation Shrinks Your Brain",
      "content": "Your brain has a cleaning system...",
      "author": "Neuroscience Research",
      "source": "Wikipedia",
      "sourceUrl": "https://en.wikipedia.org/...",
      "category": "science",
      "readTime": "45s",
      "emoji": "🧠",
      "fetchedAt": 1707123456789
    }
  ],
  "cached": true,
  "count": 30,
  "sources": {
    "wikipedia": 5,
    "hackernews": 8,
    "reddit": 12,
    "quotes": 4
  }
}
```

### POST /api/summarize

Summarizes long content into a card format.

**Request Body:**
```json
{
  "content": "Long article text to summarize...",
  "type": "microessay"
}
```

**Response:**
```json
{
  "title": "AI-Generated Title",
  "content": "Summarized content with **bold** highlights...",
  "type": "microessay"
}
```

## Content Sources

### Wikipedia API

```typescript
// Random article summary
GET https://en.wikipedia.org/api/rest_v1/page/random/summary

// On This Day facts
GET https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/{month}/{day}
```

**Rate Limits:** Effectively unlimited for our usage
**Caching:** 5 minutes (300s)

### Hacker News API

```typescript
// Top story IDs
GET https://hacker-news.firebaseio.com/v0/topstories.json

// Individual story
GET https://hacker-news.firebaseio.com/v0/item/{id}.json
```

**Rate Limits:** No official limit, be reasonable
**Caching:** 10 minutes (600s)
**Filter:** Only stories with score > 100

### Reddit JSON

```typescript
// Subreddit top posts (no auth needed)
GET https://www.reddit.com/r/{subreddit}/top.json?t=day&limit=5

// Subreddits used:
// - todayilearned
// - explainlikeimfive
// - Showerthoughts
// - science
```

**Rate Limits:** ~60 requests/minute
**Caching:** 15 minutes (900s)
**Headers:** `User-Agent: Plax/1.0`

### Quotable API

```typescript
GET https://api.quotable.io/quotes/random?limit=5
```

**Rate Limits:** Unlimited
**Caching:** 30 minutes (1800s)

## Caching Strategy

### Layer 1: Next.js Fetch Cache

```typescript
fetch(url, { next: { revalidate: 300 } })
```

- Built into Next.js
- Survives deployments on Vercel
- Automatically invalidates

### Layer 2: In-Memory Cache

```typescript
const CACHE: Map<string, CacheEntry> = new Map()

// Key format: `feed-{categories}`
// TTL: 15 minutes
```

- Persists across warm Lambda invocations
- Falls back gracefully on cold starts

### Layer 3: Static Fallback

```typescript
import { allCards } from '@/lib/sample-data'
```

- 25+ curated cards bundled in the app
- Always available, instant
- Used when live sources fail

## Personalization Engine

### Engagement Tracking

```typescript
interface Engagement {
  cardId: string
  category: string
  timeSpent: number      // milliseconds
  bookmarked: boolean
  shared: boolean
  completed: boolean     // >4 seconds
}
```

### Scoring Algorithm

```typescript
const score = 
  (timeSpent / 1000) * 1 +   // 1 point per second
  (bookmarked ? 15 : 0) +    // strong positive signal
  (completed ? 5 : 0) +      // finished reading
  (shared ? 8 : 0)           // very strong signal
```

### Feed Composition

```typescript
// 70% preference-weighted
// 30% random (serendipity)

cards.sort((a, b) => {
  const scoreA = categoryScores[a.category] + Math.random() * 0.3
  const scoreB = categoryScores[b.category] + Math.random() * 0.3
  return scoreB - scoreA
})
```

## State Management

### Zustand Store

```typescript
interface PlaxState {
  // Onboarding
  hasOnboarded: boolean
  selectedTopics: string[]

  // Bookmarks
  bookmarkedIds: string[]

  // Engagement
  engagements: Engagement[]

  // Feed
  currentCardIndex: number
  cardsRead: number
}
```

### Persistence

```typescript
persist(store, {
  name: 'plax-store-v2',
  storage: createJSONStorage(() => localStorage),
})
```

## Error Handling

```
Source fails → Try other sources → Return partial data
All sources fail → Return static fallback
AI fails → Return truncated content
Cache fails → Fetch fresh
```

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| First Contentful Paint | <1.5s | ~0.8s |
| Time to Interactive | <2.0s | ~1.2s |
| Feed Load (cached) | <200ms | ~50ms |
| Feed Load (fresh) | <2s | ~1.5s |
| Swipe Animation | 60fps | 60fps |

## Security

- API keys server-side only (never exposed to client)
- No user auth yet (localStorage only)
- No PII collection
- CORS restricted to plaxlabs.com in production

## Deployment

```bash
# Build
npm run build

# Preview locally
npm run start

# Deploy (via Vercel CLI)
vercel --prod
```

### Environment Variables on Vercel

```
GEMINI_API_KEY=xxx
GROQ_API_KEY=xxx
```

### Domain Setup

1. Vercel Dashboard → Project → Settings → Domains
2. Add `plaxlabs.com`
3. Add DNS records as instructed
4. SSL auto-provisioned

## Monitoring

- **Vercel Analytics** (built-in, free)
- **Sentry** (optional, for error tracking)
- **PostHog** (optional, for user analytics)

## Future Enhancements

1. **Supabase Integration**
   - Auth (Google, Apple, email)
   - Cloud-synced bookmarks
   - User preferences

2. **Content Pipeline**
   - Background job to pre-process content
   - arXiv paper summaries
   - Newsletter digests

3. **Mobile App**
   - React Native with Expo
   - Share 80% of logic with web
