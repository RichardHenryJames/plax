# Plax — TikTok for Readers

> Swipe through knowledge. Bite-sized content for curious minds.

A short-form reading platform that delivers personalized microessays, quotes, explainers, and fascinating facts — optimized for addictive, distraction-free reading.

## Native Android preview

The independent [Android project](android/README.md) (version 1.4.0 preview)
provides native swipeable Plax news cards in English or Hindi, topics, a **For you**
feed built from topics you choose, light and dark themes (following the phone by default), an on-device feed cache for
instant start and offline reading, an AI brief with English/Hindi translation,
bookmarks, sharing and publisher links. **Share sends a link to Plax's own page for the story**, which previews well in chat apps
and is found through the site's sitemap (see *Share a story* below). Stories you have already looked at do not come
back when you reopen the app, and the same event reported by several outlets is shown
once. It tells you when a newer build is published and lets you download it from the
app (the browser saves the APK and Android asks you to confirm; nothing installs by
itself): the feed and APK are served by this website, see *Android update feed* in
[TECH.md](TECH.md#android-update-feed-publicupdatesjson). It works without a login;
signing in with Google is optional and only syncs your
topics and saved stories with the same account the website uses (see
[SUPABASE_SETUP.md](SUPABASE_SETUP.md): the account service is currently down, so that
part is unverified end to end). It uses the public feed and summarize endpoints plus two
small routes added for sign-in, `/news/api/auth-config` and `/news/auth/app`, and the
static update feed. The AI brief is
fast once the backend changes described under *AI Summarization & Translation* below are
deployed; the app works against the current backend without them.
Open `android` in Android Studio or run `android\build.ps1` on Windows.
This is a debug-signed preview, not a published Play Store release.

## 🚀 Live

**[plaxlabs.com](https://plaxlabs.com)**

## ✨ Features

### Core Experience
- **📱 TikTok-style swipe** — Vertical full-screen cards with spring animations (drag, keyboard, scroll wheel)
- **🌍 Public first** — Opening Plax shows today's news straight away: no sign-up wall and no topic quiz. Choose topics for a **For you** feed, or sign in, only when you want to
- **🧭 Four places** — **Feed** (news, or one topic), **For you** (a mix of the topics you chose), **Topics** and **Saved**: a bottom bar on phones, a side rail on desktop, and the same layout as the Android app
- **✅ No repeats** — A story you have already looked at does not come back when you reload or return later, and one event reported by several outlets appears once. When everything new has been seen, a "You're all caught up" card offers to check again or to read the earlier stories
- **🧠 Personalized feed** — Learns your interests from engagement (time spent, bookmarks, completion rate)
- **🎯 16 topic categories** — Science, Technology, Philosophy, Psychology, History, Finance, Space, Programming, Books, Health, Math, Nature, Art, Physics, Business, Language
- **🔖 Bookmarks** — Save cards with instant animated feedback; they live in the Saved tab and, when signed in, in your account
- **♾️ Infinite scroll** — Auto-fetches more content as you approach the end of your card stack
- **🌙 Dark and light themes** — Warm marigold on near-black, or on paper. **System** is the default, like the app; Light and Dark are one tap away
- **🎨 The same design as the app** — Serif headlines and a plain-sans text, the picture first, a soft tag and `Source · age · read time` line, and one action row. On desktop the same column sits between a left and a right panel
- **🔗 Share a story** — Share and Copy make a link to **Plax's own page** for the story (`/news/s/<headline>-<id>`) instead of the publisher's: it previews as a card with the headline in WhatsApp and elsewhere, shows a short summary with its source and a link to the full report, and is listed in the sitemap. Only a story this server signed can become a page, so nobody can put words of their own on the domain; if anything fails, the publisher's link is shared as before. See [TECH.md](TECH.md#shared-story-pages)

### Content Sources (All Free, No API Keys Required)
- **Wikipedia** — Random articles + "On This Day" historical facts
- **Hacker News** — Trending tech/startup stories from top, new, and best feeds
- **Reddit** — TIL, ELI5, Showerthoughts, science, space, history, philosophy, and more (12 subreddits)
- **ZenQuotes** — Curated quotes from thinkers and leaders

### Authentication & Cloud Sync
- **Optional Google sign-in** via Supabase Auth, opened from the account button. Plax works fully without it. Signing in *merges* what you chose in this browser with your account instead of replacing it: the account's topics win when it has any, otherwise yours are kept and uploaded; saved stories are a union. A different account never inherits the previous person's local choices
- **Cloud-synced bookmarks** — Save on any device, access everywhere
- **Reading streaks** — Daily streak tracking with automatic reset logic
- **Engagement analytics** — Per-card time tracking, completion rates, category preferences
- **Profile page** — Stats, top interests, bookmarks, account management
- **Status:** the Supabase project behind sign-in is currently unreachable (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)). The account sheet says "Sign-in is temporarily unavailable" and everything else keeps working; sign-in itself has been unit-tested but not verified end to end since this change

### AI Summarization & Translation
- **Staggered provider chain** (`src/lib/llm.ts`) — Groq Qwen 3.8 27B → Gemini 3.5 Flash-Lite → Groq GPT-OSS 20B → Gemini 3.1 Flash-Lite → GPT-OSS 120B → OpenRouter free models. The next provider starts as soon as the previous one fails or stays silent for 1.5 s, and the first valid answer wins; providers that report an exhausted quota are skipped for a cool-down
- **Hindi translation** (`src/lib/translate.ts`) — Gemini 3.5 Flash-Lite first (most natural Hindi), then GPT-OSS 120B / Qwen, with Azure Translator and MyMemory racing in behind as fallbacks. Hindi sources are summarised directly in Hindi
- Tune with `LLM_CHAIN`, `LLM_TRANSLATE_CHAIN` and `LLM_HEDGE_MS` (see `.env.example`); run the unit tests with `npm test`

### Smart Feed Logic
- **Related category expansion** — If you pick "Programming", you also get Technology/Science/Math content
- **3-tier filtering** — Exact match → related categories → all cards (never returns empty)
- **No-repeat engine** (`src/lib/story-engine.ts`, `seen-storage.ts`) — a TypeScript port of the Android app's `Similarity`, `SeenStore` and `FeedMerge`, with the same constants and rules, so both make the same decisions. A story counts as seen after about a second on screen (half a second if the reader moves on). The history keeps up to 1,500 stories (news for 30 days, evergreen for 7) in this browser (`plax-seen-v1`): per story its id, a lower-case headline key of at most 160 characters and two times, never the story text. One event worded differently by two outlets is recognised from its distinctive headline words and publish times; an identical headline counts as the same event only when it is timely or exactly equal. Translating a card does not change its identity
- **Stories never replace what you are reading** — Newer stories found in the background are offered as a "New stories" button; they are swapped in silently only in the first moments after a list appears, while the reader has not moved
- **Back after a while** — Away for 2 minutes or more, the feed quietly looks for newer stories; away for 30 minutes or more, it starts again from the newest
- **Server-side deduplication** — By title before processing
- **Stable card IDs** — Same article always generates the same ID (deterministic hashing)
- **Exclude-already-seen** — The client sends up to 200 loaded or recently seen IDs so the server skips them; the first page is requested without them so it stays cacheable

## 🛠 Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 16.x |
| **UI** | React + Tailwind CSS | 19.x / 4.x |
| **Animations** | Framer Motion | 12.x |
| **State** | Zustand (persisted to localStorage) | 5.x |
| **Auth & DB** | Supabase (Auth + Postgres + RLS) | 2.x |
| **AI** | Groq (Qwen 3.8 27B, GPT-OSS) + Gemini 3.x Flash-Lite, staggered fallback | plain `fetch`, no SDK |
| **Hosting** | Vercel | Auto-deploy on push |
| **Domain** | plaxlabs.com | Vercel DNS |
| **Language** | TypeScript | 5.x |

## 🏃‍♂️ Quick Start

```bash
# Clone
git clone https://github.com/RichardHenryJames/plax.git
cd plax

# Install
npm install

# Environment variables
cp .env.example .env.local
```

Edit `.env.local`:

```env
# AI Summarization (optional — feed works without these)
GEMINI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here

# Supabase (required for auth & cloud sync)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

```bash
# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Get Free API Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| **Gemini** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | 1500 req/day |
| **Groq** | [console.groq.com](https://console.groq.com) | 14k req/day |
| **Supabase** | [supabase.com](https://supabase.com) | 50k MAU, 500MB DB |

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql`
3. Go to **Authentication → Providers** and enable Google and/or GitHub OAuth
4. Copy your project URL and keys into `.env.local`

## 📁 Project Structure

```
plax/
├── src/
│   ├── app/
│   │   ├── globals.css                # Tailwind v4 + custom styles
│   │   ├── layout.tsx                 # Root layout (AuthProviderWrapper)
│   │   ├── page.tsx                   # Main page: public News first, then Feed / For you / Topics / Saved
│   │   ├── api/
│   │   │   ├── auth-config/route.ts   # Public Supabase URL + anon key, for the Android app
│   │   │   ├── feed/route.ts          # Content feed API (Node.js runtime); signs every card
│   │   │   ├── share/route.ts         # Turns a signed card into a story page, returns its address
│   │   │   └── summarize/route.ts     # AI summarization API (Edge runtime)
│   │   ├── auth/
│   │   │   ├── app/route.ts           # Hands the Google sign-in code back to the Android app
│   │   │   └── callback/route.ts      # Supabase OAuth callback handler
│   │   ├── profile/
│   │   │   └── page.tsx               # User profile, stats, bookmarks
│   │   └── s/[slug]/                  # Shared story pages: page, preview picture, 404 and error states
│   ├── components/
│   │   ├── AccountSheet.tsx           # Optional Google sign-in, with an honest "unavailable" state
│   │   ├── AuthProvider.tsx           # Supabase auth context (user, session)
│   │   ├── AuthProviderWrapper.tsx    # Conditionally wraps app with auth
│   │   ├── BottomNav.tsx              # Feed / For you / Topics / Saved on phones
│   │   ├── BrandMark.tsx              # The Plax mark: logo glyph + serif wordmark
│   │   ├── Card.tsx                   # Content card (picture, tag line, serif headline, text, extras)
│   │   ├── CardActions.tsx            # Action bar: Read full story, Listen, Copy, Save, Share
│   │   ├── CaughtUp.tsx               # "You're all caught up" end-of-list card
│   │   ├── CloudSync.tsx              # Invisible bridge: Zustand ↔ Supabase (merges, never replaces)
│   │   ├── Feed.tsx                   # Swipeable feed (drag, keyboard, scroll) + no-repeat engine wiring
│   │   ├── ForYouEmpty.tsx            # For you before any topic is chosen
│   │   ├── HeaderMenu.tsx             # The ⋮ menu: search, account, topics, theme
│   │   ├── LeftRail.tsx               # Desktop navigation rail
│   │   ├── NavBar.tsx                 # Mobile header (mark, English | हिन्दी, refresh, menu)
│   │   ├── SavedScreen.tsx            # Saved stories
│   │   ├── TopicEditor.tsx            # Topic picker sheet
│   │   └── TopicsScreen.tsx           # Topics grid
│   └── lib/
│       ├── ai.ts                      # Gemini/Groq summarization & quiz gen
│       ├── app-redirect.ts            # Builds the redirect back into the Android app
│       ├── cache.ts                   # In-memory server cache (Map-based)
│       ├── cloud-sync.ts              # Supabase CRUD: prefs, bookmarks, engagements
│       ├── database.types.ts          # Supabase generated types
│       ├── deadline.ts                # Per-source time limit for the feed fetchers
│       ├── sample-data.ts             # CardData type + personalization helpers
│       ├── seen-storage.ts            # Reads and writes the seen history in localStorage
│       ├── share.ts                   # Story-link rules: canonical form, address, validation (shared with the app's tests)
│       ├── share-client.ts            # Browser side of sharing: make the link, check it
│       ├── share-sign.ts              # Server only: HMAC signing and verification of cards
│       ├── share-store.ts             # Stored story pages (the existing ai_cache table)
│       ├── sources.ts                 # Content fetchers (Wikipedia, HN, Reddit, ZenQuotes, news)
│       ├── store.ts                   # Zustand store (topics, bookmarks, engagements, theme)
│       ├── story-body.ts              # Body text without the headline repeated (as in the app)
│       ├── story-engine.ts            # No-repeat engine: same-event matching, seen history, merging
│       ├── supabase.ts                # Supabase client (browser + server)
│       ├── theme.ts                   # System / Light / Dark rules and the before-paint script
│       ├── types.ts                   # RawContent, ProcessedCard, category maps
│       └── wikipedia-quality.ts       # Drops Wikipedia disambiguation pages
├── assets/og/                         # Newsreader Bold (SIL OFL) for the share preview picture
├── android/                           # Native Android app (see android/README.md)
│   └── plaxlabs_logo.png             # App logo
├── supabase-schema.sql               # Full database schema
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── postcss.config.js
```

## 🚀 Deploy to Vercel

1. Push to GitHub — Vercel auto-deploys on every push to `main`
2. Add environment variables in **Vercel → Project → Settings → Environment Variables**:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Custom domain: **Vercel → Settings → Domains** → add `plaxlabs.com`

## 🗄️ Database

Three tables with Row Level Security (RLS):

| Table | Purpose | RLS Policy |
|-------|---------|------------|
| `user_profiles` | Topics, streak, cards read, onboarding state | Users read/write own row only |
| `bookmarks` | Saved cards with title, category, content preview | Users CRUD own bookmarks only |
| `engagements` | Per-card analytics (time, completion, shares) | Users insert/read own only |

- Auto-created on signup via Postgres trigger
- Reading streak managed by `update_reading_streak()` RPC function
- Full schema in `supabase-schema.sql`

## 📊 How It Works

```
User opens app
    │
    ├─ Anyone, first visit or not → public News feed (no sign-up wall, no topic quiz)
    │     Topics → pick some → For you opens;  Account → optional Google sign-in
    │
    └─ Load cached cards for this feed instantly (news ≤ 2 h old, other topics ≤ 24 h),
       minus what the reader has already seen
                     │
                     └─ Background fetch: GET /api/feed?categories=...   (first page: no exclude list)
                            │   newer stories → swapped in only while the reader has not moved,
                            │   otherwise offered as a "New stories" button
                            │
                            ├─ Cache hit? → Return cached cards
                            │
                            └─ Cache miss? → Fetch in parallel, each source limited to 8 s:
                                   ├─ Wikipedia (12 random + 5 On This Day)
                                   ├─ Hacker News (15 from top/new/best)
                                   ├─ ZenQuotes (10 quotes)
                                   └─ Reddit (12 subreddits, 5 posts each), news feeds, and more
                                         │
                                         ├─ Deduplicate by title
                                         ├─ Categorize content
                                         ├─ Generate stable IDs
                                         ├─ Filter by user's categories
                                         │   ├─ 1. Exact match
                                         │   ├─ 2. Related categories
                                         │   └─ 3. All cards (fallback)
                                         └─ Cache 5 min → return to client
                                               │
                                               └─ Client merge (story-engine.ts): unseen stories first, one
                                                  per event; seen ones held back behind the "all caught up" card.
                                                  Reaching the end asks for older pages (exclude ≤ 200 ids, up to
                                                  3 attempts) before saying there is nothing new
```

## 📄 License

MIT © Plax Labs
