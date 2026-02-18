import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

// Initialize AI clients
const geminiApiKey = process.env.GEMINI_API_KEY
const groqApiKey = process.env.GROQ_API_KEY

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null

export interface SummarizeResult {
  title: string
  content: string
  readTime: string
}

// Summarize content using Gemini (primary) or Groq (fallback)
export async function summarizeContent(text: string, type: 'microessay' | 'explainer' | 'book-summary' = 'microessay'): Promise<SummarizeResult> {
  const prompt = `You are a content summarizer for a short-form reading app. 
  
Summarize the following content into a ${type} format:
- Keep it under 200 words
- Make it engaging and insightful
- Use clear, accessible language
- Include a compelling title
- Format for easy reading (short paragraphs, bullet points if needed)

Content to summarize:
${text}

Respond in this JSON format:
{
  "title": "Compelling Title Here",
  "content": "The summarized content here...",
  "readTime": "X sec" or "X min"
}`

  try {
    // Try Gemini first
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      return parseAIResponse(response)
    }
    
    // Fallback to Groq
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
      })
      const response = completion.choices[0]?.message?.content || ''
      return parseAIResponse(response)
    }

    throw new Error('No AI API available')
  } catch (error) {
    console.error('AI summarization error:', error)
    // Return a fallback
    return {
      title: 'Content Summary',
      content: text.slice(0, 500) + '...',
      readTime: '1 min',
    }
  }
}

function parseAIResponse(response: string): SummarizeResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // If JSON parsing fails, return structured content
  }
  
  return {
    title: 'Summary',
    content: response,
    readTime: '1 min',
  }
}

// Generate quiz from card content
export async function generateQuiz(content: string): Promise<{ question: string; options: string[]; correct: number }> {
  const prompt = `Based on this content, create a simple quiz question with 4 options.

Content: ${content}

Respond in JSON:
{
  "question": "Your question here?",
  "options": ["A", "B", "C", "D"],
  "correct": 0
}`

  try {
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    }
  } catch (error) {
    console.error('Quiz generation error:', error)
  }

  return {
    question: 'What did you learn from this?',
    options: ['Something new', 'A lot', 'It was review', 'Need to re-read'],
    correct: 0,
  }
}
