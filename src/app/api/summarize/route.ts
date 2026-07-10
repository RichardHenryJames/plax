import { NextRequest, NextResponse } from 'next/server'
import { generateJSON } from '@/lib/llm'
import { translateBatch } from '@/lib/translate'
import { cacheKey, getCachedAI, setCachedAI } from '@/lib/ai-cache'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { content, title = '', type = 'microessay', lang = 'en' } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // Cache: AI enhancement/translation is deterministic per (content, lang), so a
    // repeat view (or another user seeing the same card) is instant + free.
    const ck = await cacheKey('summarize', lang, title, (content as string).slice(0, 2200))
    const cached = await getCachedAI<{ title: string; content: string; type: string }>(ck)
    if (cached) return NextResponse.json({ ...cached, cached: true })

    // ARCHITECTURE: for non-English we ALWAYS generate the essay in English (the
    // LLM's strongest language) and then translate it with a dedicated translation
    // API (Azure → MyMemory). This is how real products localize: cheaper, faster,
    // and — crucially — Hindi still works even when the LLM is out of quota, because
    // we translate the raw extract directly.
    const targetLang = lang === 'en' ? 'en' : lang

    const prompt = `You are Plax — a brilliant, friendly explainer who makes anyone feel smarter in under a minute. Rewrite the source below into a punchy, memorable micro-read.

SOURCE:
${content.slice(0, 2200)}

Write it so a curious person walks away with a genuine "aha". Requirements:
- A curiosity-sparking TITLE (max 8 words) — intriguing, not clickbait.
- 110–180 words, 3–4 short paragraphs.
- Open with a HOOK: a surprising fact, vivid image, or sharp question.
- Explain the core idea in plain language — no jargon without a quick gloss.
- Include the single most surprising or useful detail from the source.
- End with a one-line **Takeaway:** that's genuinely worth remembering.
- **Bold** 3–5 key phrases (not whole sentences).
- NEVER output LaTeX or math markup (no $...$, \\commands, ^, _, {}). If the source has math notation, express it in plain words or simple Unicode (e.g. "ℓ-regular", "less than 10%") — a normal reader must understand it.
- STAY FAITHFUL to the source — never invent facts, numbers, names, or dates. If the source is thin, be honest and concise rather than padding.

Respond with JSON only:
{"title": "...", "content": "...", "type": "${type}"}`

    // The English essay we'll show (en) or translate (other langs). Defaults to the
    // raw extract / passed title so we always have SOMETHING to show/translate if
    // the LLM is unavailable.
    let enTitle = title || ''
    let enContent = content.slice(0, 700)

    const j = await generateJSON<{ title?: string; content?: string }>(prompt, 1024)
    if (j?.content) {
      enTitle = j.title || enTitle
      enContent = j.content
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
