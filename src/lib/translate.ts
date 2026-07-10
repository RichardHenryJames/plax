// Dedicated translation — the way real products localize. A translation API is
// ~10-100x cheaper/faster than an LLM and has a huge free tier, so we use it
// instead of spending scarce LLM tokens per language.
//
// Provider chain (best → always-available):
//   1. Azure Translator  — needs AZURE_TRANSLATOR_KEY; 2M chars/mo free, top quality,
//      handles long text + batches in one call.
//   2. MyMemory          — no key required; ~50k words/day (anonymous) / higher with
//      an email; ~500 chars per request so we chunk. The universal safety net so
//      Hindi ALWAYS works, even when Azure isn't configured AND the LLM is out of quota.

const AZURE_KEY = process.env.AZURE_TRANSLATOR_KEY
const AZURE_REGION = process.env.AZURE_TRANSLATOR_REGION || 'global'
const AZURE_ENDPOINT =
  process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com'
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL // optional → raises the daily limit

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// ── Azure Translator — batch translate several strings in one call ──
async function azureTranslate(texts: string[], to: string, from = 'en'): Promise<string[] | null> {
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
      }),
      8000
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    const out = data.map((d: { translations?: { text?: string }[] }) => d?.translations?.[0]?.text ?? '')
    return out.some((s) => s) ? out : null
  } catch (e) {
    console.error('Azure translate error:', (e as Error)?.message || e)
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
async function myMemoryTranslateOne(text: string, to: string, from = 'en'): Promise<string | null> {
  try {
    const email = MYMEMORY_EMAIL ? `&de=${encodeURIComponent(MYMEMORY_EMAIL)}` : ''
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}${email}`
    const res = await withTimeout(fetch(url), 8000)
    if (!res.ok) return null
    const data = await res.json()
    const t = data?.responseData?.translatedText
    if (typeof t !== 'string' || !t.trim()) return null
    // MyMemory sometimes returns an ALL-CAPS warning string on quota/errors.
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) return null
    return t
  } catch (e) {
    console.error('MyMemory error:', (e as Error)?.message || e)
    return null
  }
}

async function myMemoryTranslate(texts: string[], to: string, from = 'en'): Promise<string[] | null> {
  const results: string[] = []
  for (const text of texts) {
    const chunks = chunkText(text)
    const translated = await Promise.all(chunks.map((c) => myMemoryTranslateOne(c, to, from)))
    if (translated.some((t) => t == null)) return null // partial failure → give up cleanly
    results.push(translated.join(' '))
  }
  return results
}

// Translate a batch of strings, trying the best available provider first.
// Returns null only if NO provider is available/working (caller keeps English).
export async function translateBatch(texts: string[], to: string, from = 'en'): Promise<string[] | null> {
  const nonEmpty = texts.map((t) => (t ?? '').trim())
  if (nonEmpty.every((t) => !t)) return texts
  const out = (await azureTranslate(texts, to, from)) ?? (await myMemoryTranslate(texts, to, from))
  if (!out) return null
  // Translation engines add spaces around markdown markers (`** x **`, `* x *`).
  // Re-tighten them so the client's bold/italic renderer matches, and drop any
  // stray spaces the engine introduced before punctuation.
  return out.map((s) =>
    s
      .replace(/\*\*\s+/g, '**')
      .replace(/\s+\*\*/g, '**')
      .replace(/(^|\s)\*\s+/g, '$1*')
      .replace(/\s+\*(\s|$)/g, '*$1')
      .replace(/\s+([।,.;:!?])/g, '$1')
      .trim()
  )
}

// True if ANY translation provider is configured/usable (Azure key OR MyMemory,
// which is always available). Used to decide whether to generate-then-translate.
export function hasTranslator(): boolean {
  return true // MyMemory needs no key, so a translator is always available
}
