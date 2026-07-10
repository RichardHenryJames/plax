'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

// ─── Types ───
interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

// ─── Provider ───
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabase>
    try {
      supabase = getSupabase()
    } catch (err) {
      // Missing/invalid Supabase env → run the app in signed-out mode instead of
      // leaving `loading` stuck true (which hides the whole auth UI).
      console.error('[Plax Auth] Supabase client unavailable:', err)
      setLoading(false)
      return
    }

    // Get initial session. IMPORTANT: if Supabase is unreachable (paused project,
    // bad env, offline) getSession() REJECTS — without .catch, loading stays true
    // forever and the whole auth UI (incl. the Sign in button) never renders.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        console.log('[Plax Auth] Initial session:', session ? `✅ ${session.user.email}` : '❌ No session')
        setSession(session)
        setUser(session?.user ?? null)
      })
      .catch((err) => {
        console.error('[Plax Auth] getSession failed (Supabase unreachable?):', err?.message || err)
        setSession(null)
        setUser(null)
      })
      .finally(() => setLoading(false))

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[Plax Auth] State change:', _event, session ? `✅ ${session.user.email}` : '❌ Signed out')
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = useCallback(async () => {
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err) {
      console.error('[Plax Auth] Google sign-in failed:', err)
      alert('Sign-in is temporarily unavailable. Please try again in a moment.')
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      const supabase = getSupabase()
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[Plax Auth] Sign-out failed:', err)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}
