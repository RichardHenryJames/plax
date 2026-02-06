export interface CardData {
  id: string
  type: 'microessay' | 'quote' | 'explainer' | 'book-summary' | 'fact' | 'code' | 'did-you-know'
  title?: string
  content: string
  author?: string
  source?: string
  sourceUrl?: string
  category: string
  readTime: string
  emoji?: string
}

// Massive content library — rich, knowledge-dense cards
export const allCards: CardData[] = [
  // ─── SCIENCE ───
  {
    id: 's1',
    type: 'microessay',
    title: 'Your Brain Cleans Itself While You Sleep',
    content: `Your brain has a cleaning system called the glymphatic system that only activates during deep sleep.

Throughout the day, neurons produce metabolic waste — toxic proteins like beta-amyloid that accumulate between cells. During sleep, your brain cells actually shrink by 60%, creating channels for cerebrospinal fluid to flush out these toxins.

Studies at the University of Rochester found that chronic sleep deprivation leads to measurable brain shrinkage, particularly in the prefrontal cortex — your center for decision-making and impulse control.

**The terrifying part:** this damage isn't fully reversible.

Sleep isn't rest. It's maintenance.`,
    author: 'Neuroscience Research',
    source: 'University of Rochester Medical Center',
    category: 'science',
    readTime: '45s',
    emoji: '🧠',
  },
  {
    id: 's2',
    type: 'did-you-know',
    title: 'Octopuses Have 3 Hearts and Blue Blood',
    content: `An octopus has three hearts: two pump blood to the gills, while the third pumps it to the rest of the body.

Their blood is blue because it uses copper-based hemocyanin instead of iron-based hemoglobin like ours. This is actually more efficient for transporting oxygen in cold, low-oxygen deep-sea environments.

Even more remarkable: **two-thirds of their neurons are in their arms**, not their brain. Each arm can taste, touch, and make decisions independently.

When an octopus loses an arm, the detached arm can still react to stimuli for up to an hour.

They're basically eight semi-independent creatures in one body.`,
    source: 'Marine Biology Research',
    category: 'science',
    readTime: '40s',
    emoji: '🐙',
  },
  {
    id: 's3',
    type: 'explainer',
    title: 'Why Mirrors Flip Left-Right But Not Up-Down',
    content: `This is one of physics' most famous "simple" questions that stumps most people.

The truth: **mirrors don't flip left and right at all.** They flip front and back.

When you face a mirror, your left hand is still on the left side of the reflection, and your right hand is on the right. What flips is the z-axis — your front becomes your back.

We perceive it as a left-right flip because when we imagine "turning around" to face someone, we rotate around our vertical axis. But the mirror doesn't rotate — it reflects.

If you lie down sideways in front of a mirror, it would seem to flip "up-down" instead.

**The "flip" is a feature of human intuition, not physics.**`,
    category: 'science',
    readTime: '50s',
    emoji: '🪞',
  },

  // ─── PHILOSOPHY ───
  {
    id: 'p1',
    type: 'quote',
    content: `"He who has a why to live can bear almost any how."`,
    author: 'Friedrich Nietzsche',
    source: 'Twilight of the Idols, 1889',
    category: 'philosophy',
    readTime: '5s',
    emoji: '💭',
  },
  {
    id: 'p2',
    type: 'microessay',
    title: 'The Ship of Theseus — Are You Still You?',
    content: `If you replace every plank of a ship, one by one, is it still the same ship?

Now consider: your body replaces nearly every cell over 7-10 years. Your stomach lining renews every few days. Red blood cells last about 4 months. Even your skeleton is fully replaced every decade.

**Are you the same person you were 10 years ago?**

Philosophers have debated this for 2,500 years. Heraclitus said "No man ever steps in the same river twice." The Buddhists call it anattā — "no-self."

Modern neuroscience adds another layer: your memories themselves are reconstructed each time you recall them, slightly different each time.

You're not a thing. You're a pattern that persists through constant change.`,
    category: 'philosophy',
    readTime: '55s',
    emoji: '🚢',
  },
  {
    id: 'p3',
    type: 'quote',
    content: `"The unexamined life is not worth living."`,
    author: 'Socrates',
    source: 'Plato\'s Apology, 399 BC',
    category: 'philosophy',
    readTime: '5s',
    emoji: '🏛️',
  },

  // ─── PSYCHOLOGY ───
  {
    id: 'psy1',
    type: 'explainer',
    title: 'The Dunning-Kruger Effect',
    content: `The less you know about something, the more confident you tend to feel about it.

This isn't about intelligence — it's a universal cognitive bias:

**Peak of Mount Stupid:** Beginners feel confident because they can't see what they don't know. Everything seems simple.

**Valley of Despair:** As you learn more, you realize how deep the rabbit hole goes. Confidence crashes.

**Slope of Enlightenment:** Experts slowly regain confidence, but it's earned — built on genuine understanding.

The paradox: "It's simple" usually means "I don't understand it." "It's complicated" usually means "I do."

The cure? **Intellectual humility.** Assume you're probably at peak Dunning-Kruger about something right now.`,
    category: 'psychology',
    readTime: '50s',
    emoji: '📊',
  },
  {
    id: 'psy2',
    type: 'microessay',
    title: 'Why You Can\'t Tickle Yourself',
    content: `Your cerebellum predicts the sensory consequences of your own actions.

When you reach to grab a cup, your brain predicts what it will feel like before your hand touches it. This prediction mechanism is so good that it cancels out expected sensations.

That's why you can't tickle yourself — your brain knows exactly what's coming and dampens the sensation.

**Schizophrenia breaks this system.** People with schizophrenia can often tickle themselves because the prediction mechanism is impaired. They experience their own actions as if someone else is performing them.

This same mechanism explains why we can't notice our own blind spot, why we don't feel our clothes after putting them on, and why your tongue doesn't feel "in the way" in your mouth.

Until now. You're welcome.`,
    category: 'psychology',
    readTime: '50s',
    emoji: '🤯',
  },

  // ─── SPACE ───
  {
    id: 'sp1',
    type: 'fact',
    title: 'The Pale Blue Dot',
    content: `On February 14, 1990, Voyager 1 turned its camera back toward Earth from 6 billion kilometers away.

The result: a photograph where Earth appears as a tiny speck — less than a single pixel — suspended in a sunbeam.

Carl Sagan wrote:

"Look again at that dot. That's here. That's home. That's us. On it everyone you love, everyone you know, everyone you ever heard of, every human being who ever was, lived out their lives."

**Every war. Every act of kindness. Every triumph. Every heartbreak.** All on a mote of dust suspended in a sunbeam.

The photo contained no new scientific data. But it changed how humanity sees itself.`,
    author: 'Carl Sagan',
    source: 'Pale Blue Dot, 1994',
    category: 'space',
    readTime: '50s',
    emoji: '🌍',
  },
  {
    id: 'sp2',
    type: 'did-you-know',
    title: 'A Day on Venus Is Longer Than Its Year',
    content: `Venus takes 243 Earth days to rotate once on its axis. But it only takes 225 Earth days to orbit the Sun.

So a single day on Venus is longer than its entire year.

Even stranger: **Venus rotates backwards.** If you could stand on Venus (you'd die instantly from 900°F heat and crushing atmospheric pressure), the Sun would rise in the west and set in the east.

Scientists believe a massive ancient impact may have flipped Venus upside down, reversing its rotation.

Venus is often called Earth's "twin" because of its similar size. But it's more like Earth's **evil twin** — with sulfuric acid clouds, surface temperatures hot enough to melt lead, and atmospheric pressure 90 times Earth's.`,
    category: 'space',
    readTime: '50s',
    emoji: '🪐',
  },

  // ─── FINANCE ───
  {
    id: 'f1',
    type: 'explainer',
    title: 'Compound Interest: The Eighth Wonder',
    content: `Einstein allegedly called it "the most powerful force in the universe." Here's why:

**Simple interest:** Earn on original amount only.
$1,000 at 10% = $100/year forever.

**Compound interest:** Earn on your earnings.
Year 1: $1,000 → $1,100
Year 5: $1,610
Year 20: $6,727
Year 40: **$45,259**

The same $1,000 becomes 45x larger — not from bigger returns, but because **gains build on gains.**

The real insight: **time beats amount.**

Starting with $100/month at age 22 beats $500/month starting at age 35.

The best financial decision isn't picking the right stock. It's starting early and being patient.

Warren Buffett made 99% of his wealth after age 50. Time is the ingredient.`,
    category: 'finance',
    readTime: '55s',
    emoji: '📈',
  },

  // ─── PROGRAMMING ───
  {
    id: 'prog1',
    type: 'code',
    title: 'Why [] === [] Is False in JavaScript',
    content: `In JavaScript, arrays are objects. When you compare with ===, you're comparing memory references, not values.

\`\`\`javascript
[] === []     // false — different objects
[1,2] === [1,2]  // false — still different objects

const a = [1,2]
const b = a
a === b        // true — same reference
\`\`\`

Each \`[]\` creates a NEW object in memory. Even with identical contents, they're different objects at different addresses.

**How to actually compare arrays:**

\`\`\`javascript
// Method 1: JSON (simple but slow)
JSON.stringify(a) === JSON.stringify(b)

// Method 2: Every (fast)
a.length === b.length && 
  a.every((val, i) => val === b[i])
\`\`\`

In JavaScript, \`===\` checks **identity** for objects, not **equality**. This trips up every developer at least once.`,
    category: 'programming',
    readTime: '45s',
    emoji: '⚡',
  },
  {
    id: 'prog2',
    type: 'microessay',
    title: 'The Real Reason Git Was Created in 2 Weeks',
    content: `In 2005, the Linux kernel team lost access to BitKeeper, their version control system, after a licensing dispute.

Linus Torvalds was furious. He needed something fast, distributed, and able to handle a project with thousands of contributors.

No existing tool met his requirements, so he built one himself.

**Git's first commit was on April 3, 2005.** By April 18 — just 15 days later — Git could host its own source code.

Torvalds' design goals were radical for the time:
• **Speed** — operations should be nearly instant
• **Distributed** — every copy is a full backup
• **Non-linear** — thousands of parallel branches
• **Integrity** — every change is cryptographically verified

Today, Git is used by 100M+ developers. A tool born from spite became the backbone of modern software.`,
    category: 'programming',
    readTime: '55s',
    emoji: '🔧',
  },

  // ─── BOOKS ───
  {
    id: 'b1',
    type: 'book-summary',
    title: 'Atomic Habits — The Core Idea',
    content: `James Clear's argument in 3 sentences:

**1. Habits compound.** Getting 1% better daily = 37x improvement in a year. 1% worse = nearly zero.

**2. Systems > Goals.** Winners and losers share the same goals. The difference is their systems.

**3. Identity > Behavior.** Don't aim to "read more." Become "a reader." Behavior follows identity.

The 4 Laws of Behavior Change:
→ **Make it obvious** (cue)
→ **Make it attractive** (craving)
→ **Make it easy** (response)
→ **Make it satisfying** (reward)

To break bad habits, invert:
→ Make it invisible
→ Make it unattractive
→ Make it difficult
→ Make it unsatisfying

The most practical self-help book ever written.`,
    author: 'James Clear',
    source: 'Atomic Habits (2018)',
    category: 'books',
    readTime: '1m',
    emoji: '📖',
  },

  // ─── HISTORY ───
  {
    id: 'h1',
    type: 'microessay',
    title: 'Cleopatra Lived Closer to the iPhone Than the Pyramids',
    content: `The Great Pyramid of Giza was completed around 2560 BC.

Cleopatra was born in 69 BC.

The iPhone was released in 2007 AD.

**Time gap: Pyramids → Cleopatra = ~2,500 years**
**Time gap: Cleopatra → iPhone = ~2,076 years**

Cleopatra literally lived closer in time to us than to the builders of the pyramids she admired.

This fact breaks people's brains because we compress "ancient history" into a single mental bucket. But ancient Egypt spanned 3,000+ years — longer than the entire period from Jesus to today.

When Cleopatra visited the pyramids, they were already ancient ruins, as old to her as the Roman Empire is to us.

History is much deeper than we intuitively feel.`,
    category: 'history',
    readTime: '50s',
    emoji: '⏳',
  },
  {
    id: 'h2',
    type: 'did-you-know',
    title: 'Oxford University Is Older Than the Aztec Empire',
    content: `Oxford University started teaching in 1096 AD.

The Aztec civilization founded Tenochtitlán (modern Mexico City) in 1325 AD.

That means Oxford was already 229 years old when the Aztec Empire began.

More timeline-breaking facts:

**Nintendo** was founded in 1889 — when Jack the Ripper was still a recent event.

**Harvard** was founded before calculus was discovered (Harvard: 1636, Newton's calculus: 1687).

**Woolly mammoths** were still alive when the pyramids were being built (~2000 BC).

**The fax machine** was invented the same year as the Oregon Trail migration (1843).

Our mental timeline of history is almost always wrong.`,
    category: 'history',
    readTime: '50s',
    emoji: '🏛️',
  },

  // ─── HEALTH ───
  {
    id: 'he1',
    type: 'explainer',
    title: 'Why Cold Showers Actually Work',
    content: `Cold water exposure triggers a cascade of measurable physiological changes:

**Norepinephrine surge:** Cold water causes a 200-300% increase in norepinephrine, a neurotransmitter that improves focus, attention, and mood. This is comparable to some ADHD medications.

**Brown fat activation:** Humans have "brown fat" that burns calories to generate heat. Cold exposure activates it, increasing metabolic rate by up to 350%.

**Vagal tone improvement:** Cold water stimulates the vagus nerve, improving heart rate variability — a key marker of stress resilience.

**Inflammation reduction:** Athletes have used ice baths for decades. Studies confirm cold exposure reduces inflammatory markers (IL-6, TNF-α).

**The catch:** benefits plateau after 2-3 minutes. Longer isn't better.

11 minutes per week total, spread across 2-4 sessions, seems to be the sweet spot according to Dr. Andrew Huberman's research review.`,
    category: 'health',
    readTime: '1m',
    emoji: '🥶',
  },

  // ─── PHYSICS ───
  {
    id: 'ph1',
    type: 'microessay',
    title: 'Time Literally Moves Slower for Your Feet',
    content: `Einstein's general relativity predicts that time moves slower in stronger gravitational fields.

This isn't a thought experiment. It's measurable reality.

In 2010, NIST physicists used the world's most precise atomic clocks and confirmed: a clock just 30 centimeters higher ticks faster than one below it.

**Your head ages faster than your feet.** Over a 79-year lifetime, your head ages about 90 billionths of a second more than your feet.

GPS satellites experience this too. They're further from Earth's gravity, so their clocks tick about 38 microseconds faster per day. Without relativity corrections, GPS would drift by ~10 km daily.

Einstein predicted this in 1915. We couldn't measure it until 2010. He was right to 18 decimal places.

**The universe doesn't have a single clock. Time is local.**`,
    category: 'physics',
    readTime: '55s',
    emoji: '⏰',
  },

  // ─── NATURE ───
  {
    id: 'n1',
    type: 'did-you-know',
    title: 'Trees Talk to Each Other Underground',
    content: `Beneath every forest is a vast network of fungal threads called mycorrhizae — nicknamed the "Wood Wide Web."

Through this network, trees:
→ **Share nutrients** — mother trees send carbon to seedlings in shade
→ **Send warnings** — when attacked by insects, trees release chemical signals through the network, and neighboring trees boost their defenses
→ **Support the sick** — healthy trees channel resources to struggling neighbors

Ecologist Suzanne Simard discovered that a single "mother tree" can be connected to hundreds of younger trees, nurturing them through underground fungal links.

When a mother tree is dying, she dumps her carbon into the network — a final gift to the next generation.

Forests aren't collections of individuals competing for light. They're **cooperative superorganisms** connected underground.`,
    category: 'nature',
    readTime: '55s',
    emoji: '🌳',
  },

  // ─── MATHEMATICS ───
  {
    id: 'm1',
    type: 'explainer',
    title: 'The Birthday Paradox',
    content: `How many people do you need in a room before there's a 50% chance two share a birthday?

Most people guess 183 (half of 365). The actual answer: **23 people.**

With just 23 people, there's a 50.7% probability of a shared birthday. With 70 people, it's 99.9%.

Why is our intuition so wrong?

Because we think about one specific person matching with others. But the question is about **any pair** matching.

With 23 people, there are 253 possible pairs (23 × 22 ÷ 2). Each pair has a small chance of matching, but 253 small chances add up fast.

This is why:
→ Hash collisions happen sooner than expected
→ DNA evidence isn't as unique as courts assume
→ Coincidences feel magical but are mathematically inevitable

**Combinatorics makes the improbable inevitable.**`,
    category: 'math',
    readTime: '55s',
    emoji: '🎂',
  },

  // ─── BUSINESS ───
  {
    id: 'biz1',
    type: 'microessay',
    title: 'Why Blockbuster Said No to Netflix for $50M',
    content: `In the year 2000, Netflix was a struggling DVD-by-mail company burning cash. Co-founder Reed Hastings flew to Dallas and offered to sell Netflix to Blockbuster for $50 million.

Blockbuster's CEO, John Antioco, reportedly laughed them out of the room.

At the time, it seemed reasonable. Blockbuster had:
→ 9,000 stores worldwide
→ $6 billion in annual revenue
→ 65,000+ employees

Netflix had massive losses and an uncertain future.

But Blockbuster missed the shift from **atoms to bits.** They saw themselves as a real estate company. Netflix saw the future of content delivery.

By 2010, Blockbuster was bankrupt.
Today, Netflix is worth $250+ billion.

**The lesson:** The biggest threat is never the competitor who looks like you. It's the one that looks nothing like you.`,
    category: 'business',
    readTime: '55s',
    emoji: '🎬',
  },

  // ─── ART ───
  {
    id: 'a1',
    type: 'microessay',
    title: 'Why the Mona Lisa Is Actually Revolutionary',
    content: `The Mona Lisa isn't famous for being beautiful. It's famous for breaking every rule of its era.

Before Leonardo, portraits were:
→ In profile (side view)
→ Against flat backgrounds
→ Posed rigidly with clear outlines

Leonardo did the opposite:
→ **Three-quarter pose** — she faces you directly
→ **Sfumato technique** — no hard outlines, edges dissolve into shadow
→ **Atmospheric perspective** — the landscape behind her fades with distance
→ **The ambiguous expression** — her smile changes depending on where you look

But here's the part most people miss: **her eyes follow you around the room.** This isn't an illusion — Leonardo precisely calculated the geometry so the gaze works from any angle.

The Mona Lisa wasn't just a painting. It was a **proof of concept** that art could capture the complexity of being human.`,
    category: 'art',
    readTime: '55s',
    emoji: '🎨',
  },

  // ─── More quotes ───
  {
    id: 'q1',
    type: 'quote',
    content: `"We are what we repeatedly do. Excellence, then, is not an act, but a habit."`,
    author: 'Will Durant',
    source: 'Summarizing Aristotle',
    category: 'philosophy',
    readTime: '5s',
    emoji: '✨',
  },
  {
    id: 'q2',
    type: 'quote',
    content: `"The best time to plant a tree was 20 years ago. The second best time is now."`,
    author: 'Chinese Proverb',
    source: 'Ancient Wisdom',
    category: 'philosophy',
    readTime: '5s',
    emoji: '🌱',
  },
  {
    id: 'q3',
    type: 'quote',
    content: `"Any sufficiently advanced technology is indistinguishable from magic."`,
    author: 'Arthur C. Clarke',
    source: 'Profiles of the Future, 1962',
    category: 'technology',
    readTime: '5s',
    emoji: '🪄',
  },
  {
    id: 'q4',
    type: 'quote',
    content: `"In the middle of difficulty lies opportunity."`,
    author: 'Albert Einstein',
    category: 'physics',
    readTime: '5s',
    emoji: '💡',
  },
]

// Deterministic shuffle using a seed — same seed = same order
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr]
  let s = seed
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647 // Park-Miller PRNG
    const j = s % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Session seed — stable for the lifetime of the tab, so scroll-up shows same cards
const SESSION_SEED = typeof window !== 'undefined'
  ? Math.floor(Math.random() * 2147483647)
  : 42

// Get cards filtered and sorted by user preferences
export function getPersonalizedFeed(
  selectedTopics: string[],
  engagementScores: Record<string, number>,
  bookmarkedIds: string[] = []
): CardData[] {
  let cards = [...allCards]

  // Filter by selected topics if any
  if (selectedTopics.length > 0) {
    cards = cards.filter((c) => selectedTopics.includes(c.category))
  }

  // Score each card
  const scored = cards.map((card) => {
    const engScore = engagementScores[card.category] || 0
    const bookmarkPenalty = bookmarkedIds.includes(card.id) ? -10 : 0
    return { card, score: engScore + bookmarkPenalty }
  })

  // Sort by score (high engagement categories first)
  scored.sort((a, b) => b.score - a.score)

  // Within same-score tiers, apply deterministic shuffle for variety
  // Group into tiers (cards with similar scores)
  const result: CardData[] = []
  let tierStart = 0
  for (let i = 1; i <= scored.length; i++) {
    // New tier when score differs by more than 5 or end of array
    if (i === scored.length || Math.abs(scored[i].score - scored[tierStart].score) > 5) {
      const tier = scored.slice(tierStart, i).map((s) => s.card)
      const shuffledTier = seededShuffle(tier, SESSION_SEED + tierStart)
      result.push(...shuffledTier)
      tierStart = i
    }
  }

  return result
}
