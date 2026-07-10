import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

export const runtime = 'edge'

const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

// "Go deeper" — given a card, return 3 short, fascinating, TRUE insights that
// build on it, so a curious reader can learn more with one tap.
export async function POST(request: NextRequest) {
  try {
    const { title, content, lang = 'en' } = await request.json()
    if (!content && !title) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    const langLine =
      lang === 'hi'
        ? '\n- Write ALL insights in HINDI (Devanagari, शुद्ध सरल हिन्दी). No English except globally-known proper nouns.'
        : ''

    const prompt = `A curious reader just read this:

TITLE: ${title || ''}
${(content || '').slice(0, 1500)}

Give exactly 3 SHORT "go deeper" insights that make them go "whoa, I didn't know that". Each must be:
- 1–2 sentences, punchy and concrete.
- A genuinely SURPRISING or USEFUL fact that BUILDS ON the topic (not a restatement).
- Strictly TRUE — never invent facts, numbers, names, or dates. If unsure, pick a safer well-known fact.${langLine}

Respond with JSON only:
{"insights": ["...", "...", "..."]}`

    let insights: string[] = []

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
        const res = await model.generateContent(prompt)
        const m = res.response.text().match(/\{[\s\S]*\}/)
        if (m) insights = JSON.parse(m[0]).insights || []
      } catch (e) {
        console.error('Deeper Gemini error:', e)
      }
    }

    if (insights.length === 0 && groq) {
      try {
        const c = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'openai/gpt-oss-120b',
          reasoning_effort: 'low',
          max_tokens: 700,
        })
        const m = (c.choices[0]?.message?.content || '').match(/\{[\s\S]*\}/)
        if (m) insights = JSON.parse(m[0]).insights || []
      } catch (e) {
        console.error('Deeper Groq error:', e)
      }
    }

    insights = (insights || []).filter((s) => typeof s === 'string' && s.trim()).slice(0, 3)
    return NextResponse.json({ insights })
  } catch (error) {
    console.error('Deeper error:', error)
    return NextResponse.json({ error: 'Failed', insights: [] }, { status: 500 })
  }
}
