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
        <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-2xl flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">P</span>
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
