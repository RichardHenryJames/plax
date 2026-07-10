import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import { translateBatch } from '@/lib/translate'

export const runtime = 'edge'

const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

type Quiz = { question: string; options: string[]; correct: number; explanation: string }

// "Test yourself" — turn a card the reader just finished into one crisp
// multiple-choice question so the knowledge actually sticks (active recall).
export async function POST(request: NextRequest) {
  try {
    const { title, content, lang = 'en' } = await request.json()
    if (!content && !title) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // Generate in English, then translate via a dedicated API (works even when
    // the LLM has limited quota; keeps the `correct` index intact).
    const langLine = ''

    const prompt = `A reader just finished this:

TITLE: ${title || ''}
${(content || '').slice(0, 1500)}

Write ONE multiple-choice question that checks whether they actually understood the KEY idea (not a trivial detail). Rules:
- Exactly 4 options, all plausible; only ONE is correct.
- The correct answer MUST be supported by the text above — never invent facts.
- Keep the question and options short and clear.
- Add a one-sentence explanation of why the answer is right.${langLine}

Respond with JSON only:
{"question": "...", "options": ["...", "...", "...", "..."], "correct": 0, "explanation": "..."}`

    let quiz: Quiz | null = null

    // Fail fast so a rate-limited provider can't stall the request (the Gemini SDK
    // auto-retries 429s with a ~36s backoff otherwise).
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
        const res = await withTimeout(model.generateContent(prompt), 7000)
        const m = res.response.text().match(/\{[\s\S]*\}/)
        if (m) quiz = JSON.parse(m[0])
      } catch (e) {
        console.error('Quiz Gemini error:', (e as Error)?.message || e)
      }
    }

    if (!quiz && groq) {
      try {
        const c = await withTimeout(groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: GROQ_MODEL,
          reasoning_effort: 'low',
          max_tokens: 700,
        }), 15000)
        const m = (c.choices[0]?.message?.content || '').match(/\{[\s\S]*\}/)
        if (m) quiz = JSON.parse(m[0])
      } catch (e) {
        console.error('Quiz Groq error:', (e as Error)?.message || e)
      }
    }

    // Validate shape so the UI never breaks on a malformed model reply.
    if (
      !quiz ||
      typeof quiz.question !== 'string' ||
      !Array.isArray(quiz.options) ||
      quiz.options.length !== 4 ||
      typeof quiz.correct !== 'number' ||
      quiz.correct < 0 ||
      quiz.correct > 3
    ) {
      return NextResponse.json({ error: 'Failed', quiz: null }, { status: 200 })
    }

    const cleanQuiz: Quiz = {
      question: quiz.question,
      options: quiz.options.map((o) => String(o)),
      correct: quiz.correct,
      explanation: typeof quiz.explanation === 'string' ? quiz.explanation : '',
    }

    // Translate to the target language (Azure → MyMemory), preserving order so the
    // `correct` index still points at the right option.
    if (lang !== 'en') {
      const batch = [cleanQuiz.question, ...cleanQuiz.options, cleanQuiz.explanation]
      const tr = await translateBatch(batch, lang)
      if (tr && tr.some((s) => s)) {
        cleanQuiz.question = tr[0] || cleanQuiz.question
        cleanQuiz.options = cleanQuiz.options.map((o, i) => tr[1 + i] || o)
        cleanQuiz.explanation = tr[5] || cleanQuiz.explanation
      }
    }

    return NextResponse.json({ quiz: cleanQuiz })
  } catch (error) {
    console.error('Quiz error:', error)
    return NextResponse.json({ error: 'Failed', quiz: null }, { status: 500 })
  }
}
