# Plax — Technical Documentation

> Complete technical reference for the Plax codebase.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [API Endpoints](#api-endpoints)
3. [Content Sources](#content-sources)
4. [Category System](#category-system)
5. [Feed Pipeline](#feed-pipeline)
6. [No-repeat Engine](#no-repeat-engine)
7. [Caching Strategy](#caching-strategy)
8. [Authentication & Cloud Sync](#authentication--cloud-sync)
9. [State Management](#state-management)
10. [Personalization Engine](#personalization-engine)
11. [AI Layer](#ai-layer)
12. [UI Components](#ui-components)
13. [Database Schema](#database-schema)
14. [Error Handling](#error-handling)
15. [Performance](#performance)
16. [Security](#security)
17. [Deployment](#deployment)

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

**AI Model Priority** (`src/lib/llm.ts`, raced with a stagger; the first valid answer wins):
1. Groq Qwen 3.8 27B (`qwen/qwen3.8-27b`) — fastest, ~0.3–0.7 s
2. Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) — most faithful, best Hindi
3. Groq GPT-OSS 20B, Gemini 3.1 Flash-Lite, GPT-OSS 120B, then OpenRouter free models
4. Raw truncation (first 700 chars) — last resort

---

### GET /auth/callback

Handles OAuth redirect after Google sign-in. Exchanges the auth code for a Supabase session, then redirects to `/`.

### GET /api/auth-config

Returns `{ url, anonKey }`: the public Supabase project URL and anon key (both already shipped to every browser as `NEXT_PUBLIC_*`; every table is protected by row-level security), so the Android app can find the account service without the address being compiled in and the project can move without an app update. Cached briefly (`s-maxage=300`). `503 { error: "unavailable" }` with `no-store` when the variables are not set.

### GET /auth/app?app=\<scheme\>&code=\<code\>

The web half of Android sign-in. Supabase returns the browser here after Google; the route answers `302` to `<scheme>://auth-callback?code=…` so the app receives the one-time code. Only the app's two schemes (`com.plaxlabs.news`, `com.plaxlabs.news.preview`) are accepted, and only `code`, `error`, `error_code` and `error_description` are forwarded (printable ASCII, at most 1,024 characters each), so the page cannot open anything else or carry arbitrary data into the app. Any other `app` gets `400`. The response is `no-store`, `no-referrer` and carries a restrictive CSP, with a link in the body in case the browser does not follow the redirect (`src/lib/app-redirect.ts`, unit-tested). Supabase must list `https://www.plaxlabs.com/news/auth/app` as a redirect URL (see `SUPABASE_SETUP.md`).

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
3. fetchAllContent() — Promise.allSettled across all sources, each limited to 8 s
   (`within`, `lib/deadline.ts`): a slow or stuck source counts as empty, so the
   page is built from the rest instead of waiting a minute for the slowest
4. Deduplicate by title (case-insensitive, first 80 chars); Wikipedia stubs,
   people, places and disambiguation pages are dropped (`isLowQualityWikipedia`,
   `isDisambiguationPage`)
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
Feed({ categories })   categories = ['news'] (Feed tab), one topic, or the reader's chosen topics (For you)

1. On mount / when the feed changes:
   a. Draw the cached page for this feed at once (news ≤ 2 h old, other topics ≤ 24 h),
      minus stories already seen
   b. Fetch the newest page (no exclude list, so it stays CDN-cacheable) and merge it
      with `replace`: unseen first, seen ones held back
   c. Nothing on screen → draw it. Something on screen → swap only within the first
      1.5 s while the reader has not moved (or when they asked); otherwise offer a
      "New stories" button
   d. A page that is entirely seen asks for older pages before the feed says it is
      caught up ('deeper')

2. Older stories (infinite scroll):
   - When remaining cards ≤ 10, fetchMore() asks for the next page with an exclude
     list (loaded + held-back + most recent seen ids, at most 200) and merges with `append`
   - Up to 3 pages are tried until one has something unseen; 1.5 s cooldown between fetches
   - A server that answers but has nothing new ends the list with the caught-up card;
     a network failure never does

3. Seen tracking: a story on screen for 1.2 s counts as seen (0.5 s if the reader moves on);
   the history is flushed 3 s after a change and whenever the page is hidden

4. Coming back: away ≥ 2 min → quietly check for newer stories;
   away ≥ 30 min → new session, start again from the newest

5. Card navigation:
   - Drag (y-axis, threshold 80px)
   - Keyboard (↓, Space, j = next; ↑, k = prev)
   - Scroll wheel (debounced 600ms)

6. Languages: the feed is always fetched in English and each card is AI-translated in
   place, so switching language never changes which stories are shown (a card keeps its
   `originalTitle`, which is what the no-repeat engine fingerprints)
```

---

## No-repeat Engine

`src/lib/story-engine.ts` (pure logic), `src/lib/seen-storage.ts` (localStorage) and the merge code in `Feed.tsx`. It is a port of `Similarity.java`, `SeenStore.java` and `FeedMerge.java` in `android/app/src/main/java/com/plaxlabs/news`, with the same constants and rules; change one side and the other together. `src/lib/story-engine.test.mjs` mirrors the Android `DuplicatesTest` scenarios (the Android Java was also run against the TypeScript on shared cases during development).

**Fingerprint of a story.** The headline (the lead of the body when there is none; the source's `originalTitle` when the card was translated), normalised with NFKC and lower-cased, split on anything that is not a letter, mark or digit. Tokens shorter than 3 characters, English and Hindi stop words, years and all-digit tokens are dropped, and a plural "s" is stemmed first. The distinctive tokens are kept sorted and unique; the *key* is every word, joined by spaces, cut at 160 characters.

**Same event** (`sameEventAt`):

1. Equal non-empty keys → the same story.
2. Otherwise both stories must be *timely* (a publish time, or category news) and share at least 3 distinctive tokens.
3. When both publish times are known they must be within 16 hours.
4. Then Jaccard ≥ 0.22, or containment ≥ 0.5, or (within 3 hours and Jaccard ≥ 0.15).

**Seen history** (`SeenStore`): at most 1,500 entries; news is kept 30 days and evergreen 7. Stored as JSON schema 1 under `plax-seen-v1`: `{ id, k, p, t, n }` per story (id, key, publish time, time seen, timely), never the story text. A story whose id is empty or longer than 200 characters is never recorded, so what is saved can always be read back. Damaged data is discarded rather than trusted.

**Merging** (`replace`, `append`, `cluster`): unseen stories first, one per event (a version with a real https picture and a similar time is preferred); stories already on screen but not yet viewed stay, and stories already viewed move to *earlier*; held-back stories are capped at 200 and offered by the "You're all caught up" card (**Check for new stories**, **Read N earlier stories**).

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

- **Key:** `plax-card-cache-v2`
- **Format:** `{ [feedSignature]: { cards: CardData[], ts: number } }`, one entry per feed (the selected topics, sorted), the 4 most recent kept
- **Max age:** news 2 hours, other topics 24 hours
- **Max cards stored:** 60 (most recent) per feed
- Stored as received; what the reader has already seen is filtered out again when the page is read, so a cached page never replays a read story
- Provides instant render on subsequent visits

### Client: Seen History (`seen-storage.ts`)

- **Key:** `plax-seen-v1` (see [No-repeat Engine](#no-repeat-engine))
- Up to 1,500 stories; damaged or oversized data is discarded; a full or blocked store is swallowed so reading never fails because of it

### Client: Zustand Persistence (`store.ts`)

- **Key:** `plax-store-v2`
- **Storage:** localStorage via `createJSONStorage`
- Stores: topics, bookmarks (ids and the saved cards themselves), engagements (last 500), read card IDs (last 500), cards read count, whether the reader has chosen topics, and which account this browser last synced with
- The pre-1.2 `seenStoryKeys` filter is dropped on load; the no-repeat engine replaced it

---

## Authentication & Cloud Sync

### Auth Flow

```
1. Plax is public: nothing needs a sign-in. The account button (header on phones,
   rail on desktop) opens AccountSheet: what an account is for, and
   "Continue with Google"
2. Click → AuthProvider.signInWithGoogle() first asks the account service
   (`/auth/v1/settings`, 5 s limit) whether it is reachable and offers Google.
   If not, the sheet says "Sign-in is temporarily unavailable" and nothing else
   happens (no redirect to an error page, no alert)
3. Otherwise supabase.auth.signInWithOAuth() → Google → consent → callback
4. /auth/callback exchanges the code for a session
5. Redirect to / with a valid session cookie
6. AuthProvider detects the session, sets user state
7. CloudSync MERGES the account with this browser (below)
```

### AuthProvider (`components/AuthProvider.tsx`)

- Creates Supabase browser client (singleton)
- Provides context: `user`, `session`, `loading`, `signInWithGoogle` (resolves to `'redirecting'` or `'unavailable'`), `signOut`
- Listens to `onAuthStateChange` for session updates
- Google is the only provider offered

### AuthProviderWrapper (`components/AuthProviderWrapper.tsx`)

- Checks if `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist
- If not configured, renders children without auth (app works offline)
- If configured, wraps with `AuthProvider` + `CloudSync`

### CloudSync (`components/CloudSync.tsx`)

Invisible component that bridges Zustand ↔ Supabase. Signing in never replaces what the reader has chosen here:

| Trigger | Action |
|---------|--------|
| User signs in (new userId) | Load profile + bookmarks → **merge** into the store: the account's topics win when it has any, otherwise the local topics are kept; saved stories are a union; `cardsRead` takes the larger |
| …and this browser last synced with the same account (or none) | Upload what the account lacks: local topics when it has none, local saved stories it does not hold |
| …and a different account used this browser before | Nothing is uploaded: the previous reader's choices are never copied into the new account. They stay on the device, which does not belong to an account; signing out does not erase them |
| Account service unreachable | Nothing is merged and the attempt is repeated next time (`syncedUserId` is only set after a merge) |
| `selectedTopics`, `hasOnboarded`, or `cardsRead` changes | Debounced sync to Supabase (2s delay) |
| New engagement added | Immediately save to `engagements` table |
| User signs out | Clear `syncedUserId` (`lastUserId` is kept for the rule above) |
| User signs in | Call `update_reading_streak()` RPC |

> **Status:** the Supabase project is currently unreachable (see `SUPABASE_SETUP.md`), so this path is unit-tested for the pure parts but has not been verified end to end.

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
  // Topics
  hasOnboarded: boolean             // true once the reader has chosen topics (never a gate: Plax is public)
  selectedTopics: string[]          // e.g. ['programming', 'science', 'space']; the For you feed
  setOnboarded: () => void
  setSelectedTopics: (topics) => void
  toggleTopic: (topic) => void
  startOnForYou: boolean            // the first choice of topics opens For you once

  // Bookmarks
  bookmarkedIds: string[]           // card IDs, oldest first
  bookmarkedCards: Record<string, BookmarkedCard>  // the saved stories themselves (last 150)
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
  syncedUserId: string | null       // the account merged this session
  lastUserId: string | null         // the account this browser last synced with (see CloudSync)
  setSyncedUserId: (id) => void
  setLastUserId: (id) => void
  hydrateFromCloud: (data) => void  // MERGE from Supabase: never replaces local choices
}
```

**Persistence:** `plax-store-v2` in localStorage. Uses `createJSONStorage` with SSR-safe fallback.

`lib/ui-store.ts` holds what is not persisted: `screen` (`feed` / `topics` / `saved`), `feedFilter` (`'news'` by default = Feed tab; a topic id = that topic; `null` = For you), `accountOpen`, `pinnedCardId` (opens a saved story in the feed), and `refreshTick`.

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

Edge runtime API endpoint. Uses the staggered provider chain in `lib/llm.ts`
(Qwen 3.8 27B → Gemini 3.5 Flash-Lite → GPT-OSS …) and translates with
`lib/translate.ts` (LLM → Azure → MyMemory). Hindi sources are summarised directly
in Hindi; results are cached (memory + Supabase `ai_cache`).

---

## UI Components

### `Feed.tsx` — Main Swipeable Feed

| Feature | Implementation |
|---------|---------------|
| Drag to swipe | Framer Motion `drag="y"` with `dragElastic={0.15}` |
| Keyboard nav | `ArrowDown`/`Space`/`j` = next, `ArrowUp`/`k` = prev |
| Scroll wheel | Debounced (600ms), threshold: `deltaY > 30` |
| Infinite scroll | Auto-fetch when ≤ 10 cards remaining (see [Feed Pipeline](#feed-pipeline)) |
| No repeats | Seen tracking, same-event merging, "New stories" button and the caught-up card (see [No-repeat Engine](#no-repeat-engine)) |
| Empty state | Loading spinner during initial load; "Try again" when the first page cannot be fetched and nothing is cached |
| Progress dots | Side dots showing ±4 cards around current position |
| Loading bar | Animated gradient bar at top during fetch |

### `Card.tsx` — Content Card

| Feature | Implementation |
|---------|---------------|
| Layout | Full-screen, centered content with gradient background glow |
| Typography | Merriweather (serif) for reading, Inter for UI, JetBrains Mono for code |
| Content types | Quote (blockquote + left bar), code (monospace block), standard (paragraphs) |
| Body text | Without the headline said twice (`lib/story-body.ts`, the same rule as the Android app); nothing is drawn when the body only repeats the headline |
| Text formatting | `**bold**`, `` `code` ``, `→ arrows`, `• bullets` |
| Read progress | Circular SVG progress ring (violet → cyan gradient) |
| Actions | Discuss (copy to clipboard), Share (Web Share API or clipboard), Bookmark |
| Bookmark feedback | Animated toast: "✓ Saved" / "Removed" |
| Cloud sync | Bookmark add/remove syncs to Supabase if signed in |

### Navigation — `BottomNav.tsx`, `LeftRail.tsx`, `NavBar.tsx`

- **Four places** — Feed, For you, Topics, Saved (`ui-store` `screen` + `feedFilter`). A bottom bar on phones (`BottomNav`), a side rail on desktop (`LeftRail`, which also holds language, theme, the reader's topics and the account button)
- **Mobile header (`NavBar`)** — logo, EN/हि, theme, search, "check for new stories", and a quiet account button that opens `AccountSheet`
- Feed tab = news (default) or one topic; For you = a mix of the reader's chosen topics, with `ForYouEmpty` until some are chosen

### `TopicsScreen.tsx`, `TopicEditor.tsx`, `SavedScreen.tsx`, `AccountSheet.tsx`, `CaughtUp.tsx`

- **Topics** — the 16 topics plus News; tapping one opens it in the Feed tab. "Choose topics" opens `TopicEditor`, a sheet that selects the topics behind For you; the first choice opens For you at once
- **Saved** — the bookmarked stories (also those restored from an account); the headline and **Open** return to the feed on that story, **Remove** unsaves it
- **Account** — explains the optional account, offers Google sign-in, and says plainly when sign-in is unavailable
- **Caught up** — "You're all caught up", **Check for new stories**, **Read N earlier stories**

### `Profile Page` (`app/profile/page.tsx`)

- Signed in: avatar, name, email, member-since date, stats grid (Cards Read, Day Streak, Minutes Read, Bookmarks) and three tabs: Stats (top interests + selected topics), Bookmarks (cloud-loaded), Settings (sign out)
- Signed out: the reader's on-device activity (cards read, saved stories, minutes, top interests) and a **Sign in** button that goes to the feed with the account sheet open, like every other sign-in entry. Nothing here needs an account

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

### `vercel.json`

It holds the daily keep-alive cron, and two things matter:

- The cron path must include the base path (`/news/api/keep-alive`). Vercel calls it on the deployment and every route lives under `/news`, so `/api/keep-alive` would answer 404 and the free-tier Supabase project would drift towards auto-pause.
- Vercel validates the file strictly. An unknown key (a `_comment`, say) fails the whole deployment with "Invalid vercel.json", and the previous production deployment keeps serving: that is why the deployments of `638d2cc` and the 1.2 release did not go out. Run `vercel build` before pushing a change to this file; it reports the same error locally.

### Account service health

Sign-in and cloud sync (website and Android app) depend on one free-tier Supabase project. It pauses after 7 days without activity and a paused project stops resolving, which makes every "Continue with Google" show "Sign-in is temporarily unavailable". The daily cron above keeps a working project awake with a real database read; it cannot wake a paused one, and a cron that is broken or never deployed lets the project pause without any warning (the likely cause of the outage that began between 31 July and 9 October 2026, when the cron's path was wrong and its fix could not deploy). `/news/api/keep-alive` answering `500` means accounts are down. Run `.\scripts\check-accounts.ps1`: it reads the live `/api/auth-config` and checks the whole chain, with a fix named for each failure. [SUPABASE_SETUP.md](SUPABASE_SETUP.md) is the recovery runbook, and `scripts/auth-stack` runs the real Supabase services locally for testing the schema and the Android account code without touching the live project.

### Android update feed (`public/updates.json`)

The native app ([android/README.md](android/README.md), *Updates from inside the app*) updates itself from two static files that deploy with the website: `public/updates.json` (seven fields: `schemaVersion`, `versionCode`, `versionName`, `minSdk`, `apkUrl`, `sha256`, `size`) at `/news/updates.json`, and the one advertised build, `public/plax-<version>.apk`, at `/news/plax-<version>.apk`. The app only reads `https://www.plaxlabs.com/news/...` (the apex redirects to `www`, and the app follows no redirect, so the feed must always be reached on `www`).

- **Headers** come from `headers()` in `next.config.js`: the feed is `application/json; charset=utf-8`; the APK is `application/vnd.android.package-archive` with `Content-Disposition: attachment`. **Both are `Cache-Control: no-store`**, and both send `nosniff` and `X-Robots-Tag: noindex`. The APK must not be cacheable: the shared cache in front of `www.plaxlabs.com` stores the answer to a ranged request (`Range: bytes=0-1`) as the whole file and then serves those 2 bytes to every download until its lifetime ends, even across deployments (seen on 10 October 2026, and reproduced with probe files: poisoned with `public, max-age=3600`, not with `no-store`). So never send a Range request to the production APK. Vercel was seen adding its own `Content-Disposition: inline` to the feed, which does not matter to the app; confirm after a deployment that the rest of these headers won: `android\verify-update.ps1` does.
- **Publishing** is `android\publish-update.ps1` (it validates the APK and writes both files), a commit, a push, then `android\verify-update.ps1` once the deployment is Ready. The steps and the signing caveat are in the Android README, *Publishing an update*.
- **Rollback** is reverting the commit that changed `updates.json`. Installed apps never go back to a lower version code.
- The files are in `public/`, so deleting or editing them by hand can strand or mislead every installed copy; change them only through the script.

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
