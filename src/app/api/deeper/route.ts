import { NextRequest, NextResponse } from 'next/server'
import { generateJSON } from '@/lib/llm'
import { translateBatch } from '@/lib/translate'

export const runtime = 'edge'

// "Go deeper" — given a card, return 3 short, fascinating, TRUE insights that
// build on it, so a curious reader can learn more with one tap.
export async function POST(request: NextRequest) {
  try {
    const { title, content, lang = 'en' } = await request.json()
    if (!content && !title) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // Generate in English (LLM's strongest language), then translate via a
    // dedicated API — cheaper + works even when the LLM has limited quota.
    const prompt = `A curious reader just read this:

TITLE: ${title || ''}
${(content || '').slice(0, 1500)}

Give exactly 3 SHORT "go deeper" insights that make them go "whoa, I didn't know that". Each must be:
- 1–2 sentences, punchy and concrete.
- A genuinely SURPRISING or USEFUL fact that BUILDS ON the topic (not a restatement).
- Strictly TRUE — never invent facts, numbers, names, or dates. If unsure, pick a safer well-known fact.

Respond with JSON only:
{"insights": ["...", "...", "..."]}`

    const j = await generateJSON<{ insights?: unknown[] }>(prompt, 700)
    let insights: string[] = (j?.insights || [])
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 3)

    // Translate the insights to the target language (Azure → MyMemory).
    if (lang !== 'en' && insights.length > 0) {
      const translated = await translateBatch(insights, lang)
      if (translated && translated.some((s) => s)) insights = translated.map((s, i) => s || insights[i])
    }

    return NextResponse.json({ insights })
  } catch (error) {
    console.error('Deeper error:', error)
    return NextResponse.json({ error: 'Failed', insights: [] }, { status: 500 })
  }
}
