import { NextRequest, NextResponse } from 'next/server'
import { readShareCard, sharePath } from '@/lib/share'
import { signingKey, verifyCard } from '@/lib/share-sign'
import { saveShare } from '@/lib/share-store'
import { SITE_URL } from '@/lib/seo'

// Turns a card a reader is sharing into a story page and returns its address. Only a card this server signed is
// accepted (lib/share.ts), so the page can only ever say what the feed said. Anything that goes wrong is answered with
// a plain status and the client falls back to sharing the publisher's link, so a reader is never left without a link.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_BODY = 32 * 1024

// Sharing twice in a row is normal; a script writing to the database is not. Best effort, per warm instance.
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
  return entry.count > 30
}

function reply(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const client = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (tooMany(client)) return reply('slow_down', 429)
  const key = signingKey()
  if (!key) return reply('unavailable', 503)
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return reply('too_large', 413)

  const text = await request.text()
  if (text.length > MAX_BODY) return reply('too_large', 413)
  let body: unknown
  try { body = JSON.parse(text) } catch { return reply('invalid', 400) }

  const read = readShareCard(body)
  if (!read) return reply('invalid', 400)
  if (!verifyCard(read.card, read.signature, key)) return reply('unverified', 403)

  const record = await saveShare(read.card, read.signature)
  if (!record) return reply('unavailable', 503)
  return NextResponse.json({ url: `${SITE_URL}${sharePath(record.title, record.sid)}`, id: record.sid }, { headers: NO_STORE })
}
