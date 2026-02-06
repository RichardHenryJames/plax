# Plax — TikTok for Readers

> Swipe through knowledge. Bite-sized content for curious minds.

A short-form reading platform that delivers personalized microessays, quotes, explainers, and fascinating facts — optimized for addictive, distraction-free reading.

## 🚀 Live Demo

**[plaxlabs.com](https://plaxlabs.com)**

## ✨ Features

- **📱 TikTok-style swipe** — Vertical full-screen cards with smooth spring animations
- **🧠 Personalized feed** — Learns your interests from engagement (time spent, bookmarks, completion)
- **📚 Rich content sources** — Wikipedia, Hacker News, Reddit, curated quotes + AI summarization
- **🎯 Topic preferences** — Choose from 16 categories during onboarding
- **🔖 Bookmarks** — Save cards for later with instant feedback
- **🌙 Dark mode** — Optimized for comfortable reading
- **⚡ Minimal latency** — Edge runtime + aggressive caching
- **💸 Free stack** — Runs entirely on free tiers

## 🛠 Tech Stack

| Layer | Technology | Cost |
|-------|------------|------|
| **Framework** | Next.js 15 (App Router) | Free |
| **UI** | React 19 + Tailwind CSS v4 | Free |
| **Animations** | Framer Motion | Free |
| **State** | Zustand (persisted) | Free |
| **AI** | Google Gemini Flash | Free (1500 req/day) |
| **AI Fallback** | Groq (Llama 3.1) | Free (14k req/day) |
| **Hosting** | Vercel (Edge Runtime) | Free |
| **Domain** | plaxlabs.com | Owned |

**Total monthly cost: $0**

## 📡 Content Sources (All Free)

| Source | What | API Limits |
|--------|------|------------|
| **Wikipedia** | Random articles + "On This Day" facts | Unlimited |
| **Hacker News** | Top trending tech/startup stories | Unlimited |
| **Reddit** | r/todayilearned, r/explainlikeimfive, r/science | ~60 req/min |
| **Quotable** | Curated quotes from thinkers & leaders | Unlimited |
| **Static fallback** | 25+ hand-curated high-quality cards | N/A |

## 🏃‍♂️ Quick Start

```bash
# Clone
git clone https://github.com/yourusername/plax.git
cd plax

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🔑 Environment Variables

```env
# Required for AI summarization
GEMINI_API_KEY=your_gemini_api_key

# Optional fallback
GROQ_API_KEY=your_groq_api_key
```

Get your free API keys:
- **Gemini**: [aistudio.google.com/apikeys](https://aistudio.google.com/apikeys)
- **Groq**: [console.groq.com](https://console.groq.com)

## 📁 Project Structure

```
plax/
├── src/
│   ├── app/
│   │   ├── globals.css          # Tailwind + custom styles
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Main app (onboarding or feed)
│   │   └── api/
│   │       ├── feed/route.ts    # Content feed endpoint
│   │       └── summarize/route.ts # AI summarization endpoint
│   ├── components/
│   │   ├── Card.tsx             # Content card with animations
│   │   ├── Feed.tsx             # Swipeable feed container
│   │   ├── NavBar.tsx           # Top navigation
│   │   └── Onboarding.tsx       # Topic selection wizard
│   └── lib/
│       ├── store.ts             # Zustand state (prefs, bookmarks, engagement)
│       ├── sample-data.ts       # Static fallback content
│       ├── sources.ts           # Content fetchers (Wikipedia, HN, Reddit)
│       ├── cache.ts             # In-memory caching layer
│       ├── types.ts             # TypeScript types
│       └── ai.ts                # AI summarization (Gemini/Groq)
├── .env.local                   # API keys (gitignored)
├── .env.example                 # Template for env vars
└── package.json
```

## 🚀 Deploy to Vercel

1. Push code to GitHub
2. Connect repo to [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
4. Deploy!

**Custom domain**: Add `plaxlabs.com` in Vercel → Settings → Domains

## 📊 Performance & Caching

```
Request Flow:

BROWSER → VERCEL CDN (global, <50ms) → EDGE RUNTIME → CACHE
                                                        ↓
                                               [HIT] Return cached
                                               [MISS] Fetch sources
                                                        ↓
                                        Wikipedia/HN/Reddit/Quotes
                                                        ↓
                                              Cache for 5-15 min
                                                        ↓
                                              Return + store
```

**Caching TTLs:**
- Wikipedia: 5 minutes
- Hacker News: 10 minutes
- Reddit: 15 minutes
- Quotes: 30 minutes
- Static fallback: Always available

**Result**: First paint <1s, feed loads <200ms

## 🧠 Personalization

```javascript
// Engagement score per category
score = (timeSpent / 1000) * 1     // seconds on card
      + (bookmarked ? 15 : 0)       // strong signal
      + (completed ? 5 : 0)         // read fully

// Feed composition
70% → preference-weighted (high score categories first)
30% → serendipity (random for discovery)
```

All data stored locally in browser. No server-side tracking.

## 🛣 Roadmap

- [x] MVP with static content
- [x] Smooth swipe animations
- [x] Topic preferences & onboarding
- [x] Engagement tracking & personalization
- [x] Live content from Wikipedia, HN, Reddit
- [x] AI summarization (Gemini + Groq)
- [x] Caching layer for minimal latency
- [ ] Supabase auth
- [ ] Cloud-synced bookmarks
- [ ] Mobile app (React Native)
- [ ] Reading streaks

## 📄 License

MIT © Plax Labs
