# Plax — Technical Documentation

> Complete technical reference for the Plax codebase.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [API Endpoints](#api-endpoints)
3. [Content Sources](#content-sources)
4. [Category System](#category-system)
5. [Feed Pipeline](#feed-pipeline)
6. [Caching Strategy](#caching-strategy)
7. [Authentication & Cloud Sync](#authentication--cloud-sync)
8. [State Management](#state-management)
9. [Personalization Engine](#personalization-engine)
10. [AI Layer](#ai-layer)
11. [UI Components](#ui-components)
12. [Database Schema](#database-schema)
13. [Error Handling](#error-handling)
14. [Performance](#performance)
15. [Security](#security)
16. [Deployment](#deployment)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Browser)                          │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Onboarding │  │    Feed    │  │    Card    │  │   Profile    │  │
│  │  (topics)  │  │  (swipe)   │  │ (content)  │  │   (stats)    │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  │
│        │               │               │                │           │
│        └───────────┬────┴───────────────┴────────────────┘           │
│                    ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    Zustand Store (persisted)                  │    │
│  │  selectedTopics · bookmarkedIds · engagements · readCardIds  │    │
│  │  hasOnboarded · cardsRead · currentCardIndex · syncedUserId  │    │
│  └──────────────────────────┬───────────────────────────────────┘    │
│                             │                                        │
│  ┌──────────────────────────┴───────────────────────────────────┐    │
│  │                      CloudSync Bridge                         │    │
│  │  Zustand ←→ Supabase (debounced, 2s after last change)       │    │
│  └──────────────────────────┬───────────────────────────────────┘    │
│                             │                                        │
│  ┌──────────────────────────┴───────────────────────────────────┐    │
│  │                 AuthProvider (Supabase Auth)                   │    │
│  │  Google OAuth · GitHub OAuth · Session management             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  localStorage: plax-store-v2, plax-card-cache                        │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         API LAYER (Vercel)                           │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │  GET /api/feed      │  │ POST /api/summarize  │                   │
│  │  Node.js runtime    │  │  Edge runtime        │                   │
│  │  force-dynamic      │  │  Gemini 2.5 Flash    │                   │
│  └──────────┬──────────┘  └──────────┬───────────┘                   │
│             │                        │                               │
│             ▼                        ▼                               │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │               In-Memory Cache (Map<string, CacheEntry>)     │     │
│  │               Key: feed-{sorted-categories}                 │     │
│  │               TTL: 5 minutes · Auto-invalidate              │     │
│  └──────────────────────────┬──────────────────────────────────┘     │
│                             │                                        │
│  ┌──────────────────────────┴──────────────────────────────────┐     │
│  │  GET /auth/callback — Supabase OAuth code exchange          │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL SERVICES                              │
│                                                                      │
│  Content Sources (free, no keys):                                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │
│  │ Wikipedia │  │ Hacker    │  │  Reddit   │  │ ZenQuotes │        │
│  │ REST API  │  │ News API  │  │ JSON API  │  │    API    │        │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘        │
│                                                                      │
│  AI (API keys required):                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────┐           │
│  │  Gemini 2.5 Flash       │  │  Groq Llama 3.3 70B     │           │
│  │  Primary · 1500 req/day │  │  Fallback · 14k req/day │           │
│  └─────────────────────────┘  └─────────────────────────┘           │
│                                                                      │
│  Database:                                                           │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  Supabase (Postgres + Auth + RLS)                           │     │
│  │  Tables: user_profiles · bookmarks · engagements            │     │
│  │  RPC: update_reading_streak()                               │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### GET /api/feed

Returns personalized content cards. Runtime: `nodejs`, `force-dynamic`.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `categories` | string | `""` | Comma-separated topic IDs (e.g. `programming,science`) |
| `limit` | number | `30` | Max cards to return |
| `refresh` | boolean | `false` | Skip server cache, fetch fresh from sources |
| `exclude` | string | `""` | Comma-separated card IDs the client already has |

**Response (200):**

```json
{
  "cards": [
    {
      "id": "wikipedia-1a2b3c",
      "type": "microessay",
      "title": "Why Sleep Deprivation Shrinks Your Brain",
      "content": "Your brain has a cleaning system called the glymphatic...",
      "author": "Neuroscience Research",
      "source": "Wikipedia",
      "sourceUrl": "https://en.wikipedia.org/wiki/...",
      "category": "science",
      "readTime": "45s",
      "emoji": "🔬",
      "fetchedAt": 1707123456789
    }
  ],
  "cached": false,
  "count": 36,
  "sources": {
    "wikipedia": 17,
    "hackernews": 10,
    "reddit": 4,
    "quotes": 5
  }
}
```

**Response (503 — all sources failed):**

```json
{
  "cards": [],
  "cached": false,
  "error": "Failed to fetch live content"
}
```

**Card Types:**

| Type | When |
|------|------|
| `quote` | Source is ZenQuotes or content starts with `"` |
| `fact` | Source includes "On This Day" |
| `did-you-know` | Content < 200 characters |
| `microessay` | Everything else |

---

### POST /api/summarize

AI-powered content summarization. Runtime: `edge`.

**Request:**

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

**AI Model Priority:**
1. Gemini 2.5 Flash (`gemini-2.5-flash`) — primary
2. Groq GPT-OSS 120B (`openai/gpt-oss-120b`) — fallback
3. Raw truncation (first 500 chars) — last resort

---

### GET /auth/callback

Handles OAuth redirect after Google/GitHub sign-in. Exchanges the auth code for a Supabase session, then redirects to `/`.

---

## Content Sources

### Wikipedia

**File:** `lib/sources.ts` → `fetchWikipediaContent()`

| Endpoint | Purpose | Count |
|----------|---------|-------|
| `en.wikipedia.org/api/rest_v1/page/random/summary` | Random articles | 12 parallel requests |
| `api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/{month}/{day}` | Historical facts | Up to 5 events |

- Each random article request returns a genuinely different article
- Articles with `extract.length < 100` are filtered out
- "On This Day" events get category `history`
- Random articles categorized by `description` field

**Rate Limits:** Effectively unlimited.

### Hacker News

**File:** `lib/sources.ts` → `fetchHackerNews()`

| Endpoint | Purpose |
|----------|---------|
| `hacker-news.firebaseio.com/v0/topstories.json` | Top story IDs |
| `hacker-news.firebaseio.com/v0/newstories.json` | New story IDs |
| `hacker-news.firebaseio.com/v0/beststories.json` | Best story IDs |
| `hacker-news.firebaseio.com/v0/item/{id}.json` | Individual story |

- Merges & deduplicates IDs from all 3 feeds
- **Random slice** — shuffles all IDs, picks first N (not always top N)
- Filters: `story.type === 'story'` and `story.score > 20`
- Stories without `text` get a generated description with score/comment count

**Rate Limits:** No official limit. ~15 item fetches per request.

### ZenQuotes

**File:** `lib/sources.ts` → `fetchQuotes()`

| Endpoint | Purpose |
|----------|---------|
| `zenquotes.io/api/quotes` | 50 random quotes per call |

- Returns up to 10 quotes per feed request
- All categorized as `philosophy`
- Content wrapped in quotes: `"Quote text here"`

**Rate Limits:** Free tier, no key required.

### Reddit

**File:** `lib/sources.ts` → `fetchReddit()`

| Endpoint | Purpose |
|----------|---------|
| `www.reddit.com/r/{subreddit}/top.json?t=day&limit=5` | Top daily posts |

**Subreddits scraped (12):**

| Subreddit | Category |
|-----------|----------|
| todayilearned | science |
| explainlikeimfive | science |
| Showerthoughts | philosophy |
| science | science |
| space | space |
| history | history |
| philosophy | philosophy |
| psychology | psychology |
| AskScience | science |
| Futurology | technology |
| LifeProTips | psychology |
| YouShouldKnow | science |

- Requires `User-Agent` header
- Posts with content < 50 chars are filtered out
- Can be rate-limited/blocked from server IPs (best-effort)

**Rate Limits:** ~60 req/min. Can be blocked.

---

## Category System

### Available Categories (16)

| ID | Label | Emoji | Sources |
|----|-------|-------|---------|
| `science` | Science | 🔬 | Wikipedia (default), Reddit |
| `technology` | Technology | 💻 | HN (default for AI/GPT/LLM) |
| `philosophy` | Philosophy | 🤔 | ZenQuotes, Reddit |
| `psychology` | Psychology | 🧠 | Reddit |
| `history` | History | 📜 | Wikipedia On This Day |
| `finance` | Finance | 💰 | HN, Wikipedia |
| `space` | Space | 🚀 | Wikipedia, Reddit, HN |
| `programming` | Programming | ⚡ | HN (30+ keywords), Wikipedia |
| `books` | Books | 📚 | — |
| `health` | Health | 🏥 | HN, Wikipedia |
| `math` | Mathematics | 📐 | Wikipedia |
| `nature` | Nature | 🌿 | Wikipedia |
| `art` | Art & Design | 🎨 | Wikipedia |
| `physics` | Physics | ⚛️ | Wikipedia |
| `business` | Business | 📈 | HN |
| `language` | Language | 🗣️ | — |

### Category Assignment

**Wikipedia:** Based on `description` field keywords:
- `physic`, `quantum` → physics
- `biolog`, `species`, `animal` → nature
- `math`, `theorem` → math
- `computer`, `software`, `programming`, `algorithm`, `engineer`, `internet`, `digital`, `database`, `cryptograph` → programming
- Default → science

**Hacker News:** Based on title keywords (programming checked first):
- 30+ keywords for `programming` (rust, python, git, linux, api, docker, kubernetes, react, etc.)
- AI/GPT/LLM/neural → technology
- Default → technology

**Reddit:** Based on `CATEGORY_MAP` lookup by subreddit name.

**ZenQuotes:** Always `philosophy`.

### Related Category Map

Used for feed filtering fallback. When exact match yields too few results:

```
programming → [technology, science, math]
technology  → [programming, science, business]
science     → [nature, physics, space, health, math]
physics     → [science, math, space]
math        → [science, physics, programming]
space       → [science, physics, technology]
finance     → [business, technology]
business    → [finance, technology]
philosophy  → [psychology, history]
psychology  → [philosophy, health]
history     → [philosophy, art]
health      → [science, psychology, nature]
nature      → [science, health, space]
art         → [history, philosophy]
books       → [philosophy, history, psychology]
language    → [philosophy, psychology]
```

---

## Feed Pipeline

### Server Side (`/api/feed`)

```
1. Parse query params (categories, limit, refresh, exclude)
2. Check in-memory cache (skip if refresh=true)
   ├─ HIT  → filter out excluded IDs → filterAndLimit → return
   └─ MISS → continue
3. fetchAllContent() — Promise.allSettled across all 4 sources
4. Deduplicate by title (case-insensitive, first 80 chars)
5. Map to ProcessedCard[] with stable IDs:
   - ID = `{source}-{hash(source + title + content)}`
   - Hash = Park-Miller deterministic hash → base36
6. Cache full card set (TTL: 5 min)
7. Remove cards in exclude set
8. filterAndLimit():
   a. Exact category match
   b. If < limit results: expand to related categories
   c. If still 0: return ALL cards
   d. Shuffle randomly
   e. Slice to limit
9. Return JSON response with source counts
```

### Client Side (`Feed.tsx`)

```
1. On mount:
   a. Load from localStorage cache (plax-card-cache, 30min max age)
   b. Filter out already-read card IDs
   c. Set cards immediately (instant render)
   d. Background: fetch /api/feed with refresh=true
   e. Append new unique cards, update cache
   f. Set isInitialLoad=false when done

2. Infinite scroll:
   - When remaining cards ≤ 10, trigger fetchMore(refresh=true)
   - 5-second cooldown between fetches
   - After 5 consecutive empty fetches, stop (content exhausted)

3. Deduplication:
   - By card ID (seenIdsRef Set)
   - By title (seenIdsRef with `t:` prefix)

4. Card navigation:
   - Drag (y-axis, threshold 80px)
   - Keyboard (↓, Space, j = next; ↑, k = prev)
   - Scroll wheel (debounced 600ms)
```

---

## Caching Strategy

### Server: In-Memory Cache (`lib/cache.ts`)

```typescript
Map<string, { cards: ProcessedCard[], timestamp: number, ttl: number }>
```

- **Key format:** `feed-{sorted-categories}` (e.g. `feed-programming,science`)
- **Default TTL:** 15 minutes
- **Feed route TTL:** 5 minutes
- Persists across warm Lambda invocations on Vercel
- Cold start = cache miss = fresh fetch

### Client: localStorage Cache (`Feed.tsx`)

- **Key:** `plax-card-cache`
- **Format:** `{ cards: CardData[], ts: number }`
- **Max age:** 30 minutes
- **Max cards stored:** 60 (most recent)
- Provides instant render on subsequent visits

### Client: Zustand Persistence (`store.ts`)

- **Key:** `plax-store-v2`
- **Storage:** localStorage via `createJSONStorage`
- Stores: topics, bookmarks, engagements (last 500), read card IDs (last 500), cards read count

---

## Authentication & Cloud Sync

### Auth Flow

```
1. User clicks "Sign in" in NavBar
2. Dropdown shows Google / GitHub buttons
3. Click triggers supabase.auth.signInWithOAuth()
4. Redirect to provider → consent → callback
5. /auth/callback exchanges code for session
6. Redirect to / with valid session cookie
7. AuthProvider detects session, sets user state
8. CloudSync component hydrates store from Supabase
```

### AuthProvider (`components/AuthProvider.tsx`)

- Creates Supabase browser client (singleton)
- Provides context: `user`, `session`, `loading`, `signInWithGoogle`, `signInWithGithub`, `signOut`
- Listens to `onAuthStateChange` for session updates

### AuthProviderWrapper (`components/AuthProviderWrapper.tsx`)

- Checks if `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist
- If not configured, renders children without auth (app works offline)
- If configured, wraps with `AuthProvider` + `CloudSync`

### CloudSync (`components/CloudSync.tsx`)

Invisible component that bridges Zustand ↔ Supabase:

| Trigger | Action |
|---------|--------|
| User signs in (new userId) | Load profile + bookmarks from Supabase → hydrate Zustand store |
| `selectedTopics`, `hasOnboarded`, or `cardsRead` changes | Debounced sync to Supabase (2s delay) |
| New engagement added | Immediately save to `engagements` table |
| User signs out | Clear `syncedUserId` |
| User signs in | Call `update_reading_streak()` RPC |

### Supabase Client (`lib/supabase.ts`)

| Client | Usage | Package |
|--------|-------|---------|
| `createBrowserSupabaseClient()` | React components (singleton) | `@supabase/ssr` |
| `createServerSupabaseClient()` | API routes, server components | `@supabase/supabase-js` |
| `getSupabase()` | Convenience singleton for browser | — |

### Cloud Sync Functions (`lib/cloud-sync.ts`)

| Function | Table | Operation |
|----------|-------|-----------|
| `syncPreferencesToCloud()` | `user_profiles` | UPDATE topics, onboarded, cards_read |
| `loadPreferencesFromCloud()` | `user_profiles` | SELECT * by user ID |
| `addBookmarkToCloud()` | `bookmarks` | UPSERT (user_id, card_id) |
| `removeBookmarkFromCloud()` | `bookmarks` | DELETE by user_id + card_id |
| `loadBookmarksFromCloud()` | `bookmarks` | SELECT * ordered by created_at DESC |
| `saveEngagementToCloud()` | `engagements` | INSERT |
| `updateReadingStreak()` | — | RPC `update_reading_streak(p_user_id)` |
| `getUserStats()` | all 3 tables | Aggregate: cards read, streak, bookmark count, total minutes, top categories |

---

## State Management

### Zustand Store (`lib/store.ts`)

```typescript
interface PlaxState {
  // Onboarding
  hasOnboarded: boolean
  selectedTopics: string[]          // e.g. ['programming', 'science', 'space']
  setOnboarded: () => void
  setSelectedTopics: (topics) => void
  toggleTopic: (topic) => void

  // Bookmarks
  bookmarkedIds: string[]           // card IDs
  toggleBookmark: (id) => void

  // Engagement
  engagements: Engagement[]         // last 500
  addEngagement: (engagement) => void
  getTopCategories: () => string[]
  getCategoryScore: (category) => number

  // Feed state
  currentCardIndex: number
  cardsRead: number
  incrementCardsRead: () => void
  readCardIds: string[]             // last 500
  markCardRead: (id) => void

  // Cloud sync
  syncedUserId: string | null
  setSyncedUserId: (id) => void
  hydrateFromCloud: (data) => void  // bulk-set from Supabase
}
```

**Persistence:** `plax-store-v2` in localStorage. Uses `createJSONStorage` with SSR-safe fallback.

### Engagement Tracking

```typescript
interface Engagement {
  cardId: string
  category: string
  timeSpent: number       // milliseconds
  bookmarked: boolean
  shared: boolean
  completed: boolean      // timeSpent > 4000ms
}
```

Tracked on every card transition (swipe, keyboard, scroll). Time measured from card entry to card exit.

---

## Personalization Engine

### Scoring Algorithm

```typescript
score = (timeSpent / 1000) * 1     // 1 point per second
      + (bookmarked ? 15 : 0)       // strong positive signal
      + (shared ? 8 : 0)            // very strong signal
      + (completed ? 5 : 0)         // finished reading (>4s)
```

### Category Ranking

```typescript
getTopCategories(): string[] {
  // Sum scores per category across all engagements
  // Return sorted by score (descending)
}
```

### Feed Composition

The personalization feed (`sample-data.ts → getPersonalizedFeed()`) uses a tiered shuffle:
1. Score all cards by their category's engagement score
2. Sort by score (high engagement categories first)
3. Within same-score tiers: apply deterministic shuffle (stable per session)

The session seed ensures scrolling back up shows the same card order.

---

## AI Layer

### File: `lib/ai.ts`

#### `summarizeContent(text, type)`

Summarizes long content into card format.

- **Primary:** Gemini 2.5 Flash (`gemini-2.5-flash`)
- **Fallback:** Groq GPT-OSS 120B (`openai/gpt-oss-120b`)
- **Last resort:** Raw truncation (first 500 chars)

Prompt instructs the model to:
- Keep under 200 words
- Use **bold** for key insights
- Short punchy paragraphs
- Hook at start, takeaway at end
- Return JSON: `{ title, content, readTime }`

#### `generateQuiz(content)`

Generates a multiple-choice quiz from card content.

- Returns: `{ question, options: string[4], correct: number }`
- Fallback: generic "What did you learn?" question

### File: `api/summarize/route.ts`

Edge runtime API endpoint. Same Gemini → Groq → raw fallback chain.
Uses `gemini-2.5-flash` and `openai/gpt-oss-120b`.

---

## UI Components

### `Feed.tsx` — Main Swipeable Feed

| Feature | Implementation |
|---------|---------------|
| Drag to swipe | Framer Motion `drag="y"` with `dragElastic={0.15}` |
| Keyboard nav | `ArrowDown`/`Space`/`j` = next, `ArrowUp`/`k` = prev |
| Scroll wheel | Debounced (600ms), threshold: `deltaY > 30` |
| Infinite scroll | Auto-fetch when ≤ 10 cards remaining |
| Empty state | Loading spinner during initial load; "Try Again" after |
| Progress dots | Side dots showing ±4 cards around current position |
| Loading bar | Animated gradient bar at top during fetch |

### `Card.tsx` — Content Card

| Feature | Implementation |
|---------|---------------|
| Layout | Full-screen, centered content with gradient background glow |
| Typography | Merriweather (serif) for reading, Inter for UI, JetBrains Mono for code |
| Content types | Quote (blockquote + left bar), code (monospace block), standard (paragraphs) |
| Text formatting | `**bold**`, `` `code` ``, `→ arrows`, `• bullets` |
| Read progress | Circular SVG progress ring (violet → cyan gradient) |
| Actions | Discuss (copy to clipboard), Share (Web Share API or clipboard), Bookmark |
| Bookmark feedback | Animated toast: "✓ Saved" / "Removed" |
| Cloud sync | Bookmark add/remove syncs to Supabase if signed in |

### `NavBar.tsx` — Top Navigation

- Logo + title (link to `/`)
- Search icon (placeholder)
- Bookmarks link (→ `/profile`)
- Auth: Avatar dropdown (signed in) or "Sign in" button
- Dropdown: Profile link, Google/GitHub sign-in, Sign out
- Gradient overlay for readability over card content

### `Onboarding.tsx` — Topic Selection

- 2-step flow: Welcome screen → Topic grid
- Animated logo entrance (scale + rotate)
- 16 topic chips in 2-column grid
- Minimum 3 topics required to proceed
- Selected chips: violet border + scale(1.05) + checkmark
- Subtle background glow animation

### `Profile Page` (`app/profile/page.tsx`)

- Avatar, name, email, member-since date
- Stats grid: Cards Read, Day Streak, Minutes Read, Bookmarks
- 3 tabs: Stats (top interests + selected topics), Bookmarks (cloud-loaded), Settings (sign out)
- Requires authentication (redirects to home if not signed in)

---

## Database Schema

### Tables

#### `user_profiles`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID (PK) | — | References `auth.users(id)` |
| `email` | TEXT | — | User email |
| `display_name` | TEXT | — | From OAuth provider |
| `avatar_url` | TEXT | — | From OAuth provider |
| `selected_topics` | TEXT[] | `{}` | Array of topic IDs |
| `has_onboarded` | BOOLEAN | `false` | Completed onboarding? |
| `cards_read` | INTEGER | `0` | Total cards read |
| `reading_streak` | INTEGER | `0` | Current daily streak |
| `last_read_at` | TIMESTAMPTZ | — | Last reading timestamp |
| `created_at` | TIMESTAMPTZ | `NOW()` | Account creation |
| `updated_at` | TIMESTAMPTZ | `NOW()` | Auto-updated via trigger |

#### `bookmarks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | References `auth.users(id)` |
| `card_id` | TEXT | Stable card ID |
| `card_title` | TEXT | Nullable |
| `card_category` | TEXT | Nullable |
| `card_content` | TEXT | First 500 chars |
| `created_at` | TIMESTAMPTZ | — |
| **UNIQUE** | `(user_id, card_id)` | Prevents duplicate bookmarks |

#### `engagements`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | References `auth.users(id)` |
| `card_id` | TEXT | Card that was read |
| `category` | TEXT | Card category |
| `time_spent` | INTEGER | Milliseconds on card |
| `bookmarked` | BOOLEAN | Was card bookmarked? |
| `shared` | BOOLEAN | Was card shared? |
| `completed` | BOOLEAN | Spent > 4s on card? |
| `created_at` | TIMESTAMPTZ | — |

### Indexes

```sql
idx_bookmarks_user       ON bookmarks(user_id)
idx_engagements_user     ON engagements(user_id)
idx_engagements_category ON engagements(user_id, category)
```

### Row Level Security (RLS)

All tables have RLS enabled. Policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `user_profiles` | `auth.uid() = id` | `auth.uid() = id` | `auth.uid() = id` | — |
| `bookmarks` | `auth.uid() = user_id` | `auth.uid() = user_id` | — | `auth.uid() = user_id` |
| `engagements` | `auth.uid() = user_id` | `auth.uid() = user_id` | — | — |

### Triggers & Functions

| Trigger/Function | Purpose |
|-----------------|---------|
| `handle_new_user()` | Auto-creates `user_profiles` row on signup (extracts name/avatar from OAuth metadata) |
| `update_updated_at()` | Auto-sets `updated_at = NOW()` on profile update |
| `update_reading_streak(p_user_id)` | If last read was yesterday → increment streak. If null or older → reset to 1. If today → no-op. |

---

## Error Handling

```
Content Sources:
  Promise.allSettled → each source independent
  Source fails → logged, others continue
  All sources fail → return { cards: [], error: "..." }, status 503

AI Summarization:
  Gemini fails → try Groq
  Groq fails → return truncated raw content (first 500 chars)

Client Feed:
  API fails → log error, increment emptyFetchCount
  5 consecutive empty fetches → stop retrying
  "Try Again" button → reset counter, fetch fresh

Cloud Sync:
  Supabase not configured → app works fully offline (localStorage only)
  Sync fails → log error, continue (local state is source of truth)
  Auth fails → redirect to home

Cache:
  Cold start (no cache) → fresh fetch from all sources
  Stale cache (expired TTL) → deleted, fresh fetch
```

---

## Performance

| Metric | Target | Notes |
|--------|--------|-------|
| First Contentful Paint | < 1s | Cached cards render instantly from localStorage |
| Feed Load (cached) | < 100ms | In-memory Map lookup |
| Feed Load (fresh) | 2-4s | Parallel fetch from 4 sources |
| Card transition | 150ms | Framer Motion tween, ease `[0.25, 0.1, 0.25, 1]` |
| Swipe animation | 60fps | GPU-accelerated transforms |
| Bundle size | ~200KB gzip | Next.js code splitting |

### Optimizations

- **Instant render:** localStorage card cache shown immediately, live fetch in background
- **Parallel fetching:** All 4 content sources fetched with `Promise.allSettled`
- **No waterfall:** Cards render before AI processing (AI is only for `/api/summarize`)
- **Debounced sync:** Cloud sync waits 2s after last change to batch writes
- **Engagement cap:** Only last 500 engagements stored (prevents unbounded growth)
- **Read IDs cap:** Only last 500 read card IDs tracked
- **Card cache cap:** Only last 60 cards stored in localStorage

---

## Security

| Concern | Approach |
|---------|----------|
| API keys | Server-side only (`GEMINI_API_KEY`, `GROQ_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — never exposed to client |
| Client keys | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe to expose (RLS protects data) |
| Data access | Row Level Security on all tables — users can only access their own data |
| OAuth | Handled by Supabase Auth — no password storage |
| XSS | React's built-in escaping; no `dangerouslySetInnerHTML` |
| CSRF | Supabase handles session tokens via secure cookies |

---

## Deployment

### Vercel (Production)

Auto-deploys on every push to `main`.

```bash
# Manual deploy (if needed)
vercel --prod
```

### Environment Variables (Vercel Dashboard)

| Variable | Required | Scope |
|----------|----------|-------|
| `GEMINI_API_KEY` | Optional | Server |
| `GROQ_API_KEY` | Optional | Server |
| `NEXT_PUBLIC_SUPABASE_URL` | For auth | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For auth | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | For server ops | Server only |

### Build

```bash
npm run build    # Next.js production build
npm run start    # Local production server
npm run dev      # Development server
npm run lint     # ESLint
```

### Domain

- `plaxlabs.com` configured in Vercel → Settings → Domains
- SSL auto-provisioned by Vercel
- DNS managed through Vercel
