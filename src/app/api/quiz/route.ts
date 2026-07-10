import { NextRequest, NextResponse } from 'next/server'
import { generateJSON } from '@/lib/llm'
import { translateBatch } from '@/lib/translate'

export const runtime = 'edge'

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
    const prompt = `A reader just finished this:

TITLE: ${title || ''}
${(content || '').slice(0, 1500)}

Write ONE multiple-choice question that checks whether they actually understood the KEY idea (not a trivial detail). Rules:
- Exactly 4 options, all plausible; only ONE is correct.
- The correct answer MUST be supported by the text above — never invent facts.
- Keep the question and options short and clear.
- Add a one-sentence explanation of why the answer is right.

Respond with JSON only:
{"question": "...", "options": ["...", "...", "...", "..."], "correct": 0, "explanation": "..."}`

    const quiz = await generateJSON<Quiz>(prompt, 700)

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
