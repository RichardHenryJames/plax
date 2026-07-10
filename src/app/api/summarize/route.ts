import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import { translateBatch } from '@/lib/translate'

export const runtime = 'edge'

const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

// Models are env-overridable so we can tune limits/quality without a code change.
// Default to gemini-2.0-flash: ~1,500 requests/day free (vs ~20/day for 2.5-flash).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

export async function POST(request: NextRequest) {
  try {
    const { content, title = '', type = 'microessay', lang = 'en' } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

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
    let llmWrote = false // did the LLM actually produce an essay?

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ])

    // Try Gemini (fail fast — 7s — then fall through to Groq)
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
        const response = await withTimeout(model.generateContent(prompt), 7000)
        const text = response.response.text()
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          const j = JSON.parse(match[0])
          if (j.content) { enTitle = j.title || enTitle; enContent = j.content; llmWrote = true }
        }
      } catch (e) {
        console.error('Gemini error:', (e as Error)?.message || e)
      }
    }

    // Fallback to Groq
    if (!llmWrote && groq) {
      try {
        const completion = await withTimeout(groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: GROQ_MODEL,
          reasoning_effort: 'low',
          max_tokens: 1024,
        }), 15000)
        const text = completion.choices[0]?.message?.content || ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          const j = JSON.parse(match[0])
          if (j.content) { enTitle = j.title || enTitle; enContent = j.content; llmWrote = true }
        }
      } catch (e) {
        console.error('Groq error:', (e as Error)?.message || e)
      }
    }

    // English request → return whatever we have (LLM essay if it worked, else raw).
    if (targetLang === 'en') {
      return NextResponse.json({ title: enTitle, content: enContent, type })
    }

    // Non-English → translate the English text (essay or raw extract) via the
    // dedicated translation chain (Azure → MyMemory). Works regardless of LLM quota.
    const translated = await translateBatch([enTitle || '', enContent], targetLang)
    if (translated && (translated[0] || translated[1])) {
      return NextResponse.json({
        title: translated[0] || enTitle,
        content: translated[1] || enContent,
        type,
        translated: true,
      })
    }

    // Translation unavailable → return English so the client can retry (better
    // than a broken/empty card).
    return NextResponse.json({ title: enTitle, content: enContent, type })
  } catch (error) {
    console.error('Summarize error:', error)
    return NextResponse.json({ error: 'Summarization failed' }, { status: 500 })
  }
}
