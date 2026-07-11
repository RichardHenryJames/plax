import { RawContent, CATEGORY_MAP, TOPIC_SUBREDDITS, TOPIC_WIKI_QUERIES, TOPIC_WIKI_QUERIES_HI, TOPIC_NEWS_KEYWORD } from './types'

// ─── HTML Cleaning (for HN and Reddit raw content) ───

function stripHtml(html: string): string {
  return html
    // Replace <p> and <br> with newlines
    .replace(/<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove all other HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Wikipedia Random Articles (truly random each call) ───

export async function fetchWikipediaContent(count: number = 12, lang: string = 'en'): Promise<RawContent[]> {
  const results: RawContent[] = []
  const host = `https://${lang}.wikipedia.org`

  // ONE request for `count` random articles via generator=random — far fewer HTTP
  // calls than N parallel /random/summary fetches. Those bursts get rate-limited
  // (429) from shared serverless IPs (Vercel) → an EMPTY Wikipedia feed. A single
  // batched call is reliable. (extracts API caps at 20 intros per query.)
  try {
    const grnlimit = Math.min(Math.max(count, 1), 20)
    const url =
      `${host}/w/api.php?action=query&format=json` +
      `&generator=random&grnnamespace=0&grnlimit=${grnlimit}` +
      '&prop=extracts|info|description&exintro=1&explaintext=1&inprop=url&origin=*'
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
    })
    if (r.ok) {
      const data = await r.json()
      const pages = data?.query?.pages || {}
      for (const key of Object.keys(pages)) {
        const p = pages[key]
        const extract: string = (p?.extract || '').trim()
        // Skip stubs. For non-English wikis the English-tuned quality regexes
        // don't apply, so just require a reasonable length.
        if (!extract || extract.length < 120) continue
        if (lang === 'en' && isLowQualityWikipedia(p.description || '', p.title || '', extract)) continue
        results.push({
          title: p.title,
          content: trimToSentence(extract, 700),
          url: p.fullurl || `${host}/?curid=${p.pageid}`,
          source: 'Wikipedia',
          category: lang === 'en' ? categorizeWikipedia(p.description || p.title) : 'general',
        })
      }
    }
  } catch (error) {
    console.error('Wikipedia random error:', error)
  }

  // "On this day" is English-only in our fetch → skip for other languages.
  if (lang !== 'en') return results

  // Fetch "On this day" facts
  try {
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()

    const response = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/${month}/${day}`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.selected) {
        data.selected.slice(0, 5).forEach((event: any) => {
          if (event.text) {
            results.push({
              title: `On This Day in ${event.year}`,
              content: event.text,
              url: event.pages?.[0]?.content_urls?.desktop?.page,
              source: 'Wikipedia - On This Day',
              category: 'history',
            })
          }
        })
      }
    }
  } catch (error) {
    console.error('Wikipedia On This Day error:', error)
  }

  return results
}

function categorizeWikipedia(description: string): string {
  const d = description.toLowerCase()
  const has = (...w: string[]) => w.some((x) => d.includes(x))

  // Order matters: most specific first, broad science last, then neutral general.
  if (has('space', 'planet', 'astronom', 'galaxy', 'cosmos', 'orbit', 'spacecraft', 'satellite', 'nebula', 'asteroid', 'comet', 'nasa')) return 'space'
  if (has('quantum', 'relativity', 'particle physic', 'thermodynam', 'astrophysic', 'physicist', 'physics')) return 'physics'
  if (has('theorem', 'algebra', 'geometry', 'calculus', 'number theory', 'topolog', 'mathematic', 'mathematician')) return 'math'
  if (has('philosoph', 'ethics', 'metaphysic', 'epistemolog', 'existential')) return 'philosophy'
  if (has('psycholog', 'cognit', 'behaviou', 'mental health', 'emotion', 'perception')) return 'psychology'
  if (has('medic', 'disease', 'medicine', 'nutrition', 'clinical', 'hospital', 'health', 'anatomy', 'therapy', 'vaccine', 'pathogen', 'epidemi')) return 'health'
  if (has('software', 'programming', 'algorithm', 'internet', 'database', 'cryptograph', 'source code', 'operating system', 'compiler', 'computing', 'computer science')) return 'programming'
  if (has('artificial intelligence', 'machine learning', 'robot', 'semiconductor', 'electronic', 'technolog', 'gadget', 'computer hardware')) return 'technology'
  if (has('econom', 'business', 'financ', 'stock market', 'banking', 'trade', 'currency', 'investment')) return 'finance'
  if (has('novel', 'literature', 'literary', 'poetry', 'poem', 'book', 'author', 'writer', 'fiction')) return 'books'
  if (has('painting', 'painter', 'sculpt', 'artist', 'art movement', 'museum', 'architecture', 'design', 'photograph', 'film', 'cinema', 'music', 'composer')) return 'art'
  if (has('linguist', 'language', 'etymolog', 'grammar', 'dialect', 'alphabet', 'writing system')) return 'language'
  if (has('biolog', 'species', 'animal', 'plant', 'ecolog', 'botan', 'zoolog', 'wildlife', 'forest', 'ecosystem', 'organism', 'evolution', 'genetic')) return 'nature'
  if (has('histor', 'war', 'empire', 'ancient', 'dynasty', 'revolution', 'battle', 'medieval', 'century', 'kingdom', 'civilization', 'archaeolog')) return 'history'
  if (has('chemistr', 'chemical', 'molecul', 'atom', 'reaction', 'scientif', 'research', 'laborator', 'science', 'element', 'compound', 'enzyme')) return 'science'

  // Unclassifiable (misc events, objects, photos…) → neutral bucket that only
  // surfaces for no-topic browsers, never polluting a user's picked topic.
  return 'general'
}

// True for the boring random-Wikipedia stubs we don't want as reading cards:
// individual people, tiny geographic places, administrative units, sports/season
// pages, single crime/disaster events, and media/product entries. Uses the
// Wikidata short description (very reliable signal) plus title/extract heuristics.
// `allowNotablePeople` (used by topic search) keeps substantive historical/
// intellectual biographies (scientists, authors, leaders, artists) — which are
// premium on-topic content — while still dropping pop-culture/sports stubs.
function isLowQualityWikipedia(
  description: string,
  title: string,
  extract: string,
  opts: { allowNotablePeople?: boolean } = {}
): boolean {
  const d = description.toLowerCase()
  const head = extract.slice(0, 180)

  // Pop-culture / sports / entertainment people — ALWAYS dull for a knowledge
  // feed, regardless of the selected topic.
  if (/\b(footballer|football player|basketball player|baseball player|cricketer|rugby player|tennis player|golfer|athlete|swimmer|boxer|wrestler|cyclist|racing driver|racecar driver|jockey|sportsperson|actor|actress|singer|rapper|dj|drummer|guitarist|bassist|model|youtuber|streamer|influencer|tiktoker|reality (star|television personality)|television personality|beauty pageant|pornographic)\b/.test(d))
    return true

  // Substantive biographies (scientists, authors, leaders, artists…). These are
  // GREAT topic content (Einstein for physics, Darwin for science, an author for
  // books), so only filter them for the random feed — keep them in topic search.
  if (!opts.allowNotablePeople) {
    if (/\b(politician|senator|congressman|governor|mayor|minister|diplomat|composer|painter|sculptor|illustrator|photographer|architect|novelist|poet|playwright|author|writer|journalist|bishop|archbishop|priest|pastor|rabbi|imam|saint|monk|nun|general|colonel|admiral|soldier|officer|pilot|aviator|flying ace|lawyer|judge|physician|surgeon|nurse|businessperson|businessman|businesswoman|entrepreneur|ceo|chef|monarch|king|queen|emperor|prince|princess|duke|duchess|earl|nobleman|noblewoman|aristocrat|philosopher|scientist|physicist|chemist|biologist|mathematician|economist|historian|inventor|explorer|astronomer)\b/.test(d))
      return true
    if (/\bborn \d{3,4}\b/.test(d) || /\(\d{4}[-–]/.test(title)) return true
    if (/\(born \d|\(\d{3,4}\s*[–-]\s*\d{3,4}\)|\bb\.\s*\d{4}\b/i.test(head)) return true
    if (/\b(is|was) (a|an|the) [a-z-]+ (politician|writer|author|poet|painter|general|officer|bishop|saint|monarch|king|queen|emperor|businessman|businesswoman|lawyer|physician|philosopher|scientist|physicist|mathematician|economist|historian|inventor)\b/i.test(head))
      return true
  }

  // Place/geography openers in the extract (catches stubs whose Wikidata
  // description is empty — e.g. "Samowicze is a village in eastern Poland").
  if (/\b(is|was) (a|an) [a-z\s,'-]*?\b(village|hamlet|town|city|municipality|commune|comune|locality|settlement|county|district|province|region|neighbou?rhood|suburb|civil parish|rural locality|census-designated place|unincorporated community)\b/i.test(head))
    return true
  if (/\b(is|was) (a|an) [a-z\s,'-]*?\b(river|creek|stream|mountain|peak|hill|lake|reservoir|island|islet|bay|glacier|railway station|airport|airfield)\b/i.test(head))
    return true

  // Media / creative-work openers in the extract (catches albums, songs, films,
  // shows, games with empty Wikidata descriptions — e.g. "X is the ninth studio
  // album by…", "Y is a 2019 film…", "Z is a video game developed by…").
  if (/\b(is|was) (a|an|the) [a-z0-9\s,'-]*?\b(studio album|live album|compilation album|album|extended play|ep|song|single|soundtrack|mixtape)\b\s+(by|from|released|recorded)/i.test(head))
    return true
  if (/\b(is|was) (a|an|the) \d{4}\s+[a-z\s-]*?\b(film|movie|television film|documentary|short film)\b/i.test(head))
    return true
  if (/\b(is|was) (a|an|the) [a-z\s-]*?\b(television series|tv series|television sitcom|sitcom|miniseries|web series|anime television|drama series|reality (television|show)|video game|role-playing game|first-person shooter|comic book|manga|graphic novel)\b/i.test(head))
    return true

  // Geographic / administrative stubs ("village in India", "commune in France"…)
  if (/\b(village|hamlet|town|city|municipality|commune|comune|locality|settlement|county|district|province|prefecture|region|department|census-designated|unincorporated|neighborhood|suburb|civil parish|ward)\b.*\b(in|of)\b/.test(d))
    return true
  if (/\b(river|creek|stream|mountain|peak|hill|lake|reservoir|island|islet|bay|glacier|valley|railway station|metro station|airport|airfield|air base|highway|road|bridge)\b/.test(d))
    return true

  // Sports seasons, teams, competitions, and single events
  if (/\b(season|football club|f\.c\.|sports team|squad|roster|tournament|championship|league|olympic|world cup|grand prix)\b/.test(d))
    return true

  // Taxonomy / species stubs (a single moth species = boring card)
  if (/\b(genus|species|moth|beetle|spider|butterfly|fungus|mollusc|snail|orchid|plant in|family of)\b/.test(d))
    return true

  // Media & product entries (films, shows, albums, games, phones, companies…)
  if (/\b(film|movie|documentary|television series|tv series|tv program|sitcom|miniseries|web series|anime|manga|album|studio album|ep by|song by|single by|soundtrack|band|musical group|video game|board game|mobile app|software|operating system|programming library|smartphone|mobile phone|product|brand|manufacturer|company|corporation|automobile|car model|magazine|newspaper|comic|novel by)\b/.test(d))
    return true

  // Disambiguation & list pages
  if (/may refer to:?$/i.test(extract)) return true
  if (/\(disambiguation\)/i.test(title)) return true
  if (/^(List of|Lists of|Index of|Outline of|Glossary of) /i.test(title)) return true

  return false
}

// ─── Wikipedia topic search (on-topic articles for the user's selected topics) ───
// Reddit blocks datacenter IPs (Vercel), so niche topics need a reliable on-topic
// source. Wikipedia's search generator returns real articles matching a query and
// is never IP-blocked, so this guarantees relevant content for every picked topic.
export async function fetchWikipediaByTopics(
  categories: string[],
  perTopic: number = 5,
  lang: string = 'en'
): Promise<RawContent[]> {
  if (!categories.length) return []

  // Keep total Wikipedia search requests small (≤6) to avoid serverless-IP rate
  // limits, but give FOCUSED users more depth: with few topics we spend the
  // request budget on more seed terms per topic (more on-topic variety), and pull
  // more results per term. Many topics → 1 term each.
  const MAX_REQUESTS = 6
  const cats = categories.slice(0, MAX_REQUESTS)
  const termsPerTopic = Math.max(1, Math.min(3, Math.floor(MAX_REQUESTS / cats.length)))
  const perTermLimit = cats.length <= 2 ? 6 : perTopic
  // Hindi feed searches Hindi Wikipedia using Hindi seed terms.
  const queryMap = lang === 'hi' ? TOPIC_WIKI_QUERIES_HI : TOPIC_WIKI_QUERIES

  const perCat = await Promise.all(
    cats.map(async (category) => {
      const queries = queryMap[category]
      if (!queries || !queries.length) return [] as RawContent[]
      // Pick DISTINCT random seed terms so we don't get near-identical articles
      // from one term (e.g. five "Public Health Service" variants).
      const shuffled = [...queries].sort(() => Math.random() - 0.5)
      const nTerms = Math.min(termsPerTopic, shuffled.length)
      const terms = shuffled.slice(0, nTerms)
      const perTerm = Math.max(2, perTermLimit)
      const batches = await Promise.all(
        terms.map((term) => fetchWikiSearch(term, perTerm, category, lang))
      )
      return batches.flat()
    })
  )

  // Flatten + dedupe by title.
  const seen = new Set<string>()
  const merged: RawContent[] = []
  for (const arr of perCat) {
    for (const item of arr) {
      const k = item.title.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(item)
    }
  }
  return merged
}

// One Wikipedia full-text search → intro extracts, tagged with the given category.
async function fetchWikiSearch(
  term: string,
  limit: number,
  category: string,
  lang: string = 'en'
): Promise<RawContent[]> {
  const host = `https://${lang}.wikipedia.org`
  const offset = Math.floor(Math.random() * 8) // vary results across refreshes
  const url =
    `${host}/w/api.php?action=query&format=json` +
    '&generator=search&gsrnamespace=0&gsrsearch=' +
    encodeURIComponent(term) +
    `&gsrlimit=${limit}&gsroffset=${offset}` +
    '&prop=extracts|info|description&exintro=1&explaintext=1&inprop=url&redirects=1&origin=*'
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
    })
    if (!r.ok) return []
    const data = await r.json()
    const pages = data?.query?.pages
    if (!pages) return []
    const out: RawContent[] = []
    for (const key of Object.keys(pages)) {
      const p = pages[key]
      const extract: string = (p?.extract || '').trim()
      // Skip stubs, disambiguation, list, place & media entries, but KEEP notable
      // biographies. Quality regexes are English-tuned → only apply for en.
      if (!extract || extract.length < (lang === 'en' ? 140 : 100)) continue
      if (lang === 'en' && isLowQualityWikipedia(p.description || '', p.title || '', extract, { allowNotablePeople: true })) continue
      out.push({
        title: p.title,
        content: trimToSentence(extract, 700),
        url: p.fullurl || `${host}/?curid=${p.pageid}`,
        source: 'Wikipedia',
        category,
      })
    }
    return out
  } catch {
    return []
  }
}

// Trim text to <= max chars, cutting cleanly at the last sentence boundary.
function trimToSentence(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (lastStop > max * 0.5) return slice.slice(0, lastStop + 1)
  return slice.trim() + '…'
}

// ─── Hacker News (random slice from top + new + best stories) ───

export async function fetchHackerNews(count: number = 15): Promise<RawContent[]> {
  const results: RawContent[] = []

  try {
    // Top + best stories only (skip `newstories` — mostly unvetted, low-score
    // posts). These feeds carry the well-upvoted, substantive items.
    const feeds = ['topstories', 'beststories']
    const feedPromises = feeds.map((feed) =>
      fetch(`https://hacker-news.firebaseio.com/v0/${feed}.json`, { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : [])
        .catch(() => [])
    )
    const feedResults = await Promise.all(feedPromises)
    const allIds: number[] = [...new Set(feedResults.flat())] // merge & deduplicate IDs

    // Pick a RANDOM slice instead of always the first N — this is key for
    // freshness. Fetch extra candidates so the quality filter still yields ~count.
    const shuffled = allIds.sort(() => Math.random() - 0.5)
    const selectedIds = shuffled.slice(0, count * 3)

    // Fetch stories in parallel
    const storyPromises = selectedIds.map(async (id) => {
      try {
        const res = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { cache: 'no-store' }
        )
        return res.ok ? res.json() : null
      } catch {
        return null
      }
    })

    const stories = await Promise.all(storyPromises)

    stories.forEach((story) => {
      if (!story || !story.title || story.type !== 'story') return
      // Quality bar: well-upvoted stories only.
      if ((story.score || 0) < 40) return
      // Skip pure discussion/question threads ("Ask HN", polls) — they're not
      // readable insights. Keep "Show HN" (projects) and normal link stories.
      if (/^ask hn[:\s]/i.test(story.title) || story.type === 'poll') return
      // Need real substance: an external article OR self-text. Skip link-less
      // threads that would only yield the generic "trending discussion" filler.
      const hasText = typeof story.text === 'string' && story.text.length > 0
      if (!story.url && !hasText) return

      const cleanTitle = story.title.replace(/^show hn:\s*/i, '').trim()
      results.push({
        title: cleanTitle,
        content: hasText
          ? stripHtml(story.text)
          : `${cleanTitle} — a highly-upvoted story on Hacker News (${story.score} points, ${story.descendants || 0} comments). Tap “Read full story” for the full article.`,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        author: story.by,
        source: 'Hacker News',
        category: categorizeHN(story.title),
      })
    })
  } catch (error) {
    console.error('Hacker News fetch error:', error)
  }

  // Cap so HN doesn't over-weight the feed (we fetched extra candidates).
  return results.slice(0, count)
}

function categorizeHN(title: string): string {
  const t = title.toLowerCase()
  if (
    t.includes('rust') || t.includes('python') || t.includes('javascript') ||
    t.includes('typescript') || t.includes('code') || t.includes('programming') ||
    t.includes('compiler') || t.includes('git') || t.includes('linux') ||
    t.includes('api') || t.includes('database') || t.includes('sql') ||
    t.includes('open source') || t.includes('github') || t.includes('docker') ||
    t.includes('kubernetes') || t.includes('golang') || t.includes('java ') ||
    t.includes('c++') || t.includes('swift') || t.includes('react') ||
    t.includes('node') || t.includes('algorithm') || t.includes('debug') ||
    t.includes('server') || t.includes('deploy') || t.includes('framework') ||
    t.includes('library') || t.includes('engineer') || t.includes('developer') ||
    t.includes('backend') || t.includes('frontend') || t.includes('fullstack') ||
    t.includes('devops') || t.includes('bug') || t.includes('kernel') ||
    t.includes('cpu') || t.includes('gpu') || t.includes('wasm')
  )
    return 'programming'
  if (t.includes('ai') || t.includes('gpt') || t.includes('llm') || t.includes('machine learning') || t.includes('neural'))
    return 'technology'
  if (t.includes('startup') || t.includes('funding') || t.includes('vc') || t.includes('business'))
    return 'business'
  if (t.includes('crypto') || t.includes('bitcoin') || t.includes('finance')) return 'finance'
  if (t.includes('space') || t.includes('nasa') || t.includes('mars')) return 'space'
  if (t.includes('health') || t.includes('medical') || t.includes('brain')) return 'health'
  if (t.includes('science') || t.includes('research') || t.includes('study')) return 'science'
  return 'technology' // default for HN
}

// ─── ZenQuotes API (Free Quotes — replaces deprecated Quotable) ───
// Free, no API key, returns 50 quotes per request

export async function fetchQuotes(count: number = 5): Promise<RawContent[]> {
  const results: RawContent[] = []

  try {
    const response = await fetch('https://zenquotes.io/api/quotes', {
      cache: 'no-store',
    })

    if (!response.ok) return results
    const quotes = await response.json()

    if (Array.isArray(quotes)) {
      quotes.slice(0, count).forEach((quote: any) => {
        if (quote.q && quote.a) {
          results.push({
            title: '',
            content: `"${quote.q}"`,
            author: quote.a,
            source: 'ZenQuotes',
            category: 'philosophy',
          })
        }
      })
    }
  } catch (error) {
    console.error('ZenQuotes fetch error:', error)
  }

  return results
}

// ─── arXiv (recent academic papers, key-free Atom API) ───
// Adds genuine research depth for science/physics/math/tech topics. We fetch the
// latest papers in matching arXiv categories and turn the abstract into a card;
// the AI-enhance step later distils the dense abstract into a plain-language read.
const TOPIC_ARXIV: Record<string, string[]> = {
  physics: ['physics.gen-ph', 'astro-ph.CO', 'quant-ph', 'gr-qc'],
  math: ['math.HO', 'math.NT', 'math.GM'],
  space: ['astro-ph.EP', 'astro-ph.GA', 'astro-ph.SR'],
  science: ['q-bio.PE', 'physics.bio-ph', 'physics.hist-ph'],
  technology: ['cs.AI', 'cs.RO', 'cs.HC'],
  programming: ['cs.PL', 'cs.SE', 'cs.DS'],
}

export async function fetchArxiv(categories: string[]): Promise<RawContent[]> {
  const cats = categories.flatMap((c) => (TOPIC_ARXIV[c] || []).map((a) => ({ topic: c, arxiv: a })))
  if (cats.length === 0) return []
  // One search across the matching arXiv categories, newest first.
  const uniqueArxiv = [...new Set(cats.map((c) => c.arxiv))].slice(0, 6)
  const arxivToTopic = new Map(cats.map((c) => [c.arxiv, c.topic]))
  const search = uniqueArxiv.map((a) => `cat:${a}`).join(' OR ')
  const url =
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(search)}` +
    `&sortBy=submittedDate&sortOrder=descending&max_results=12`

  try {
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' } })
    if (!r.ok) return []
    const xml = await r.text()
    const out: RawContent[] = []
    // Lightweight Atom parse (no XML dep): split on <entry>.
    const entries = xml.split('<entry>').slice(1)
    for (const e of entries) {
      const title = decodeXml((e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim())
      const summary = decodeXml((e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim())
      const link = e.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim()
      const primaryCat = e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1]
      const author = decodeXml(e.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim() || '')
      if (!title || summary.length < 160) continue
      const cleanTitle = cleanLatex(title)
      const cleanSummary = cleanLatex(summary)
      // Skip papers that are STILL heavy with math notation after cleaning — they
      // read like garbage in a general-audience feed no matter how we frame them.
      if (mathDensity(cleanTitle) > 0.06 || mathDensity(cleanSummary) > 0.05) continue
      const topic = (primaryCat && arxivToTopic.get(primaryCat)) || arxivToTopic.get(uniqueArxiv[0]) || 'science'
      out.push({
        title: cleanTitle,
        content: cleanSummary.length > 800 ? cleanSummary.slice(0, 800) + '…' : cleanSummary,
        url: link,
        author: author ? `${author} et al.` : undefined,
        source: 'arXiv',
        category: topic,
      })
    }
    return out
  } catch (error) {
    console.error('arXiv fetch error:', error)
    return []
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// ─── LaTeX → readable plain text (for arXiv abstracts/titles) ───
// arXiv text is full of TeX: $\ell$, $\overline{A}_\ell(n)$, Tur\'an, \emph{x}.
// Rendered raw it looks like garbage. We convert accents + common symbols to real
// Unicode and strip the rest so the card reads like clean prose (the AI-enhance
// step then polishes it further).
const LATEX_SYMBOLS: Record<string, string> = {
  ell: 'ℓ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ',
  omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', infty: '∞', times: '×', cdot: '·',
  leq: '≤', geq: '≥', neq: '≠', approx: '≈', sim: '∼', pm: '±', to: '→', rightarrow: '→',
  leftarrow: '←', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫',
  in: '∈', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀', exists: '∃',
}
// Accent commands like \'a \"o \`e \^i \~n → precombined chars.
const LATEX_ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', n: 'ń', c: 'ć', s: 'ś', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', O: 'Ò' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  '~': { a: 'ã', n: 'ñ', o: 'õ', N: 'Ñ' },
}

export function cleanLatex(input: string): string {
  let s = input
  // Accents: \'a  \'{a}  \"o  \~n  etc.
  s = s.replace(/\\(['"`^~])\{?([a-zA-Z])\}?/g, (m, acc, ch) => LATEX_ACCENTS[acc]?.[ch] ?? ch)
  // Text-mode wrappers → keep inner text: \emph{x} \textbf{x} \textit{x} \mathrm{x} \mathbf{x} \text{x} \operatorname{x}
  s = s.replace(/\\(?:emph|textbf|textit|textrm|texttt|mathrm|mathbf|mathcal|mathbb|mathit|text|operatorname|boldsymbol)\s*\{([^{}]*)\}/g, '$1')
  // \overline{x} \hat{x} \tilde{x} \bar{x} \vec{x} → inner text
  s = s.replace(/\\(?:overline|underline|hat|tilde|bar|vec|dot|widehat|widetilde)\s*\{([^{}]*)\}/g, '$1')
  // \frac{a}{b} → a/b
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
  // \sqrt{x} → √x
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1')
  // Known symbol commands → Unicode.
  s = s.replace(/\\([a-zA-Z]+)/g, (m, name) => LATEX_SYMBOLS[name] ?? '')
  // Superscripts/subscripts: ^{n} _{i} → ^n _i ; drop the braces.
  s = s.replace(/[\^_]\s*\{([^{}]*)\}/g, (m, inner) => inner)
  s = s.replace(/([\^_])([a-zA-Z0-9])/g, '$2')
  // Remaining braces + $ math delimiters + stray backslashes.
  s = s.replace(/[{}$]/g, '').replace(/\\/g, '')
  // Tidy whitespace/punctuation.
  return s.replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s{2,}/g, ' ').trim()
}

// Fraction of characters that are still math-ish symbols — used to drop papers
// that are too notation-dense to read as prose.
function mathDensity(s: string): number {
  if (!s) return 0
  const mathChars = (s.match(/[$\\^_{}=<>+\/×·≤≥≠≈∑∏∫∂∇]/g) || []).length
  return mathChars / s.length
}

// ─── Project Gutenberg (real opening passages of classic books) ───
// For the Books topic we surface genuine literature. gutenberg.org blocks datacenter
// IPs (403 from Vercel) and Gutendex is Cloudflare-gated, so instead of a fragile
// runtime fetch we keep a curated catalog of famous public-domain works with their
// AUTHENTIC opening passages stored inline (verbatim, no invention). Fast, reliable,
// zero network dependency. The AI-enhance step frames WHY each book matters.
const GUTENBERG_CLASSICS: { id: number; title: string; author: string; opening: string }[] = [
  {
    id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen',
    opening:
      'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
  },
  {
    id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens',
    opening:
      'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair.',
  },
  {
    id: 2701, title: 'Moby Dick', author: 'Herman Melville',
    opening:
      'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.',
  },
  {
    id: 5200, title: 'Metamorphosis', author: 'Franz Kafka',
    opening:
      'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections.',
  },
  {
    id: 158, title: 'Emma', author: 'Jane Austen',
    opening:
      'Emma Woodhouse, handsome, clever, and rich, with a comfortable home and happy disposition, seemed to unite some of the best blessings of existence; and had lived nearly twenty-one years in the world with very little to distress or vex her.',
  },
  {
    id: 64317, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald',
    opening:
      'In my younger and more vulnerable years my father gave me some advice that I\u2019ve been turning over in my mind ever since. \u201cWhenever you feel like criticizing any one,\u201d he told me, \u201cjust remember that all the people in this world haven\u2019t had the advantages that you\u2019ve had.\u201d',
  },
  {
    id: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë',
    opening:
      'There was no possibility of taking a walk that day. We had been wandering, indeed, in the leafless shrubbery an hour in the morning; but since dinner the cold winter wind had brought with it clouds so sombre, and a rain so penetrating, that further out-door exercise was now out of the question.',
  },
  {
    id: 768, title: 'Wuthering Heights', author: 'Emily Brontë',
    opening:
      'I have just returned from a visit to my landlord\u2014the solitary neighbour that I shall be troubled with. This is certainly a beautiful country! In all England, I do not believe that I could have fixed on a situation so completely removed from the stir of society.',
  },
  {
    id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle',
    opening:
      'To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler.',
  },
  {
    id: 345, title: 'Dracula', author: 'Bram Stoker',
    opening:
      'Left Munich at 8:35 P.M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets.',
  },
  {
    id: 84, title: 'Frankenstein', author: 'Mary Shelley',
    opening:
      'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.',
  },
  {
    id: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde',
    opening:
      'The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn.',
  },
]

export async function fetchGutenberg(count = 3): Promise<RawContent[]> {
  const picks = [...GUTENBERG_CLASSICS].sort(() => Math.random() - 0.5).slice(0, count)
  return picks.map((book) => ({
    title: book.title,
    content: book.opening,
    author: book.author,
    url: `https://www.gutenberg.org/ebooks/${book.id}`,
    source: 'Project Gutenberg',
    category: 'books',
  }))
}

// ─── Open Library (real, current book catalog — free, no API key) ───
// The Books topic needs to be data-RICH: not just 12 classic openings, but the
// whole living catalog — bestsellers, genres, contemporary + classic, with real
// authors and real descriptions. Open Library (openlibrary.org, run by the
// Internet Archive) exposes millions of works by subject with covers, authors,
// publish years and descriptions, all key-free. We pull a rotating set of genres
// each call for variety, enrich the top picks with their real description, and
// surface them as cards. The AI-enhance step frames WHY each book is worth reading.
const OPENLIB_SUBJECTS = [
  'literature', 'fiction', 'fantasy', 'science_fiction', 'mystery',
  'thriller', 'historical_fiction', 'romance', 'horror', 'adventure',
  'biography', 'philosophy', 'psychology', 'poetry', 'classics',
  'short_stories', 'science', 'history',
]

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}

// Cheap English-language check for book descriptions (Open Library mixes langs).
// Requires a few common English function words in the opening — enough to reject
// Spanish/French/Italian/German blurbs without a heavy language-detect dependency.
function looksEnglish(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase()
  const hits = (head.match(/\b(the|and|of|to|a|in|is|that|with|his|her|for|was|by)\b/g) || []).length
  // Foreign giveaways that shouldn't appear in an English blurb.
  const foreign = /\b(una|es|el|la|del|und|der|die|von|est|une|dans|romanzo|novela)\b/.test(head)
  return hits >= 3 && !foreign
}

export async function fetchOpenLibraryBooks(count = 6): Promise<RawContent[]> {
  const subjects = pickRandom(OPENLIB_SUBJECTS, 3)
  try {
    // 1) Pull works from a few genres in parallel (popular first via the API's
    //    default ranking), then merge + de-dupe by work key.
    const perSubject = Math.max(6, Math.ceil((count * 2) / subjects.length))
    const batches = await Promise.allSettled(
      subjects.map(async (subject) => {
        const url = `https://openlibrary.org/subjects/${subject}.json?limit=${perSubject}`
        const r = await fetch(url, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
        })
        if (!r.ok) return [] as any[]
        const data = await r.json()
        return (data?.works || []).map((w: any) => ({ ...w, _subject: subject }))
      })
    )
    const seen = new Set<string>()
    const works: any[] = []
    batches.forEach((b) => {
      if (b.status === 'fulfilled') {
        for (const w of b.value) {
          if (!w?.key || seen.has(w.key)) continue
          // Require a cover + author so cards look complete.
          if (!w.cover_id || !(w.authors && w.authors.length)) continue
          seen.add(w.key)
          works.push(w)
        }
      }
    })
    // Mix popularity with freshness: keep a broad pool (so contemporary titles
    // surface too, not only the most-reprinted classics) and random-sample it.
    const shortlist = pickRandom(works, Math.max(count * 3, 14))

    // 2) Enrich the shortlist with real descriptions (parallel, capped).
    const enriched = await Promise.allSettled(
      shortlist.map(async (w) => {
        try {
          const wr = await fetch(`https://openlibrary.org${w.key}.json`, {
            cache: 'no-store',
            headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
          })
          if (!wr.ok) return null
          const wd = await wr.json()
          const rawDesc = typeof wd.description === 'string' ? wd.description : wd.description?.value
          const desc = (rawDesc || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
          // Drop boilerplate / too-short descriptions — a card needs substance.
          if (!desc || desc.length < 90) return null
          // English feed → require an English description (Open Library mixes langs).
          if (!looksEnglish(desc)) return null
          // Strip trailing source citations / markdown emphasis Open Library appends.
          const clean = desc
            .split(/\n?\s*(?:--|—)\s*This text refers|\(\s*source:/i)[0]
            .replace(/\*\*?/g, '')
            .trim()
          if (clean.length < 90) return null
          const author = (w.authors || []).map((a: any) => a.name).filter(Boolean).join(', ')
          const year = w.first_publish_year ? ` (${w.first_publish_year})` : ''
          return {
            title: `${w.title}${year}`,
            content: clean.length > 800 ? trimToSentence(clean, 800) : clean,
            author: author || undefined,
            url: `https://openlibrary.org${w.key}`,
            source: 'Open Library',
            category: 'books',
          } as RawContent
        } catch {
          return null
        }
      })
    )
    const out: RawContent[] = []
    enriched.forEach((e) => {
      if (e.status === 'fulfilled' && e.value) out.push(e.value)
    })
    return out.slice(0, count)
  } catch (error) {
    console.error('Open Library error:', error)
    return []
  }
}

// ─── Met Museum (signature ART source — free, no key) ───
// The Art topic deserves real artworks, not generic Wikipedia. The Metropolitan
// Museum Open Access API exposes 470k+ objects with artist, date, culture, medium
// and images. We search a rotating art theme, pick objects that have images +
// substantive metadata, and build a factual card (the AI-enhance step frames why
// the work matters). No API key required.
const MET_QUERIES = [
  'painting', 'portrait', 'landscape', 'sculpture', 'impressionism',
  'still life', 'mythology', 'drawing', 'watercolor', 'modern art',
]

export async function fetchMetArt(count = 3): Promise<RawContent[]> {
  try {
    const q = pickRandom(MET_QUERIES, 1)[0]
    const searchUrl =
      `https://collectionapi.metmuseum.org/public/collection/v1/search` +
      `?q=${encodeURIComponent(q)}&hasImages=true`
    const sr = await fetch(searchUrl, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!sr.ok) return []
    const sd = await sr.json()
    const ids: number[] = sd?.objectIDs || []
    if (!ids.length) return []
    // Sample a handful of random object IDs from the result set.
    const picks = pickRandom(ids, count * 3).slice(0, count * 3)
    const objs = await Promise.allSettled(
      picks.map(async (id) => {
        const r = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
          { cache: 'no-store', headers: { Accept: 'application/json' } }
        )
        if (!r.ok) return null
        const o = await r.json()
        if (!o?.title || !o?.primaryImage) return null
        const artist = (o.artistDisplayName || '').trim()
        const bits: string[] = []
        if (artist) bits.push(`by ${artist}`)
        if (o.objectDate) bits.push(o.objectDate)
        if (o.culture) bits.push(o.culture)
        if (o.medium) bits.push(o.medium)
        if (o.department) bits.push(`Met Museum · ${o.department}`)
        const factLine = bits.join(' · ')
        // Build substantive content the AI-enhance step can turn into a card.
        const content = `${o.title}${factLine ? ` — ${factLine}.` : '.'} ` +
          `${o.creditLine || ''} This work is part of the Metropolitan Museum of Art's ` +
          `open-access collection.`.trim()
        return {
          title: o.title,
          content: content.replace(/\s+/g, ' ').trim(),
          author: artist || undefined,
          url: o.objectURL || `https://www.metmuseum.org/art/collection/search/${id}`,
          source: 'The Met',
          category: 'art',
        } as RawContent
      })
    )
    const out: RawContent[] = []
    objs.forEach((o) => { if (o.status === 'fulfilled' && o.value) out.push(o.value) })
    return out.slice(0, count)
  } catch (error) {
    console.error('Met Museum error:', error)
    return []
  }
}

// ─── NASA APOD (signature SPACE source — free, DEMO_KEY works) ───
// NASA's Astronomy Picture of the Day ships a real, expert-written explanation
// (usually 600–1200 chars) — perfect card substance for the Space topic. We pull
// a few recent days for variety. Uses NASA_API_KEY if set, else DEMO_KEY.
export async function fetchNasaApod(count = 3): Promise<RawContent[]> {
  try {
    const key = process.env.NASA_API_KEY || 'DEMO_KEY'
    const url = `https://api.nasa.gov/planetary/apod?api_key=${key}&count=${count}`
    const r = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!r.ok) return []
    const data = await r.json()
    const items: any[] = Array.isArray(data) ? data : [data]
    return items
      .filter((a) => a?.title && a?.explanation && String(a.explanation).length > 160)
      .map((a) => ({
        title: String(a.title).trim(),
        content: String(a.explanation).replace(/\s+/g, ' ').trim().slice(0, 900),
        author: a.copyright ? String(a.copyright).trim() : undefined,
        url: a.hdurl || a.url || 'https://apod.nasa.gov/apod/',
        source: 'NASA APOD',
        category: 'space',
      }))
      .slice(0, count)
  } catch (error) {
    console.error('NASA APOD error:', error)
    return []
  }
}

// ─── PoetryDB (real poems — free, no key) ───
// Adds genuine literature to Books + Language: a real poem excerpt with author.
export async function fetchPoetry(count = 2): Promise<RawContent[]> {
  try {
    const r = await fetch(`https://poetrydb.org/random/${count}`, {
      cache: 'no-store', headers: { Accept: 'application/json' },
    })
    if (!r.ok) return []
    const poems: any[] = await r.json()
    if (!Array.isArray(poems)) return []
    return poems
      .filter((p) => p?.title && Array.isArray(p.lines) && p.lines.length >= 4)
      .map((p) => {
        // Use the first ~8 lines as an evocative excerpt.
        const excerpt = p.lines.filter((l: string) => l.trim()).slice(0, 8).join('\n')
        return {
          title: p.title.trim(),
          content: excerpt,
          author: p.author ? String(p.author).trim() : undefined,
          url: `https://poetrydb.org/author,title/${encodeURIComponent(p.author)};${encodeURIComponent(p.title)}`,
          source: 'PoetryDB',
          category: 'books',
        } as RawContent
      })
      .slice(0, count)
  } catch (error) {
    console.error('PoetryDB error:', error)
    return []
  }
}

// ─── Real-time news (Event Registry / NewsAPI.ai) ───
// For fast-moving topics (tech, science, finance, business, health…) we surface
// fresh headlines so the feed feels current, not just evergreen. Gated per topic
// and only active when the EVENTREGISTRY_API_KEY env var is set. The AI-enhance
// step turns the article body into a crisp, faithful explainer.
export async function fetchNews(categories: string[], perTopic = 3): Promise<RawContent[]> {
  const apiKey = process.env.EVENTREGISTRY_API_KEY
  if (!apiKey) return []
  const newsTopics = categories.filter((c) => TOPIC_NEWS_KEYWORD[c])
  if (newsTopics.length === 0) return []

  // Query a few relevant topics in parallel (cap at 3 to stay fast + within quota).
  const picks = newsTopics.slice(0, 3)
  const results = await Promise.allSettled(
    picks.map(async (topic) => {
      const reqBody = {
        action: 'getArticles',
        keyword: TOPIC_NEWS_KEYWORD[topic],
        keywordLoc: 'title',
        lang: 'eng',
        articlesPage: 1,
        articlesCount: perTopic,
        articlesSortBy: 'date',
        dataType: ['news'],
        includeArticleImage: true,
        includeArticleBasicInfo: true,
        articleBodyLen: 500,
        isDuplicateFilter: 'skipDuplicates',
        startSourceRankPercentile: 0,
        endSourceRankPercentile: 30, // only reputable, higher-ranked sources
        apiKey,
        resultType: 'articles',
      }
      const r = await fetch('https://eventregistry.org/api/v1/article/getArticles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        cache: 'no-store',
      })
      if (!r.ok) return []
      const data = await r.json()
      const articles: any[] = data?.articles?.results || []
      return articles
        .filter((a) => a.title && a.body && String(a.body).length > 160)
        .map((a) => {
          const text = String(a.body).replace(/\s+/g, ' ').trim()
          return {
            title: String(a.title).trim(),
            content: text.length > 900 ? text.slice(0, 900) + '…' : text,
            url: a.url,
            source: a.source?.title ? String(a.source.title) : 'News',
            category: topic,
          } as RawContent
        })
    })
  )

  const out: RawContent[] = []
  results.forEach((res) => {
    if (res.status === 'fulfilled') out.push(...res.value)
  })
  return out
}





export async function fetchReddit(
  subreddits: string[] = ['todayilearned', 'explainlikeimfive', 'Showerthoughts']
): Promise<RawContent[]> {
  // Fetch all subreddits in parallel
  const subPromises = subreddits.map((subreddit) =>
    fetch(`https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=5`, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Plax/1.0)',
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        if (!response.ok) return []
        const data = await response.json()
        const items: RawContent[] = []
        if (data.data?.children) {
          data.data.children.forEach((child: any) => {
            const post = child.data
            if (post.selftext || post.title) {
              const rawContent = post.selftext || post.title
              const content = stripHtml(rawContent)
              if (content.length > 50) {
                items.push({
                  title: cleanRedditTitle(post.title),
                  content,
                  url: `https://reddit.com${post.permalink}`,
                  author: `u/${post.author}`,
                  source: `Reddit r/${subreddit}`,
                  category: CATEGORY_MAP[subreddit] || 'science',
                })
              }
            }
          })
        }
        return items
      })
      .catch((error) => {
        console.error(`Reddit r/${subreddit} fetch error:`, error)
        return [] as RawContent[]
      })
  )
  const subResults = await Promise.all(subPromises)
  return subResults.flat()
}

function cleanRedditTitle(title: string): string {
  return title
    .replace(/^TIL\s*/i, '')
    .replace(/^ELI5:\s*/i, '')
    .replace(/^Showerthought:\s*/i, '')
    .trim()
}

// ─── Aggregate all sources (each one is independently error-safe) ───
export async function fetchAllContent(categories: string[] = [], lang: string = 'en'): Promise<RawContent[]> {
  // ── HINDI FEED ──────────────────────────────────────────────────────────
  // For Hindi we source natively from Hindi Wikipedia (Devanagari content) so
  // even un-enhanced cards render in Hindi. Skip the English-only sources
  // (Hacker News, ZenQuotes, Reddit). Client-side AI enhancement further polishes
  // these into crisp Hindi micro-essays.
  if (lang === 'hi') {
    const DEFAULT_TOPICS = ['science', 'history', 'space', 'health', 'nature', 'philosophy']
    const topicsForSearch = categories.length ? categories : DEFAULT_TOPICS
    const results = await Promise.allSettled([
      fetchWikipediaByTopics(topicsForSearch, 6, 'hi'),
      fetchWikipediaContent(18, 'hi'),
    ])
    const all: RawContent[] = []
    results.forEach((r) => {
      if (r.status === 'fulfilled') all.push(...r.value)
    })
    console.log(`[Plax Sources] Hindi: ${all.length} items`)
    return all
  }

  // Base subreddits (broad coverage) + topic-specific subreddits for the user's
  // selected categories, so niche picks (health, books, finance…) get real
  // on-topic content instead of leaning on random Wikipedia/quotes.
  const baseSubs = [
    'todayilearned', 'explainlikeimfive', 'Showerthoughts', 'science',
    'space', 'history', 'philosophy', 'psychology', 'AskScience',
    'Futurology', 'LifeProTips', 'YouShouldKnow',
  ]
  const topicSubs = categories.flatMap((c) => TOPIC_SUBREDDITS[c] || [])
  const subreddits = [...new Set([...topicSubs, ...baseSubs])].slice(0, 18)

  // For the no-topic feed (new user / cleared filters) seed the topic search with
  // a broadly-interesting default set so first impressions are curated-quality,
  // not random-stub roulette.
  const DEFAULT_TOPICS = ['science', 'history', 'psychology', 'technology', 'space', 'philosophy']
  const topicsForSearch = categories.length ? categories : DEFAULT_TOPICS

  // Source gating so a FOCUSED feed isn't polluted by off-topic sources:
  //   • Hacker News is almost entirely tech/programming → only fetch it when the
  //     user picked a tech topic (or has no topics). This fixes "why is a
  //     Technology card showing when I picked Science/Space/Books/Health".
  //   • ZenQuotes are philosophy-flavoured → only when philosophy/psychology
  //     (or no topics).
  //   • Random Wikipedia is serendipity → only for the no-topic feed; when the
  //     user has picks, lean on the on-topic Wikipedia search instead.
  const noTopics = categories.length === 0
  const hasTech = categories.some((c) => c === 'technology' || c === 'programming')
  const hasPhil = categories.some((c) => c === 'philosophy' || c === 'psychology')
  const includeHN = noTopics || hasTech
  const includeQuotes = noTopics || hasPhil
  const includeRandom = noTopics
  // arXiv adds research depth for science/tech/space/math topics. Gate it to the
  // relevant picks so a Books/Health feed isn't flooded with dense physics papers.
  const arxivTopics = categories.filter((c) =>
    ['physics', 'math', 'space', 'science', 'technology', 'programming'].includes(c)
  )
  const includeArxiv = arxivTopics.length > 0
  // Project Gutenberg gives real classic-literature excerpts for the Books topic.
  const includeGutenberg = categories.includes('books')
  // Open Library gives the living book catalog (bestsellers + genres + classics,
  // real authors & descriptions) so Books is data-rich, not just 12 classics.
  const includeOpenLibrary = categories.includes('books')
  // Signature per-topic sources: real artworks (Met) for art, NASA APOD for space,
  // real poems (PoetryDB) for books/language — so each topic feels curated.
  const includeMet = categories.includes('art')
  const includeNasa = categories.includes('space')
  const includePoetry = categories.includes('books') || categories.includes('language')
  // Real-time news for fast-moving topics (only if API key present + topic matches).
  const newsTopics = categories.filter((c) => TOPIC_NEWS_KEYWORD[c])
  const includeNews = newsTopics.length > 0

  // Use Promise.allSettled so one failing source doesn't kill the rest
  const results = await Promise.allSettled([
    includeRandom ? fetchWikipediaContent(18) : Promise.resolve([]),
    includeHN ? fetchHackerNews(15) : Promise.resolve([]),
    includeQuotes ? fetchQuotes(10) : Promise.resolve([]),
    fetchReddit(subreddits),     // topic-aware subreddit set
    fetchWikipediaByTopics(topicsForSearch), // on-topic articles (defaults when no picks)
    includeArxiv ? fetchArxiv(arxivTopics) : Promise.resolve([]),
    includeGutenberg ? fetchGutenberg(3) : Promise.resolve([]),
    includeNews ? fetchNews(newsTopics, 3) : Promise.resolve([]),
    includeOpenLibrary ? fetchOpenLibraryBooks(6) : Promise.resolve([]),
    includeMet ? fetchMetArt(3) : Promise.resolve([]),
    includeNasa ? fetchNasaApod(3) : Promise.resolve([]),
    includePoetry ? fetchPoetry(2) : Promise.resolve([]),
  ])

  const all: RawContent[] = []
  const sourceNames = ['Wikipedia', 'HackerNews', 'Quotes', 'Reddit', 'WikipediaTopics', 'arXiv', 'Gutenberg', 'News', 'OpenLibrary', 'MetArt', 'NASA', 'Poetry']

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[Plax Sources] ${sourceNames[i]}: ${result.value.length} items`)
      all.push(...result.value)
    } else {
      console.error(`[Plax Sources] ${sourceNames[i]} failed:`, result.reason)
    }
  })

  console.log(`[Plax Sources] Total: ${all.length} items from ${sourceNames.length} sources`)
  return all
}
