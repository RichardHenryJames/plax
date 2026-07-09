'use client'

import { Feed } from '@/components/Feed'
import { NavBar } from '@/components/NavBar'
import { Onboarding } from '@/components/Onboarding'
import { LeftRail } from '@/components/LeftRail'
import { RightRail } from '@/components/RightRail'
import { CommandPalette } from '@/components/CommandPalette'
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
      <main className="h-[100dvh] bg-dark-bg flex items-center justify-center">
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

  if (!hasOnboarded) {
    return (
      <main className="h-[100dvh] bg-dark-bg overflow-hidden">
        <Onboarding />
      </main>
    )
  }

  return (
    <main className="h-[100dvh] bg-dark-bg overflow-hidden">
      {/* Desktop = 3-pane workspace (rails hidden below lg/xl); mobile = pure swipe feed */}
      <div className="flex h-full">
        <LeftRail />
        <div className="relative flex-1 min-w-0 h-full">
          <NavBar />
          <Feed />
        </div>
        <RightRail />
      </div>
      <CommandPalette />
    </main>
  )
}
