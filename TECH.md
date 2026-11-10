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

`lead` (after 1.5.5, optional, `true` or absent) says that `content` is the opening of the article itself, which the server read from the publisher's page because the feed gave only a line or two (see *More text for a short story* under [One view per story](#one-view-per-story)). The website then shows it as it is and does not rewrite it with the AI step; the app ignores it. A card's `id` is made from the text the *feed* gave, not from this longer text, so a story keeps its id whether or not its page has been read yet. A card's `image` may likewise be the picture of the article's page, where the feed gave none. The news stream puts the stories that fill a card (380 characters or more under the headline) before those that do not.

`categories=stocks` (added 4 November 2026) is the Stocks topic: news cards (`category: "news"`) filed under `section: "stocks"`. See [The Stocks topic](#the-stocks-topic).

### POST /api/feed

The same request with its parameters in a JSON body: `{ "categories": ["stocks"], "limit": 30, "refresh": false, "lang": "en", "exclude": ["id", "..."] }`. It exists because a reader far down a long feed has a list of stories to skip that does not fit in an address (a server accepts about 14 KB of it, which is about 450 ids; the website's `Feed.tsx` sends up to **1,200** ids, and uses the `GET` while the list has 200 or fewer, so the first page stays CDN-cacheable and the Android app, which sends at most 200, is unchanged). The answer is the same as the `GET`'s and is never shared by a CDN. Refused with `400` when the body is not a JSON object, `categories` is not a list of at most 40 names made of `a-z`, `0-9`, `_` and `-`, or `exclude` is not a list of at most 3,000 strings of at most 200 characters, and with `413` above 200,000 characters. `limit` is held to 1–60 (30 when it is not a number). If the website's `POST` is refused for any reason it asks again with the `GET` and its first 200 ids, which is how it behaved before.

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

`card: true` is sent by the website for the text of a card (`Feed.tsx`, both the card shown and the warm-up of the other language, so that they share one cache entry). For `category: "news"` it asks for a **short brief** of 55–85 words, as full as the source allows (it was 35–60 until 2 November 2026, which left a hole under a Hindi card now that the picture no longer grows to fill it), so that the story fits one screen together with its picture (`lib/summary-prompt.ts`; in Hindi the 70–110 word brief came to 600–800 characters, 14 to 17 lines on a phone, and left no room for the picture). Without the flag, which is how versions of the Android app before Go deeper called it (their on-demand AI brief; the app has Go deeper now, and the older apps are still installed, so the route keeps this form) and how every other category is asked for, the prompts are exactly the earlier ones (checked once, byte for byte, against the original route for 15 categories, both languages and several sources; `summary-prompt.test.mjs` keeps the ranges and the scope of the flag under test). The short brief has its own cache version (`v3-brief`), so a long brief cached for the same story is never served in its place.

**The Android app calls this route too, for one thing: to translate.** In Hindi, the feed of Hindi has stories of its own for the news and for almost every topic, but for Stocks and (partly) Books it answers with the English stories, so the app (`mobile/src/data/translate-api.ts`, `translations.ts`) sends each such story the way the website sends a card in Hindi, with the same fields (`content`, `title`, `type: "microessay"`, `lang: "hi"`, `category`, `card: true`; `summary-prompt.test.mjs` keeps them equal) so that one cache entry serves both. It accepts the answer only if it is Hindi, since this route answers `200` with the English as it was when every service it tries is out. See `mobile/README.md`, "Reading in Hindi".

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

A dedicated **Contact us** page (`src/app/contact/page.tsx`, address and dates in `src/lib/legal.ts`, the same frame as the policy pages). Google Play's News and Magazines policy asks every news app for a dedicated website page and an in-app page that are easy to find and show a contact email or phone number; a privacy policy that happens to contain an address was not accepted (policy notice of 16 October 2026). The page has an H1 "Contact us", the address as visible text and a `mailto:` link, who runs Plax, what to write about (problems, corrections, publishers and rights holders, privacy and deletion, feedback), how replies work, where the stories come from, and a `ContactPage` JSON-LD block. It is linked from the menu (☰), the desktop left rail, the footer of every public page (`SiteLinks.tsx`: headlines, Hindi headlines, topics, each topic, the policy pages), the privacy policy's Contact section and the server-rendered crawler nav in `layout.tsx`, and it is in the sitemap. The Android app's **Contact us** (a menu entry; its **About** screen also shows the address) shows the same address and opens this page; the app's contact-sheet test (`mobile/src/ui/screens/__tests__/contact-sheet.test.tsx`) fails if the app's address, page path or operator differ from `legal.ts`. This URL, `https://plax-rouge.vercel.app/news/contact`, is the one given to the Play Console as the news declaration's contact URL. Change the address in `legal.ts` and in `Contact` (`mobile/src/ui/screens/ContactSheet.tsx`) together.

### GET /privacy and GET /delete-account

Plain server-rendered pages (`src/app/privacy`, `src/app/delete-account`, text and facts in `src/lib/legal.ts`, frame in `LegalPage.tsx`). The privacy policy states what stays on a device, what the servers receive, the AI and translation services that can see story text, what a Google account stores (on the website: email, name, picture address, topics, saved stories and reading activity; the Android app sends only topics and saved stories), retention, deletion, children (13 and over) and a contact. The delete page lets a reader without the app delete from the browser: `DeleteAccountPanel` signs in with Google (returning to the page through the callback's `next` parameter), asks first, then calls the route above with the session's token; email is the fallback. Both are linked from the menu (☰) and the Account sheet, listed in the sitemap, and are the two URLs entered in the Play Console. The contact address and the dates live in `legal.ts`; change the policy text and `updated`/`updatedIso` together.

### GET /ads.txt and GET /app-ads.txt

Two plain-text routes (`src/app/ads.txt/route.ts`, `src/app/app-ads.txt/route.ts`) that publish the one line AdSense and AdMob ask a publisher to publish, `google.com, pub-<id>, DIRECT, f08c47fec0942fa0` (`adsTxtLine` in `lib/ads-config.ts`, built from `NEXT_PUBLIC_ADSENSE_CLIENT`). They answer **404 while no publisher id is set**, so a site with no ads claims nothing. The site lives under `/news`, so the files are at `/news/ads.txt` and `/news/app-ads.txt`, and `next.config.js` redirects the root addresses (`/ads.txt`, `/app-ads.txt`, `basePath: false`) to them, because the crawlers look at the root of the host. AdMob reads `app-ads.txt` at the root of the developer website named in the Play listing, so it only counts while that website is this host. See [Ads](#ads--adstriptsx-adcardtsx-adslottsx-adsruntimetsx-adchoicestsx).

---

## Shared Story Pages

Tapping Share on a story sends a link to **Plax's own page for that story** (`https://plax-rouge.vercel.app/news/s/<slug>-<id>`) rather than the publisher's article. The page previews well in WhatsApp and other chat apps, can be found through the sitemap, shows a short summary with its source, and sends readers to the publisher for the full report and to Plax for more. It is built so that nobody can put words of their own on the site's domain.

### Why the card is signed

News pools rotate and clients keep stories for days, so a link cannot be re-resolved from the feed later; it must be made from the card the reader holds, and the server must be able to trust that card.

1. `/api/feed` adds `sig` to every card: an HMAC-SHA256 (truncated to 128 bits) over `id`, `title`, `content`, `source`, `sourceUrl`, `image`, `publishedAt`, `category` and `section`, joined with a separator that cannot occur in them (`src/lib/share.ts`, `src/lib/share-sign.ts`).
2. The key is derived (HMAC, fixed label) from `SHARE_SECRET` when set, otherwise from the existing `SUPABASE_SERVICE_ROLE_KEY`, so **no new environment variable is needed**. With neither, cards are simply unsigned.
3. On Share the client sends the card back. `POST /api/share` accepts it only if the signature verifies (timing-safe), so a changed headline, link or picture is refused with `403`.
4. Both sides canonicalise text first (control characters removed, ends trimmed, and `&amp;`/`&#038;`/`&#38;` decoded in the two web addresses, as the Android parser does), so a card that went through the app still verifies. `src/lib/share-vector.json` is a golden vector that the app's unit test (`mobile/src/data/__tests__/share-links.test.ts`) and the website's unit test both check, so the two implementations cannot drift apart unnoticed.
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
- **Android** (`mobile/src/data/share-links.ts`, `mobile/src/app/sharer.ts`): the same request with a time limit (7 s, "Preparing link…" after 0.7 s), the answer accepted only if it is a story page of this story on the Plax site itself. Tapping Share again on the same story while it waits means "do not wait" (the publisher's link goes out at once); tapping another story abandons the first request. A request that was given up on is never obeyed if it answers later, and nothing is opened if the screen is gone or in the background.
- **Why 6-7 seconds.** The first release allowed 4 s and the installed app fell back to the publisher's link when a sleeping serverless instance had to start. From a workstation the endpoint needs 0.3-2.2 s for a story it has not stored (about 0.5 s warm), and a phone's network adds to that. Waiting is bounded, visible and cancellable by tapping again; being unable to wait is the failure to avoid.
- **Fallback everywhere:** no signature (an older cached card, a quote), no publisher link, or any failure → the publisher's link is shared exactly as before.

### Search visibility

- **Automatic.** A new share is a page as soon as `POST /api/share` answers, and `sitemap.xml` lists it within about an hour (it is rebuilt hourly and carries the 500 newest shared stories). The domain's `/robots.txt` and `/sitemap.xml` redirect (307, from `next.config.js`) to their copies under `/news`, and `robots.txt` lists `sitemap.xml` and `news-sitemap.xml`, so nothing has to be set up here for crawlers to find them.
- **One address per page.** The sitemap, `rel="canonical"`, `og:url`, the English/Hindi `hreflang` pair and the breadcrumbs must all name the same address, and it must answer `200` without a redirect. Under the `/news` base path the values in `alternates` are prefixed again (`'/news'` became `/news/news`, a `404`) and `'/'` becomes `/news/`, which redirects to `/news`. Use the page's own path (`'/headlines'`) and, for the home page, the absolute `SITE_URL`. Both mistakes were left over from the move to `/news` (the news hub named a canonical that did not exist, and the sitemap listed the redirecting home address) and were fixed on 11 October 2026.
- **How to check.** Fetch `/news/sitemap.xml`, then every address in it without following redirects: each must answer `200`, carry no `noindex` and name itself as its canonical, and the English and Hindi hubs must name each other in `hreflang`.
- **The home page is an app, so crawlers need help.** Its stories come from `/news/api/feed`, and robots.txt keeps crawlers off `/news/api/`. Google therefore rendered "Could not load stories" and Search Console reported a **soft 404** for the home page (11 October 2026). `src/app/page.tsx` now reads the first 12 stories on the server, with the feed route's own `GET` so ids and signatures match, rebuilds every few minutes, and gives them to `HomeApp`/`Feed` as `seed`. The feed shows the seed **only when the first live load fails and nothing is cached** (offline, or a crawler), so a reader whose network works never sees it and the no-repeat behaviour is unchanged. The HTML also carries an off-screen `h1`, the 12 headlines as plain text and links to the two hubs, for anything that does not run scripts. To check it, render the page with a Googlebot user agent and `/news/api/` blocked: it must show a story, not the error.
- **News sections and the US page (added 4 November 2026, to reach US readers, whose ads pay the most).** `lib/types.ts` holds the sections (`NEWS_SECTIONS`: US, India, World, Tech, Business, Science; the order is the order of the chips and of the hub) and the feeds that fill them (`GENERAL_NEWS_FEEDS`, each filed under a section). A section is a chip in the feed, a tag on its cards, a page at `/headlines/<id>`, and an entry in `sitemap.xml` and `news-sitemap.xml`; the page's copy is in `lib/news-section-seo.ts`, and `news-sections.test.mjs` fails if a section has no copy (it would be in the sitemap and answer 404) or a feed names a section that does not exist. The US section reads the US desks of six outlets: NPR National, PBS NewsHour Nation, CBS News US, NBC News US, ABC News US and The Hill (each answered on 4 November with fresh items and a description). The US page is written for a US reader (`en-US`, times in Eastern time, "US News Today" copy), and its link to the live feed opens the news on the US chip (`/?topic=news&section=us`, read by `HomeApp`, which then cleans the address). A page of headlines never gives one outlet more than an even share of it (`diverse` in `lib/story-order.ts`), so The Hill's feed of a hundred items does not fill the US page. **A reader in the US starts on the US chip** (`lib/us-reader.ts`, read by `HomeApp`): an `en-US` browser in a US time zone (an Indian or British English browser, or a Toronto or Mexico City time zone, is not one), judged from what the browser itself says, with nothing sent anywhere and no location looked up. It is only a first start: a reader who taps any section chip (the feed's or the menu's, `pickNewsSection` in `lib/ui-store.ts`) has a flag `plax-section-chosen` stored in the browser and is left on All from then on, and a link with a `section`, a Hindi feed, a `card` link or a topic other than News are never redirected to it. Everyone else starts on All, as before. The Android app has no US chip yet (its section list, `MenuSheet.SECTION_IDS` and `FeedViewModel.section`, is built in, and a new chip needs a new app); a US story shows in its All view with a "US" tag, because the app writes an unknown section's id in capitals.
- **Manual, in Google Search Console — done on 4 November 2026** (account richardhenryjames64@gmail.com, the one that owns the AdMob and AdSense accounts). The old `plaxlabs.com` property no longer applies. The property is the URL prefix `https://plax-rouge.vercel.app/news/`, verified with the **HTML file** `public/googlece3bfe79fa12d032.html` (served at `/news/googlece3bfe79fa12d032.html`): **keep that file**, because Google checks it again from time to time and the property is lost without it. `sitemap.xml` was submitted and Search Console registered it as `https://plax-rouge.vercel.app/news/sitemap.xml`; it showed "Couldn't fetch" at first, which is the usual first state, while URL Inspection already said the pages had been discovered through that sitemap ("Discovered, currently not indexed"). The sitemap itself answers `200` to a Googlebot user agent with 113 addresses. "Request indexing" answered "Quota exceeded" for the new property: try again the next day, for a few addresses (`/headlines/us` first). Then watch Pages for the reason any address is not indexed. Indexing cannot be forced: Google says crawling takes from a few days to a few weeks, "Request indexing" in URL Inspection is for a few addresses and has a quota, and the Indexing API is only for job postings and livestream videos. A link sent in a private chat is never seen by a crawler, so sharing to WhatsApp does not by itself bring a page to Google; the sitemap does.
- **`news-sitemap.xml` does not make Plax a Google News source.** Google's news sitemaps are for articles first published on the site in the last two days, with their real publication dates; this one lists the hub pages stamped with the time it was built (every 15 minutes). It does no harm and every address in it is also in `sitemap.xml`, so it is not worth submitting. Removing it would also mean editing `src/app/robots.ts`.

### Limits worth knowing

- The page carries a short summary and the source's headline with attribution and a link out, as the `/headlines` pages already do. An original summary per story would be stronger for search and safer for copyright; that is not built.
- The site is addressed by a Vercel subdomain (`plax-rouge.vercel.app`, see `lib/site.ts`). A free subdomain carries little authority with search engines, so ranking for US searches (and AdSense's review of the site) is slower than it would be on a domain of Plax's own. A custom domain is the largest single lever for search reach; changing it means changing `SITE_HOST` and the app's `PRODUCTION_SITE` (`mobile/src/build.ts`) together and shipping a new app.
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

### The Stocks topic

Added on 4 November 2026 at the owner's request: stock-market news from all over the world, as a feed of a thousand stories rather than a few dozen, and a US-heavy surface for readers whose ads pay the most. It is a topic of its own (`stocks` in `TOPICS`, `lib/store.ts`; Hindi name "शेयर बाज़ार" in `lib/i18n.ts`; an evergreen page `/topics/stocks` from `TOPIC_SEO`; `Topic.STOCKS` in the app) whose stories are **news cards**: `category: "news"`, so everything that treats news as news treats them so (the card layout and the "Breaking" tag, the article openings and pictures of `enrichNews`, the no-repeat engine, Go deeper, sharing), filed under `section: "stocks"`, which is **not** one of the News chips. `lib/news-chips.ts` holds the section's name and the rules that keep the two apart; it has no imports because the browser and the tests both read it.

- **Where the stories come from** (`lib/stocks.ts`, `STOCK_FEEDS`, server side only). About 60 feeds of about 45 outlets in nine regions: the US (CNBC with six feeds, MarketWatch, The Wall Street Journal, Bloomberg, MarketBeat, The Motley Fool, InvestorPlace, Benzinga, Business Insider, Fortune, Kiplinger, Fox Business, NBC News, CBS MoneyWatch), Canada (The Globe and Mail), the UK and Ireland (This is Money, The Guardian, the Financial Times, BBC News, City A.M., The Independent, Sky News, the Evening Standard, RTÉ), Europe (DW, France 24, CNBC Europe), India (The Economic Times, Mint, The Hindu BusinessLine, CNBC-TV18, NDTV Profit), Asia and the Pacific (CNBC Asia, the South China Morning Post, The Straits Times, ABC Australia, The Sydney Morning Herald, NZ Herald, Japan Today, Bangkok Post, The Daily Star), Africa (Moneyweb, BusinessDay), Latin America (Buenos Aires Times, MercoPress, The Rio Times, Mexico News Daily) and FXStreet. A feed marked `markets: true` is about the markets and gives all its stories; the business desk of a general outlet gives only the stories that pass `isStockStory` (a short list of exact words: shares, markets, earnings, the indexes, central banks, oil, and so on; a plain "market" is not enough, so the housing market is not one). Every feed was fetched with **the User-Agent the server sends**, not a browser's: Nasdaq answers a browser and never answers a reader that gives a contact address, Business Standard refuses it (403), and neither is in the list. An outlet that is not in the list is usually one with no description in its feed (Seeking Alpha, Investing.com, Nikkei Asia), a feed that is not fresh (Moneycontrol, The Telegraph) or one that refuses a reader (Yahoo Finance, Barron's, Forbes, Investopedia). MarketBeat is kept to 25 stories: its feed is templated notes ("Projected to Post Quarterly Earnings on Wednesday") for thousands of companies.
- **The pool** (`fetchStocksNews` and `fetchStocksPool` in `lib/sources.ts`, `pickStocks` in `lib/stocks.ts`). All feeds are read together, each within 6 s (the time covers the body, not only the answer). **The pool does not wait for stragglers** (`settled`): once 4 s have passed and 90 % of the feeds have answered or failed it goes ahead, because some feeds hang for a minute at a time and would hold every cold pool for the full 6 s. A feed that is late or fails this time is in the pool with what it last answered, for 30 minutes (`feedMemory`), so an outlet does not come and go between two refreshes; a late answer is kept for the next pool. Then `pickStocks`: only the last seven days; a story with no time, or one more than an hour in the future, is dropped (it would lead or sink the feed); business desks filtered; one telling of each story (by address without its query string, and by the words of its headline); at most 130 stories of one outlet and 1,200 in all, newest first; text cut at a word to 600 characters, which is all a card holds, so the pool stays about 1 MB, well inside the 2 MB the server's data cache keeps. In practice the pool is 900 to 1,000 stories. The server logs one line per pool: `[Plax Stocks] 994 stories from 58 of 63 feeds in 5122 ms; nothing from ...`, which is where to look first when an outlet is missing.
- **Its own cache.** The feed route keeps the pool in `getStocksPool` (`unstable_cache`, 180 s, tag `feed`), separate from the topics' pool (`getPooledContent`): inside that one it would be stored again for every combination of topics a reader may have, and would come near the 2 MB limit. An empty answer throws, which `unstable_cache` does not keep, so a bad minute of the feeds is not remembered for three minutes. The request asks `fetchAllContent` only for the other topics, and a feed of nothing but Stocks asks no other source. Hindi mode and the Android app get it too: the pool does not depend on the language (the cards are English, as everywhere in the website's feed).
- **The order** (`newsOrder` with `STOCK_AGE_STEPS_MS`, `lib/story-order.ts`). The News stream puts the stories that fill a card before the others, which is right when a pool is a day deep and wrong for a pool that is a week deep: a week-old story with a long text would come before this morning's. For Stocks the stories are **grouped by age** (the last 6 hours, up to a day, up to three days, older), the ones that fill a card go first *inside* a group, and no group goes ahead of a newer one. At most four stories of one outlet are on a page (`STOCK_PER_PAGE_OUTLET`; the News has six), so a page has at least eight outlets. In a mixed feed (Stocks with other topics) the stories are shuffled with the rest, as any topic's are.
- **A feed of a thousand stories.** The reader can go to the end of the pool: `Feed.tsx` now sends up to 1,200 ids to skip, by `POST /api/feed` when there are more than 200 (see above); with the old limit of 200 any long feed ended after about 230 stories, because the server sent back stories the reader already had and the page found nothing new. Measured on the development server: paging through the whole feed took 35 pages and gave 872 different stories from 39 outlets (pages of about 30 KB, 200 ms each once the pool is warm), none of them invalid by the Android parser's rules; and 252 different stories were read in one sitting in a real browser with the keyboard, 9 of the requests being `POST`s, until the test's own time limit stopped it. The 1.5 s cooldown between pages and the three tries per page are unchanged. Cards cached on the device for a Stocks feed are shown for at most two hours, like News (`feedIsTimely`), not 24.
- **The screen.** The tag reads STOCKS (`Card.tsx`), and so does the "Now reading" badge of the right panel. The News chips (US, India, World, ...) are **not** shown on the Stocks feed, on desktop or in the phone's menu: they narrow the general news (`feedHasNews`, `isGeneralNews`), and a story of Stocks is not in any of those sections. A shared Stocks story is tagged Stocks and its page links to `/topics/stocks` (`app/s/[slug]`).
- **A bug that this exposed, fixed with it.** The chosen News chip was never cleared when the reader moved to another topic, and the feed hid every card that was not in that section, so a reader who left News with a chip on saw "No new stories right now" for any other topic. Since the 4 November change that starts a US reader on the US chip, that was every US reader who went from the headlines to a topic. Now `setFeedFilter` in `lib/ui-store.ts` clears the chip when the topic changes (`sectionAfterTopicChange`), and `Feed.tsx` applies a chip only to a feed that has the news in it (a deep link such as `/?topic=science&section=us` used to do the same).
- **To change the list.** Fetch the feed with the server's User-Agent at a low concurrency (a few at a time, so that a feed is not starved by the others) and keep it only if it answers within a few seconds with at least three fresh items that carry a description of 40 characters or more. Add it to `STOCK_FEEDS` with its region and whether it is a markets feed; `stocks.test.mjs` checks that the list is sound and covers every region. There is nothing else to change.
- **Not built.** Region chips (US, India, Europe, ...) on the Stocks feed: the cards do not carry a region, and adding a field means changing the signature and the app's parser. A live, server-rendered `/headlines/stocks` page like the News sections' (today `/topics/stocks` is evergreen copy, so the fresh stories are not visible to a crawler). Stock news in Hindi (the Hindi feeds are general news, so the feed of Hindi answers a Stocks request with the English stories; the website translates them card by card, and the Android app does the same since 8 November 2026, before which it showed a Hindi tag over English text). In the Android app a session ends at 180 stories (`FeedViewModel.STORY_LIMIT`) and the exclude list is at most 200 ids in the address, so the app's Stocks feed is shorter than the website's; making it as long needs the app to send a `POST` and a new bundle.

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
   page is built from the rest instead of waiting a minute for the slowest.
   The Stocks topic is not one of its sources: it has its own pool and cache
   (`getStocksPool`, see [The Stocks topic](#the-stocks-topic)), merged in here
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
   a. Draw the cached page for this feed at once (news and stocks ≤ 2 h old, other topics ≤ 24 h),
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
     list (loaded + held-back + most recent seen ids, at most 1,200; in the address
     up to 200 ids, by `POST /api/feed` beyond that) and merges with `append`
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
     wheel has been idle for 220 ms, so a trackpad's momentum cannot skip stories. Known limit: a
     laptop touchpad keeps sending small events for about a second after a swipe, so a swipe that
     starts less than 220 ms after the last of them is ignored (on a recording of a real touchpad this
     rule moved for 16 of about 27 one-at-a-time swipes), and the wheel does nothing over the side
     rails (`aside`). A rule that told a new swipe from the tail by its speed (commit `80d90dc`) was
     reverted: on the same recording it made 38 moves for about 27 swipes

6. Languages: the feed is always fetched in English and each card is AI-translated in
   place, so switching language never changes which stories are shown (a card keeps its
   `originalTitle`, which is what the no-repeat engine fingerprints). The Android app asks the
   feed for the language and gets stories of their own in Hindi for almost every topic; the
   English-only ones (Stocks, some Books) it translates in place the same way, one story at a time
   as the reader nears it (`mobile/src/data/translations.ts`)
```

---

## No-repeat Engine

`src/lib/story-engine.ts` (pure logic), `src/lib/seen-storage.ts` (localStorage) and the merge code in `Feed.tsx`. It is shared with the Android app, which imports the rules for what counts as the same event from this module (`mobile/src/data/similarity.ts`, as `@shared/story-engine`) and keeps its history and merge in `mobile/src/data/seen-store.ts` and `feed-merge.ts`, which follow `SeenStore` and the merge code here (all of it began as `Similarity.java`, `SeenStore.java` and `FeedMerge.java` of the native app 1.7.1, tag `native-android-1.7.1`), with the same constants and rules; change one side and the other together. `src/lib/story-engine.test.mjs` mirrors the app's `duplicates.test.ts` scenarios (the native Java was also run against the TypeScript on shared cases during development).

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
| Scroll wheel | One push of ≥ 50 px moves one story; locked until the wheel has been idle for 220 ms (the lock's timer is not cleared when the handler is re-registered after a move, which would swallow the next push). A touchpad swipe that starts within 220 ms of the previous one's last event is ignored (see Card navigation above) |
| Infinite scroll | Auto-fetch when ≤ 10 cards remaining (see [Feed Pipeline](#feed-pipeline)) |
| No repeats | Seen tracking, same-event merging, "New stories" button and the caught-up card (see [No-repeat Engine](#no-repeat-engine)) |
| Empty state | Loading spinner during initial load; "Try again" when the first page cannot be fetched and nothing is cached |
| Progress dots | Side dots showing ±4 cards around current position |
| Loading bar | Animated gradient bar at top during fetch |

### `Card.tsx` — Content Card

The card follows the Android app's layout, so the website and the app read the same.

| Feature | Implementation |
|---------|---------------|
| Layout | The picture leads (rounded; its height is what the text leaves, between its minimum (60% of the width) and its most (4:5 of the width, and 60% of the card), so that the card is full; a story with no picture, news or topic, gets a **poster**: its outlet's name set like a masthead over a soft wash, with its section under a short rule, as in the app; a quote is its own picture and has none), then the tag and origin line with **Listen, Save and Share at its right end**, the headline (the link to the full story), the summary and the extras row (see [One view per story](#one-view-per-story)). The parts stand one under the other from the top, with only their own small spaces between them. Unlike a photograph, a poster is left out when the whole summary does not fit beside it (`lib/poster.ts` holds the rule and the masthead; its signs, the flag of India and a globe, were dropped on 2 November 2026: Windows draws the flag as the letters "IN", and a globe on a news story read as the placeholder it was). Pictures are asked for with no referrer, which some publishers' servers need. The ☰ menu button floats over the picture's top-left corner. On desktop the same column sits between the two side panels |
| Tag and origin | News: a soft marigold tag with the section ("INDIA") and the age ("20m ago"), then the buttons; "Breaking" within 30 minutes. **From 1.7.1 the card does not name the publisher** (`SHOW_SOURCE_NAME` is `false` in `lib/app-features.ts`; see *Android app settings*): the headline is the link to the story at the publisher. The age starts right after the tag or the Breaking badge, 10 px (8 under 400 px) away, at every width: the row is `justify-start` from 540 px up (it was centred in the room between the badge and the buttons, which left 47 to 93 px of gap). When the name is switched on it is as it was before 1.7.1: on a phone (under 540 px) the age stands **under** the source name, as in the app, so that the name is no longer cut to "The Hi…" beside the age and the buttons (it was, for The Hindu Business, on 390 px); each is cut with an ellipsis only as a last resort (a Hindi age on a 320 px phone), so that nothing runs under a button, and the row is no taller than its buttons; from 540 px they stand in one line, `Source · 2h ago · 20s`; the ↗ after the source gives way below 400 px. The word "Breaking" (its dot stays) gives way below 540 px. Other topics keep the topic chip (its dropdown manages topics) |
| Typography | One system with the app: **Newsreader Bold** serif for headlines and the wordmark (`.headline`, `.wordmark`), **Inter** for the text people read (`.reading-text`), JetBrains Mono for code. Hindi headlines use Noto Serif Devanagari Bold, Hindi text Noto Sans Devanagari |
| Content types | Quote (blockquote + left bar), code (monospace block), standard (paragraphs) |
| Body text | Without the headline said twice (`lib/story-body.ts`, the same rule as the Android app); nothing is drawn when the body only repeats the headline |
| Extras | **Go deeper** (AI insights, a soft pill with a sparkle), and on other topics **Test yourself** and **More by this author**. They sit in one row right under the summary, wherever the summary ends (the row is not pushed to the bottom: that would leave a hole between the text and it); what they open is a **sheet** that floats over the summary: a title bar with the close button that stays put, and a body that scrolls on its own. Its height is the room the card has above the row (`--sheet-room`, set by `useCardFit`), so the sheet is never taller than the card, the cross is always in view and in reach, and the card itself never has to grow. Escape closes it, and a swipe on it stays on the story |
| Text formatting | `**bold**`, `` `code` ``, `→ arrows`, `• bullets`. Paragraphs are set apart by a blank line so that the summary can be counted and cut as one text |
| Cloud sync | Bookmark add/remove syncs to Supabase if signed in |

### One view per story

A story must be seen in one view, and one swipe must always move to the next story: the card has nothing that scrolls. (Before 1.5.5 a long summary scrolled first, and only a swipe at its edge moved on: up to five swipes for one story, and a swipe that began on the headline did nothing.) The picture, the tag and source line (with the Listen, Save and Share buttons at its right end), the headline, the summary and, on the website, the Go deeper row under it therefore share the height of the screen, in the app and on the website, by the same rules:

- **The picture keeps its minimum; the summary takes the rest and is cut where its room ends.** The source line, the headline and the row are always shown. A story with a **photograph** keeps it: the picture gets at least 60% of the width and 30% of the box (never under 96 px), the summary gets what remains, whole if it fits and otherwise cut to a whole line with an ellipsis, and the picture takes whatever the lines leave (so it is less than a line over its minimum when the summary is cut), and then whatever room the text did not use (a summary that ends a line or two short of its room, as it does when it is cut at a sentence, or a short summary): the picture is at most 4:5 (1.25 times the width) and 60% of the box, so the card is full (`grownHero` in `lib/card-fit.ts`, applied by `useCardFit` after the text is placed; the same `grownHero` in the app, which imports this very module in `mobile/src/ui/story/layout.ts`). **The parts are never spread apart.** They stand one under the other from the top with only their own small spaces between them (14 px above the source line, 10 above the headline, 12 above the summary, 14 above the row), and the row of buttons follows the text rather than being pushed to the bottom. What a very short story (a headline with nothing under it, which the server shows after those that fill a card) still leaves once its picture is at its most is empty at the bottom, never between the parts. The box is `justify-start`, and `card-layout-parity.test.mjs` fails if `justify-between`, a pushed-down row, a different picture cap on the website and in the app, or spare room dealt out between the parts in the app's `StoryPage` comes back (checked by mutation: nine bad edits, all caught; the native app's `FitDeviceTest` checked the same on a page of each size, also with the picture's growth switched off and a part moved, both caught; the React Native app's `layout.test.ts` checks it for a sweep of 504 page sizes, text sizes and stories and for both ends of every layout range, and `mobile/e2e/reading.e2e.mjs` on a phone). Until 4 November 2026 the picture was at most 75% of the width and 40% of the box and the room left was spread evenly between the parts (`justify-between`), which left holes of 30 to 60 px between the picture, the source line, the headline and the summary on a tall screen: measured in a browser on 4 November 2026 on 22 stories at six window sizes, 19 of 22 cards on a 1440 × 900 desktop and 22 of 22 on a 768 × 1024 tablet or a 1920 × 1080 desktop had a space over 2 px between two parts, up to 61 px. The same measurement on a production build after the change (26 stories at each of 360 × 640, 390 × 844, 412 × 915, 768 × 1024, 1440 × 900 and 1920 × 1080): no card had more than 1 px between two parts, and the room left under the text was a median of 0% of the card (at most 1.0%). The picture is a median of 31% (a 360 × 640 phone) to 54% (a 768 × 1024 tablet) of the card's height, and at most 60%. Photographs 600 px or more wide (19 of 25 stories) are shown at a median of 0.3 to 0.8 times their own size and at most 1.3 times, so they stay sharp; the six thumbnails that some publishers send (90 and 240 px wide) were already enlarged 4 to 7 times to the width of the column and are as soft as before (the 240 px one a little more on a tablet, because its box is taller). A taller picture also crops more of the sides of a landscape photograph, which is the cost of a full card and the reason for the cap. (An earlier rule, in 1.5.5, let the picture grow to 1.4 times its width with a short text; the rule before this one, 75% and 40%, was its replacement.) A poster's masthead grows with its tile (a sixth of it, 1.25 to 2.75 rem; 18 to 36 sp in the app). The summary is always set at its own size (it used to be set at 94% and 88% before being cut), so stories look alike. A **poster** only stands in for a picture, so it keeps the older rule: it is shown only when the whole summary fits beside it (its minimum is 30% of the width and a quarter of the box), else it is left out. Before the summary is cut below three lines the headline gives up lines, never below two, and a long headline is set smaller (90%, 80%) before it is ever cut. A card with no summary gets the picture at its most. (The 1.5.5 planner also kept a picture minimum and cut the summary; the 1.5.5 follow-up reversed that to "whole summary first, picture takes what is left", which dropped the picture of any story with a longer text and left a gap under a short one. The rule now is the first to do neither.)
- **The summary ends where its room ends, at a sentence or a word, never through one** (`lib/text-fit.ts`, which the app imports too, so the same test cases hold for both): when the text does not fit, it ends at the end of a sentence if one falls within two lines of the end of the room, else after the last whole word that fits and can end a text, with an ellipsis, "abruptly", as in Inshorts. A word that needs the next cannot end it: an article, a conjunction, a preposition, an auxiliary, an initial, a title, a number, a Hindi postposition, or a bracket never closed, so a cut that fell after "…Justices Joymalya Bagchi and V" ends "…Justices Joymalya Bagchi…" and "…compared to a 1.7…" ends "…compared…" (`trimWeakTail` in `lib/sentence.ts`, which `text-fit.ts` uses, so the app has it too: up to four words are taken off, never leaving fewer than four; the server's cut at a word, `shortSummary` in `lib/blurb.ts`, does the same). It used to be cut by the browser's line clamp or the text view's own ellipsis, which end a line wherever its room does ("prope…"). A full stop after "Dr.", "Mr.", an initial ("M. K. Stalin") or "U.S." is not the end of a sentence (`lib/sentence.ts`). A summary with paragraphs or bold words is still cut by lines. A headline or summary that fits is left uncut.
- **No header and no bottom bar.** The story has the whole screen, as in Inshorts. What they held is in a **menu**: a round ☰ button floats over the picture's top-left corner and opens a panel that slides in from the left (`MenuButton.tsx`, `MenuDrawer.tsx`; `MenuPanel.tsx` in the app) with the feed language, Feed / For you / Topics / Saved, the news sections, the account, the theme and the links (the app's panel has the same; neither has a row for checking for new stories, which the feed does itself, or for choosing topics, which the Topics screen and the account sheet offer). With no picture the button stands at the start of the source line, which makes room for it (the box carries `data-hero="on"` or `"off"`, and the line is measured both ways), so it never covers text. Screens that are not a story (Topics, Saved, For you with nothing chosen, loading, caught up) carry the ☰ in the corner. A desktop window (1024 px and wider) has no ☰: the side panels and the section chips are there. The panel closes on its scrim, ✕, Escape, a swipe to the left, or when the window grows to desktop width; while it is open the keys and the wheel do not move the feed. Nothing is reserved at the foot of the page either: the space the old bar took goes to the story.
- **The headline is the link to the full story** (a new tab on the website, the browser in the app); there is no separate "Read full story" button. On the website it shows an underline in the signal colour on hover and focus; in the app a press ripples on it and a screen reader announces "Read full story" as its action. A story with no usable link has a headline that is not pressable.
- **Stories with no summary.** About one English headline in ten comes from a feed whose description only repeats the headline, so there was nothing to put under it. The server now reads the article's own description (`og:description`, `twitter:description`, `description`; `lib/blurb.ts`, called from `lib/sources.ts` after each news source) for those stories only, within what is left of the source's time budget (at most 14 pages, 6 at a time, 2.5 s, cached 12 hours, 30 minutes for a miss), refuses addresses that are not public web pages, and keeps the text only if it is long enough and shares a word with the headline. A story it cannot help stays as it was.
- **More text for a short story, and a picture for one that has none.** Most feeds give one sentence (often a standfirst that does not say what happened: "The service medal is given for excellence in special operation…"), which left a picture, a headline and two lines over a large empty space; and some (Al Jazeera, TechCrunch, NPR, BusinessLine's live pages) give no picture, which showed a globe. For the **news** stories the feed shows (the newest 6 of each outlet) the server reads the article's own page (`lib/lead.ts`, run by the feed route after the pool: `lib/news-enrich.ts`): the opening of the article when the story's text is under 400 characters, and the picture the page names for link previews (`og:image`, else `twitter:image`: https, a named host, and not a logo, an icon, a vector or a stand-in; a picture shared by three stories is the site's banner) when the feed gave none. Pages are read newest first, 10 at a time with those of different sites in turn, 30 a pass, 2.8 s all together and 3 s a page, from their start until about 480 characters and the end of the head or 768 KB. **What a page gave is kept for 12 hours in Next's data cache, which every server instance shares** (`lib/lead-cache.ts`; a page that gave nothing, or could not be read, is not kept there, and is looked at again after 30 minutes, an outlet that did not answer after 5): the first visit after a deploy reads the pages and the rest cost a cache read. It is done after the pool because a cache read inside the pool's own cache is not read at all. The text is read two ways, the page's `articleBody` (JSON-LD) and the paragraphs of its markup, and the cleaner is used: a web address or a widget's counter ("opinion 1") in a body, or a sentence given twice, means the markup is used, or the text is cut there; a page of running updates and a list of names are not a card's text; bylines, captions, "Also read", offers and notices are left out. **A dateline is taken off only when it is known to be one** (`lib/dateline.ts`). A story that begins "Delhi Police said", "AIIMS Delhi doctors", "Trump: I will" or "RELIANCE Industries" begins as a dateline does, and a first word lost is worse than a dateline kept (a first version of the rule lost "Delhi", "AIIMS", "RELIANCE" and "Trump:"). So a dateline goes when it can be nothing else: "( for web)" and "Our Bureau Mumbai:"; a place with an agency ("LONDON (Reuters) -") or a date and a mark ("Hyderabad, Nov 2:"); a place on the list (about 330 Indian towns and world cities) with a colon ("Mumbai:"), in capitals before a sentence ("KOCHI The Ernakulam…", but not "DELHI POLICE said"), or in any case before "The", "A", "An", "In", "On", "At", "As", "After", "Amid" or "With" ("New Delhi The Centre has…"), or with a date and no mark before such a word, the credit before it going too ("Our Bureau New Delhi, November 2 In high-level talks", the way BusinessLine begins; "Our Bureau chief said" and "Special Representative Ajay Banga said" are kept), and so does a note to the editors in brackets at the start ("(Highlighted paras can be removed for Print. Please retain those for online) Kolkata With the tightening…" became "With the tightening…"). Whatever else begins like one (a place that is not on the list, an acronym) is a doubt, and the page settles it: its markup is the story without the dateline, its structured body is the same paragraphs with it, and only the markup paragraphs the structured body also says (compared by their letters, not their spacing or dashes) are used, which also leaves out a widget's paragraph (a share's figures before a business story) that only the markup carries. To see the markup the reader goes on past the 480 characters, at most to 256 KB, and uses what it has if the time runs out. At most about 600 characters, ending at a sentence when one ends far enough in; used only if it is at least 140 characters and 80 more than the feed gave, and shares a word with the headline; dropped when two stories get the same opening (a site's own text). The card carries `lead: true`, and the website does not rewrite such a card with the AI step in English (in Hindi the card's text, now 55 to 85 words, is written from this longer text). **A story that fills a card goes first.** The news stream is newest first, but a story with under 380 characters under its headline is shown after all that have more (`lib/story-order.ts`), so a feed that has enough full ones never shows a card with a hole in it, and one that has not still shows what it has; and when several outlets tell one event, the telling with the most text and a picture is the one kept, not the first told. On production on 2 November 2026 the first 30 stories had a median of 530 characters, none under 300, and a picture on every one (before: median 515, 8 under 200 and up to 10 with no picture, at times). The text is the publisher's, shown with its name and a link, and at most about a hundred words of it. The text a feed gives is cleaned by `lib/rss-text.ts`: markup out, entities decoded, and a field that is escaped twice (NDTV sends "Pune&amp;#039;s", which showed as "Pune&#039;s" on 3 of 80 live cards) decoded again. The data cache outlives a deployment, so the key of the page cache (`article-page-v3` in `lib/lead-cache.ts`) is changed whenever the reading or cutting rules are, or pages read with the old rules would be served for 12 more hours. `PLAX_ARTICLE_LEADS=off` turns the step off.
- **Last resorts.** The source line holds the buttons, so it is never given up. A page too short for the picture's minimum and three lines of the summary loses the poster first, before any text is cut; a photograph stays while the headline gives up lines (never below two) to leave the summary three, and below that the picture goes, and then lines of the summary. In the app a phone on its side puts the picture beside the text.
- **The arithmetic is shared.** The app imports `src/lib/card-fit.ts` (website) as it is (the native app's `CardFit.java` was its port): one pure function of pixels, with the same test cases (`card-fit.test.mjs`, including a sweep of over 10,000 combinations that asserts nothing is ever planned beyond the page). The website's version counts half a pixel of room as enough, because line heights there are fractions of a pixel (room for exactly two lines once came out as 1.9999999999999998 of one, and cost the summary a line and the headline another).
- **The app** (`mobile/src/ui/story/StoryPage.tsx` with the arithmetic of `layout.ts`; the native app's `StoryPage.java` replaced a `ScrollView` per page): a page that measures the real text layouts (Devanagari lines are taller than Latin ones) and applies the plan; nothing is flipped between measures, so no layout is requested again and again. `layout.test.ts` checks that every part is on the page, in order and without overlap, whatever the screen, text size and story (504 combinations), and at both ends of every layout range the settings file may send; `mobile/e2e/reading.e2e.mjs` does the same on a running app at six text and theme settings, in Hindi and on its side, asserting no overlap, nothing outside the page, nothing that scrolls and a summary that fills the page of a long story.
- **The website** (`useCardFit.ts`, used by `Card.tsx`): each part of the card carries a `data-fit` attribute (`hero`, `meta`, `title`, `body`, `actions`) and the space above it as padding; the hook measures them (the source line both with and without a picture above it), runs `planFit`, and applies the result with inline styles only (line clamps, the picture's height and `data-hero`), again when the box changes size or the web fonts arrive. A safety loop shrinks the picture to its minimum, then takes lines of the summary down to three (a poster goes before any line is taken), then gives up the picture, then lines of the summary and of the headline, if anything still reaches past the box; it judges that from where the parts are laid out, not from `scrollHeight`, which also counts the few pixels of the entrance animation's slide and once cut a line from a card that fitted.
- **One swipe.** Touch: a swipe anywhere on the card, whatever it starts on (the headline link included), moves one story; a sheet or a text box keeps its own swipes (`data-no-feed-scroll`). Wheel: one push of the wheel moves one story.

Checked in a real browser (Edge driven by Playwright, a production build, the feed replaced by recorded live stories so the numbers repeat) on a phone (390 × 844), a small phone (360 × 640), a tablet, a desktop, a short laptop window and a phone on its side (851 × 393), over 24 English stories each. Before the full-screen change the summary was lost or cut in 10 of 24 stories on the phone, 12 on the small phone and 18 on the phone on its side; after it, in none, none and 1 (a summary cut at a whole line on a short window). Nothing overflows, nothing scrolls, and one touch swipe or one wheel push moves one story. Also checked: every entry of the menu and its five ways of closing, a section chosen from it, Hindi, light and dark, the Go deeper sheet (its cross is in reach at the start and after its text is scrolled, on all six sizes; it is never taller than the card, Escape and the cross close it, a swipe on it stays on the story), and six non-news card types (essay, quote, book, fact, code, poster) with no text under the ☰, and, on a topic feed, the topic chip's dropdown and the Test yourself sheet beside the ☰ (the chip is not covered, the dropdown is on the screen and closes on a tap away, the sheet stays inside the card and its cross closes it). The Android app was run on an API 36 emulator (see `mobile/README.md`). Not checked: a physical phone, and any browser but Edge (Chromium): iOS Safari's address bar and safe areas are the likeliest place for a difference. See the READMEs for what was and was not verified.

The second pass (the buttons on the source line, the headline as the link, the simpler menu) was checked the same way: on 24 stories at five sizes, the three buttons stand on the source line at its right end with no wrapping and no overflow (the source name is cut with an ellipsis on 5 of 24 on a phone, none on a tablet or desktop); the headline opens the publisher in a new tab; Save toggles and says so; Share hands the headline and a link to the share sheet, and copies them when there is none. Every entry of the menu was used with touch taps on a phone, a small phone and a tablet (135 checks: the five ways of closing, language both ways, the four places each marked while open, a section and All, search, the account, the theme, Contact us, the privacy page, and no row for new stories), which found and fixed two bugs in the search palette (a tapped result ran the highlighted one instead, and results reloaded the page) and gave it an Escape key that works from anywhere, a ✕ on a phone and dialog roles. The measuring run again found no story without its summary and no summary cut on six sizes; one 221-character headline is cut at the last resort, by design. A fake clock showed the feed asks for newer stories every five minutes, after two minutes away, and not after forty seconds, that what it finds is offered and taken as "New stories", and that the caught-up card's button asks for a live refresh.

### `CardActions.tsx` — the buttons on the source line

Not a bar any more: an inline row at the right end of the card's tag and source line (`ml-auto`, it never wraps), so the space the fixed bar took at the foot of the page belongs to the story. Round buttons: **Listen** (text to speech), **Copy** (tablet and wider; a phone's share sheet already copies), **Save** (marigold when saved, with the signed fields kept so the story can be shared later) and **Share**; 36 px circles (40 px from `sm`) with a 44 px touch area. The confirmation ("Saved to bookmarks", "Copied") appears just under them. There is no "Read full story" button: the headline is the link. Share and Copy make the story's Plax link first (see [Shared story pages](#shared-story-pages)) and fall back to the publisher's link; Share hands the headline and the link to the browser's share sheet when there is one and copies them when there is not. The app puts its Go deeper (✨), Save and Share in the same place (`Ui.lineButton`: a 36 dp circle in a 44 by 48 dp touch target).

### Navigation — `MenuButton.tsx`, `MenuDrawer.tsx`, `LeftRail.tsx`, `BrandMark.tsx`

- **Four places** — Feed, For you, Topics, Saved (`ui-store` `screen` + `feedFilter`). On a phone they are in the menu; on desktop they are in a side rail (`LeftRail`, which also holds search, language, theme (System / Light / Dark), the reader's topics and the account button)
- **No header and no bottom bar.** `NavBar`, `BottomNav` and `HeaderMenu` were removed so that a story has the whole screen. `MenuButton` is a round glass ☰ over the story's top-left corner (`corner` variant for the screens that are not a story: Topics, Saved, For you with nothing chosen, loading, caught up); it sets `menuOpen` in `ui-store`
- **Menu (`MenuDrawer`)** — a left panel (a dialog: focus is kept inside it, Escape closes it): the feed language (English | हिन्दी), the four places with the current one marked, the news sections (only while the feed shows news), search, the account (the reader's picture when signed in), the theme, and Contact us and the privacy policy as quiet links at the foot. There is no row for choosing topics (the Topics screen has a card for it) or for checking for new stories: the feed looks for them when the reader comes back, every few minutes while the tab is open, and on the "caught up" card. It closes on its scrim, ✕, Escape, a swipe to the left, when a row is chosen, or when the window grows to desktop width. While it is open the feed's keys and wheel are ignored (`Feed.tsx`). The Android app's `MenuSheet` holds the same places, with the app's own About, Contact us, the privacy policy, the update check and Clear saved rows in place of search. The search palette (`CommandPalette.tsx`) runs the result that is tapped, not the one that was highlighted (a finger has no hover), and moves within the app with the store, never `router.push('/')`, which under `/news` reloaded the page
- **`BrandMark`** — the logo's P as a flat glyph (cut from the master logo image `public/plaxlabs_logo.png` with a CSS mask, so it follows the text colour in both themes) and the wordmark in the headline serif; used by the menu, the rail, the story pages and the topic pages. Everything else that draws the P uses the traced outline in `lib/brand.ts` (see *The "P"* below)
- The section chips (All, US, India, World, …) are soft filled pills shown at desktop width (1024 px and up); on a phone the same choice is in the menu. The Feed tab = news (default) or one topic; For you = a mix of the reader's chosen topics, with `ForYouEmpty` until some are chosen

**Intentionally different from the app:** the website has Listen and Copy, a search palette (⌘K), the left and right panels on desktop (navigation, stats and shortcuts), and its Go deeper is an inline panel where the app's is a bottom sheet (✨, on the source line; both ask `/api/deeper` for the same three facts, and there is no AI brief anywhere since 4 November 2026). Everything else (menu, card, the buttons on the source line, places, theme choice) is meant to be the same; if one drifts, the screenshots in the 1.4.0 verification show what it should look like (the header, the bottom bar and the Read full story row in them are gone since the full-screen change).

### The "P" — `lib/brand.ts`, `lib/brand-tile.tsx`

Apart from `BrandMark`, which masks the master logo so it can take the text colour, the P is drawn from **one outline**. `src/lib/brand.ts` holds it: `P_BOWL` and `P_STEM` (absolute `M/L/C/Z` paths, traced once from the logo; they overlap it 99.1% at the same height, where the hand-drawn vector the Android app had before 1.5.3 overlapped 74%), its box `P_BOX`, the colours `BRAND` (tile `#F59E0B`, ink `#1A1203`) and the proportions `P_IN_TILE` (0.68 of the height, for a tile shown whole) and `P_IN_FULL_BLEED` (0.45, for the maskable install icons, so a circular mask cannot clip it).

- **`PTile`** (`lib/brand-tile.tsx`) draws the P on the amber tile as an inline `<svg><path>`, which Satori (`next/og`) renders. The three share cards (`app/opengraph-image.tsx`, `app/topics/[topic]/opengraph-image.tsx`, `app/s/[slug]/opengraph-image.tsx`) use it; none types a letter.
- **Icons**: `scripts/brand-icons.mjs` draws `app/icon.png` (the favicon: 512, rounded, clear corners), `app/apple-icon.png` (180, opaque), `public/icon-192.png` and `public/icon-512.png` (opaque, full-bleed) and the Play listing's icon (`mobile/artifacts/play/icon-512.png`, git-ignored, 32-bit) from `brand.ts` in a headless browser (`npm i --no-save playwright-core` first; set `BROWSER` if no Edge, Chrome or Chromium is found). `app/manifest.ts` lists the two public icons, the 512 one also as maskable.
- **Android**: the drawables `ic_launcher_foreground`, `ic_plax`, `ic_splash` and `drawable-night/ic_splash` carry the same two paths.
- **To change the logo**: retrace it, change `brand.ts`, the app's icon set (`mobile/src/ui/icons.ts`, the "plax" icon) and its picture maker (`mobile/scripts/gen-assets.mjs`), run both scripts and rebuild the app. `lib/brand.test.mjs` (6 tests) fails if the website's outline, the app's drawing and pictures, the colours, the icon files' sizes and colour types or the manifest drift apart, or if a share card types a "P" again.
- Chat apps cache link previews, so a link shared before a card changed can keep its old picture for a while.

### `TopicsScreen.tsx`, `TopicEditor.tsx`, `SavedScreen.tsx`, `AccountSheet.tsx`, `CaughtUp.tsx`

- **Topics** — the 16 topics plus News and Stocks; tapping one opens it in the Feed tab. "Choose topics" opens `TopicEditor`, a sheet that selects the topics behind For you; the first choice opens For you at once
- **Saved** — the bookmarked stories (also those restored from an account); the headline and **Open** return to the feed on that story, **Remove** unsaves it
- **Account** — explains the optional account, offers Google sign-in, and says plainly when sign-in is unavailable
- **Caught up** — "You're all caught up", **Check for new stories**, **Read N earlier stories**

### `Profile Page` (`app/profile/page.tsx`)

- Signed in: avatar, name, email, member-since date, stats grid (Cards Read, Day Streak, Minutes Read, Bookmarks) and three tabs: Stats (top interests + selected topics), Bookmarks (cloud-loaded), Settings (sign out)
- Signed out: the reader's on-device activity (cards read, saved stories, minutes, top interests) and a **Sign in** button that goes to the feed with the account sheet open, like every other sign-in entry. Nothing here needs an account

### Ads — `AdStrip.tsx`, `AdCard.tsx`, `RailAd.tsx`, `AdSlot.tsx`, `AdsRuntime.tsx`, `AdChoices.tsx`

Google AdSense ads, placed by the screen. A phone, a tablet and any window narrower than 1280 px get a strip at the foot of the page and a full-page ad after every fifth story; a desktop window (1280 px and up, where the right panel is on screen) gets one ad at the top of the right panel and none in the middle, which is for the story. **Off unless configured:** with none of the variables below there is no script, no strip, no ad card, no panel ad, no `google-adsense-account` meta tag and no `ads.txt`, and the website is exactly as it was before ads existed. The Android app has the same two places a phone has (an AdMob banner at the foot and a native ad page after every fifth story), see `mobile/README.md`.

- **Configuration** (`lib/ads-config.ts`, tested by `ads-config.test.mjs`). `NEXT_PUBLIC_ADSENSE_CLIENT` (`ca-pub-` and 16 digits) and the ad units `NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW` (a 320 x 50 unit), `NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE` (728 x 90) and `NEXT_PUBLIC_ADSENSE_SLOT_PAGE` (a responsive rectangle). `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` is optional: the unit of the right panel, which falls back to the page unit (a responsive unit serves any shape, and the ad is asked for the shape the place has room for). A value shaped wrongly counts as not set, so a typo never reaches Google. `NEXT_PUBLIC_ADS_PREVIEW=true` draws labelled boxes where the ads would be and sends nothing, for looking at the layout and for the tests; it is never set in production. `NEXT_PUBLIC_ADS_POLICY=true` makes the privacy policy say that Plax shows ads before the website has real ads: set it when the Android release with ads goes out (one policy covers both, and it must never run ahead of what a reader gets). The variables are written out in full in the file (`process.env.NEXT_PUBLIC_...`), because Next puts a value into the browser's code only where it finds it spelled that way. They are listed in `.env.example`.
- **Placement** (`adPlacement` in `lib/ads-config.ts`, `useRailVisible` in `lib/ads-state.ts`). One rule says where the ads are: where the right panel is on screen (`matchMedia('(min-width: 1280px)')`, the width at which `RightRail` is shown, `xl`; a test keeps the two together) the ad is in the panel and there is no strip and no page ad; anywhere else there is the strip and the page ad. A window between 1024 and 1279 px has the left panel but not the right one, so it gets the strip and the page ad like a tablet (a laptop's maximised window is often 1272 px wide: zoom out or widen it to see the panel ad). The rule is read live, so resizing a window moves the ads at once. If no unit is set for the panel the middle stays as it was.
- **The script and the consent choice** (`AdsRuntime.tsx`, `AdChoices.tsx`). Google's script is loaded once, after the page is interactive, and only when ads are on. A blocker that stops it, or lets a stand-in load, is noticed at once (`lib/ads-state.ts`; `adsbygoogle.loaded` is set only by the real script), and every slot gives its room back. **The script also sets `height: auto !important` on `<main>` and the box in it** (seen on the live site on 2 November 2026, from the day the AdSense ids were set: a desktop showed the two panels and a blank middle, because the story column has no height of its own; the hidden `ins` the script put in the body was the only ad element on the page, so this is the script's own page-level behaviour, with Auto ads on for the site), so those two boxes are kept at their heights for as long as the script is on the page: an `auto` height set on them is taken off at once, before the browser paints (`lib/layout-guard.ts`, `layout-guard.test.mjs`; checked in Edge against the real script on production at 1440 × 900, 1280 × 720, 1920 × 1080 and 390 × 844). Turning Auto ads off for the site in AdSense (Ads → By site) is the owner's to decide: the page places its own ads. Consent is Google's: the message for readers in the EEA, the UK and Switzerland is set up in the AdSense account (**Privacy & messaging**) and the same script shows it; ads wait for it. The menu's **Privacy and ad choices** and a button on the privacy page reopen the reader's choice (`googlefc.showRevocationMessage`).
- **The strip** (`AdStrip.tsx`). Under the story and never over it: `HomeApp.tsx` is a column, the story area takes what the strip leaves, and `useCardFit` fits the story into that. A 728 x 90 unit when its column is at least 740 px wide and 520 px high, else 320 x 50. **It takes room only for an ad that has come**, unless this browser has been served a strip ad within a week, when it keeps exactly the ad's height from the start so that nothing jumps (see *Nothing shows before an ad has come*). It gives the room back when no ad fills it within 5 seconds or the script is blocked. It is on the Feed screen only (not on Topics, Saved or an empty For you) and clears the bottom safe-area inset. Not where the right panel carries the ad (see Placement).
- **The right-panel ad** (`RailAd.tsx`, in `RightRail.tsx`). At the very top of the panel, 300 px wide, labelled **Advertisement** (once the ad is in): a half page (300 x 600) in a window at least 1000 px tall, else a rectangle (300 x 250 up to 336 x 280), chosen once as the ad is asked for, so the rest of the panel stays in view in a short window. Like the strip it is on stories only (not Topics, Saved or an empty For you), is drawn only while the panel is on screen (a unit in a hidden box cannot be sized), takes no room and shows no label until an ad has come (unless one was served here within a week), and gives its room back when no ad fills it. The panel keeps its own scrolling as before: the wheel over it scrolls the panel, not the feed.
- **The full-page ad** (`AdCard.tsx`, placed by `Feed.tsx` with `lib/ad-slots.ts`, which the app uses too). After the 5th, 10th, ... story and never as the last card, in the same swipe feed, so the next story is one swipe, the arrow keys or the **Next story** button away. It is labelled **Advertisement** and holds the biggest unit the page has room for: a half page (300 x 600) where the area is at least 632 px high, else a rectangle of at most 336 x 280, with room all round it to swipe from. An ad card is never read, saved, searched or counted in a reader's history. A slot keeps its number as more stories load, so the ad asked for stays with it. Until an ad has come the card shows only room (its label and its button are `invisible`, which keeps the layout the unit's shape was chosen from; they come up with the ad, or after 2.5 s of waiting so that a slow answer leaves a reader a way on). When no ad comes the card is dropped and the stories run on; after two empty slots in a row the feed passes over the next two slots and then asks again (`slotMayAsk` in `lib/ad-slots.ts`: a served slot ends the run of misses, a slot never asked for neither counts nor ends it), so a short gap on Google's side costs a few ads and not every ad of the visit; filled ones always stay, and where the script is blocked or the unit is resting (`lib/ads-verdict.ts`) no more are inserted. A page shorter than 520 px (a phone on its side) has no full-page ad. None on a desktop (the panel has the ad).
- **Nothing shows before an ad has come** (`lib/ads-verdict.ts`, `useAdsResting` and `rememberAds` in `lib/ads-state.ts`, tested by `ads-verdict.test.mjs` and `ad-card.test.mjs`). Found on the live site on 3 Nov 2026, while the AdSense account had not approved the site and every ask came back `unfilled`: after the fifth story a phone landed on a page of "ADVERTISEMENT" and a button over a blank for about a second before the next story came in (on every visit), a desktop showed a labelled blank at the top of the panel for 1.5 s and then the panel jumped up, and a phone had a blank strip for a moment. So: (1) **a place that asked and was never served rests for 6 hours in that browser** (`localStorage`, `plax-ads-verdict-v1`, a time per kind: page, strip, rail; nothing about the reader): it is not drawn and not asked for again until the rest is over, when one ask finds out whether anything changed; **so does a place that has not been asked yet, when nothing has been served in that browser and another place has been asked in vain**: the strip asks at load, seconds before a reader reaches the fifth story, so a first-time visitor is not taken to an empty card to find out what the strip already knows (an account that has not been approved serves none of its units), and one ad of any kind ends that; (2) **only Google's own answer is remembered** (`data-ad-status` `filled` or `unfilled`), not our 5-second wait that ran out (a slow network says nothing about the account), a script that threw or a blocker; (3) **a unit that has filled within a week is only between ads**, as every account is now and then: one that did not come rests nothing, and its place keeps its room from the start (the strip, the panel) so that nothing jumps; (4) **where nothing has been served, nothing is shown while the ad is on the way**: the panel and the strip are asked for without taking room and without a label, over the page's last pixels and without touching them (`pointer-events: none`), and the page card shows only room. Checked in Edge on a production build with Google's script stood in for, at 390 x 844 (touch) and 1440 x 900: *unfilled* gave a strip that never took a pixel (the story stayed 820 px tall), **no ad card at all in 7 swipes, even on a first visit** (the strip's answer, a second after load, rests the card; before that rule the card stood 0.9 s with no label or button and was then dropped), a panel with no label and no gap, and on the second visit nothing asked; *filled* gave the strip (the story made room once, 820 to 762 px, on the very first ad), the label and the button with the ad, and on the second visit the strip's 58 px kept from the first frame; *no answer* gave a card with its label and button only after 2.5 s and nothing remembered; *blocked* gave nothing at all. The reader can still leave a card by a finger drag from the middle of the ad, by the wheel and by the button (a synthesized scroll gesture does not move an ad's frame, a real touch sequence does). **On the live site with Google's real script and the unapproved account** (a fresh browser, 390 x 844, touch, after the deployment of that rule): the strip took 0 px and its answer (`unfilled`) was remembered, 0 ad cards in 7 swipes on the first visit and in 7 on the second, and the story stayed 820 px tall throughout; before the change the first visit stood on a blank card for 1.3 s (no label, no button) and the second visit before the first change on a card with its label and button.
- **Swiping from the ad itself** (`AdCard.tsx`). Google's ad is a frame of another origin, so a swipe or a push of the wheel that begins on it never reaches the page's own handlers; what the browser does with a gesture the frame does not use is scroll the nearest scrolling box. So the whole ad page is a scrolling box with a range of 20,000 px each way, whose page is held in place by `position: sticky`; a scroll of 72 px (what a swipe on a story needs) in either direction is the gesture and moves to the next or the previous story. It starts not counting and counts only after 220 ms without a scroll, so the tail of the push that brought the reader here does not carry them past (the range is far larger than any tail, because a box run to its end goes silent, which looks like a box that has stopped, and the rest of the tail was taken for a new swipe). When it moves on it tells the feed to hold the wheel (`holdWheel` in `Feed.tsx`) so the tail does not move the next story. The box is `data-no-feed-scroll`, so the feed's own touch and wheel handlers leave it alone and a gesture has one path, never two (two would skip a story). The frame itself is never covered or made unclickable: that is not allowed.
- **What Google's script does to the boxes around an ad** (found with the real script on 2 Nov 2026, in test mode: `data-adtest="on"` on the unit, against a local build with the real ids). For a *responsive* unit (the full-page ad, the panel's ad) it sets `height: auto !important`, and `min-height: 0 !important` where a box has one, on every box from the ad up to the first absolutely positioned one; the scrolling boxes (`overflow: auto`) are skipped. A fixed-size unit (the strip) is left alone. It does this when the ad is asked for, and the code does not rely on it happening only once. This is what blanked the middle of a desktop on the live site (`<main>` and the box in it are as tall as the window): `AdsRuntime.tsx` keeps those two boxes at their heights (`lib/layout-guard.ts`: an `auto` height set on them is taken off as it is set). The ad page needs more than that: a scrolling box whose room comes from the height of a box around the page lost all of it (`scrollHeight` equal to `clientHeight`, so a swipe on the ad did nothing), and a page sized by `min-height` came out too short. So nothing in `AdCard.tsx` depends on a `height`, `min-height` or `max-height`: the room to scroll is two spacers of a fixed height *beside* the page, and the page is as tall as the scrolling box by its `flex-basis` of `100cqh` (the box is a size container), neither of which the script touches. `ad-card.test.mjs` pins this. Browsers without container units (before 2022) get a page as tall as its contents, which still works. The script cannot be made to fill a test ad here (an unapproved site gets none), so the real script is checked for what it does to the page, and a stand-in for it (fills every unit with a frame of another origin and re-applies the heights every 600 ms) for the swipes.
- **Program rules kept.** A unit is asked for once and never refreshed; ads are plainly marked; nothing makes an ad look like a story. The live ads are never clicked while testing: layout is checked with the preview boxes, fill, no fill and a blocked script with a stubbed script, and the no-ads case with none of the variables set (`ad-slots.test.mjs` and `ads-config.test.mjs` hold the arithmetic and the rules).
- **The owner's account (set up 1 to 2 Nov 2026).** Publisher `ca-pub-2225161543339119`. AdSense has the site `plax-rouge.vercel.app` (reviewed on 10 Nov 2026 and not approved yet: see *Google's verdict* below) and three units: `4893598900` (responsive rectangle, `NEXT_PUBLIC_ADSENSE_SLOT_PAGE`; the right-panel ad uses it too, as `NEXT_PUBLIC_ADSENSE_SLOT_RAIL` is not set), `2201528943` (320 x 50, `NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW`) and `7328190550` (728 x 90, `NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE`). The consent message for the EEA, the UK and Switzerland ("Plax EEA UK consent") is published. These are public identifiers (the page and every app carry them) and are set in the host's environment variables, not in the source. Community reports say a site on a `*.vercel.app` host is often not approved and that a domain of one's own is the usual cure; Google's own rule asks only for access to the site's HTML. The same publisher id serves AdMob, so the one `app-ads.txt` line covers both. On 2 Nov 2026 the four `NEXT_PUBLIC_ADSENSE_*` variables were added in Vercel, for Production only and as plain (not secret) variables, since they are public; they reach the page only in a new build, which a push to `main` starts (Vercel's own Redeploy asks for a code emailed to the owner). From that build the website carries the AdSense script and the `google-adsense-account` tag and serves the two `ads.txt` files, and the privacy policy says that Plax shows ads.
- **Before real ads show:** an approved AdSense site, the three ad units, and `ads.txt` live. Approval is Google's decision about the site, which republishes headlines and summaries, and is not guaranteed.
- **Google's verdict (read from the owner's AdSense account on 10 Nov 2026).** Sites → `plax-rouge.vercel.app`: **Needs attention, "Low-value content"** ("Your site isn't ready to show ads"). *Verify site ownership* passed, so the `vercel.app` address did not stop verification; the ads.txt status is *Authorised*; Policy centre says *No current issues* (nothing limits ad serving). Google's text: to qualify, a site must provide substantial unique value, a consistent presence on the web and genuine user interest; before resubmitting it should provide authentic, high-quality information, tools or services, show ongoing curation and structural maintenance, and sustain genuine user interest. What a crawler gets from the home page is the menu and a list of headlines from other publishers (about 240 words); the feed itself is drawn by JavaScript. **Ask for a review only after the site has changed** (the Request review button asks the owner to confirm that the issues are fixed). Meanwhile the web shows no ad: the script loads, Google answers each request `unfilled`, and the page gives the room back (checked on the live site, 10 Nov 2026). The Android app's ads are AdMob's, a separate account area, and are served.

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

The Android app's website build (package `com.plaxlabs.news.preview`, which is not on Google Play; [mobile/README.md](mobile/README.md), *Updates*) updates itself from two static files that deploy with the website: `public/updates.json` (seven fields: `schemaVersion`, `versionCode`, `versionName`, `minSdk`, `apkUrl`, `sha256`, `size`) at `/news/updates.json`, and the one advertised build, `public/plax-<version>.apk`, at `/news/plax-<version>.apk`. The app only reads `https://plax-rouge.vercel.app/news/...` (`PRODUCTION_SITE` in `mobile/src/build.ts`, equal to `SITE_URL` in `src/lib/site.ts`) and takes only an `apkUrl` that is that address followed by `/plax-<versionName>.apk`. The Google Play build never reads them: Google Play updates it (it only tells its reader that a newer version is on Google Play, when `app-config.json` says so).

- **Headers** come from `headers()` in `next.config.js`: the feed is `application/json; charset=utf-8`; the APK is `application/vnd.android.package-archive` with `Content-Disposition: attachment`. **Both are `Cache-Control: no-store`**, and both send `nosniff` and `X-Robots-Tag: noindex`. The APK must not be cacheable: the shared cache in front of the site (at the time `www.plaxlabs.com`, which proxied this app) stores the answer to a ranged request (`Range: bytes=0-1`) as the whole file and then serves those 2 bytes to every download until its lifetime ends, even across deployments (seen on 10 October 2026, and reproduced with probe files: poisoned with `public, max-age=3600`, not with `no-store`). So never send a Range request to the production APK. Vercel was seen adding its own `Content-Disposition: inline` to the feed, which does not matter to the app; confirm after a deployment that the rest of these headers won: `mobile\scripts\verify-update.ps1` does.
- **Publishing** is `mobile\scripts\publish-update.ps1` (it validates the APK and writes both files), a commit, a push, then `mobile\scripts\verify-update.ps1` once the deployment is Ready. The steps and the signing caveat are in [mobile/README.md](mobile/README.md), *Publishing an update*.
- **Rollback** is reverting the commit that changed `updates.json`. Installed apps never go back to a lower version code.
- The files are in `public/`, so deleting or editing them by hand can strand or mislead every installed copy; change them only through the script.

### Over-the-air updates of the app's JavaScript (EAS Update)

Both builds of the Android app (Google Play's and the website's) are React Native apps whose screens and logic are JavaScript, and they ask Expo's update service (`https://u.expo.dev/<project id>`, the `production` channel; the device tests' build asks `e2e`) for a newer JavaScript bundle each time they start, download it in the background and run it the next time they start. That is how a fix or a change reaches a Google Play install without a new bundle. Google Play's policy forbids an app to download *executable code* from elsewhere, but not code run by an interpreter or virtual machine that gives only indirect access to Android's APIs (it names JavaScript in a web view or browser as an example); Expo documents JavaScript updates of a React Native app as falling on the allowed side, and the reading of the policy is Google's. What cannot be updated this way is the native layer (the Kotlin, the manifest, the permissions, the native libraries), which needs a new bundle.

- **What may be published.** The bundle's `runtimeVersion` is the fixed string `2.0.0` (`RUNTIME_VERSION` in `mobile/app.config.js`), so one publication serves both builds, and only a build with the same runtime version takes it. A test (`mobile/scripts/native-fingerprint.js`, run by `mobile/scripts/__tests__/native-fingerprint.test.js`) fails when the native layer differs from what `mobile/native-fingerprint.json` recorded for that runtime version: change the native layer, and you must either bump `RUNTIME_VERSION` and ship a new bundle, or (before a runtime version has shipped) record the new fingerprint.
- **Publishing** is `mobile\scripts\publish-ota.ps1 -Message "..."` (it checks the native fingerprint, the types and every unit test first, then runs `eas update --branch production --platform android`; `-Rollout 10` starts with a tenth of the installs), which needs `eas login` as the project's owner. Check it with `npx eas update:list --branch production` and by starting the app twice on a phone: the first start downloads, the second runs it.
- **Rollback** is publishing the earlier code again (`eas update:republish`, or `eas update:roll-back-to-embedded` to go back to the bundle built into the app); an installed app that cannot reach the service keeps the bundle it has. The update library also sets aside a bundle that crashes as it starts (not tried on this app).

### Android app settings (`public/app-config.json`)

The Android app (both builds) reads one more static file that deploys with the website: `public/app-config.json` at `/news/app-config.json`, a small JSON document of **data** (never code): the topics, the news sections, a few switches, how often a full-page ad comes, four picture numbers, one notice, whether a newer version is on Google Play, and up to four menu links. The app asks for it when it comes to the front, at most every 3 hours, with no cookie or identifier, keeps the last good copy on the phone and, for anything it cannot read, keeps its built-in value. [mobile/README.md](mobile/README.md), *What the website can change without a new app*, has the whole table and the rules.

- **One list of rules, two readers.** `src/lib/app-config-rules.ts` (the website's check) is imported by the app (`mobile/src/config/app-config.ts`, as `@shared/app-config-rules`), and both run `src/lib/app-config-cases.json` (168 cases, written in ASCII so every character that matters is an escape): `npm test` (`app-config.test.mjs`) and the app's `app-config.test.ts` fail if they disagree, so a file that passes `npm test` is a file the app takes whole. A document that is not strict JSON (comments, trailing commas, a name twice, a byte order mark, more than six levels), over 16 KB, or of another `schemaVersion` is refused whole; otherwise each part stands on its own.
- **The same numbers on the website.** `heroMaxWidth`, `heroMaxHeight`, `photoMinWidth` and `photoMinHeight` are the constants of `useCardFit.ts`, `ads.pageEvery` is `STORIES_PER_AD` in `ad-slots.ts`, `sections` is `NEWS_SECTIONS` in `types.ts`, and `features.sourceName` is `SHOW_SOURCE_NAME` in `app-features.ts`: a test fails if the file and the website differ, so the website and the app change together. Topics are checked against `TOPICS` in `store.ts` (a topic the feed has no sources for would show nothing).
- **Headers** come from `headers()` in `next.config.js`, as for the update feed: `application/json; charset=utf-8`, `Cache-Control: no-store`, `nosniff`, `X-Robots-Tag: noindex`.
- **The publisher's name: off on the website and in the app, in every build.** The card shows only the age (the headline is the link to the story at its publisher), so `features.sourceName` is `false` and `SHOW_SOURCE_NAME` in `app-features.ts` is `false` (a test keeps the two equal). The app follows that one switch in every build, the Google Play one too (`showsSourceName` in `mobile/src/config/app-config.ts`, which the feed asks; a test reads the sources for it), so setting `features.sourceName` to `true` (and `SHOW_SOURCE_NAME` with it) brings the name back on both with no new bundle. This is a change from the native app, whose Google Play build named the publisher whatever the file said, because Google Play's News policy asks an aggregator for clear information about the publishing sources of what it shows and the Play Console declaration says each card shows its source: with no name on a card, the declaration is not what the app does, and Google may ask for the name back (that risk is the owner's to weigh; see `mobile/PLAY-CONSOLE-ANSWERS.txt`, section 8). The poster of a story with no picture is headed by *Plax* (`POSTER_NAME` in `poster.ts`), not by the outlet. The age starts right after the tag or the Breaking badge at every width (the row is `justify-start` from 540 px up; it was centred in the room between the badge and the buttons).
- **Rollback** is pushing the earlier content. Installed apps that already took a file keep the last good one if the site cannot be reached.

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

- The site is served from the project's own Vercel domain, `plax-rouge.vercel.app` (Vercel → Settings → Domains), under `/news`. Its first domain, `plaxlabs.com`, expired and stopped answering, which left every installed app with no stories and no sign-in; the address is a constant (`src/lib/site.ts`, `PRODUCTION_SITE` in the app) and `src/lib/site.test.mjs` fails if it differs between them or if the old one returns.
- Nothing else is served at the root of the domain: `next.config.js` redirects `/` to `/news` and sends `/robots.txt` and `/sitemap.xml` to their copies under `/news`, which is where crawlers look.
- SSL is provisioned by Vercel. The address is built into each copy of the app, so a custom domain later means changing both constants and shipping a new app.
