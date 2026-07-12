import { NextRequest, NextResponse } from 'next/server'
import { generateJSON } from '@/lib/llm'
import { translateBatch } from '@/lib/translate'
import { cacheKey, getCachedAI, setCachedAI } from '@/lib/ai-cache'

export const runtime = 'edge'

// Some models occasionally emit HTML (<p>, <strong>, <em>…) despite being asked
// for markdown, and some source extracts carry stray tags. Convert emphasis tags
// to markdown and strip everything else so the UI never shows literal <p>/<strong>.
function sanitizeText(s: string): string {
  if (!s) return s
  return s
    .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '**$2**')
    .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$2*')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '') // strip any remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // Strip leaked section labels (Hook:/Takeaway:/Summary:) — a finished piece
    // never announces them, but models occasionally emit them anyway.
    .replace(/(^|\n)\s*\*{0,2}(hook|takeaway|summary|intro(?:duction)?|tl;?dr)\*{0,2}\s*:\s*/gi, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// Topic-specific voice + structure. A breaking-news brief, a science explainer,
// a book note, and a philosophy idea should each READ differently.
function topicGuidance(category: string): { role: string; angle: string; words: string } {
  switch (category) {
    case 'news':
      return {
        role: 'a sharp newsroom editor writing a crisp news brief',
        angle:
          '- Lead with the single most important fact (who/what/where/when).\n' +
          '- Give essential context and why it matters, neutrally — no hype, no opinion.\n' +
          '- Prefer concrete specifics (numbers, places, names) straight from the source.',
        words: '70–110 words, 2–3 tight paragraphs',
      }
    case 'science':
    case 'physics':
    case 'space':
    case 'health':
    case 'nature':
      return {
        role: 'a gifted science communicator (think a great science magazine)',
        angle:
          '- Open on the surprising finding or the question it answers.\n' +
          '- Explain the mechanism in plain language; gloss any term a layperson would not know.\n' +
          '- Note why it matters or what it changes.',
        words: '110–170 words, 3–4 short paragraphs',
      }
    case 'books':
      return {
        role: 'a thoughtful literary critic recommending a book',
        angle:
          '- Capture the essence, theme, or why the work endures — not a plot dump.\n' +
          '- Convey its distinctive voice or idea and who would love it.\n' +
          '- Be evocative but faithful to what the source says.',
        words: '100–160 words, 3 short paragraphs',
      }
    case 'philosophy':
    case 'psychology':
      return {
        role: 'a lucid thinker who makes big ideas click',
        angle:
          '- Frame the core idea or question and why it unsettles or illuminates.\n' +
          '- Use a concrete example or thought experiment to make it tangible.\n' +
          '- Land on what it means for how we think or live.',
        words: '110–170 words, 3–4 short paragraphs',
      }
    case 'finance':
    case 'business':
      return {
        role: 'a savvy business explainer (think a sharp finance newsletter)',
        angle:
          '- Lead with the core insight, number, or move that matters.\n' +
          '- Explain the mechanism and the stakes plainly; gloss jargon.\n' +
          '- Note the practical takeaway for a reader.',
        words: '90–150 words, 3 short paragraphs',
      }
    case 'history':
      return {
        role: 'a vivid history storyteller',
        angle:
          '- Set the scene and the stakes; make a distant moment feel immediate.\n' +
          '- Center the pivotal person, event, or turning point.\n' +
          '- Close on its lasting significance.',
        words: '110–170 words, 3–4 short paragraphs',
      }
    default:
      return {
        role: 'a brilliant, friendly explainer who makes anyone feel smarter in under a minute',
        angle:
          '- Open with something surprising, vivid, or a sharp question.\n' +
          '- Explain the core idea in plain language; gloss any jargon.\n' +
          '- Include the single most surprising or useful detail.',
        words: '110–170 words, 3–4 short paragraphs',
      }
  }
}

// Build the full summarize prompt for a given topic. CRITICAL: the essay must
// READ like a finished piece — it should HAVE a hook and a takeaway, but must
// NEVER print the words "Hook"/"Takeaway" or any section labels (that looks like
// a template, not journalism).
function buildPrompt(category: string, content: string, type: string): string {
  const g = topicGuidance(category)
  return `You are ${g.role}. Rewrite the source below into a polished, publication-quality micro-read.

SOURCE:
${content.slice(0, 2200)}

Requirements:
- A compelling TITLE (max 8 words) — specific and intriguing, never clickbait.
- ${g.words}.
${g.angle}
- Write flowing prose. Do NOT use section labels or headers — NEVER write the words "Hook", "Takeaway", "Summary", "Intro", or similar. It must read like a finished article, not a template.
- End on a resonant closing line, but do not announce it.
- **Bold** 2–4 key phrases (never whole sentences).
- Use ONLY markdown for emphasis (**bold**). NEVER output HTML tags (no <p>, <strong>, <em>, <br>) — plain text + markdown only.
- NEVER output LaTeX or math markup (no $...$, \\commands, ^, _, {}). Express any math in plain words or simple Unicode a normal reader understands.
- STAY FAITHFUL to the source — never invent facts, numbers, names, or dates. If the source is thin, be concise rather than padding.

Respond with JSON only:
{"title": "...", "content": "...", "type": "${type}"}`
}

export async function POST(request: NextRequest) {
  try {
    const { content, title = '', type = 'microessay', lang = 'en', category = '' } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // Cache: AI enhancement/translation is deterministic per (content, lang), so a
    // repeat view (or another user seeing the same card) is instant + free.
    // Cache key includes a prompt VERSION + category so a prompt change (e.g. the
    // topic-aware rewrite that removed Hook/Takeaway labels) invalidates stale
    // entries instead of serving pre-fix summaries forever.
    const ck = await cacheKey('summarize', 'v2', category || '', lang, title, (content as string).slice(0, 2200))
    const cached = await getCachedAI<{ title: string; content: string; type: string }>(ck)
    if (cached) return NextResponse.json({ ...cached, cached: true })

    // ARCHITECTURE: for non-English we ALWAYS generate the essay in English (the
    // LLM's strongest language) and then translate it with a dedicated translation
    // API (Azure → MyMemory). This is how real products localize: cheaper, faster,
    // and — crucially — Hindi still works even when the LLM is out of quota, because
    // we translate the raw extract directly.
    const targetLang = lang === 'en' ? 'en' : lang

    const prompt = buildPrompt(category, content, type)

    // The English essay we'll show (en) or translate (other langs). Defaults to the
    // raw extract / passed title so we always have SOMETHING to show/translate if
    // the LLM is unavailable.
    let enTitle = title || ''
    let enContent = sanitizeText(content.slice(0, 700))

    const j = await generateJSON<{ title?: string; content?: string }>(prompt, 1024)
    if (j?.content) {
      enTitle = sanitizeText(j.title || enTitle)
      enContent = sanitizeText(j.content)
    }

    // English request → return whatever we have (LLM essay if it worked, else raw).
    if (targetLang === 'en') {
      const result = { title: enTitle, content: enContent, type }
      // Only cache a genuine LLM enhancement, not the raw-extract fallback.
      if (j?.content) await setCachedAI(ck, result)
      return NextResponse.json(result)
    }

    // Non-English → translate the English text (essay or raw extract) via the
    // dedicated translation chain (Azure → MyMemory). Works regardless of LLM quota.
    const translated = await translateBatch([enTitle || '', enContent], targetLang)
    if (translated && (translated[0] || translated[1])) {
      const result = { title: translated[0] || enTitle, content: translated[1] || enContent, type, translated: true }
      // Cache real translations (Devanagari for hi) so repeat views cost nothing.
      if (lang !== 'hi' || /[\u0900-\u097F]/.test(result.content)) await setCachedAI(ck, result)
      return NextResponse.json(result)
    }

    // Translation unavailable → return English so the client can retry (better
    // than a broken/empty card).
    return NextResponse.json({ title: enTitle, content: enContent, type })
  } catch (error) {
    console.error('Summarize error:', error)
    return NextResponse.json({ error: 'Summarization failed' }, { status: 500 })
  }
}
