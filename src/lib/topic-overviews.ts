// What each topic page says about its subject: two short paragraphs of Plax's own writing, so that no topic page is only a list of bullet
// points and a paragraph that is the same on all of them. Each ends by pointing to a guide in Learn where there is one. Kept apart from
// lib/seo.ts, which also feeds the sitemap and the Open Graph cards, and tested in guides.test.mjs (every topic has one, of a real length).
export const TOPIC_OVERVIEWS: Record<string, string[]> = {
  science: [
    "This section follows research and discovery across biology, chemistry, earth science and medicine: a new finding, a result that overturns an older idea, or a clear explanation of how something we already know works. Stories are short summaries of reports from science publishers and news outlets, each linked to the original.",
    "A single study is a step, not a conclusion. When you read a science story, look at how many people or samples were studied, whether the result was in humans or in animals, and whether other teams have found the same thing. Our guide to how science works explains how claims are tested and checked.",
  ],
  technology: [
    "Technology stories cover the products, platforms and policies that shape daily life: phones and chips, the internet and cloud services, artificial intelligence, security, and the businesses behind them. The feed brings together short summaries from technology publishers, with a link to each original.",
    "Technology news moves quickly and is often promotional, so it pays to separate what has shipped from what has only been announced, and what has been measured from what has been claimed. To understand the ideas under the headlines, start with our guides to how the internet works and how AI chatbots work.",
  ],
  philosophy: [
    "Philosophy asks the questions that other subjects take for granted: what we can know, what makes an action right, what a good life is, what a mind is. The ideas in this section come from the long conversation among thinkers in India, Greece, China, the Islamic world and Europe, and from the debates of today.",
    "These are ideas to try on, not answers to memorise. A good habit is to state a view in its strongest form before you argue against it. Our introduction to Stoicism shows one ancient school and the practices that it offered.",
  ],
  psychology: [
    "Psychology studies how people think, feel and behave: memory, habit, motivation, emotion, and the mistakes that our minds make in predictable ways. The stories here summarise research reports and explainers on those themes.",
    "Psychology is a young science, and it has had its own corrections: some famous findings have not held up when other teams repeated them. Treat a single result as a lead, and look for findings that have been repeated. Our guide to cognitive biases shows how some of the best-supported findings apply to the way we read the news.",
  ],
  history: [
    "History is the record of how we got here. This section brings short pieces on the events, people and ideas of the past, from ancient civilisations and empires to the modern world, with attention to what the evidence shows and where historians disagree.",
    "Good history is careful about its sources: who wrote them, when and why. For a place to start with the deep past of South Asia, read our guide to the Indus Valley Civilisation, one of the world's first urban cultures.",
  ],
  finance: [
    "Finance covers money in everyday life and in the economy: saving, borrowing, inflation, interest rates, taxes, banking and the policies that govern them. The feed draws on business and finance publishers in India and abroad, and summarises their reports in a few lines.",
    "Plax is news and explanation, not advice. Rates, rules and taxes change, and your situation is your own. To understand the terms that headlines use, see our guides to inflation, the repo rate and the Union Budget.",
  ],
  stocks: [
    "Stocks follows the markets: company results, share prices, indices, public offerings and the economic news that moves them, in India and in other markets. The feed reads market news from publishers in several countries, summarises each story in a few lines and links to the original.",
    "Market news reports what happened, not what will happen, and nothing here is a recommendation to buy or sell. To read the numbers with confidence, start with our guides to the Sensex and the Nifty, how an IPO works in India and the P/E ratio.",
  ],
  space: [
    "Space covers launches, missions, telescopes and discoveries about the planets, stars and galaxies, including the work of ISRO and other space agencies. Stories are short summaries from space and science publishers and from agencies such as NASA, each linked to the original.",
    "A great deal of spaceflight comes down to one fact: reaching orbit is a problem of speed, not of height. Our guide to how rockets reach orbit explains why, and what the numbers in a launch headline mean.",
  ],
  programming: [
    "Programming is about telling computers what to do: languages, tools, software design, and the practices that make software reliable and secure. The section gathers short summaries from developer and technology publishers and from discussions among programmers.",
    "If you are new to the field, the best way in is to understand a few ideas well. Our guides to what an API is and to how the internet works cover two ideas that come up everywhere in software.",
  ],
  books: [
    "Books is a section for readers: new releases, classics, prizes, and ideas about writing and reading, from India and from the world. Stories and notes come from literary publications and from open libraries such as Open Library and Project Gutenberg.",
    "If you do not know where to begin with Indian writing, our guide to twelve writers and a first book for each is a place to start, from Tagore and Premchand to prize-winning novelists and writers in translation.",
  ],
  health: [
    "Health covers medicine, nutrition, fitness, sleep and public health, drawn from health and science publishers. Each story explains in a few lines what a new study or report found, with a link to the original.",
    "Health news is where a headline can do the most harm if it is read too eagerly: a study in mice is not a treatment, and one result is not advice. Nothing on Plax replaces a doctor. Our guide to how vaccines work shows how we explain a medical idea in general terms.",
  ],
  math: [
    "Mathematics is the language of patterns, and this section brings short pieces on ideas, puzzles, proofs and the people who made them, from arithmetic and geometry to probability and the mathematics behind computers.",
    "Mathematical ideas often run against intuition. One of the most useful is Bayes' theorem, which shows how evidence should change your mind, and why a positive result on a test for a rare condition can still be more likely a false alarm than not.",
  ],
  nature: [
    "Nature covers the living world and the planet: ecosystems, weather and climate, oceans, forests and wildlife, and the effects of people on them. Stories come from science and earth-science publishers and are summarised in a few lines.",
    "India's year is set by the monsoon. Our guide to how the Indian monsoon works explains what drives it, what the forecasters' words mean, and how to read a rainfall report.",
  ],
  art: [
    "Art and design cover painting, sculpture, architecture, photography, typography and the way things are made to be used and looked at. Stories draw on the open collections of museums, such as the Metropolitan Museum of Art, and on writing about art and design.",
    "Design is the art of directing attention. Our guide to visual hierarchy shows how size, contrast and space decide what you notice first, using a news card as its example.",
  ],
  physics: [
    "Physics asks how the universe works at every scale, from particles and light to energy, forces and the cosmos. Stories summarise research reports and explain their results in plain language.",
    "Many physics ideas begin with an everyday question. Why the sky is blue is a good one: our guide shows how scattering explains blue skies, red sunsets and white clouds.",
  ],
  business: [
    "Business follows companies, markets, startups and the economy: how firms make money, how they are funded, and the decisions that shape industries. The feed draws on business publishers in India and abroad.",
    "Funding and valuation headlines are easy to read wrongly. Our guide to how startup funding rounds work explains seed, Series A and later rounds, valuation and dilution, and what a headline number leaves out.",
  ],
  language: [
    "Language covers how we speak and write: words and their histories, grammar, scripts, translation, and the languages of India and the world. Stories and etymologies come from linguistics and reference sources.",
    "Plax is read in English and Hindi, and Hindi is written in the Devanagari script. Our guide to how Devanagari works explains its logic, from consonants that carry a vowel to letters that join together.",
  ],
}
