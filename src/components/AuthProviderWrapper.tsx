'use client'

import { AuthProvider } from './AuthProvider'
import { CloudSync } from './CloudSync'
import { ThemeSync } from './ThemeSync'

// Wrapper needed because AuthProvider uses browser APIs (useContext, useState)
// and layout.tsx is a server component
export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const hasSupabaseConfig =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase isn't configured, still render children (works offline)
  if (!hasSupabaseConfig) {
    return <><ThemeSync />{children}</>
  }

  return (
    <AuthProvider>
      <ThemeSync />
      <CloudSync />
      {children}
    </AuthProvider>
  )
}
