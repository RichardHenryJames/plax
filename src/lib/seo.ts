// ────────────────────────────────────────────────────────────────────────────
// SEO configuration — single source of truth for site metadata + topic landing
// page copy. Kept independent of the client Zustand store so server components
// (sitemap, topic pages) stay lightweight.
// ────────────────────────────────────────────────────────────────────────────

// The canonical host. Set NEXT_PUBLIC_SITE_URL in the environment to override.
// Default is the www host because the live site + Google Search Console property
// are www (the apex 307-redirects to www). The sitemap URLs, canonical tags,
// robots directives and OG URLs must all match this exact host so Google can
// fetch the sitemap and index the correct URLs (no cross-host / redirect issues).
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.plaxlabs.com'
).replace(/\/$/, '')

export const SITE = {
  name: 'Plax',
  shortName: 'Plax',
  title: 'Plax — Get Smarter Every Day',
  tagline: 'TikTok for readers',
  description:
    'Plax is a personalized knowledge feed for curious minds. Swipe through bite-sized, AI-summarized insights on science, technology, AI, startups, finance, philosophy and more — get smarter in five minutes a day.',
  url: SITE_URL,
  ogImage: `${SITE_URL}/plaxlabs_logo.png`,
  twitter: '@plaxlabs',
  locale: 'en_US',
  keywords: [
    'Plax',
    'plaxlabs',
    'knowledge feed',
    'learn every day',
    'bite-sized learning',
    'AI summaries',
    'microlearning',
    'reading app',
    'science news',
    'technology news',
    'startup news',
    'daily insights',
  ],
}

export interface TopicSeo {
  id: string
  label: string
  emoji: string
  /** ~150-char meta description */
  description: string
  /** 2–3 sentence intro shown as page copy */
  intro: string
  /** Scannable "what you'll discover" bullets */
  discover: string[]
  /** Extra keyword phrases this page should target */
  keywords: string[]
}

// Evergreen, human-written copy for each topic so the landing pages carry real
// indexable content (not thin/auto-generated boilerplate).
export const TOPIC_SEO: TopicSeo[] = [
  {
    id: 'science',
    label: 'Science',
    emoji: '🔬',
    description:
      'The latest science, discoveries and research — explained simply. Bite-sized science insights you can read in a minute on Plax.',
    intro:
      'From breakthrough research to the everyday science that shapes how the world works, this feed distills complex discoveries into clear, memorable insights. No jargon, no fluff — just the ideas worth knowing.',
    discover: [
      'Fresh discoveries from biology, chemistry and the natural sciences',
      'Why new research matters and what actually changed',
      'Counterintuitive findings that reshape how you see the world',
    ],
    keywords: ['science news', 'science facts', 'science explained', 'research summaries'],
  },
  {
    id: 'technology',
    label: 'Technology',
    emoji: '💻',
    description:
      'Technology and AI news that matters, summarized. Keep up with the tools, trends and breakthroughs shaping the future — in minutes.',
    intro:
      'Technology moves fast. This feed keeps you ahead with sharp, bite-sized takes on AI, gadgets, the internet and the companies redefining how we live and work.',
    discover: [
      'What is genuinely new in AI and computing — minus the hype',
      'How emerging tools change the way we live and work',
      'Signal over noise from across the tech world',
    ],
    keywords: ['technology news', 'AI news', 'tech trends', 'artificial intelligence'],
  },
  {
    id: 'philosophy',
    label: 'Philosophy',
    emoji: '🤔',
    description:
      'Big ideas and timeless wisdom, made accessible. Explore philosophy, ethics and the questions that matter in bite-sized reads.',
    intro:
      'The best philosophy is practical. This feed surfaces timeless ideas and modern thinking on how to reason well, live well and make sense of a complicated world.',
    discover: [
      'Timeless ideas from the great thinkers, distilled',
      'Mental models and frameworks for clearer thinking',
      'Ethical questions that sharpen how you decide',
    ],
    keywords: ['philosophy', 'stoicism', 'mental models', 'critical thinking'],
  },
  {
    id: 'psychology',
    label: 'Psychology',
    emoji: '🧠',
    description:
      'How the mind works — memory, motivation, habits and behavior — explained in quick, practical insights on Plax.',
    intro:
      'Understand yourself and others better. This feed turns psychology research into practical insights on decisions, emotions, habits and the quirks that drive human behavior.',
    discover: [
      'The science of habits, motivation and focus',
      'Cognitive biases that quietly shape your choices',
      'Practical takeaways you can use the same day',
    ],
    keywords: ['psychology', 'human behavior', 'cognitive bias', 'productivity psychology'],
  },
  {
    id: 'history',
    label: 'History',
    emoji: '📜',
    description:
      'History that reads like a story. Fascinating events, people and turning points — bite-sized and unforgettable.',
    intro:
      'History is full of stories worth knowing. This feed brings you the pivotal moments, surprising details and forgotten figures that shaped the world we live in.',
    discover: [
      'Turning points that changed the course of history',
      '“On this day” moments and surprising origins',
      'The context behind events you thought you knew',
    ],
    keywords: ['history facts', 'world history', 'historical events', 'on this day'],
  },
  {
    id: 'finance',
    label: 'Finance',
    emoji: '💰',
    description:
      'Money, markets and investing — made clear. Build financial literacy with bite-sized insights on Plax.',
    intro:
      'Financial literacy, one insight at a time. This feed breaks down markets, investing, money psychology and the economic forces that affect your everyday decisions.',
    discover: [
      'Investing and market concepts without the jargon',
      'The psychology of money and better decisions',
      'How economic shifts affect your everyday life',
    ],
    keywords: ['finance', 'investing basics', 'personal finance', 'financial literacy'],
  },
  {
    id: 'space',
    label: 'Space',
    emoji: '🚀',
    description:
      'Space, astronomy and the cosmos — explained. From black holes to Mars missions, wonder in bite-sized reads.',
    intro:
      'Look up and go deep. This feed covers the universe in accessible pieces — planets, stars, missions and the mind-bending science of everything beyond Earth.',
    discover: [
      'The latest from space missions and exploration',
      'How the universe works, explained simply',
      'Awe-inspiring facts about planets, stars and beyond',
    ],
    keywords: ['space', 'astronomy', 'space exploration', 'cosmos facts'],
  },
  {
    id: 'programming',
    label: 'Programming',
    emoji: '⚡',
    description:
      'Programming and software engineering insights, summarized. Level up with bite-sized reads on code, tools and best practices.',
    intro:
      'For people who build. This feed distills software engineering — languages, tools, architecture and the trends worth your attention — into quick, high-signal reads.',
    discover: [
      'Trends and tools across modern software development',
      'Concepts and best practices, explained clearly',
      'What the engineering community is talking about',
    ],
    keywords: ['programming', 'software engineering', 'coding', 'developer news'],
  },
  {
    id: 'books',
    label: 'Books',
    emoji: '📚',
    description:
      'Big ideas from great books, distilled. Key takeaways and lessons worth remembering — in bite-sized reads on Plax.',
    intro:
      'Read more by reading smarter. This feed surfaces the most valuable ideas from books across genres, so you can absorb the lessons that stick.',
    discover: [
      'Key ideas and takeaways from notable books',
      'Lessons you can apply to work and life',
      'Your next great read, one insight at a time',
    ],
    keywords: ['book summaries', 'book ideas', 'reading', 'book takeaways'],
  },
  {
    id: 'health',
    label: 'Health',
    emoji: '🏥',
    description:
      'Health, fitness and longevity — backed by evidence. Practical, bite-sized insights to help you live better on Plax.',
    intro:
      'Feel better with evidence, not fads. This feed translates health and longevity research into practical insights on sleep, nutrition, movement and well-being.',
    discover: [
      'Evidence-based takes on nutrition, sleep and fitness',
      'Longevity and well-being, minus the hype',
      'Small habits with an outsized impact',
    ],
    keywords: ['health', 'longevity', 'nutrition', 'wellness'],
  },
  {
    id: 'math',
    label: 'Mathematics',
    emoji: '📐',
    description:
      'The beauty of mathematics, made intuitive. Elegant ideas, patterns and problem-solving in bite-sized reads.',
    intro:
      'Math is more beautiful than school made it seem. This feed reveals the elegant patterns and surprising ideas behind numbers, logic and the structure of everything.',
    discover: [
      'Elegant ideas and famous problems, made intuitive',
      'The hidden math behind everyday things',
      'Patterns that reveal how the world is built',
    ],
    keywords: ['mathematics', 'math concepts', 'math explained', 'problem solving'],
  },
  {
    id: 'nature',
    label: 'Nature',
    emoji: '🌿',
    description:
      'The wonders of the natural world — plants, animals and ecosystems — in bite-sized, fascinating reads on Plax.',
    intro:
      'The natural world is endlessly surprising. This feed explores life on Earth — creatures, ecosystems and the astonishing ways nature works.',
    discover: [
      'Astonishing facts about animals and ecosystems',
      'How life adapts and thrives in every corner of Earth',
      'The science of the living world, simplified',
    ],
    keywords: ['nature', 'wildlife', 'biology facts', 'ecosystems'],
  },
  {
    id: 'art',
    label: 'Art & Design',
    emoji: '🎨',
    description:
      'Art, design and creativity — explored. Movements, masters and ideas that shape how we see, in bite-sized reads.',
    intro:
      'See the world with a designer’s eye. This feed covers art and design — the movements, makers and ideas that shape culture and creativity.',
    discover: [
      'Art movements and masters, in context',
      'Design thinking and the principles behind great work',
      'How creativity shapes the world around us',
    ],
    keywords: ['art', 'design', 'art history', 'creativity'],
  },
  {
    id: 'physics',
    label: 'Physics',
    emoji: '⚛️',
    description:
      'Physics — from quantum to cosmic — made intuitive. Understand the laws that govern reality in bite-sized reads.',
    intro:
      'The rules that run reality, made graspable. This feed explains physics from the quantum to the cosmic — relativity, energy, particles and the fabric of the universe.',
    discover: [
      'Big ideas from quantum mechanics to relativity',
      'The physics behind everyday phenomena',
      'Mind-bending concepts, explained without the math wall',
    ],
    keywords: ['physics', 'quantum physics', 'physics explained', 'how the universe works'],
  },
  {
    id: 'business',
    label: 'Business',
    emoji: '📈',
    description:
      'Business and startups, decoded. Strategy, growth and the stories behind great companies — in bite-sized reads on Plax.',
    intro:
      'Learn how great companies actually work. This feed distills business and startup thinking — strategy, growth, leadership and the moves that separate winners from the rest.',
    discover: [
      'Startup and strategy lessons that transfer',
      'The stories and decisions behind great companies',
      'How markets, products and growth really work',
    ],
    keywords: ['business', 'startups', 'entrepreneurship', 'business strategy'],
  },
  {
    id: 'language',
    label: 'Language',
    emoji: '🗣️',
    description:
      'Language and words — origins, meaning and the science of communication — in bite-sized, delightful reads.',
    intro:
      'Words are worth wondering about. This feed explores language — its origins, quirks and the science of how we communicate and understand each other.',
    discover: [
      'Word origins and the stories behind language',
      'How communication shapes thought and culture',
      'Delightful linguistic facts worth sharing',
    ],
    keywords: ['language', 'etymology', 'linguistics', 'words'],
  },
]

export function getTopicSeo(id: string): TopicSeo | undefined {
  return TOPIC_SEO.find((t) => t.id === id)
}
