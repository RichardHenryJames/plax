import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// ─── Browser Client (for React components) ───
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Server Client (for API routes / server components) ───
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Singleton browser client ───
let browserClient: ReturnType<typeof createBrowserSupabaseClient> | null = null

export function getSupabase() {
  if (typeof window === 'undefined') {
    throw new Error('getSupabase() should only be called in the browser')
  }
  if (!browserClient) {
    browserClient = createBrowserSupabaseClient()
  }
  return browserClient
}
