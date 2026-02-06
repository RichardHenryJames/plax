'use client'

import { AuthProvider } from './AuthProvider'
import { CloudSync } from './CloudSync'

// Wrapper needed because AuthProvider uses browser APIs (useContext, useState)
// and layout.tsx is a server component
export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const hasSupabaseConfig =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase isn't configured, still render children (works offline)
  if (!hasSupabaseConfig) {
    return <>{children}</>
  }

  return (
    <AuthProvider>
      <CloudSync />
      {children}
    </AuthProvider>
  )
}
