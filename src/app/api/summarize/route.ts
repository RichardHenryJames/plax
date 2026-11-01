import { NextRequest, NextResponse } from 'next/server'
import { generateJSON } from '@/lib/llm'
import { translateBatch } from '@/lib/translate'
import { cacheKey, getCachedAI, setCachedAI } from '@/lib/ai-cache'
import { buildPrompt, wantsShortBrief } from '@/lib/summary-prompt'
import { hasMixedScriptWord } from '@/lib/script-mix'

export const runtime = 'edge'

const DEVANAGARI = /[\u0900-\u097F]/

// True when most letters are Devanagari, i.e. the source is already Hindi.
function isMostlyDevanagari(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  if (letters < 20) return false
  return (text.match(/[\u0900-\u097F]/g)?.length ?? 0) / letters > 0.5
}

// Some models occasionally emit HTML (<p>, <strong>, <em>…) despite being asked
// for markdown, and some source extracts carry stray tags. Convert emphasis tags
// to markdown and strip everything else so the UI never shows literal <p>/<strong>.
function sanitizeText(s: string): string {
  if (!s) return s
  return s
    .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '**$2**')
    .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, '*$2*')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '') // strip any remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // Strip leaked section labels (Hook:/Takeaway:/Summary:) — a finished piece
    // never announces them, but models occasionally emit them anyway.
    .replace(/(^|\n)\s*\*{0,2}(hook|takeaway|summary|intro(?:duction)?|tl;?dr)\*{0,2}\s*:\s*/gi, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export async function POST(request: NextRequest) {
  try {
    const { content, title = '', type = 'microessay', lang = 'en', category = '', card = false } = await request.json()

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // The website asks for a card's text (`card: true`) and a news card has to leave room for its picture, so it gets a short brief;
    // the app's on-demand AI brief and every other topic keep their longer forms (see summary-prompt.ts).
    const shortBrief = wantsShortBrief(category, card)

    // Cache: AI enhancement/translation is deterministic per (content, lang), so a
    // repeat view (or another user seeing the same card) is instant + free.
    // Cache key includes a prompt VERSION + category so a prompt change (e.g. the
    // topic-aware rewrite that removed Hook/Takeaway labels) invalidates stale
    // entries instead of serving pre-fix summaries forever. The short news brief has a version of its own,
    // so long briefs cached for the same story are never served in its place (and the app's briefs stay as they were).
    const ck = await cacheKey('summarize', shortBrief ? 'v2-brief' : 'v2', category || '', lang, title, (content as string).slice(0, 2200))
    const cached = await getCachedAI<{ title: string; content: string; type: string }>(ck)
    if (cached) return NextResponse.json({ ...cached, cached: true })

    // A Hindi source asked for in Hindi is written directly in Hindi on the
    // translation-tuned chain. The English round trip below is slower and loses
    // nuance for text that never needed translating. Falls through if it fails.
    if (lang === 'hi' && isMostlyDevanagari(content)) {
      const direct = await generateJSON<{ title?: string; content?: string }>(
        buildPrompt(category, content, type, 'Hindi (Devanagari script)', shortBrief),
        1536,
        { chain: 'translate', validate: (v) => typeof v.content === 'string' && DEVANAGARI.test(v.content) && !hasMixedScriptWord(v.content) }
      )
      if (direct?.content) {
        const result = { title: sanitizeText(direct.title || title), content: sanitizeText(direct.content), type }
        await setCachedAI(ck, result)
        return NextResponse.json(result)
      }
    }

    // ARCHITECTURE: for non-English we ALWAYS generate the essay in English (the
    // LLM's strongest language) and then translate it with a dedicated translation
    // API (Azure → MyMemory). This is how real products localize: cheaper, faster,
    // and — crucially — Hindi still works even when the LLM is out of quota, because
    // we translate the raw extract directly.
    const targetLang = lang === 'en' ? 'en' : lang

    const prompt = buildPrompt(category, content, type, undefined, shortBrief)

    // The English essay we'll show (en) or translate (other langs). Defaults to the
    // raw extract / passed title so we always have SOMETHING to show/translate if
    // the LLM is unavailable.
    let enTitle = title || ''
    let enContent = sanitizeText(content.slice(0, 700))

    const j = await generateJSON<{ title?: string; content?: string }>(prompt, 1024, {
      validate: (v) => typeof v.content === 'string' && v.content.trim().length > 20,
    })
    if (j?.content) {
      enTitle = sanitizeText(j.title || enTitle)
      enContent = sanitizeText(j.content)
    }

    // English request → return whatever we have (LLM essay if it worked, else raw).
    if (targetLang === 'en') {
      const result = { title: enTitle, content: enContent, type }
      // Only cache a genuine LLM enhancement, not the raw-extract fallback.
      if (j?.content) await setCachedAI(ck, result)
      return NextResponse.json(result)
    }

    // Non-English → translate the English text (essay or raw extract) via the
    // dedicated translation chain (LLM → Azure → MyMemory). Works regardless of LLM quota.
    // A Hindi extract that is still Hindi (every LLM failed) needs no translation.
    if (lang === 'hi' && isMostlyDevanagari(enContent)) {
      return NextResponse.json({ title: enTitle, content: enContent, type })
    }
    const translated = await translateBatch([enTitle || '', enContent], targetLang)
    if (translated && (translated[0] || translated[1])) {
      const result = { title: translated[0] || enTitle, content: translated[1] || enContent, type, translated: true }
      // Cache real translations (Devanagari for hi) so repeat views cost nothing.
      if (lang !== 'hi' || /[\u0900-\u097F]/.test(result.content)) await setCachedAI(ck, result)
      return NextResponse.json(result)
    }

    // Translation unavailable → return English so the client can retry (better
    // than a broken/empty card).
    return NextResponse.json({ title: enTitle, content: enContent, type })
  } catch (error) {
    console.error('Summarize error:', error)
    return NextResponse.json({ error: 'Summarization failed' }, { status: 500 })
  }
}
