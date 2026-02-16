'use client'

import { Feed } from '@/components/Feed'
import { NavBar } from '@/components/NavBar'
import { Onboarding } from '@/components/Onboarding'
import { usePlaxStore } from '@/lib/store'
import { useEffect, useState } from 'react'

export default function Home() {
  const hasOnboarded = usePlaxStore((s) => s.hasOnboarded)
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <main className="h-screen bg-dark-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <img
            src="/plaxlabs_logo.png"
            alt="Plax"
            className="w-16 h-16 rounded-2xl"
          />
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen bg-dark-bg overflow-hidden">
      {!hasOnboarded ? (
        <Onboarding />
      ) : (
        <>
          <NavBar />
          <Feed />
        </>
      )}
    </main>
  )
}
