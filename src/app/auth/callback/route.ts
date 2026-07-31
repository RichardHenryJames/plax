import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { BASE_PATH } from '@/lib/base-path'

/**
 * This app is proxied at plaxlabs.com/news, so the request lands on its own
 * deployment and `request.url` reports the internal *.vercel.app origin rather
 * than the host the user is actually browsing. Vercel sets x-forwarded-host to
 * the public one; it is platform-controlled and cannot be spoofed by a client.
 */
function publicOrigin(request: Request, fallback: string): string {
  const host = request.headers.get('x-forwarded-host')
  if (!host) return fallback
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

/**
 * `next` arrives from the query string, so it is untrusted. Anything other than
 * a single-slash local path — notably `//evil.com`, which browsers read as
 * protocol-relative — would hand a freshly authenticated user to another site.
 */
function safeNext(raw: string | null): string {
  return raw && /^\/(?!\/)/.test(raw) ? raw : BASE_PATH
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const base = publicOrigin(request, origin)
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${base}${next}`)
    }
    console.error('[Plax Auth Callback] Error:', error.message)
  }

  return NextResponse.redirect(`${base}${BASE_PATH}`)
}
