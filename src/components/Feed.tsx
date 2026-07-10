'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from './Card'
import { CardActions } from './CardActions'
import { CardSkeleton } from './Skeleton'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'

const LOAD_MORE_THRESHOLD = 10 // fetch more when 10 cards from end
const CARD_CACHE_KEY = 'plax-card-cache'
const CARD_CACHE_MAX_AGE = 30 * 60 * 1000 // 30 minutes

// A stable signature of the current topic selection, so the cache is scoped to
// the topics it was built for (prevents stale cards from a previous topic pick
// showing first when the user changes what they follow).
function topicsSig(topics: string[]): string {
  return [...topics].sort().join(',')
}

// ── Client-side card cache (localStorage), scoped to the topic selection ──
function getCachedCards(sig: string): CardData[] {
  try {
    const raw = localStorage.getItem(CARD_CACHE_KEY)
    if (!raw) return []
    const { cards, ts, sig: cachedSig } = JSON.parse(raw)
    if (Date.now() - ts > CARD_CACHE_MAX_AGE || cachedSig !== sig) {
      localStorage.removeItem(CARD_CACHE_KEY)
      return []
    }
    return cards || []
  } catch {
    return []
  }
}

function setCachedCards(cards: CardData[], sig: string) {
  try {
    // Keep last 60 cards in cache
    const toStore = cards.slice(-60)
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify({ cards: toStore, ts: Date.now(), sig }))
  } catch { /* quota exceeded — ignore */ }
}

// ── Personalization: sort an incoming batch so the user's high-engagement
//    categories surface first. Stable within equal scores; a no-op for new users. ──
function rankByEngagement(batch: CardData[], scoreOf: (category: string) => number): CardData[] {
  const cache: Record<string, number> = {}
  const score = (cat: string) => (cache[cat] ??= scoreOf(cat))
  return batch
    .map((c, i) => ({ c, i, s: score(c.category) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c)
}

export function Feed() {
  const { selectedTopics, bookmarkedIds, engagements, addEngagement, incrementCardsRead, readCardIds, markCardRead } = usePlaxStore()
  const feedFilter = useUIStore((s) => s.feedFilter)
  const setCurrentCard = useUIStore((s) => s.setCurrentCard)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const cardEntryTime = useRef(Date.now())
  const [cards, setCards] = useState<CardData[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const isFetchingRef = useRef(false) // ref to avoid stale closure
  const [isInitialLoad, setIsInitialLoad] = useState(true) // true until first fetch completes
  const fetchCountRef = useRef(0)
  const seenIdsRef = useRef(new Set<string>())
  const lastFetchTimeRef = useRef(0)
  const emptyFetchCountRef = useRef(0) // tracks consecutive fetches that returned 0 new cards

  // Map API response to CardData
  const mapApiCards = (apiCards: Record<string, string>[]): CardData[] => {
    return apiCards
      .map((c) => ({
        id: c.id || Math.random().toString(36).slice(2),
        type: (c.type || 'microessay') as CardData['type'],
        title: c.title,
        content: c.content,
        author: c.author,
        source: c.source,
        sourceUrl: c.sourceUrl,
        category: c.category,
        readTime: c.readTime || '30s',
        emoji: c.emoji,
      }))
      .filter((c) => !seenIdsRef.current.has(c.id)) // deduplicate by ID within session
      .filter((c) => { // deduplicate by title within session
        const titleKey = (c.title || c.content.slice(0, 80)).toLowerCase().trim()
        if (seenIdsRef.current.has(`t:${titleKey}`)) return false
        seenIdsRef.current.add(`t:${titleKey}`)
        return true
      })
  }

  // Fetch a batch of cards
  const fetchMore = useCallback(async (refresh = false) => {
    if (isFetchingRef.current) return

    // Cooldown: don't re-fetch within 5 seconds
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 5_000) return

    // Stop after 5 consecutive empty fetches (genuinely exhausted)
    if (emptyFetchCountRef.current >= 5) {
      console.log('[Plax Feed] Stopped fetching — 5 consecutive empty responses (all content read)')
      return
    }

    setIsFetching(true)
    isFetchingRef.current = true
    lastFetchTimeRef.current = now
    fetchCountRef.current++

    try {
      const cats = useUIStore.getState().feedFilter || selectedTopics.join(',')
      // Send IDs the client already has so server skips them
      const excludeIds = [...seenIdsRef.current].filter((id) => !id.startsWith('t:')).join(',')
      const res = await fetch(`/api/feed?categories=${cats}&limit=30&refresh=${refresh}&exclude=${encodeURIComponent(excludeIds)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.cards?.length > 0) {
          const newCards = rankByEngagement(mapApiCards(data.cards), usePlaxStore.getState().getCategoryScore)
          if (newCards.length > 0) {
            emptyFetchCountRef.current = 0 // reset — we got fresh cards
            newCards.forEach((c) => seenIdsRef.current.add(c.id))
            console.log(`[Plax Feed] Loaded ${newCards.length} new cards (batch #${fetchCountRef.current})`)
            setCards((prev) => {
              const updated = [...prev, ...newCards]
              setCachedCards(updated, topicsSig(selectedTopics))
              return updated
            })
            setIsFetching(false)
            isFetchingRef.current = false
            setIsInitialLoad(false)
            return
          }
        }
      }
    } catch {
      console.log('[Plax Feed] API fetch failed')
    }

    // API returned cards but all were duplicates/read, or request failed
    emptyFetchCountRef.current++
    console.log(`[Plax Feed] No new cards (empty fetch #${emptyFetchCountRef.current}/5)`)
    setIsFetching(false)
    isFetchingRef.current = false
    setIsInitialLoad(false)
  }, [selectedTopics, engagements, bookmarkedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load — show cached cards instantly, then fetch fresh in background
  useEffect(() => {
    // 1. Instant: load from localStorage cache (skip already-read cards)
    const cached = getCachedCards(topicsSig(selectedTopics)).filter((c) => !readCardIds.includes(c.id))
    if (cached.length > 0) {
      cached.forEach((c) => {
        seenIdsRef.current.add(c.id)
        const titleKey = (c.title || c.content.slice(0, 80)).toLowerCase().trim()
        seenIdsRef.current.add(`t:${titleKey}`)
      })
      setCards(cached)
      console.log(`[Plax Feed] Instant load: ${cached.length} cached cards`)
    }

    // 2. Background: fetch fresh cards and append
    const fetchLive = async () => {
      setIsFetching(true)
      isFetchingRef.current = true
      try {
        const cats = selectedTopics.join(',')
        const excludeIds = [...seenIdsRef.current].filter((id) => !id.startsWith('t:')).join(',')
        const res = await fetch(`/api/feed?categories=${cats}&limit=30&refresh=true&exclude=${encodeURIComponent(excludeIds)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.cards?.length > 0) {
            const liveCards = rankByEngagement(mapApiCards(data.cards), usePlaxStore.getState().getCategoryScore)
            liveCards.forEach((c) => seenIdsRef.current.add(c.id))
            console.log(`[Plax Feed] Live refresh: ${liveCards.length} new cards`)
            setCards((prev) => {
              // If we had cache, append new; if empty, set fresh
              const updated = prev.length > 0 ? [...prev, ...liveCards] : liveCards
              setCachedCards(updated, topicsSig(selectedTopics))
              return updated
            })
          }
        }
      } catch (err) {
        console.error('[Plax Feed] Live fetch failed:', err)
      } finally {
        setIsFetching(false)
        isFetchingRef.current = false
        setIsInitialLoad(false)
      }
    }
    fetchLive()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter loaded cards by the active desktop topic filter ──
  const visibleCards = useMemo(
    () => (feedFilter ? cards.filter((c) => c.category === feedFilter) : cards),
    [cards, feedFilter]
  )

  // Reset to the top whenever the filter changes
  useEffect(() => {
    setCurrentIndex(0)
    cardEntryTime.current = Date.now()
  }, [feedFilter])

  // Publish the current card so the desktop right rail can show it
  useEffect(() => {
    setCurrentCard(visibleCards[currentIndex] ?? null)
  }, [currentIndex, visibleCards, setCurrentCard])

  // ── Lazy AI enhancement: rewrite the raw extract of the card being read ──
  const enhanceAttempted = useRef(new Set<string>())
  const enhanceCard = useCallback(async (card: CardData | undefined) => {
    if (!card || card.aiEnhanced || enhanceAttempted.current.has(card.id)) return
    // Only transform long-form raw extracts (skip quotes, short facts)
    if (card.type !== 'microessay' || (card.content?.length ?? 0) < 240) return
    enhanceAttempted.current.add(card.id)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: card.content, type: 'microessay' }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data?.title || !data?.content) return // no AI key / failed → keep raw extract
      setCards((prev) => {
        const updated = prev.map((c) =>
          c.id === card.id
            ? { ...c, title: data.title || c.title, content: data.content, aiEnhanced: true, originalContent: c.content }
            : c
        )
        // Read topics from the store (not a stale closure) so enhanced cards are
        // cached under the CURRENT topic signature even after a topic change.
        setCachedCards(updated, topicsSig(usePlaxStore.getState().selectedTopics))
        return updated
      })
    } catch {
      /* keep the original extract on failure */
    }
  }, [])

  // Enhance the current card + prefetch the next for a smooth read
  useEffect(() => {
    enhanceCard(visibleCards[currentIndex])
    enhanceCard(visibleCards[currentIndex + 1])
  }, [currentIndex, visibleCards, enhanceCard])

  // Publish a searchable index of loaded cards for the ⌘K palette
  const setSearchItems = useUIStore((s) => s.setSearchItems)
  useEffect(() => {
    setSearchItems(cards.map((c) => ({ id: c.id, title: c.title, category: c.category, content: c.content.slice(0, 200) })))
  }, [cards, setSearchItems])

  // Jump the feed to a specific card (from search); clears the filter if needed
  const pendingJumpId = useUIStore((s) => s.pendingJumpId)
  useEffect(() => {
    if (!pendingJumpId) return
    const idx = visibleCards.findIndex((c) => c.id === pendingJumpId)
    if (idx >= 0) {
      setDirection(idx >= currentIndex ? 1 : -1)
      setCurrentIndex(idx)
      cardEntryTime.current = Date.now()
      useUIStore.getState().setPendingJumpId(null)
    } else if (useUIStore.getState().feedFilter) {
      useUIStore.getState().setFeedFilter(null) // filtered out → clear filter, retry next pass
    } else {
      useUIStore.getState().setPendingJumpId(null) // not loaded → give up
    }
  }, [pendingJumpId, visibleCards, currentIndex])

  // ── Infinite scroll: auto-fetch when near end ──
  useEffect(() => {
    const remaining = visibleCards.length - currentIndex
    if (remaining <= LOAD_MORE_THRESHOLD && !isFetching && cards.length > 0) {
      console.log(`[Plax Feed] ${remaining} cards left, fetching more...`)
      fetchMore(true)
    }
  }, [currentIndex, visibleCards.length, cards.length, isFetching, fetchMore])

  // Mark the current card as read as soon as it's displayed
  useEffect(() => {
    if (visibleCards.length > 0 && currentIndex < visibleCards.length) {
      markCardRead(visibleCards[currentIndex].id)
    }
  }, [currentIndex, visibleCards]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track engagement on card change
  const trackEngagement = useCallback(
    (cardIndex: number) => {
      if (cardIndex >= 0 && cardIndex < visibleCards.length) {
        const card = visibleCards[cardIndex]
        const timeSpent = Date.now() - cardEntryTime.current
        markCardRead(card.id)
        addEngagement({
          cardId: card.id,
          category: card.category,
          timeSpent,
          bookmarked: bookmarkedIds.includes(card.id),
          shared: false,
          completed: timeSpent > 4000, // Spent more than 4 seconds
        })
      }
      cardEntryTime.current = Date.now()
    },
    [visibleCards, bookmarkedIds, addEngagement]
  )

  const goToCard = useCallback(
    (newIndex: number, dir: number) => {
      if (newIndex < 0) return // can't go before first card
      if (newIndex >= visibleCards.length) {
        // At the edge — trigger fetch & don't move yet
        if (!isFetching) fetchMore(true)
        return
      }
      trackEngagement(currentIndex)
      setDirection(dir)
      setCurrentIndex(newIndex)
      incrementCardsRead()
    },
    [visibleCards.length, currentIndex, trackEngagement, incrementCardsRead, isFetching, fetchMore]
  )

  // Touch navigation — lets long article content scroll natively, and only
  // navigates on a decisive swipe when the content is at its scroll boundary.
  const touchStartRef = useRef<{ y: number; atTop: boolean; atBottom: boolean } | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scroller = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-card-scroll]')
    let atTop = true
    let atBottom = true
    if (scroller) {
      atTop = scroller.scrollTop <= 1
      atBottom = Math.ceil(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight - 1
    }
    touchStartRef.current = { y: e.touches[0].clientY, atTop, atBottom }
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const dy = e.changedTouches[0].clientY - start.y
    const SWIPE = 55
    if (dy < -SWIPE && start.atBottom) goToCard(currentIndex + 1, 1) // swipe up → next
    else if (dy > SWIPE && start.atTop) goToCard(currentIndex - 1, -1) // swipe down → prev
  }, [currentIndex, goToCard])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (useUIStore.getState().commandOpen) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'j') {
        e.preventDefault()
        goToCard(currentIndex + 1, 1)
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        goToCard(currentIndex - 1, -1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIndex, goToCard])

  // Scroll wheel navigation — scroll long article content first, only advance
  // to the next/prev card once the content reaches its scroll boundary.
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (useUIStore.getState().commandOpen) return

      // Ignore wheel events over the desktop rails / any other scrollable chrome
      // so they scroll natively instead of navigating the feed.
      const target = e.target as HTMLElement | null
      if (target?.closest('aside, [data-no-feed-scroll]')) return

      // Let the active card's content scroll while it still can in this direction
      const scroller = document.querySelector<HTMLElement>('[data-card-scroll]')
      if (scroller) {
        const { scrollTop, scrollHeight, clientHeight } = scroller
        const canScrollDown = Math.ceil(scrollTop + clientHeight) < scrollHeight - 1
        const canScrollUp = scrollTop > 1
        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
          return // native scroll handles it; don't navigate
        }
      }

      e.preventDefault()
      if (scrollTimeout.current) return
      scrollTimeout.current = setTimeout(() => {
        scrollTimeout.current = null
      }, 600)
      if (e.deltaY > 30) goToCard(currentIndex + 1, 1)
      if (e.deltaY < -30) goToCard(currentIndex - 1, -1)
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [currentIndex, goToCard])

  const currentCard = visibleCards[currentIndex]
  const prevCard = currentIndex > 0 ? visibleCards[currentIndex - 1] : null
  const nextCard = currentIndex < visibleCards.length - 1 ? visibleCards[currentIndex + 1] : null

  // Single source of read-progress (drives the top segmented bar + card dock),
  // restarts each time the visible card changes.
  const [readProgress, setReadProgress] = useState(0)
  useEffect(() => {
    setReadProgress(0)
    if (!currentCard) return
    const rt = currentCard.readTime || '30s'
    const readTimeMs = rt.includes('m') ? parseInt(rt) * 60000 : parseInt(rt) * 1000
    const step = Math.max(60, readTimeMs / 50)
    const interval = setInterval(() => setReadProgress((p) => Math.min(p + 2, 100)), step)
    return () => clearInterval(interval)
  }, [currentCard?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentCard) {
    const filterEmpty = feedFilter && cards.length > 0 && visibleCards.length === 0
    // Premium skeleton while first content loads
    if (!filterEmpty && (isFetching || isInitialLoad)) {
      return (
        <div className="feed-container">
          <CardSkeleton />
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 text-dark-subtle text-xs">
            <span className="w-3.5 h-3.5 border-2 border-violet-500/60 border-t-transparent rounded-full animate-spin" />
            Curating your feed…
          </div>
        </div>
      )
    }
    return (
      <div className="feed-container flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5 px-6 text-center max-w-sm"
        >
          {filterEmpty ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">🔭</div>
              <div>
                <p className="text-white text-lg font-semibold mb-1">Nothing here yet</p>
                <p className="text-dark-muted text-sm">We&apos;re still gathering cards for this topic. Browse everything in the meantime.</p>
              </div>
              <button
                onClick={() => useUIStore.getState().setFeedFilter(null)}
                className="btn-primary focus-ring px-5 py-2.5 text-sm"
              >
                Show all topics
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">📭</div>
              <div>
                <p className="text-white text-lg font-semibold mb-1">You&apos;re all caught up</p>
                <p className="text-dark-muted text-sm">You&apos;ve read everything we have right now. Check back soon for fresh insights.</p>
              </div>
              <button
                onClick={() => {
                  emptyFetchCountRef.current = 0
                  fetchMore(true)
                }}
                className="btn-primary focus-ring px-5 py-2.5 text-sm"
              >
                Refresh feed
              </button>
            </>
          )}
        </motion.div>
      </div>
    )
  }

  const variants = {
    enter: (dir: number) => ({
      y: dir > 0 ? '38%' : '-38%',
      opacity: 0,
      scale: 0.96,
    }),
    center: {
      y: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir: number) => ({
      y: dir > 0 ? '-18%' : '18%',
      opacity: 0,
      scale: 0.97,
    }),
  }

  return (
    <div className="feed-container">
      {/* Infinite progress pulse at top */}
      {isFetching && (
        <div className="absolute top-0 left-0 right-0 z-50 h-0.5 bg-white/5 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-transparent via-violet-500 to-transparent w-1/3"
            animate={{ x: ['-100%', '400%'] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Fetching indicator (subtle, no card numbering) */}
      <AnimatePresence>
        {isFetching && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-[calc(5rem+env(safe-area-inset-top))] right-4 z-40 lg:top-4"
          >
            <div className="flex items-center gap-2 text-dark-subtle text-xs glass px-3 py-1.5 rounded-full">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-3.5 h-3.5 border-[1.5px] border-violet-400 border-t-transparent rounded-full inline-block"
              />
              <span>Loading</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main swipe area */}
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={currentCard.id}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            y: { type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] },
            scale: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.18 },
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="card-slot"
        >
          <Card card={currentCard} isActive={true} />
        </motion.div>
      </AnimatePresence>

      {/* Fixed action dock (Inshorts-style) — stays put while cards flip */}
      <CardActions card={currentCard} />

      {/* Stories-style reading-progress bar (Instagram/Inshorts). RIGHT-ANCHORED
          window of 7 segments = your recent journey through the feed: cards you've
          passed stay FILLED, the current card fills by read progress, and the
          window slides so the active (filling) segment is always at the right
          edge once you're past the 7th card. This shows real forward motion and
          never pins in the MIDDLE (the old windowed+centered bar pinned at
          position 3 on an unbounded feed, which looked stuck). */}
      {(() => {
        const SEG = 7
        const start = Math.max(0, currentIndex - (SEG - 1))
        return (
          <div className="absolute left-1/2 -translate-x-1/2 z-40 top-[calc(4.5rem+env(safe-area-inset-top))] lg:top-6 w-[min(70%,26rem)] flex items-center gap-1">
            {Array.from({ length: SEG }).map((_, j) => {
              const idx = start + j
              const beyond = idx >= visibleCards.length
              const isPast = idx < currentIndex
              const isCurrent = idx === currentIndex
              const fill = beyond ? 0 : isPast ? 100 : isCurrent ? readProgress : 0
              return (
                <div key={j} className="h-[3px] flex-1 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 transition-[width] duration-200 ease-out"
                    style={{ width: `${fill}%` }}
                  />
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Loading indicator when fetching more at the end */}
      {isFetching && currentIndex >= visibleCards.length - 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30"
        >
          <div className="flex items-center gap-2 glass px-4 py-2 rounded-full">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full"
            />
            <span className="text-dark-text/80 text-xs font-medium">Loading more…</span>
          </div>
        </motion.div>
      )}

      {/* Swipe hint on first card */}
      {currentIndex === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 text-dark-subtle text-xs flex flex-col items-center gap-1.5 pointer-events-none"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            className="w-9 h-9 rounded-full glass flex items-center justify-center"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
            </svg>
          </motion.div>
          <span className="hidden sm:block">Swipe up or press ↓</span>
        </motion.div>
      )}
    </div>
  )
}
