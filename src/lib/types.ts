// ─── Content Source Types ───

export interface RawContent {
  title: string
  content: string
  url?: string
  author?: string
  source: string
  category: string
}

export interface ProcessedCard {
  id: string
  type: 'microessay' | 'quote' | 'explainer' | 'fact' | 'did-you-know'
  title?: string
  content: string
  author?: string
  source?: string
  sourceUrl?: string
  category: string
  readTime: string
  emoji?: string
  fetchedAt: number
  aiEnhanced?: boolean
}

// ─── Category mapping for sources ───
export const CATEGORY_MAP: Record<string, string> = {
  // Reddit subreddits
  'todayilearned': 'science',
  'explainlikeimfive': 'science',
  'science': 'science',
  'space': 'space',
  'askscience': 'science',
  'AskScience': 'science',
  'philosophy': 'philosophy',
  'psychology': 'psychology',
  'history': 'history',
  'programming': 'programming',
  'technology': 'technology',
  'books': 'books',
  'personalfinance': 'finance',
  'futurology': 'technology',
  'Futurology': 'technology',
  'Showerthoughts': 'philosophy',
  'LifeProTips': 'psychology',
  'YouShouldKnow': 'science',
  // Topic-specific subreddits (added for better niche coverage)
  'Health': 'health',
  'nutrition': 'health',
  'Fitness': 'health',
  'suggestmeabook': 'books',
  'literature': 'books',
  'Economics': 'finance',
  'investing': 'finance',
  'finance': 'finance',
  'Entrepreneur': 'business',
  'business': 'business',
  'startups': 'business',
  'math': 'math',
  'learnmath': 'math',
  'Physics': 'physics',
  'Art': 'art',
  'design': 'art',
  'nature': 'nature',
  'EarthPorn': 'nature',
  'languagelearning': 'language',
  'etymology': 'language',
  'artificial': 'technology',
  'MachineLearning': 'technology',
  'coding': 'programming',
  // Wikipedia categories
  'Biology': 'science',
  'Mathematics': 'math',
  'Technology': 'technology',
  'Psychology': 'psychology',
  'Nature': 'nature',
}

// Topic → extra subreddits to fetch when the user selects that topic. Lets the
// feed pull genuinely on-topic content for niche picks (health, books, finance,
// business, art, language, math) instead of leaning on random Wikipedia/quotes.
export const TOPIC_SUBREDDITS: Record<string, string[]> = {
  science: ['science', 'AskScience', 'todayilearned'],
  technology: ['technology', 'Futurology', 'artificial', 'MachineLearning'],
  philosophy: ['philosophy', 'Showerthoughts'],
  psychology: ['psychology', 'LifeProTips'],
  history: ['history', 'todayilearned'],
  finance: ['personalfinance', 'investing', 'finance'],
  space: ['space', 'AskScience'],
  programming: ['programming', 'coding'],
  books: ['books', 'suggestmeabook', 'literature'],
  health: ['Health', 'nutrition', 'Fitness'],
  math: ['math', 'learnmath'],
  nature: ['nature', 'EarthPorn', 'science'],
  art: ['Art', 'design'],
  physics: ['Physics', 'AskScience'],
  business: ['Entrepreneur', 'business', 'startups'],
  language: ['languagelearning', 'etymology'],
}

// Wikipedia search seed terms per topic. Used by fetchWikipediaByTopics to pull
// genuinely on-topic articles (Wikipedia is never IP-blocked, unlike Reddit), so
// niche picks like health / finance / books get real relevant content.
export const TOPIC_WIKI_QUERIES: Record<string, string[]> = {
  science: ['scientific discovery', 'biology', 'chemistry', 'evolution', 'genetics', 'neuroscience'],
  technology: ['artificial intelligence', 'emerging technology', 'robotics', 'semiconductor', 'renewable energy'],
  philosophy: ['philosophy', 'ethics', 'existentialism', 'ancient philosophy', 'philosophy of mind'],
  psychology: ['cognitive psychology', 'human behavior', 'cognitive bias', 'human memory', 'emotion'],
  history: ['ancient civilization', 'world history', 'medieval history', 'ancient history', 'historical empire'],
  finance: ['personal finance', 'investing', 'stock market', 'economics', 'compound interest'],
  space: ['solar system', 'black hole', 'space exploration', 'Milky Way galaxy', 'exoplanet'],
  programming: ['programming language', 'computer science', 'algorithm', 'software engineering', 'data structure'],
  books: ['classic literature', 'famous novel', 'literary award', 'poetry', 'notable author'],
  health: ['human nutrition', 'public health', 'mental health', 'disease prevention', 'physical fitness'],
  math: ['mathematics', 'famous theorem', 'number theory', 'geometry', 'notable mathematician'],
  nature: ['ecology', 'wildlife', 'natural phenomenon', 'biodiversity', 'ecosystem'],
  art: ['art movement', 'famous painting', 'renaissance art', 'modern art', 'sculpture'],
  physics: ['quantum mechanics', 'theory of relativity', 'particle physics', 'thermodynamics', 'astrophysics'],
  business: ['entrepreneurship', 'startup company', 'business strategy', 'marketing', 'management'],
  language: ['linguistics', 'etymology', 'language family', 'writing system', 'grammar'],
}

// Topic → keyword for real-time news (Event Registry). Only topics where fresh
// headlines genuinely help are included; the rest lean on evergreen sources.
export const TOPIC_NEWS_KEYWORD: Record<string, string> = {
  technology: 'technology',
  programming: 'software development',
  science: 'scientific research',
  space: 'space exploration',
  finance: 'financial markets',
  business: 'business',
  health: 'health',
  physics: 'physics',
}

// Topic → Guardian section (open-platform.theguardian.com). The Guardian's
// editorial sections give high-quality, well-written coverage across nearly every
// topic — a big quality lift over generic Wikipedia. Only active when
// GUARDIAN_API_KEY is set. Sections are the Guardian's real section IDs.
export const TOPIC_GUARDIAN_SECTION: Record<string, string> = {
  science: 'science',
  technology: 'technology',
  programming: 'technology',
  space: 'science',
  books: 'books',
  art: 'artanddesign',
  business: 'business',
  finance: 'money',
  health: 'society',
  nature: 'environment',
  history: 'culture',
  philosophy: 'books',
  music: 'music',
  physics: 'science',
}

// Hindi Wikipedia search seed terms per topic (Devanagari). Used for the Hindi
// feed so content is natively in Hindi, on-topic, and relevance-ranked.
export const TOPIC_WIKI_QUERIES_HI: Record<string, string[]> = {
  science: ['वैज्ञानिक खोज', 'जीव विज्ञान', 'रसायन विज्ञान', 'विकासवाद', 'आनुवंशिकी'],
  technology: ['कृत्रिम बुद्धिमत्ता', 'प्रौद्योगिकी', 'रोबोटिक्स', 'अक्षय ऊर्जा', 'इंटरनेट'],
  philosophy: ['दर्शनशास्त्र', 'नैतिकता', 'भारतीय दर्शन', 'तर्कशास्त्र', 'अस्तित्ववाद'],
  psychology: ['मनोविज्ञान', 'मानव व्यवहार', 'संज्ञानात्मक मनोविज्ञान', 'भावना', 'स्मृति'],
  history: ['प्राचीन सभ्यता', 'भारत का इतिहास', 'मध्यकालीन इतिहास', 'विश्व इतिहास', 'साम्राज्य'],
  finance: ['व्यक्तिगत वित्त', 'निवेश', 'शेयर बाज़ार', 'अर्थशास्त्र', 'बैंकिंग'],
  space: ['सौर मंडल', 'ब्लैक होल', 'अंतरिक्ष अन्वेषण', 'आकाशगंगा', 'ग्रह'],
  programming: ['प्रोग्रामिंग भाषा', 'कंप्यूटर विज्ञान', 'एल्गोरिथ्म', 'सॉफ्टवेयर', 'डेटा संरचना'],
  books: ['हिन्दी साहित्य', 'प्रसिद्ध उपन्यास', 'कविता', 'साहित्य', 'लेखक'],
  health: ['पोषण', 'सार्वजनिक स्वास्थ्य', 'मानसिक स्वास्थ्य', 'योग', 'रोग'],
  math: ['गणित', 'प्रमेय', 'संख्या सिद्धांत', 'ज्यामिति', 'बीजगणित'],
  nature: ['पारिस्थितिकी', 'वन्यजीव', 'जैव विविधता', 'प्रकृति', 'पर्यावरण'],
  art: ['कला', 'चित्रकला', 'भारतीय कला', 'मूर्तिकला', 'संगीत'],
  physics: ['भौतिक विज्ञान', 'क्वांटम यांत्रिकी', 'सापेक्षता', 'ऊष्मागतिकी', 'खगोल भौतिकी'],
  business: ['उद्यमिता', 'व्यवसाय', 'विपणन', 'प्रबंधन', 'स्टार्टअप'],
  language: ['भाषा विज्ञान', 'व्युत्पत्ति', 'भाषा परिवार', 'व्याकरण', 'लिपि'],
}

export const EMOJI_MAP: Record<string, string> = {
  science: '🔬',
  technology: '💻',
  philosophy: '🤔',
  psychology: '🧠',
  history: '📜',
  finance: '💰',
  space: '🚀',
  programming: '⚡',
  books: '📚',
  health: '🏥',
  math: '📐',
  nature: '🌿',
  art: '🎨',
  physics: '⚛️',
  business: '📈',
  language: '🗣️',
  general: '💡',
}
