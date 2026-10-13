import { NextRequest, NextResponse } from 'next/server'
import { bearerToken, deleteOwnAccount } from '@/lib/account-delete'

// Deletes the account of whoever calls it, proved by their own access token (lib/account-delete.ts). Used by the
// Android app and by the delete-account web page. There are no cookies and no CORS answer, so another site cannot use
// it on a reader's behalf, and nothing here is ever cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

// A reader deletes their account once; a script trying tokens is not a reader. Best effort, per warm instance.
const windows = new Map<string, { start: number; count: number }>()
function tooMany(client: string): boolean {
  const now = Date.now()
  const entry = windows.get(client)
  if (!entry || now - entry.start > 60_000) {
    if (windows.size > 2000) windows.clear()
    windows.set(client, { start: now, count: 1 })
    return false
  }
  entry.count += 1
  return entry.count > 10
}

export async function POST(request: NextRequest) {
  const client = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (tooMany(client)) return NextResponse.json({ error: 'slow_down' }, { status: 429, headers: NO_STORE })
  const token = bearerToken(request.headers.get('authorization'))
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })
  const outcome = await deleteOwnAccount(token, {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  return NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE })
}
