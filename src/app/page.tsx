'use client'

import { Feed } from '@/components/Feed'
import { NavBar } from '@/components/NavBar'
import { BottomNav } from '@/components/BottomNav'
import { LeftRail } from '@/components/LeftRail'
import { RightRail } from '@/components/RightRail'
import { CommandPalette } from '@/components/CommandPalette'
import { TopicEditor } from '@/components/TopicEditor'
import { AccountSheet } from '@/components/AccountSheet'
import { TopicsScreen } from '@/components/TopicsScreen'
import { SavedScreen } from '@/components/SavedScreen'
import { ForYouEmpty } from '@/components/ForYouEmpty'
import { FeedErrorBoundary } from '@/components/FeedErrorBoundary'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useEffect, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { BrandMark } from '@/components/BrandMark'

export default function Home() {
  const selectedTopics = usePlaxStore((s) => s.selectedTopics)
  const screen = useUIStore((s) => s.screen)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // What the site opens on. Everyone starts on public News: no onboarding, no account, no topics needed.
  // A reader who last used For you (and has topics) returns there; deep links go where they point.
  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams(window.location.search)
    const topic = params.get('topic')
    const lang = params.get('lang')
    const card = params.get('card')
    const store = usePlaxStore.getState()
    if (lang === 'hi' || lang === 'en') store.setLanguage(lang)
    if (card) {
      useUIStore.getState().pinCard(card)
    } else if (topic && TOPICS.some((x) => x.id === topic)) {
      // /?topic=<id> (from the /topics pages) reads that topic straight away.
      useUIStore.getState().setFeedFilter(topic)
    } else if (store.startOnForYou && store.selectedTopics.length > 0) {
      useUIStore.getState().setFeedFilter(null)
    }
    // Clean the URL so a refresh doesn't re-apply it.
    if (topic || lang || card) window.history.replaceState({}, '', withBase('/'))
  }, [mounted])

  if (!mounted) {
    return (
      <main className="h-[100dvh] bg-dark-bg flex items-center justify-center">
        <div className="animate-pulse">
          <BrandMark size="lg" href={null} />
        </div>
      </main>
    )
  }

  // For you with no topics chosen yet: invite a choice instead of loading anything.
  const forYouEmpty = feedFilter === null && selectedTopics.length === 0
  const categories = feedFilter ? [feedFilter] : selectedTopics

  return (
    <main className="h-[100dvh] bg-dark-bg overflow-hidden">
      {/* Desktop = 3-pane workspace (rails hidden below lg/xl); mobile = swipe feed with the four tabs below */}
      <div className="flex h-full">
        <LeftRail />
        <div className="relative flex-1 min-w-0 h-full flex flex-col">
          <div className="relative flex-1 min-h-0">
            <NavBar />
            <FeedErrorBoundary>
              {screen === 'topics' ? (
                <TopicsScreen />
              ) : screen === 'saved' ? (
                <SavedScreen />
              ) : forYouEmpty ? (
                <ForYouEmpty />
              ) : (
                <Feed categories={categories} />
              )}
            </FeedErrorBoundary>
          </div>
          <BottomNav />
        </div>
        <RightRail />
      </div>
      <CommandPalette />
      <TopicEditor />
      <AccountSheet />
    </main>
  )
}
