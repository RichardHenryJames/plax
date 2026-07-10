import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Keep-alive endpoint hit by a Vercel cron job so the free-tier Supabase project
// doesn't auto-pause after ~1 week of inactivity. It performs a tiny real DB read
// (not just an HTTP ping) so Postgres itself registers activity.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    // Lightweight read against an existing table — enough to count as DB activity.
    const { error } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })

    if (error) {
      console.error('[Plax KeepAlive] DB error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[Plax KeepAlive] Failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
