'use client'

import { Feed } from '@/components/Feed'
import { NavBar } from '@/components/NavBar'
import { Onboarding } from '@/components/Onboarding'
import { LeftRail } from '@/components/LeftRail'
import { RightRail } from '@/components/RightRail'
import { CommandPalette } from '@/components/CommandPalette'
import { TopicEditor } from '@/components/TopicEditor'
import { FeedErrorBoundary } from '@/components/FeedErrorBoundary'
import { usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useEffect, useState } from 'react'

export default function Home() {
  const hasOnboarded = usePlaxStore((s) => s.hasOnboarded)
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Deep-link: /?topic=<id> (from the /topics pages) → follow that topic and
  // filter the feed to it, so "Read X on Plax" actually shows X immediately.
  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams(window.location.search)
    const topic = params.get('topic')
    if (!topic) return
    const { selectedTopics, setSelectedTopics, setOnboarded, hasOnboarded } = usePlaxStore.getState()
    if (!selectedTopics.includes(topic)) {
      setSelectedTopics([...selectedTopics, topic])
    }
    if (!hasOnboarded) setOnboarded()
    useUIStore.getState().setFeedFilter(topic)
    // Clean the URL so a refresh doesn't re-apply it.
    window.history.replaceState({}, '', '/')
  }, [mounted])

  if (!mounted) {
    return (
      <main className="h-[100dvh] bg-dark-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <span className="brand-badge rounded-2xl">
            <img
              src="/plaxlabs_logo.png"
              alt="Plax"
              className="w-16 h-16 rounded-2xl"
            />
          </span>
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
          <FeedErrorBoundary>
            <Feed />
          </FeedErrorBoundary>
        </div>
        <RightRail />
      </div>
      <CommandPalette />
      <TopicEditor />
    </main>
  )
}
