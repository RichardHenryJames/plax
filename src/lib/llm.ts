// Centralized LLM text generation with a robust, non-deprecated provider chain
// and fast-fail timeouts. Used by summarize / deeper / quiz.
//
// Chain (each step only runs if the previous produced nothing):
//   1. Gemini     (GEMINI_MODELS list — tries 2.5-flash, 2.5-flash-lite, 2.0-flash…
//                   each model has its OWN free daily quota, multiplying capacity)
//   2. Groq #1     (GROQ_MODEL,   default openai/gpt-oss-120b — best quality, production)
//   3. Groq #2     (GROQ_MODEL_2, default openai/gpt-oss-20b  — 2x faster/cheaper, SEPARATE
//                   free daily token budget → roughly doubles daily capacity)
//   4. OpenRouter  (OPENROUTER_MODELS, several FREE models on one key — DeepSeek, Qwen,
//                   Llama etc. Each is a separate free pool, massively extending capacity.)
//
// NOTE: we deliberately avoid llama-3.1-8b-instant / llama-3.3-70b-versatile — Groq
// deprecates both on 2026-08-16 (replacements: gpt-oss-20b / gpt-oss-120b).
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY
const openRouterKey = process.env.OPENROUTER_API_KEY
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

// Comma-separated Gemini model IDs tried in order. Each model has its OWN free
// daily quota pool, so listing several roughly multiplies daily capacity — when
// one model returns "limit: 0 / 429 quota exceeded" the next is tried. 2.5-flash
// leads because Google zeroed the 2.0-flash free tier (limit:0) in mid-2026.
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-2.0-flash-lite'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const GROQ_MODEL_2 = process.env.GROQ_MODEL_2 || 'openai/gpt-oss-20b'
// A comma-separated list of OpenRouter FREE model IDs, tried in order. Each `:free`
// model has its own free allocation, so listing several greatly extends capacity.
// (Verified available on the free tier via /api/v1/models.)
const OPENROUTER_MODELS = (
  process.env.OPENROUTER_MODELS ||
  'meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-next-80b-a3b-instruct:free,openai/gpt-oss-120b:free,openai/gpt-oss-20b:free'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// ── OpenRouter (OpenAI-compatible chat completions, many free models on one key) ──
async function openRouterGenerate(prompt: string, maxTokens: number): Promise<string> {
  if (!openRouterKey) return ''
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await withTimeout(
        fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            // Optional attribution headers OpenRouter recommends.
            'HTTP-Referer': 'https://www.plaxlabs.com',
            'X-Title': 'Plax',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
          }),
        }),
        15000
      )
      if (!res.ok) continue
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content || ''
      if (typeof text === 'string' && text.trim()) return text
    } catch (e) {
      console.error(`OpenRouter (${model}) error:`, (e as Error)?.message || e)
    }
  }
  return ''
}

// Generate raw text for a prompt, trying each provider until one succeeds.
export async function generateText(prompt: string, maxTokens = 1024): Promise<string> {
  // 1. Gemini — try each model in order; each has its own free daily quota pool,
  //    so an exhausted model (429 / limit:0) falls through to the next.
  if (genAI) {
    for (const modelId of GEMINI_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId })
        const res = await withTimeout(model.generateContent(prompt), 7000)
        const text = res.response.text()
        if (text?.trim()) return text
      } catch (e) {
        console.error(`Gemini (${modelId}) error:`, (e as Error)?.message || e)
      }
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
  // 4. OpenRouter free models (last resort — biggest pool of extra free capacity)
  const orText = await openRouterGenerate(prompt, maxTokens)
  if (orText.trim()) return orText

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
