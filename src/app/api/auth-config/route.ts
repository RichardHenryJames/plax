import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Which Supabase project holds the accounts, for the Android app. The app asks here instead of carrying
 * the address, so the project can move without an app update. The anon key is public by design: it is
 * already in the web bundle, and every table is protected by row-level security.
 */
export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json(
    { url, anonKey },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
  )
}
