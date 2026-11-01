# Plax — Technical Documentation

> Complete technical reference for the Plax codebase.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [API Endpoints](#api-endpoints)
3. [Shared Story Pages](#shared-story-pages)
4. [Content Sources](#content-sources)
5. [Category System](#category-system)
6. [Feed Pipeline](#feed-pipeline)
7. [No-repeat Engine](#no-repeat-engine)
8. [Caching Strategy](#caching-strategy)
9. [Authentication & Cloud Sync](#authentication--cloud-sync)
10. [State Management](#state-management)
11. [Personalization Engine](#personalization-engine)
12. [AI Layer](#ai-layer)
13. [UI Components](#ui-components)
14. [Database Schema](#database-schema)
15. [Error Handling](#error-handling)
16. [Performance](#performance)
17. [Security](#security)
18. [Deployment](#deployment)

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
      "fetchedAt": 1707123456789,
      "sig": "45cf1f8654294cfdfa03b1376166de5b"
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

`sig` (1.4.0, optional) is the server's signature over the card as served (see [Shared story pages](#shared-story-pages)). Clients that do not know it ignore it, so older apps and cached cards keep working; a card without one is simply shared by its publisher's link.

`lead` (after 1.5.5, optional, `true` or absent) says that `content` is the opening of the article itself, which the server read from the publisher's page because the feed gave only a line or two (see *More text for a short story* under [One view per story](#one-view-per-story)). The website then shows it as it is and does not rewrite it with the AI step; the app ignores it. A card's `id` is made from the text the *feed* gave, not from this longer text, so a story keeps its id whether or not its page has been read yet.

---

### POST /api/share

Turns a card a reader is sharing into a story page and returns its address. Runtime: `nodejs`, `force-dynamic`, always `Cache-Control: no-store`.

**Request:** the card exactly as the feed served it, plus its `sig` (`id`, `title`, `content`, `source`, `sourceUrl`, `image`, `publishedAt`, `category`, `section`, `sig`). At most 32 KB.

**Response (200):** `{ "url": "https://plax-rouge.vercel.app/news/s/<slug>-<id>", "id": "<id>" }`. Asking again for the same card returns the same address.

| Status | `error` | Meaning |
|---|---|---|
| 400 | `invalid` | Not a well-formed card (missing text, a non-web link, text over its limit, a bad signature shape) |
| 403 | `unverified` | The signature does not match the card: its words, link or picture were changed |
| 413 | `too_large` | Over 32 KB |
| 429 | `slow_down` | More than 30 requests a minute from one address (per warm instance) |
| 503 | `unavailable` | No signing secret configured, or the story store did not take the write. No address is promised in that case |

Clients treat anything but 200 as "no Plax link" and share the publisher's link, so a failure never stops sharing.

---

### GET /s/\<slug\>-\<id\>

The story page (see below). `<id>` is the first 16 hex characters of the signature; `<slug>` is only for reading. A wrong slug answers `308` to the right one, an unknown id `404`, and an unreachable store a `500` (retried by search engines, never cached).

---

### POST /api/summarize

AI-powered content summarization. Runtime: `edge`.

**Request:**

```json
{
  "content": "Long article text to summarize...",
  "type": "microessay",
  "lang": "en",
  "category": "news",
  "card": true
}
```

`card: true` is sent by the website for the text of a card (`Feed.tsx`, both the card shown and the warm-up of the other language, so that they share one cache entry). For `category: "news"` it asks for a **short brief** of 35–60 words, so that the story fits one screen together with its picture (`lib/summary-prompt.ts`; in Hindi the 70–110 word brief came to 600–800 characters, 14 to 17 lines on a phone, and left no room for the picture). Without the flag, which is how the Android app's on-demand **AI brief** calls it, and for every other category, the prompts are exactly the earlier ones (checked once, byte for byte, against the original route for 15 categories, both languages and several sources; `summary-prompt.test.mjs` keeps the ranges and the scope of the flag under test). The short brief has its own cache version (`v2-brief`), so a long brief cached for the same story is never served in its place.

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

The web half of Android sign-in. Supabase returns the browser here after Google; the route answers `302` to `<scheme>://auth-callback?code=…` so the app receives the one-time code. Only the app's two schemes (`com.plaxlabs.news`, `com.plaxlabs.news.preview`) are accepted, and only `code`, `error`, `error_code` and `error_description` are forwarded (printable ASCII, at most 1,024 characters each), so the page cannot open anything else or carry arbitrary data into the app. Any other `app` gets `400`. The response is `no-store`, `no-referrer` and carries a restrictive CSP, with a link in the body in case the browser does not follow the redirect (`src/lib/app-redirect.ts`, unit-tested). Supabase must list `https://plax-rouge.vercel.app/news/auth/app**` as a redirect URL, and its Site URL must be the same domain; otherwise it sends the reader back to its Site URL and sign-in never reaches the app (see `SUPABASE_SETUP.md`; `scripts/check-accounts.ps1` checks it).

### POST /api/account/delete

Deletes the account of whoever calls it: Google Play requires that an account made inside an app can be deleted again, with its data, from the app and from a web page. It is used by the Android app (Account, Delete account) and by the website's `/delete-account` page.

- **Request:** `Authorization: Bearer <the reader's own Supabase access token>`, no body. Nothing in the request names an account.
- **How it decides:** `src/lib/account-delete.ts` asks the account service (`GET /auth/v1/user` with that token) whose token it is, requires the answer's `id` to be a UUID (it becomes part of an address), and calls the admin API (`DELETE /auth/v1/admin/users/<id>`, hard delete) with the service-role key, which never leaves the server. So one reader cannot delete another, and the reader's token is never sent anywhere but the account service.
- **What goes:** the auth user, and through `ON DELETE CASCADE` its `user_profiles`, `bookmarks` and `engagements` rows, sessions and sign-in identities. Nothing else in the database refers to a person (`ai_cache` and shared story pages hold no personal data).
- **Answers** (all `no-store`): `200 {"deleted":true}` (also when the account is already gone, so a lost answer can be retried), `401` (no, malformed, expired or unknown token), `405` for other methods, `429` after 10 requests a minute from one address (best effort, per warm instance), `503` when it cannot be done now (the account service or its configuration is unavailable); in that case nothing was deleted or it can safely be asked again.
- **No cookies and no CORS answer**, so another website cannot call it for a reader. The token is never put in a result or a log.
- **Tested** with a fake account service (`src/lib/account-delete.test.mjs`, 10 tests) and end to end against a real local GoTrue and PostgREST (no token, made-up token, damaged signature, GET, a real deletion with the cascade checked in every table, a second reader untouched, the old token refused, the limit).

### GET /contact

A dedicated **Contact us** page (`src/app/contact/page.tsx`, address and dates in `src/lib/legal.ts`, the same frame as the policy pages). Google Play's News and Magazines policy asks every news app for a dedicated website page and an in-app page that are easy to find and show a contact email or phone number; a privacy policy that happens to contain an address was not accepted (policy notice of 16 October 2026). The page has an H1 "Contact us", the address as visible text and a `mailto:` link, who runs Plax, what to write about (problems, corrections, publishers and rights holders, privacy and deletion, feedback), how replies work, where the stories come from, and a `ContactPage` JSON-LD block. It is linked from the menu (☰), the desktop left rail, the footer of every public page (`SiteLinks.tsx`: headlines, Hindi headlines, topics, each topic, the policy pages), the privacy policy's Contact section and the server-rendered crawler nav in `layout.tsx`, and it is in the sitemap. The Android app's **Contact us** (a menu entry; its **About** screen also shows the address) shows the same address and opens this page; `ContactTest` fails if the app's address, page path or operator differ from `legal.ts`. This URL, `https://plax-rouge.vercel.app/news/contact`, is the one given to the Play Console as the news declaration's contact URL. Change the address in `legal.ts` and in `Contact.java` together.

### GET /privacy and GET /delete-account

Plain server-rendered pages (`src/app/privacy`, `src/app/delete-account`, text and facts in `src/lib/legal.ts`, frame in `LegalPage.tsx`). The privacy policy states what stays on a device, what the servers receive, the AI and translation services that can see story text, what a Google account stores (on the website: email, name, picture address, topics, saved stories and reading activity; the Android app sends only topics and saved stories), retention, deletion, children (13 and over) and a contact. The delete page lets a reader without the app delete from the browser: `DeleteAccountPanel` signs in with Google (returning to the page through the callback's `next` parameter), asks first, then calls the route above with the session's token; email is the fallback. Both are linked from the menu (☰) and the Account sheet, listed in the sitemap, and are the two URLs entered in the Play Console. The contact address and the dates live in `legal.ts`; change the policy text and `updated`/`updatedIso` together.

---

## Shared Story Pages

Tapping Share on a story sends a link to **Plax's own page for that story** (`https://plax-rouge.vercel.app/news/s/<slug>-<id>`) rather than the publisher's article. The page previews well in WhatsApp and other chat apps, can be found through the sitemap, shows a short summary with its source, and sends readers to the publisher for the full report and to Plax for more. It is built so that nobody can put words of their own on the site's domain.

### Why the card is signed

News pools rotate and clients keep stories for days, so a link cannot be re-resolved from the feed later; it must be made from the card the reader holds, and the server must be able to trust that card.

1. `/api/feed` adds `sig` to every card: an HMAC-SHA256 (truncated to 128 bits) over `id`, `title`, `content`, `source`, `sourceUrl`, `image`, `publishedAt`, `category` and `section`, joined with a separator that cannot occur in them (`src/lib/share.ts`, `src/lib/share-sign.ts`).
2. The key is derived (HMAC, fixed label) from `SHARE_SECRET` when set, otherwise from the existing `SUPABASE_SERVICE_ROLE_KEY`, so **no new environment variable is needed**. With neither, cards are simply unsigned.
3. On Share the client sends the card back. `POST /api/share` accepts it only if the signature verifies (timing-safe), so a changed headline, link or picture is refused with `403`.
4. Both sides canonicalise text first (control characters removed, ends trimmed, and `&amp;`/`&#038;`/`&#38;` decoded in the two web addresses, as the Android parser does), so a card that went through the app still verifies. `android/app/src/test/resources/share-vector.json` is a golden vector that the Android unit test and the website's unit test both check, so the two implementations cannot drift apart unnoticed.
5. A translated card is shared by its **original** words (`originalTitle`/`originalContent`), which are what the signature covers; saved copies keep the signed fields (`BookmarkedCard.image/publishedAt/section/sig`).
6. A stored record is looked up by `sid`, the first 64 bits of the signature. It is not a secret and not guessable into a different page: a card with another signature has another `sid`.

### Storage and the page

- Records are kept in the existing `ai_cache` table under `share:v1:<sid>` (server-only, service role; no schema change). `putDurable` reports whether the write really reached the database, so no link is ever handed out for a page that does not exist. Saving is **one write that keeps an existing page** (`Prefer: resolution=ignore-duplicates`: PostgREST answers 201 for a duplicate and leaves the original alone), because the same signature always means the same card and a read first would only add a database round trip to the reader's wait. Records never expire, so a link keeps working after the story has left every feed.
- `src/app/s/[slug]/page.tsx` is server-rendered from the stored record: headline, source, publish time, the summary without the headline repeated (`story-body.ts`), the publisher's picture (hot-linked, `no-referrer`, https only, hidden if it fails), a "Read the full story at …" button, Share and Copy link, and links to the section or topic.
- Metadata: absolute canonical URL, Open Graph `article`, Twitter large card, JSON-LD `WebPage` (`isBasedOn` the publisher's work, not claiming authorship) with a breadcrumb. Hindi stories (detected by script) get `lang="hi"`, `hi_IN` and the Devanagari serif.
- Everything from the record is escaped by React; JSON-LD has `<` escaped so a headline cannot close the script element; links are re-validated as `http(s)` and pictures as `https` when the page renders, whatever the record holds.
- **Caching:** `revalidate = 120`. A viral link costs one database read per two minutes. If the store is unreachable the page answers `500` (not cached, and an already-cached page keeps being served) instead of a `404`, which search engines would take as gone. A missing story is a `404` cached for the same two minutes.
- `src/app/sitemap.ts` lists the 500 newest shared stories (hourly), failing soft.

### The preview picture

`/s/<slug>/opengraph-image` draws a 1200×630 card: the Plax mark (`PTile`, the shared "P" outline on the amber tile; see *The "P"* under UI Components), the section, the headline set large in Newsreader Bold (`assets/og/`, SIL OFL, 30 KB), and the source. It is drawn, not copied from the publisher. Satori, which draws it, does **not** shape Devanagari correctly (vowel signs land on the wrong letter), so a card never draws Hindi: a Hindi headline gets a plain branded card (and a non-Latin source name is left off the line below it), and the Hindi headline reaches the preview through `og:title`, which the chat app sets itself. `₹` is written `Rs` (the font has no glyph for it). The image is cached immutably, except the stand-in drawn when the store cannot be asked.

### Clients

- **Web** (`src/lib/share-client.ts`, `CardActions.tsx`): the link is made first (limit 6 s) and its address checked against the card's signature; then `navigator.share` (or the clipboard). While it waits the Share or Copy button shows a spinner, and a second click gives up waiting (the first click then carries on with the publisher's link). Browsers that only open the share sheet straight from the tap (iOS Safari) show "Link ready. Tap Share again", and the next tap is instant because the link is remembered. Copy puts the Plax link in the pasted text.
- **Android** (`ShareLinks.java`, `MainActivity.share`): the same request from a worker thread (limit 7 s, "Preparing link…" after 0.7 s), the answer accepted only if it is a story page of this story on the Plax site itself. Tapping Share again on the same story while it waits means "do not wait" (the publisher's link goes out at once); tapping another story abandons the first request. A request that was given up on is never obeyed if it answers later, and nothing is opened if the screen is gone or in the background.
- **Why 6-7 seconds.** The first release allowed 4 s and the installed app fell back to the publisher's link when a sleeping serverless instance had to start. From a workstation the endpoint needs 0.3-2.2 s for a story it has not stored (about 0.5 s warm), and a phone's network adds to that. Waiting is bounded, visible and cancellable by tapping again; being unable to wait is the failure to avoid.
- **Fallback everywhere:** no signature (an older cached card, a quote), no publisher link, or any failure → the publisher's link is shared exactly as before.

### Search visibility

- **Automatic.** A new share is a page as soon as `POST /api/share` answers, and `sitemap.xml` lists it within about an hour (it is rebuilt hourly and carries the 500 newest shared stories). The domain's `/robots.txt` and `/sitemap.xml` redirect (307, from `next.config.js`) to their copies under `/news`, and `robots.txt` lists `sitemap.xml` and `news-sitemap.xml`, so nothing has to be set up here for crawlers to find them.
- **One address per page.** The sitemap, `rel="canonical"`, `og:url`, the English/Hindi `hreflang` pair and the breadcrumbs must all name the same address, and it must answer `200` without a redirect. Under the `/news` base path the values in `alternates` are prefixed again (`'/news'` became `/news/news`, a `404`) and `'/'` becomes `/news/`, which redirects to `/news`. Use the page's own path (`'/headlines'`) and, for the home page, the absolute `SITE_URL`. Both mistakes were left over from the move to `/news` (the news hub named a canonical that did not exist, and the sitemap listed the redirecting home address) and were fixed on 11 October 2026.
- **How to check.** Fetch `/news/sitemap.xml`, then every address in it without following redirects: each must answer `200`, carry no `noindex` and name itself as its canonical, and the English and Hindi hubs must name each other in `hreflang`.
- **The home page is an app, so crawlers need help.** Its stories come from `/news/api/feed`, and robots.txt keeps crawlers off `/news/api/`. Google therefore rendered "Could not load stories" and Search Console reported a **soft 404** for the home page (11 October 2026). `src/app/page.tsx` now reads the first 12 stories on the server, with the feed route's own `GET` so ids and signatures match, rebuilds every few minutes, and gives them to `HomeApp`/`Feed` as `seed`. The feed shows the seed **only when the first live load fails and nothing is cached** (offline, or a crawler), so a reader whose network works never sees it and the no-repeat behaviour is unchanged. The HTML also carries an off-screen `h1`, the 12 headlines as plain text and links to the two hubs, for anything that does not run scripts. To check it, render the page with a Googlebot user agent and `/news/api/` blocked: it must show a story, not the error.
- **Manual, in Google Search Console** (the old `plaxlabs.com` property no longer applies; add `https://plax-rouge.vercel.app/news/` as a new URL-prefix property, verified by a method that needs no DNS, such as the HTML tag): under Sitemaps add `sitemap.xml`, then watch Pages for the reason any address is not indexed. Indexing cannot be forced: Google says crawling takes from a few days to a few weeks, "Request indexing" in URL Inspection is for a few addresses and has a quota, and the Indexing API is only for job postings and livestream videos. A link sent in a private chat is never seen by a crawler, so sharing to WhatsApp does not by itself bring a page to Google; the sitemap does.
- **`news-sitemap.xml` does not make Plax a Google News source.** Google's news sitemaps are for articles first published on the site in the last two days, with their real publication dates; this one lists the hub pages stamped with the time it was built (every 15 minutes). It does no harm and every address in it is also in `sitemap.xml`, so it is not worth submitting. Removing it would also mean editing `src/app/robots.ts`.

### Limits worth knowing

- The page carries a short summary and the source's headline with attribution and a link out, as the `/headlines` pages already do. An original summary per story would be stronger for search and safer for copyright; that is not built.
- There are no Android App Links: the app declares no `https` intent filter and the site serves no `/.well-known/assetlinks.json`, so a tapped Plax link opens in the browser, not the app.
- `/robots.txt` and `/sitemap.xml` at the domain root redirect to their copies under `/news` (`next.config.js`); their content is `src/app/robots.ts` and `src/app/sitemap.ts`.

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

4. Newer stories are looked for without being asked (the menu has no row for it):
   - a tab left open asks every 5 minutes, quietly (the CDN-cacheable page, no live refresh)
   - coming back to the tab after 2 minutes or more asks once; after 30 minutes the feed
     starts again from the newest stories; a shorter glance away asks nothing
   - what it finds is offered as the "New stories" button, never swapped under the reader
   - the caught-up card, and the empty and error screens, have a **Check for new stories**
     button, which asks the server for a live refresh
   The app does the same (`FeedViewModel.foreground()`, the "New stories" pill and the
   caught-up card).

4. Coming back: away ≥ 2 min → quietly check for newer stories;
   away ≥ 30 min → new session, start again from the newest

5. Card navigation (a card never scrolls, so one gesture moves exactly one story):
   - Touch: a decisive swipe anywhere on the card (≥ 72 px, mostly vertical, quick or long); only an
     input or a sheet that scrolls by itself (`data-no-feed-scroll`) keeps its own swipes
   - Keyboard (↓, Space, j = next; ↑, k = prev)
   - Scroll wheel: one push of ≥ 50 px moves one story, and navigation then stays locked until the
     wheel has been idle for 220 ms, so a trackpad's momentum cannot skip stories

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
1. Plax is public: nothing needs a sign-in. The account row (in the ☰ menu on phones,
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

  // Appearance
  themeMode: 'system' | 'light' | 'dark'   // the reader's choice; System (the default) follows the device, like the Android app
  theme: string                     // what that resolves to right now; kept current by ThemeSync

  // Bookmarks
  bookmarkedIds: string[]           // card IDs, oldest first
  bookmarkedCards: Record<string, BookmarkedCard>  // the saved stories themselves (last 150); a story saved from 1.4.0 keeps what the share signature covers, so it can still be shared
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

**Theme:** `lib/theme.ts` holds the rules (`resolveTheme`, `themeModeOf`) and `THEME_SCRIPT`, which `layout.tsx` runs in the page head before anything is drawn; `ThemeSync` keeps the `<html>` class right afterwards and follows the device's setting live while the choice is System. State saved before the System option existed has only `theme`: an explicit `light` carries over, while `dark` (the old default, indistinguishable from a choice) becomes System. `theme.test.mjs` runs the head script itself against the functions for every combination.

`lib/ui-store.ts` holds what is not persisted: `screen` (`feed` / `topics` / `saved`), `feedFilter` (`'news'` by default = Feed tab; a topic id = that topic; `null` = For you), `accountOpen`, `menuOpen` (the ☰ panel) and `pinnedCardId` (opens a saved story in the feed).

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
in Hindi; results are cached (memory + Supabase `ai_cache`). The prompts (the voice and
length for each topic, and the short news brief the website asks for) live in
`lib/summary-prompt.ts`. A Hindi answer in which a word has letters of another script
inside it (a model once wrote "पाльше" for "पाले में") is refused, and the next provider's
answer is used (`lib/script-mix.ts`; checked against 126 texts of the native Hindi feed, none
flagged; a word of another script standing on its own, such as a name, is left alone).

---

## UI Components

### `Feed.tsx` — Main Swipeable Feed

| Feature | Implementation |
|---------|---------------|
| Swipe | A decisive touch swipe anywhere on the card moves one story: ≥ 72 px, mostly vertical, quick or long. A card never scrolls, so there is no "scroll the text first" |
| Keyboard nav | `ArrowDown`/`Space`/`j` = next, `ArrowUp`/`k` = prev |
| Scroll wheel | One push of ≥ 50 px moves one story; locked until the wheel has been idle for 220 ms (the lock's timer is not cleared when the handler is re-registered after a move, which would swallow the next push) |
| Infinite scroll | Auto-fetch when ≤ 10 cards remaining (see [Feed Pipeline](#feed-pipeline)) |
| No repeats | Seen tracking, same-event merging, "New stories" button and the caught-up card (see [No-repeat Engine](#no-repeat-engine)) |
| Empty state | Loading spinner during initial load; "Try again" when the first page cannot be fetched and nothing is cached |
| Progress dots | Side dots showing ±4 cards around current position |
| Loading bar | Animated gradient bar at top during fetch |

### `Card.tsx` — Content Card

The card follows the Android app's layout, so the website and the app read the same.

| Feature | Implementation |
|---------|---------------|
| Layout | The picture leads (rounded; its height is what the text leaves, between its minimum and 1.2 times its width; a story with no picture, news or topic, gets a **poster**: its section's or topic's sign on a soft wash, as in the app; a quote is its own picture and has none), then the tag and origin line with **Listen, Save and Share at its right end**, the headline (the link to the full story), the summary and the extras row (see [One view per story](#one-view-per-story)). Unlike a photograph, a poster is left out when the whole summary does not fit beside it (`lib/poster.ts` holds the rule and the signs; `poster.test.mjs` checks that the five section signs are the app's). The ☰ menu button floats over the picture's top-left corner. On desktop the same column sits between the two side panels |
| Tag and origin | News: a soft marigold tag with the section ("INDIA") and `Source · 2h ago · 20s`, then the buttons; "Breaking" within 30 minutes. The line never wraps: the source name is cut with an ellipsis first and the age never is; the ↗ after the source gives way below 400 px, and the read time and the word "Breaking" (its dot stays) below 540 px, where they took the name's room on a 430 px phone. Other topics keep the topic chip (its dropdown manages topics) |
| Typography | One system with the app: **Newsreader Bold** serif for headlines and the wordmark (`.headline`, `.wordmark`), **Inter** for the text people read (`.reading-text`), JetBrains Mono for code. Hindi headlines use Noto Serif Devanagari Bold, Hindi text Noto Sans Devanagari |
| Content types | Quote (blockquote + left bar), code (monospace block), standard (paragraphs) |
| Body text | Without the headline said twice (`lib/story-body.ts`, the same rule as the Android app); nothing is drawn when the body only repeats the headline |
| Extras | **Go deeper** (AI insights, a soft pill with a sparkle), and on other topics **Test yourself** and **More by this author**. They sit in one row pinned under the summary; what they open is a **sheet** that floats over the summary: a title bar with the close button that stays put, and a body that scrolls on its own. Its height is the room the card has above the row (`--sheet-room`, set by `useCardFit`), so the sheet is never taller than the card, the cross is always in view and in reach, and the card itself never has to grow. Escape closes it, and a swipe on it stays on the story |
| Text formatting | `**bold**`, `` `code` ``, `→ arrows`, `• bullets`. Paragraphs are set apart by a blank line so that the summary can be counted and cut as one text |
| Cloud sync | Bookmark add/remove syncs to Supabase if signed in |

### One view per story

A story must be seen in one view, and one swipe must always move to the next story: the card has nothing that scrolls. (Before 1.5.5 a long summary scrolled first, and only a swipe at its edge moved on: up to five swipes for one story, and a swipe that began on the headline did nothing.) The picture, the tag and source line (with the Listen, Save and Share buttons at its right end), the headline, the summary and, on the website, the Go deeper row under it therefore share the height of the screen, in the app and on the website, by the same rules:

- **The picture keeps its minimum; the summary takes the rest and is cut where its room ends.** The source line, the headline and the row are always shown. A story with a **photograph** keeps it: the picture gets at least 60% of the width and 30% of the box (never under 96 px), the summary gets what remains, whole if it fits and otherwise cut to a whole line with an ellipsis, and the picture takes whatever the lines leave (so it is less than a line over its minimum when the summary is cut). A short summary leaves room, and the picture takes it, up to 1.2 times its width and 62% of the box, so the card is always full instead of ending in a gap. The summary is always set at its own size (it used to be set at 94% and 88% before being cut), so stories look alike. A **poster** only stands in for a picture, so it keeps the older rule: it is shown only when the whole summary fits beside it (its minimum is 30% of the width and a quarter of the box), else it is left out. Before the summary is cut below three lines the headline gives up lines, never below two, and a long headline is set smaller (90%, 80%) before it is ever cut. A card with no summary lets the picture grow taller. (The 1.5.5 planner also kept a picture minimum and cut the summary; the 1.5.5 follow-up reversed that to "whole summary first, picture takes what is left", which dropped the picture of any story with a longer text and left a gap under a short one. The rule now is the first to do neither.)
- **The summary is cut at a whole line, with an ellipsis,** never through the middle of one, where its room ends: "abruptly", as in Inshorts. A headline or summary that fits is left uncut: a text view limited to a number of lines may break its lines differently, and would then end in an ellipsis though the text would have fitted.
- **No header and no bottom bar.** The story has the whole screen, as in Inshorts. What they held is in a **menu**: a round ☰ button floats over the picture's top-left corner and opens a panel that slides in from the left (`MenuButton.tsx`, `MenuDrawer.tsx`; `MenuSheet.java` in the app) with the feed language, Feed / For you / Topics / Saved, the news sections, the account, the theme and the links (the app's panel has the same; neither has a row for checking for new stories, which the feed does itself, or for choosing topics, which the Topics screen and the account sheet offer). With no picture the button stands at the start of the source line, which makes room for it (the box carries `data-hero="on"` or `"off"`, and the line is measured both ways), so it never covers text. Screens that are not a story (Topics, Saved, For you with nothing chosen, loading, caught up) carry the ☰ in the corner. A desktop window (1024 px and wider) has no ☰: the side panels and the section chips are there. The panel closes on its scrim, ✕, Escape, a swipe to the left, or when the window grows to desktop width; while it is open the keys and the wheel do not move the feed. Nothing is reserved at the foot of the page either: the space the old bar took goes to the story.
- **The headline is the link to the full story** (a new tab on the website, the browser in the app); there is no separate "Read full story" button. On the website it shows an underline in the signal colour on hover and focus; in the app a press ripples on it and a screen reader announces "Read full story" as its action. A story with no usable link has a headline that is not pressable.
- **Stories with no summary.** About one English headline in ten comes from a feed whose description only repeats the headline, so there was nothing to put under it. The server now reads the article's own description (`og:description`, `twitter:description`, `description`; `lib/blurb.ts`, called from `lib/sources.ts` after each news source) for those stories only, within what is left of the source's time budget (at most 14 pages, 6 at a time, 2.5 s, cached 12 hours, 30 minutes for a miss), refuses addresses that are not public web pages, and keeps the text only if it is long enough and shares a word with the headline. A story it cannot help stays as it was.
- **More text for a short story.** Most feeds give one sentence (often a standfirst that does not say what happened: "The service medal is given for excellence in special operation…"), which left a picture, a headline and two lines over a large empty space. For a **news** story whose text is under 300 characters the server now reads the opening of the article itself (`lib/lead.ts`, run by `lib/sources.ts` after the step above, in what is left of the source's deadline: newest stories first, at most 6 per outlet, 24 pages, 8 at a time, 3 s, a page read from its start until it has about 480 characters or 768 KB, cached 12 hours per instance, 30 minutes for a miss). The text is the article's `articleBody` (JSON-LD) when the page has one, else the first paragraphs of its `<article>`, without bylines, captions, "Also read", offers and notices; at most about 600 characters, ending at a sentence when one ends far enough in; used only if it is at least 140 characters and 80 more than the feed gave, and shares a word with the headline; dropped when two stories get the same opening (a site's own text). The card carries `lead: true`, and the website does not rewrite such a card with the AI step in English (in Hindi the AI brief is written from this longer text). The page's layout cuts it where its room ends. Pages that refuse the request (NDTV and NPR answered 403 or nothing in the check on 1 November 2026) leave their stories as the feed gave them; `PLAX_ARTICLE_LEADS=off` turns the step off. The text is the publisher's, shown with its name and a link, and at most about a hundred words of it.
- **Last resorts.** The source line holds the buttons, so it is never given up. A page too short for the picture's minimum and three lines of the summary loses the poster first, before any text is cut; a photograph stays while the headline gives up lines (never below two) to leave the summary three, and below that the picture goes, and then lines of the summary. In the app a phone on its side puts the picture beside the text.
- **The arithmetic is shared.** `CardFit.java` (app) and `src/lib/card-fit.ts` (website) are the same pure function of pixels, with the same test cases (`CardFitTest.java`, `card-fit.test.mjs`, both including a sweep of over 10,000 combinations that asserts nothing is ever planned beyond the page). The website's version counts half a pixel of room as enough, because line heights there are fractions of a pixel (room for exactly two lines once came out as 1.9999999999999998 of one, and cost the summary a line and the headline another).
- **The app** (`StoryPage.java`, replacing a `ScrollView` per page): a `ViewGroup` that measures the real text layouts (Devanagari lines are taller than Latin ones) and applies the plan; nothing is flipped between measures, so no layout is requested again and again. `FitDeviceTest` lays out 11 stories (English, Hindi, long and short, no picture, no summary) on six page sizes at three text sizes and asserts no overlap, nothing outside the page, text no taller than its room, an ellipsis exactly when text is cut, and nothing that scrolls.
- **The website** (`useCardFit.ts`, used by `Card.tsx`): each part of the card carries a `data-fit` attribute (`hero`, `meta`, `title`, `body`, `actions`) and the space above it as padding; the hook measures them (the source line both with and without a picture above it), runs `planFit`, and applies the result with inline styles only (line clamps, the picture's height and `data-hero`), again when the box changes size or the web fonts arrive. A safety loop shrinks the picture to its minimum, then takes lines of the summary down to three (a poster goes before any line is taken), then gives up the picture, then lines of the summary and of the headline, if anything still reaches past the box; it judges that from where the parts are laid out, not from `scrollHeight`, which also counts the few pixels of the entrance animation's slide and once cut a line from a card that fitted.
- **One swipe.** Touch: a swipe anywhere on the card, whatever it starts on (the headline link included), moves one story; a sheet or a text box keeps its own swipes (`data-no-feed-scroll`). Wheel: one push of the wheel moves one story.

Checked in a real browser (Edge driven by Playwright, a production build, the feed replaced by recorded live stories so the numbers repeat) on a phone (390 × 844), a small phone (360 × 640), a tablet, a desktop, a short laptop window and a phone on its side (851 × 393), over 24 English stories each. Before the full-screen change the summary was lost or cut in 10 of 24 stories on the phone, 12 on the small phone and 18 on the phone on its side; after it, in none, none and 1 (a summary cut at a whole line on a short window). Nothing overflows, nothing scrolls, and one touch swipe or one wheel push moves one story. Also checked: every entry of the menu and its five ways of closing, a section chosen from it, Hindi, light and dark, the Go deeper sheet (its cross is in reach at the start and after its text is scrolled, on all six sizes; it is never taller than the card, Escape and the cross close it, a swipe on it stays on the story), and six non-news card types (essay, quote, book, fact, code, poster) with no text under the ☰, and, on a topic feed, the topic chip's dropdown and the Test yourself sheet beside the ☰ (the chip is not covered, the dropdown is on the screen and closes on a tap away, the sheet stays inside the card and its cross closes it). The Android app was run on an API 36 emulator (see `android/README.md`). Not checked: a physical phone, and any browser but Edge (Chromium): iOS Safari's address bar and safe areas are the likeliest place for a difference. See the READMEs for what was and was not verified.

The second pass (the buttons on the source line, the headline as the link, the simpler menu) was checked the same way: on 24 stories at five sizes, the three buttons stand on the source line at its right end with no wrapping and no overflow (the source name is cut with an ellipsis on 5 of 24 on a phone, none on a tablet or desktop); the headline opens the publisher in a new tab; Save toggles and says so; Share hands the headline and a link to the share sheet, and copies them when there is none. Every entry of the menu was used with touch taps on a phone, a small phone and a tablet (135 checks: the five ways of closing, language both ways, the four places each marked while open, a section and All, search, the account, the theme, Contact us, the privacy page, and no row for new stories), which found and fixed two bugs in the search palette (a tapped result ran the highlighted one instead, and results reloaded the page) and gave it an Escape key that works from anywhere, a ✕ on a phone and dialog roles. The measuring run again found no story without its summary and no summary cut on six sizes; one 221-character headline is cut at the last resort, by design. A fake clock showed the feed asks for newer stories every five minutes, after two minutes away, and not after forty seconds, that what it finds is offered and taken as "New stories", and that the caught-up card's button asks for a live refresh.

### `CardActions.tsx` — the buttons on the source line

Not a bar any more: an inline row at the right end of the card's tag and source line (`ml-auto`, it never wraps), so the space the fixed bar took at the foot of the page belongs to the story. Round buttons: **Listen** (text to speech), **Copy** (tablet and wider; a phone's share sheet already copies), **Save** (marigold when saved, with the signed fields kept so the story can be shared later) and **Share**; 36 px circles (40 px from `sm`) with a 44 px touch area. The confirmation ("Saved to bookmarks", "Copied") appears just under them. There is no "Read full story" button: the headline is the link. Share and Copy make the story's Plax link first (see [Shared story pages](#shared-story-pages)) and fall back to the publisher's link; Share hands the headline and the link to the browser's share sheet when there is one and copies them when there is not. The app puts its brief (✨), Save and Share in the same place (`Ui.lineButton`: a 36 dp circle in a 44 by 48 dp touch target).

### Navigation — `MenuButton.tsx`, `MenuDrawer.tsx`, `LeftRail.tsx`, `BrandMark.tsx`

- **Four places** — Feed, For you, Topics, Saved (`ui-store` `screen` + `feedFilter`). On a phone they are in the menu; on desktop they are in a side rail (`LeftRail`, which also holds search, language, theme (System / Light / Dark), the reader's topics and the account button)
- **No header and no bottom bar.** `NavBar`, `BottomNav` and `HeaderMenu` were removed so that a story has the whole screen. `MenuButton` is a round glass ☰ over the story's top-left corner (`corner` variant for the screens that are not a story: Topics, Saved, For you with nothing chosen, loading, caught up); it sets `menuOpen` in `ui-store`
- **Menu (`MenuDrawer`)** — a left panel (a dialog: focus is kept inside it, Escape closes it): the feed language (English | हिन्दी), the four places with the current one marked, the news sections (only while the feed shows news), search, the account (the reader's picture when signed in), the theme, and Contact us and the privacy policy as quiet links at the foot. There is no row for choosing topics (the Topics screen has a card for it) or for checking for new stories: the feed looks for them when the reader comes back, every few minutes while the tab is open, and on the "caught up" card. It closes on its scrim, ✕, Escape, a swipe to the left, when a row is chosen, or when the window grows to desktop width. While it is open the feed's keys and wheel are ignored (`Feed.tsx`). The Android app's `MenuSheet` holds the same places, with the app's own About, Contact us, the privacy policy, the update check and Clear saved rows in place of search. The search palette (`CommandPalette.tsx`) runs the result that is tapped, not the one that was highlighted (a finger has no hover), and moves within the app with the store, never `router.push('/')`, which under `/news` reloaded the page
- **`BrandMark`** — the logo's P as a flat glyph (cut from the master logo image `public/plaxlabs_logo.png` with a CSS mask, so it follows the text colour in both themes) and the wordmark in the headline serif; used by the menu, the rail, the story pages and the topic pages. Everything else that draws the P uses the traced outline in `lib/brand.ts` (see *The "P"* below)
- The section chips (All, India, World, …) are soft filled pills shown at desktop width (1024 px and up); on a phone the same choice is in the menu. The Feed tab = news (default) or one topic; For you = a mix of the reader's chosen topics, with `ForYouEmpty` until some are chosen

**Intentionally different from the app:** the website has Listen and Copy, a search palette (⌘K), the left and right panels on desktop (navigation, stats and shortcuts), and an inline Go deeper panel where the app opens an AI-brief sheet (✨, on the source line). Everything else (menu, card, the buttons on the source line, places, theme choice) is meant to be the same; if one drifts, the screenshots in the 1.4.0 verification show what it should look like (the header, the bottom bar and the Read full story row in them are gone since the full-screen change).

### The "P" — `lib/brand.ts`, `lib/brand-tile.tsx`

Apart from `BrandMark`, which masks the master logo so it can take the text colour, the P is drawn from **one outline**. `src/lib/brand.ts` holds it: `P_BOWL` and `P_STEM` (absolute `M/L/C/Z` paths, traced once from the logo; they overlap it 99.1% at the same height, where the hand-drawn vector the Android app had before 1.5.3 overlapped 74%), its box `P_BOX`, the colours `BRAND` (tile `#F59E0B`, ink `#1A1203`) and the proportions `P_IN_TILE` (0.68 of the height, for a tile shown whole) and `P_IN_FULL_BLEED` (0.45, for the maskable install icons, so a circular mask cannot clip it).

- **`PTile`** (`lib/brand-tile.tsx`) draws the P on the amber tile as an inline `<svg><path>`, which Satori (`next/og`) renders. The three share cards (`app/opengraph-image.tsx`, `app/topics/[topic]/opengraph-image.tsx`, `app/s/[slug]/opengraph-image.tsx`) use it; none types a letter.
- **Icons**: `scripts/brand-icons.mjs` draws `app/icon.png` (the favicon: 512, rounded, clear corners), `app/apple-icon.png` (180, opaque), `public/icon-192.png` and `public/icon-512.png` (opaque, full-bleed) and the Play listing's icon (`android/artifacts/play/icon-512.png`, git-ignored, 32-bit) from `brand.ts` in a headless browser (`npm i --no-save playwright-core` first; set `BROWSER` if no Edge, Chrome or Chromium is found). `app/manifest.ts` lists the two public icons, the 512 one also as maskable.
- **Android**: the drawables `ic_launcher_foreground`, `ic_plax`, `ic_splash` and `drawable-night/ic_splash` carry the same two paths.
- **To change the logo**: retrace it, change `brand.ts` and the four drawables, run the script and rebuild the app. `lib/brand.test.mjs` (6 tests) and the Android `BrandTest` (4) fail if the website's outline, the drawables, the colours, the icon files' sizes and colour types or the manifest drift apart, or if a share card types a "P" again.
- Chat apps cache link previews, so a link shared before a card changed can keep its old picture for a while.

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
| XSS | React's built-in escaping. `dangerouslySetInnerHTML` is used only for JSON-LD blocks and the theme script; in anything carrying story text (the story page's JSON-LD) `<` is escaped so a headline cannot close the script element |
| Shared story pages | Only a card this server signed can become a page (HMAC, timing-safe compare), so nobody can publish words of their own on the domain; the page re-validates links (`http(s)`) and pictures (`https`) on every render; `/api/share` is size-capped, rate-limited and `no-store`. See [Shared story pages](#shared-story-pages) |
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

The native app ([android/README.md](android/README.md), *Updates from inside the app*) updates itself from two static files that deploy with the website: `public/updates.json` (seven fields: `schemaVersion`, `versionCode`, `versionName`, `minSdk`, `apkUrl`, `sha256`, `size`) at `/news/updates.json`, and the one advertised build, `public/plax-<version>.apk`, at `/news/plax-<version>.apk`. The app only reads `https://plax-rouge.vercel.app/news/...` (`FeedApi.SITE`, equal to `SITE_URL` in `src/lib/site.ts`) and follows no redirect.

- **Headers** come from `headers()` in `next.config.js`: the feed is `application/json; charset=utf-8`; the APK is `application/vnd.android.package-archive` with `Content-Disposition: attachment`. **Both are `Cache-Control: no-store`**, and both send `nosniff` and `X-Robots-Tag: noindex`. The APK must not be cacheable: the shared cache in front of the site (at the time `www.plaxlabs.com`, which proxied this app) stores the answer to a ranged request (`Range: bytes=0-1`) as the whole file and then serves those 2 bytes to every download until its lifetime ends, even across deployments (seen on 10 October 2026, and reproduced with probe files: poisoned with `public, max-age=3600`, not with `no-store`). So never send a Range request to the production APK. Vercel was seen adding its own `Content-Disposition: inline` to the feed, which does not matter to the app; confirm after a deployment that the rest of these headers won: `android\verify-update.ps1` does.
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
| `SHARE_SECRET` | Optional | Server only. Signs story cards (see [Shared story pages](#shared-story-pages)); when unset the key is derived from `SUPABASE_SERVICE_ROLE_KEY`, so nothing needs adding. Rotating either one changes what new cards are signed with. Existing share links keep working, because stored pages are looked up by their name and not re-verified; cards cached on readers' devices from before the rotation fail verification (`403`) and are shared by their publisher's link until the feed refreshes them |

### Build

```bash
npm run build    # Next.js production build
npm run start    # Local production server
npm run dev      # Development server
npm run lint     # ESLint
```

### Domain

- The site is served from the project's own Vercel domain, `plax-rouge.vercel.app` (Vercel → Settings → Domains), under `/news`. Its first domain, `plaxlabs.com`, expired and stopped answering, which left every installed app with no stories and no sign-in; the address is a constant (`src/lib/site.ts`, `FeedApi.SITE` in the app) and `src/lib/site.test.mjs` and `SiteAddressTest` fail if it differs between them or if the old one returns.
- Nothing else is served at the root of the domain: `next.config.js` redirects `/` to `/news` and sends `/robots.txt` and `/sitemap.xml` to their copies under `/news`, which is where crawlers look.
- SSL is provisioned by Vercel. The address is built into each copy of the app, so a custom domain later means changing both constants and shipping a new app.
