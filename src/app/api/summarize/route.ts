import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

export const runtime = 'edge'

const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

export async function POST(request: NextRequest) {
  try {
    const { content, type = 'microessay', lang = 'en' } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    const langInstruction =
      lang === 'hi'
        ? `\n- Write the ENTIRE title and content in HINDI (Devanagari script, शुद्ध सरल हिन्दी). Do NOT use English words (not even "takeaway", "hook") except globally-recognised proper nouns. Use **bold** only — never single-asterisk *italics*. Keep it natural, warm and easy to read.`
        : ''

    const prompt = `Transform this into an engaging ${type} for a short-form reading app:

${content.slice(0, 2000)}

Rules:
- Under 200 words
- Short punchy paragraphs
- Use **bold** for key insights
- Hook at start, takeaway at end
- Every sentence adds value${langInstruction}

JSON response only:
{"title": "...", "content": "...", "type": "${type}"}`

    let result = { title: '', content: content.slice(0, 500), type }

    // Try Gemini
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
        const response = await model.generateContent(prompt)
        const text = response.response.text()
        const match = text.match(/\{[\s\S]*\}/)
        if (match) result = { ...result, ...JSON.parse(match[0]) }
      } catch (e) {
        console.error('Gemini error:', e)
      }
    }

    // Fallback to Groq
    if (!result.title && groq) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'openai/gpt-oss-120b',
          reasoning_effort: 'low',
          max_tokens: 1024,
        })
        const text = completion.choices[0]?.message?.content || ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) result = { ...result, ...JSON.parse(match[0]) }
      } catch (e) {
        console.error('Groq error:', e)
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Summarize error:', error)
    return NextResponse.json({ error: 'Summarization failed' }, { status: 500 })
  }
}
