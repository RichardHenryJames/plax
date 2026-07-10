// Centralized LLM text generation with a robust, non-deprecated provider chain
// and fast-fail timeouts. Used by summarize / deeper / quiz.
//
// Chain (each step only runs if the previous produced nothing):
//   1. Gemini  (GEMINI_MODEL, default gemini-2.0-flash — ~1,500 req/day free)
//   2. Groq #1 (GROQ_MODEL,   default openai/gpt-oss-120b — best quality, production)
//   3. Groq #2 (GROQ_MODEL_2, default openai/gpt-oss-20b  — 2x faster/cheaper, and a
//      SEPARATE free daily token budget, so it roughly doubles daily capacity)
//
// NOTE: we deliberately avoid llama-3.1-8b-instant / llama-3.3-70b-versatile — Groq
// deprecates both on 2026-08-16 (replacements: gpt-oss-20b / gpt-oss-120b).
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const GROQ_MODEL_2 = process.env.GROQ_MODEL_2 || 'openai/gpt-oss-20b'

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// Generate raw text for a prompt, trying each provider until one succeeds.
export async function generateText(prompt: string, maxTokens = 1024): Promise<string> {
  // 1. Gemini (fail fast — 7s)
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
      const res = await withTimeout(model.generateContent(prompt), 7000)
      const text = res.response.text()
      if (text?.trim()) return text
    } catch (e) {
      console.error('Gemini error:', (e as Error)?.message || e)
    }
  }
  // 2 & 3. Groq models in order (each has its own free daily token budget)
  if (groq) {
    for (const model of [GROQ_MODEL, GROQ_MODEL_2]) {
      try {
        const c = await withTimeout(
          groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model,
            reasoning_effort: 'low',
            max_tokens: maxTokens,
          }),
          15000
        )
        const text = c.choices[0]?.message?.content || ''
        if (text.trim()) return text
      } catch (e) {
        console.error(`Groq (${model}) error:`, (e as Error)?.message || e)
      }
    }
  }
  return ''
}

// Generate + parse the first JSON object found in the model's reply.
export async function generateJSON<T = unknown>(prompt: string, maxTokens = 1024): Promise<T | null> {
  const text = await generateText(prompt, maxTokens)
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}
