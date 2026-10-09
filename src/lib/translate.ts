// Dedicated translation — the way real products localize. A translation API is
// ~10-100x cheaper/faster than an LLM and has a huge free tier, so we use it
// instead of spending scarce LLM tokens per language.
//
// Providers, raced with a stagger (see staggered.ts) so the answer arrives as soon
// as the first acceptable translation does and a failing provider costs nothing:
//   1. LLM translate chain — ~1 s for a card; Gemini 3.5 flash-lite writes the most
//      natural Hindi, with gpt-oss-120b / Qwen behind it (see llm.ts).
//   2. Azure Translator  — needs AZURE_TRANSLATOR_KEY; 2M chars/mo free, handles long
//      text + batches in one call. Starts if the LLM fails or is slow.
//   3. MyMemory          — no key required; ~50k words/day (anonymous) / higher with
//      an email; ~500 chars per request so we chunk. The universal safety net so
//      Hindi ALWAYS works, even when Azure isn't configured AND the LLM is out of quota.
import { extractJSON, generateText } from './llm'
import { raceStaggered } from './staggered'
import { tidyMarkers } from './tidy'

const AZURE_KEY = process.env.AZURE_TRANSLATOR_KEY
const AZURE_REGION = process.env.AZURE_TRANSLATOR_REGION || 'global'
const AZURE_ENDPOINT =
  process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com'
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL // optional → raises the daily limit

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// ── Azure Translator — batch translate several strings in one call ──
async function azureTranslate(
  texts: string[],
  to: string,
  from = 'en',
  signal?: AbortSignal
): Promise<string[] | null> {
  if (!AZURE_KEY) return null
  try {
    const res = await withTimeout(
      fetch(`${AZURE_ENDPOINT}/translate?api-version=3.0&from=${from}&to=${to}`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Ocp-Apim-Subscription-Region': AZURE_REGION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(texts.map((t) => ({ Text: t }))),
        signal,
      }),
      8000
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    const out = data.map((d: { translations?: { text?: string }[] }) => d?.translations?.[0]?.text ?? '')
    return out.some((s) => s) ? out : null
  } catch (e) {
    if (!signal?.aborted) console.error('Azure translate error:', (e as Error)?.message || e)
    return null
  }
}

// Split text into chunks under `max` chars, breaking on sentence boundaries so
// MyMemory (which limits request size) gets coherent pieces.
function chunkText(text: string, max = 480): string[] {
  if (text.length <= max) return [text]
  const chunks: string[] = []
  let buf = ''
  // Split on sentence enders (keep the delimiter), fall back to spaces.
  const parts = text.split(/(?<=[.!?।])\s+/)
  for (const part of parts) {
    if ((buf + ' ' + part).trim().length > max) {
      if (buf) chunks.push(buf.trim())
      if (part.length > max) {
        // Hard-wrap an over-long sentence on spaces.
        let rest = part
        while (rest.length > max) {
          let cut = rest.lastIndexOf(' ', max)
          if (cut <= 0) cut = max
          chunks.push(rest.slice(0, cut).trim())
          rest = rest.slice(cut)
        }
        buf = rest
      } else {
        buf = part
      }
    } else {
      buf = (buf ? buf + ' ' : '') + part
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks
}

// ── MyMemory — free, no key. One request per chunk. ──
async function myMemoryTranslateOne(
  text: string,
  to: string,
  from = 'en',
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const email = MYMEMORY_EMAIL ? `&de=${encodeURIComponent(MYMEMORY_EMAIL)}` : ''
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}${email}`
    const res = await withTimeout(fetch(url, { signal }), 8000)
    if (!res.ok) return null
    const data = await res.json()
    const t = data?.responseData?.translatedText
    if (typeof t !== 'string' || !t.trim()) return null
    // MyMemory sometimes returns an ALL-CAPS warning string on quota/errors.
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) return null
    return t
  } catch (e) {
    if (!signal?.aborted) console.error('MyMemory error:', (e as Error)?.message || e)
    return null
  }
}

async function myMemoryTranslate(
  texts: string[],
  to: string,
  from = 'en',
  signal?: AbortSignal
): Promise<string[] | null> {
  const results: string[] = []
  for (const text of texts) {
    if (signal?.aborted) return null
    const chunks = chunkText(text)
    const translated = await Promise.all(chunks.map((c) => myMemoryTranslateOne(c, to, from, signal)))
    if (translated.some((t) => t == null)) return null // partial failure → give up cleanly
    results.push(translated.join(' '))
  }
  return results
}

const DEVANAGARI = /[\u0900-\u097F]/
// A long Latin-script source must come back in the target script; short fragments
// (brand names, tickers) are legitimately left alone.
const LONG_SOURCE_LETTERS = 12

function validTranslation(input: string[], output: string[], to: string): boolean {
  if (output.length !== input.length) return false
  return input.every((source, i) => {
    const text = (source ?? '').trim()
    if (!text) return true
    const translated = (output[i] ?? '').trim()
    if (!translated) return false
    if (to !== 'hi') return true
    return (text.match(/\p{L}/gu)?.length ?? 0) < LONG_SOURCE_LETTERS || DEVANAGARI.test(translated)
  })
}

function languageName(code: string): string {
  if (code === 'hi') return 'Hindi (Devanagari script)'
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code
  } catch {
    return code
  }
}

function parseTranslations(text: string): string[] | null {
  const list = extractJSON<{ translations?: unknown }>(text)?.translations
  if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) return null
  return list as string[]
}

// One LLM call translates the whole batch (title + body) so a card needs a single
// round trip. Output is validated (item count, target script) before it can win.
async function llmTranslate(
  texts: string[],
  to: string,
  from: string,
  signal: AbortSignal
): Promise<string[] | null> {
  const payload = JSON.stringify(texts)
  const prompt =
    `Translate every string in this JSON array from ${languageName(from)} to ${languageName(to)}.\n` +
    '- Write the way a native news reader expects: natural, fluent, idiomatic wording, not word-for-word.\n' +
    '- Keep names, numbers, units and dates exact. Keep **bold** and *italic* markdown markers around the same words.\n' +
    '- Never add, drop or explain anything. An empty string stays empty.\n' +
    `Return ONLY JSON: {"translations":[...]} with exactly ${texts.length} strings in the same order.\n\n${payload}`
  const text = await generateText(prompt, Math.min(4096, 800 + Math.ceil(payload.length * 2.5)), {
    chain: 'translate',
    json: true,
    temperature: 0.2,
    signal,
    accept: (candidate) => {
      const parsed = parseTranslations(candidate)
      return parsed !== null && validTranslation(texts, parsed, to)
    },
  })
  return text ? parseTranslations(text) : null
}

// How long the LLM gets before Azure starts translating alongside it.
const TRANSLATE_HEDGE_MS = 2500

// Translate a batch of strings, trying the best available provider first.
// Returns null only if NO provider is available/working (caller keeps English).
export async function translateBatch(texts: string[], to: string, from = 'en'): Promise<string[] | null> {
  const nonEmpty = texts.map((t) => (t ?? '').trim())
  if (nonEmpty.every((t) => !t)) return texts
  const out = await raceStaggered<string[] | null>(
    [
      (signal) => llmTranslate(texts, to, from, signal),
      (signal) => azureTranslate(texts, to, from, signal),
      (signal) => myMemoryTranslate(texts, to, from, signal),
    ],
    TRANSLATE_HEDGE_MS,
    (candidate) => Array.isArray(candidate) && validTranslation(texts, candidate, to)
  )
  if (!out) return null
  return out.map(tidyMarkers)
}

// True if ANY translation provider is configured/usable (Azure key OR MyMemory,
// which is always available). Used to decide whether to generate-then-translate.
export function hasTranslator(): boolean {
  return true // MyMemory needs no key, so a translator is always available
}
