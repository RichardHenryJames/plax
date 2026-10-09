// Centralized LLM text generation for summarize / deeper / quiz / translate.
//
// Speed first. Measured in Oct 2026 with the production keys (median of 3 calls,
// one 60-word news item):
//   Groq   qwen/qwen3.8-27b        0.25-0.70 s   fast, faithful English; Hindi is serviceable
//   Gemini gemini-3.5-flash-lite   0.9-1.3 s     best natural Hindi, faithful
//   Groq   openai/gpt-oss-20b/120b 0.5-1.3 s     good, but can mis-expand acronyms
//   Gemini gemini-2.5-flash        429 or 3.6 s  the previous default
//   Gemini gemini-2.5-flash-lite   404           retired
//
// A request races a *staggered* chain (see staggered.ts): the next provider starts
// the moment the previous one fails, or after HEDGE_MS if it is still silent, and
// the first answer that passes validation wins. Providers that answer 429/404 are
// skipped for a cool-down so an exhausted quota costs nothing on later requests.
//
// Configuration (all optional, comma-separated `provider:model` pairs):
//   LLM_CHAIN            general chain (brief writing, quizzes, insights)
//   LLM_TRANSLATE_CHAIN  translation chain (ordered for the best Hindi)
//   LLM_HEDGE_MS         stagger delay in ms (default 1500)
// The older GEMINI_MODELS / GROQ_MODEL / GROQ_MODEL_2 / OPENROUTER_MODELS
// variables are no longer read.
import { raceStaggered, type Step } from './staggered'

export type ChainName = 'default' | 'translate'

export interface GenerateOptions {
  /** Ask the provider for a JSON object (native JSON mode where supported). */
  json?: boolean
  chain?: ChainName
  temperature?: number
  hedgeMs?: number
  /** Reject an answer so the next provider is tried instead. */
  accept?: (text: string) => boolean
  /** Abort all in-flight provider calls. */
  signal?: AbortSignal
}

type Kind = 'groq' | 'gemini' | 'openrouter'
interface Target {
  kind: Kind
  model: string
  id: string
}

const DEFAULT_CHAIN = [
  'groq:qwen/qwen3.8-27b',
  'gemini:gemini-3.5-flash-lite',
  'groq:openai/gpt-oss-20b',
  'gemini:gemini-3.1-flash-lite',
  'groq:openai/gpt-oss-120b',
  'openrouter:google/gemma-4-31b-it:free',
  'openrouter:google/gemma-4-26b-a4b-it:free',
].join(',')

const TRANSLATE_CHAIN = [
  'gemini:gemini-3.5-flash-lite',
  'groq:openai/gpt-oss-120b',
  'groq:qwen/qwen3.8-27b',
  'gemini:gemini-3.1-flash-lite',
  'groq:openai/gpt-oss-20b',
].join(',')

const TIMEOUT_MS: Record<Kind, number> = { groq: 7000, gemini: 9000, openrouter: 12000 }

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[]
}
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
}

export function parseChain(spec: string): Target[] {
  const targets: Target[] = []
  for (const raw of spec.split(',')) {
    const item = raw.trim()
    const split = item.indexOf(':')
    if (split <= 0) continue
    const kind = item.slice(0, split)
    const model = item.slice(split + 1).trim()
    if (!model || (kind !== 'groq' && kind !== 'gemini' && kind !== 'openrouter')) continue
    targets.push({ kind, model, id: `${kind}:${model}` })
  }
  return targets
}

function apiKey(kind: Kind): string | undefined {
  if (kind === 'groq') return process.env.GROQ_API_KEY
  if (kind === 'gemini') return process.env.GEMINI_API_KEY
  return process.env.OPENROUTER_API_KEY
}

// Per-isolate cool-down for providers that report an exhausted quota or a retired
// model. Skipping them avoids paying a round trip (or a hedge delay) on every call.
const cooldownUntil = new Map<string, number>()

function noteFailure(id: string, status: number, retryAfter: string | null) {
  let seconds = 0
  if (status === 429) seconds = Math.min(Math.max(Number(retryAfter) || 0, 30), 300)
  else if (status === 401 || status === 403 || status === 404) seconds = 600
  if (seconds > 0) cooldownUntil.set(id, Date.now() + seconds * 1000)
}

function activeTargets(chain: ChainName): Target[] {
  const spec =
    (chain === 'translate' ? process.env.LLM_TRANSLATE_CHAIN : process.env.LLM_CHAIN) ||
    (chain === 'translate' ? TRANSLATE_CHAIN : DEFAULT_CHAIN)
  const configured = parseChain(spec).filter((t) => Boolean(apiKey(t.kind)))
  const now = Date.now()
  const ready = configured.filter((t) => (cooldownUntil.get(t.id) ?? 0) <= now)
  return ready.length > 0 ? ready : configured
}

async function postJSON<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal: AbortSignal,
  id: string
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      noteFailure(id, res.status, res.headers.get('retry-after'))
      throw new Error(`HTTP ${res.status}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

async function callGroq(
  target: Target,
  prompt: string,
  maxTokens: number,
  o: { json: boolean; temperature: number },
  signal: AbortSignal
): Promise<string> {
  const body: Record<string, unknown> = {
    model: target.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: o.temperature,
  }
  // gpt-oss cannot disable reasoning, only shorten it; Qwen can skip it entirely.
  if (target.model.includes('gpt-oss')) body.reasoning_effort = 'low'
  else if (target.model.includes('qwen')) {
    body.reasoning_effort = 'none'
    body.reasoning_format = 'hidden'
  }
  if (o.json) body.response_format = { type: 'json_object' }
  const data = await postJSON<ChatResponse>(
    GROQ_URL,
    { Authorization: `Bearer ${apiKey('groq')}` },
    body,
    TIMEOUT_MS.groq,
    signal,
    target.id
  )
  return data.choices?.[0]?.message?.content ?? ''
}

async function callGemini(
  target: Target,
  prompt: string,
  maxTokens: number,
  o: { json: boolean; temperature: number },
  signal: AbortSignal
): Promise<string> {
  const generationConfig: Record<string, unknown> = { temperature: o.temperature, maxOutputTokens: maxTokens }
  if (o.json) generationConfig.responseMimeType = 'application/json'
  // Thinking tokens only add latency for rewriting and translation.
  if (target.model.startsWith('gemini-3')) {
    generationConfig.thinkingConfig = { thinkingLevel: target.model.includes('lite') ? 'minimal' : 'low' }
  } else if (target.model.startsWith('gemini-2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 }
  }
  const data = await postJSON<GeminiResponse>(
    `${GEMINI_URL}/${encodeURIComponent(target.model)}:generateContent`,
    { 'x-goog-api-key': apiKey('gemini') ?? '' },
    { contents: [{ parts: [{ text: prompt }] }], generationConfig },
    TIMEOUT_MS.gemini,
    signal,
    target.id
  )
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
}

async function callOpenRouter(
  target: Target,
  prompt: string,
  maxTokens: number,
  o: { json: boolean; temperature: number },
  signal: AbortSignal
): Promise<string> {
  const data = await postJSON<ChatResponse>(
    OPENROUTER_URL,
    {
      Authorization: `Bearer ${apiKey('openrouter')}`,
      'HTTP-Referer': 'https://www.plaxlabs.com',
      'X-Title': 'Plax',
    },
    {
      model: target.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: o.temperature,
    },
    TIMEOUT_MS.openrouter,
    signal,
    target.id
  )
  return data.choices?.[0]?.message?.content ?? ''
}

function runTarget(
  target: Target,
  prompt: string,
  maxTokens: number,
  o: { json: boolean; temperature: number },
  signal: AbortSignal
): Promise<string> {
  const call =
    target.kind === 'groq' ? callGroq : target.kind === 'gemini' ? callGemini : callOpenRouter
  return call(target, prompt, maxTokens, o, signal).catch((error: unknown) => {
    if (!signal.aborted) console.warn('[llm]', target.id, (error as Error)?.message || 'failed')
    throw error
  })
}

// Generate raw text for a prompt. Returns '' only when every provider failed.
export async function generateText(
  prompt: string,
  maxTokens = 1024,
  options: GenerateOptions = {}
): Promise<string> {
  const targets = activeTargets(options.chain ?? 'default')
  if (targets.length === 0) return ''
  const settings = { json: options.json ?? false, temperature: options.temperature ?? 0.4 }
  const steps: Step<string>[] = targets.map(
    (target) => (signal) => runTarget(target, prompt, maxTokens, settings, signal)
  )
  const hedgeMs = options.hedgeMs ?? (Number(process.env.LLM_HEDGE_MS) || 1500)
  const accept = options.accept
  const text = await raceStaggered(
    steps,
    hedgeMs,
    (value) => typeof value === 'string' && value.trim().length > 0 && (accept ? accept(value) : true),
    options.signal
  )
  return text ?? ''
}

export function extractJSON<T = unknown>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

// Generate + parse the first JSON object in the reply. An answer that is not valid
// JSON (or fails `validate`) is rejected so the next provider is tried, instead of
// the request failing on the first malformed reply.
export async function generateJSON<T = unknown>(
  prompt: string,
  maxTokens = 1024,
  options: Omit<GenerateOptions, 'json'> & { validate?: (value: T) => boolean } = {}
): Promise<T | null> {
  const { validate, accept, ...rest } = options
  const text = await generateText(prompt, maxTokens, {
    ...rest,
    json: true,
    accept: (candidate) => {
      const value = extractJSON<T>(candidate)
      return value !== null && (validate ? validate(value) : true) && (accept ? accept(candidate) : true)
    },
  })
  return text ? extractJSON<T>(text) : null
}
