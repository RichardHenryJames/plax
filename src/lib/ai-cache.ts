// Shared AI-result cache. AI generation (summaries, translations, insights,
// quizzes) is DETERMINISTIC per input, so we cache results and reuse them — this
// makes repeat views instant AND costs zero AI/translation quota the 2nd time.
//
// Two layers:
//   1. In-memory (per warm instance) — instant, always on, bounded LRU-ish.
//   2. Supabase `ai_cache` table (durable + SHARED across all users/instances) —
//      so once ANY user generates a card's Hindi/quiz/insights, EVERYONE gets it
//      free forever. Optional: silently no-ops if the table/env isn't present, so
//      the app still works with just the memory layer.
//
// Supabase table (run once in the SQL editor — safe if it already exists):
//   create table if not exists ai_cache (
//     key text primary key,
//     value jsonb not null,
//     created_at timestamptz default now()
//   );
//   alter table ai_cache enable row level security;
//   -- service role bypasses RLS; no public policies needed (server-only access).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
let supabaseCacheEnabled = !!(SUPABASE_URL && SERVICE_KEY)

// ── In-memory layer ──
type MemEntry = { value: unknown; expires: number }
const MEM = new Map<string, MemEntry>()
const MEM_MAX = 500
const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days (AI results rarely change)

function memGet(key: string): unknown | null {
  const e = MEM.get(key)
  if (!e) return null
  if (Date.now() > e.expires) {
    MEM.delete(key)
    return null
  }
  // Refresh recency (Map keeps insertion order → re-insert = most-recent).
  MEM.delete(key)
  MEM.set(key, e)
  return e.value
}

function memSet(key: string, value: unknown, ttl: number) {
  if (MEM.size >= MEM_MAX) {
    const oldest = MEM.keys().next().value // eslint-disable-line @typescript-eslint/no-unused-vars
    if (oldest !== undefined) MEM.delete(oldest)
  }
  MEM.set(key, { value, expires: Date.now() + ttl })
}

// ── Supabase REST layer (edge-friendly, no SDK) ──
async function supaGet(key: string): Promise<unknown | null> {
  if (!supabaseCacheEnabled) return null
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_cache?key=eq.${encodeURIComponent(key)}&select=value`,
      {
        headers: {
          apikey: SERVICE_KEY!,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        // Short timeout: the cache should never slow the request down much.
        signal: AbortSignal.timeout(2500),
      }
    )
    if (!res.ok) {
      // Table missing (404 / PGRST205) → disable so we don't add latency per req.
      if (res.status === 404) supabaseCacheEnabled = false
      return null
    }
    const rows = await res.json()
    return Array.isArray(rows) && rows[0] ? rows[0].value : null
  } catch {
    return null
  }
}

async function supaSet(key: string, value: unknown): Promise<void> {
  if (!supabaseCacheEnabled) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_cache`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY!,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates', // upsert on primary key
      },
      body: JSON.stringify({ key, value }),
      signal: AbortSignal.timeout(2500),
    })
  } catch {
    /* best-effort; a cache write failure must never break the request */
  }
}

// A stable, short cache key from arbitrary input parts (uses Web Crypto SHA-256,
// available in the edge runtime).
export async function cacheKey(...parts: (string | undefined)[]): Promise<string> {
  const input = parts.map((p) => p ?? '').join('\u0001')
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, '0') // 128-bit is plenty
  return hex
}

// Get a cached value (memory → Supabase). Populates memory on a Supabase hit.
export async function getCachedAI<T = unknown>(key: string): Promise<T | null> {
  const mem = memGet(key)
  if (mem !== null) return mem as T
  const supa = await supaGet(key)
  if (supa !== null) {
    memSet(key, supa, DEFAULT_TTL)
    return supa as T
  }
  return null
}

// Store a value in both layers.
export async function setCachedAI(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
  memSet(key, value, ttl)
  await supaSet(key, value)
}
