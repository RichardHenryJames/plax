import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

// ── AI Clients (Gemini primary, Groq fallback) ──
const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

export const isAIAvailable = () => !!(genAI || groq)

export interface EnhancedCard {
  title: string
  content: string
}

// ── The prompt that makes content addictive ──
const ENHANCE_PROMPT = `You are a world-class content writer for Plax — a TikTok-style app for curious minds. Your job is to take raw content and rewrite it so readers can't stop swiping.

RULES:
1. HOOK FIRST — Start with a jaw-dropping fact, question, or bold claim that makes them NEED to keep reading
2. Keep it SHORT — 80-150 words max. Every. Word. Earns. Its. Place.
3. Use punchy short paragraphs (1-3 sentences each). Separate paragraphs with double newlines.
4. Write like you're texting a smart friend — casual, witty, clear
5. End with a mind-blowing takeaway or "wait, WHAT?" moment
6. NO clickbait — deliver real insight
7. Use **bold** for the single most surprising fact
8. NO bullet points, NO lists — this is a story, not a lecture
9. NO emojis

INPUT:
Title: {TITLE}
Source: {SOURCE}
Content: {CONTENT}

Respond ONLY with this JSON (no markdown, no code fences):
{"title": "A short punchy title (max 8 words)", "content": "The full rewritten content"}`

/**
 * Enhance a single piece of content using AI.
 * Returns null if AI fails (caller should fall back to raw content).
 */
async function enhanceSingle(
  title: string,
  content: string,
  source: string
): Promise<EnhancedCard | null> {
  const prompt = ENHANCE_PROMPT
    .replace('{TITLE}', title || 'Untitled')
    .replace('{SOURCE}', source)
    .replace('{CONTENT}', content.slice(0, 1200))

  try {
    let responseText = ''

    if (genAI) {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 400,
        },
      })
      const result = await model.generateContent(prompt)
      responseText = result.response.text()
    } else if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.1-70b-versatile',
        max_tokens: 400,
        temperature: 0.9,
      })
      responseText = completion.choices[0]?.message?.content || ''
    } else {
      return null
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.content || parsed.content.length < 30) return null

    return {
      title: parsed.title || title,
      content: parsed.content,
    }
  } catch (error) {
    console.error(
      `[Plax AI] Failed to enhance "${title?.slice(0, 40)}":`,
      error instanceof Error ? error.message : error
    )
    return null
  }
}

/**
 * Enhance a batch of cards in parallel.
 * Returns a Map of index → EnhancedCard for cards that were successfully enhanced.
 * Cards that fail are simply not in the map (caller uses raw content).
 */
const AI_CONCURRENCY = 5

export async function enhanceBatch(
  cards: { title: string; content: string; source: string }[]
): Promise<Map<number, EnhancedCard>> {
  if (!isAIAvailable()) {
    console.log('[Plax AI] No AI keys configured — serving raw content')
    return new Map()
  }

  console.log(`[Plax AI] Enhancing ${cards.length} cards (concurrency: ${AI_CONCURRENCY})...`)
  const results = new Map<number, EnhancedCard>()
  const startTime = Date.now()

  // Process in chunks to respect rate limits
  for (let i = 0; i < cards.length; i += AI_CONCURRENCY) {
    const chunk = cards.slice(i, i + AI_CONCURRENCY)
    const promises = chunk.map((card, j) =>
      enhanceSingle(card.title, card.content, card.source).then((enhanced) => {
        if (enhanced) results.set(i + j, enhanced)
      })
    )
    await Promise.allSettled(promises)
  }

  const elapsed = Date.now() - startTime
  console.log(`[Plax AI] Enhanced ${results.size}/${cards.length} cards in ${elapsed}ms`)
  return results
}
