# Plax — TikTok for Readers

> Swipe through knowledge. Bite-sized content for curious minds.

A short-form reading platform that delivers personalized microessays, quotes, explainers, and fascinating facts — optimized for addictive, distraction-free reading.

## 🚀 Live

**[plaxlabs.com](https://plaxlabs.com)**

## ✨ Features

### Core Experience
- **📱 TikTok-style swipe** — Vertical full-screen cards with spring animations (drag, keyboard, scroll wheel)
- **🧠 Personalized feed** — Learns your interests from engagement (time spent, bookmarks, completion rate)
- **🎯 16 topic categories** — Science, Technology, Philosophy, Psychology, History, Finance, Space, Programming, Books, Health, Math, Nature, Art, Physics, Business, Language
- **🔖 Bookmarks** — Save cards with instant animated feedback, synced to cloud when signed in
- **♾️ Infinite scroll** — Auto-fetches more content as you approach the end of your card stack
- **🌙 Dark mode** — Fully dark UI optimized for comfortable reading

### Content Sources (All Free, No API Keys Required)
- **Wikipedia** — Random articles + "On This Day" historical facts
- **Hacker News** — Trending tech/startup stories from top, new, and best feeds
- **Reddit** — TIL, ELI5, Showerthoughts, science, space, history, philosophy, and more (12 subreddits)
- **ZenQuotes** — Curated quotes from thinkers and leaders

### Authentication & Cloud Sync
- **Google & GitHub OAuth** via Supabase Auth
- **Cloud-synced bookmarks** — Save on any device, access everywhere
- **Reading streaks** — Daily streak tracking with automatic reset logic
- **Engagement analytics** — Per-card time tracking, completion rates, category preferences
- **Profile page** — Stats, top interests, bookmarks, account management

### AI Summarization
- **Google Gemini 2.5 Flash** (primary) — Content summarization and quiz generation
- **Groq GPT-OSS 120B** (fallback) — Automatic failover if Gemini is unavailable

### Smart Feed Logic
- **Related category expansion** — If you pick "Programming", you also get Technology/Science/Math content
- **3-tier filtering** — Exact match → related categories → all cards (never returns empty)
- **Client-side deduplication** — By card ID and title, across sessions
- **Server-side deduplication** — By title before processing
- **Stable card IDs** — Same article always generates the same ID (deterministic hashing)
- **Exclude-already-seen** — Client sends seen IDs to server so they're skipped

## 🛠 Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 16.x |
| **UI** | React + Tailwind CSS | 19.x / 4.x |
| **Animations** | Framer Motion | 12.x |
| **State** | Zustand (persisted to localStorage) | 5.x |
| **Auth & DB** | Supabase (Auth + Postgres + RLS) | 2.x |
| **AI (Primary)** | Google Gemini 2.5 Flash | via @google/generative-ai |
| **AI (Fallback)** | Groq (GPT-OSS 120B) | via groq-sdk |
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
│   │   ├── page.tsx                   # Main page (Onboarding or Feed)
│   │   ├── api/
│   │   │   ├── feed/route.ts          # Content feed API (Node.js runtime)
│   │   │   └── summarize/route.ts     # AI summarization API (Edge runtime)
│   │   ├── auth/
│   │   │   └── callback/route.ts      # Supabase OAuth callback handler
│   │   └── profile/
│   │       └── page.tsx               # User profile, stats, bookmarks
│   ├── components/
│   │   ├── AuthProvider.tsx           # Supabase auth context (user, session)
│   │   ├── AuthProviderWrapper.tsx    # Conditionally wraps app with auth
│   │   ├── Card.tsx                   # Content card (typography, actions, bookmark)
│   │   ├── CloudSync.tsx              # Invisible bridge: Zustand ↔ Supabase
│   │   ├── Feed.tsx                   # Swipeable feed (drag, keyboard, scroll)
│   │   ├── NavBar.tsx                 # Top nav (logo, search, auth dropdown)
│   │   └── Onboarding.tsx             # Topic selection wizard (min 3 topics)
│   └── lib/
│       ├── ai.ts                      # Gemini/Groq summarization & quiz gen
│       ├── cache.ts                   # In-memory server cache (Map-based)
│       ├── cloud-sync.ts              # Supabase CRUD: prefs, bookmarks, engagements
│       ├── database.types.ts          # Supabase generated types
│       ├── sample-data.ts             # CardData type + personalization helpers
│       ├── sources.ts                 # Content fetchers (Wikipedia, HN, Reddit, ZenQuotes)
│       ├── store.ts                   # Zustand store (topics, bookmarks, engagements)
│       ├── supabase.ts                # Supabase client (browser + server)
│       └── types.ts                   # RawContent, ProcessedCard, category maps
├── public/
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
    ├─ First visit? → Onboarding (pick ≥3 topics) → Save to Zustand + Cloud
    │
    └─ Returning? → Load cached cards from localStorage instantly
                     │
                     └─ Background fetch: GET /api/feed?categories=...&exclude=...
                            │
                            ├─ Cache hit? → Return cached cards
                            │
                            └─ Cache miss? → Fetch in parallel:
                                   ├─ Wikipedia (12 random + 5 On This Day)
                                   ├─ Hacker News (15 from top/new/best)
                                   ├─ ZenQuotes (10 quotes)
                                   └─ Reddit (12 subreddits, 5 posts each)
                                         │
                                         ├─ Deduplicate by title
                                         ├─ Categorize content
                                         ├─ Generate stable IDs
                                         ├─ Filter by user's categories
                                         │   ├─ 1. Exact match
                                         │   ├─ 2. Related categories
                                         │   └─ 3. All cards (fallback)
                                         └─ Cache 5 min → return to client
```

## 📄 License

MIT © Plax Labs
