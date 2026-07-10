import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

export const runtime = 'edge'

const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

// Models are env-overridable so we can tune limits/quality without a code change.
// Default to gemini-2.0-flash: ~1,500 requests/day free (vs ~20/day for 2.5-flash).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

// Dedicated translation (the way real products localize — a translation API is
// ~10-100x cheaper/faster than an LLM and has a huge free tier). When an Azure
// Translator key is present we GENERATE the essay once in English and TRANSLATE
// it to the target language, instead of spending scarce LLM tokens per language.
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION || 'global'
const AZURE_TRANSLATOR_ENDPOINT =
  process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com'

async function azureTranslate(texts: string[], to: string): Promise<string[] | null> {
  if (!AZURE_TRANSLATOR_KEY) return null
  try {
    const res = await fetch(
      `${AZURE_TRANSLATOR_ENDPOINT}/translate?api-version=3.0&to=${to}`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
          'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(texts.map((t) => ({ Text: t }))),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    return data.map((d: { translations?: { text?: string }[] }) => d?.translations?.[0]?.text ?? '')
  } catch (e) {
    console.error('Azure translate error:', (e as Error)?.message || e)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { content, type = 'microessay', lang = 'en' } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // If we'll translate via a dedicated API, GENERATE in English (the LLM's
    // strongest language) and translate afterwards — better quality + far cheaper.
    const useTranslator = lang === 'hi' && !!AZURE_TRANSLATOR_KEY
    const genLang = useTranslator ? 'en' : lang

    const langInstruction =
      genLang === 'hi'
        ? `\n- Write the ENTIRE title and content in HINDI (Devanagari script, शुद्ध सरल हिन्दी). Do NOT use English words (not even "takeaway", "hook") except globally-recognised proper nouns. Use **bold** only — never single-asterisk *italics*. Keep it natural, warm and easy to read.`
        : ''

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
- STAY FAITHFUL to the source — never invent facts, numbers, names, or dates. If the source is thin, be honest and concise rather than padding.${langInstruction}

Respond with JSON only:
{"title": "...", "content": "...", "type": "${type}"}`

    let result = { title: '', content: content.slice(0, 500), type }

    // Race a promise against a timeout so a hung/rate-limited provider can't stall
    // the whole request. The Gemini SDK auto-retries 429s with a ~36s backoff,
    // which otherwise makes each call take 40s+ before the Groq fallback runs.
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
        if (match) result = { ...result, ...JSON.parse(match[0]) }
      } catch (e) {
        console.error('Gemini error:', (e as Error)?.message || e)
      }
    }

    // Fallback to Groq (fast primary when Gemini quota is exhausted)
    if (!result.title && groq) {
      try {
        const completion = await withTimeout(groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: GROQ_MODEL,
          reasoning_effort: 'low',
          max_tokens: 1024,
        }), 15000)
        const text = completion.choices[0]?.message?.content || ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) result = { ...result, ...JSON.parse(match[0]) }
      } catch (e) {
        console.error('Groq error:', (e as Error)?.message || e)
      }
    }

    // Dedicated translation step (only when we generated in English for Hindi).
    if (useTranslator && result.title) {
      const translated = await azureTranslate([result.title, result.content], 'hi')
      if (translated && translated[0]) {
        result = { ...result, title: translated[0], content: translated[1] || result.content }
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Summarize error:', error)
    return NextResponse.json({ error: 'Summarization failed' }, { status: 500 })
  }
}
