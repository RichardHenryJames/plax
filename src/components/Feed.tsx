'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { Card } from './Card'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore } from '@/lib/store'

const SWIPE_THRESHOLD = 80
const LOAD_MORE_THRESHOLD = 10 // fetch more when 10 cards from end
const CARD_CACHE_KEY = 'plax-card-cache'
const CARD_CACHE_MAX_AGE = 30 * 60 * 1000 // 30 minutes

// ── Client-side card cache (localStorage) ──
function getCachedCards(): CardData[] {
  try {
    const raw = localStorage.getItem(CARD_CACHE_KEY)
    if (!raw) return []
    const { cards, ts } = JSON.parse(raw)
    if (Date.now() - ts > CARD_CACHE_MAX_AGE) {
      localStorage.removeItem(CARD_CACHE_KEY)
      return []
    }
    return cards || []
  } catch {
    return []
  }
}

function setCachedCards(cards: CardData[]) {
  try {
    // Keep last 60 cards in cache
    const toStore = cards.slice(-60)
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify({ cards: toStore, ts: Date.now() }))
  } catch { /* quota exceeded — ignore */ }
}

export function Feed() {
  const { selectedTopics, bookmarkedIds, engagements, addEngagement, incrementCardsRead, readCardIds, markCardRead } = usePlaxStore()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const cardEntryTime = useRef(Date.now())
  const [cards, setCards] = useState<CardData[]>([])
  const [isFetching, setIsFetching] = useState(false)
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
      .filter((c) => !readCardIds.includes(c.id)) // skip already-read cards
      .filter((c) => { // deduplicate by title within session
        const titleKey = (c.title || c.content.slice(0, 80)).toLowerCase().trim()
        if (seenIdsRef.current.has(`t:${titleKey}`)) return false
        seenIdsRef.current.add(`t:${titleKey}`)
        return true
      })
  }

  // Fetch a batch of cards
  const fetchMore = useCallback(async (refresh = false) => {
    if (isFetching) return

    // Cooldown: don't re-fetch within 10 seconds
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 10_000) return

    // Stop after 3 consecutive empty fetches (all cards already seen/read)
    if (emptyFetchCountRef.current >= 3) {
      console.log('[Plax Feed] Stopped fetching — 3 consecutive empty responses (all content read)')
      return
    }

    setIsFetching(true)
    lastFetchTimeRef.current = now
    fetchCountRef.current++

    try {
      const cats = selectedTopics.join(',')
      const res = await fetch(`/api/feed?categories=${cats}&limit=20&refresh=${refresh}`)
      if (res.ok) {
        const data = await res.json()
        if (data.cards?.length > 0) {
          const newCards = mapApiCards(data.cards)
          if (newCards.length > 0) {
            emptyFetchCountRef.current = 0 // reset — we got fresh cards
            newCards.forEach((c) => seenIdsRef.current.add(c.id))
            console.log(`[Plax Feed] Loaded ${newCards.length} new cards (batch #${fetchCountRef.current})`)
            setCards((prev) => {
              const updated = [...prev, ...newCards]
              setCachedCards(updated)
              return updated
            })
            setIsFetching(false)
            return
          }
        }
      }
    } catch {
      console.log('[Plax Feed] API fetch failed')
    }

    // API returned cards but all were duplicates/read, or request failed
    emptyFetchCountRef.current++
    console.log(`[Plax Feed] No new cards (empty fetch #${emptyFetchCountRef.current}/3)`)
    setIsFetching(false)
  }, [isFetching, selectedTopics, engagements, bookmarkedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load — show cached cards instantly, then fetch fresh in background
  useEffect(() => {
    // 1. Instant: load from localStorage cache (skip already-read cards)
    const cached = getCachedCards().filter((c) => !readCardIds.includes(c.id))
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
      try {
        const cats = selectedTopics.join(',')
        const res = await fetch(`/api/feed?categories=${cats}&limit=20&refresh=true`)
        if (res.ok) {
          const data = await res.json()
          if (data.cards?.length > 0) {
            const liveCards = mapApiCards(data.cards)
            liveCards.forEach((c) => seenIdsRef.current.add(c.id))
            console.log(`[Plax Feed] Live refresh: ${liveCards.length} new cards`)
            setCards((prev) => {
              // If we had cache, append new; if empty, set fresh
              const updated = prev.length > 0 ? [...prev, ...liveCards] : liveCards
              setCachedCards(updated)
              return updated
            })
          }
        }
      } catch (err) {
        console.error('[Plax Feed] Live fetch failed:', err)
      } finally {
        setIsFetching(false)
      }
    }
    fetchLive()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Infinite scroll: auto-fetch when near end ──
  useEffect(() => {
    const remaining = cards.length - currentIndex
    if (remaining <= LOAD_MORE_THRESHOLD && !isFetching && cards.length > 0) {
      console.log(`[Plax Feed] ${remaining} cards left, fetching more...`)
      fetchMore(true)
    }
  }, [currentIndex, cards.length, isFetching, fetchMore])

  // Mark the current card as read as soon as it's displayed
  useEffect(() => {
    if (cards.length > 0 && currentIndex < cards.length) {
      markCardRead(cards[currentIndex].id)
    }
  }, [currentIndex, cards]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track engagement on card change
  const trackEngagement = useCallback(
    (cardIndex: number) => {
      if (cardIndex >= 0 && cardIndex < cards.length) {
        const card = cards[cardIndex]
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
    [cards, bookmarkedIds, addEngagement]
  )

  const goToCard = useCallback(
    (newIndex: number, dir: number) => {
      if (newIndex < 0) return // can't go before first card
      if (newIndex >= cards.length) {
        // At the edge — trigger fetch & don't move yet
        if (!isFetching) fetchMore(true)
        return
      }
      trackEngagement(currentIndex)
      setDirection(dir)
      setCurrentIndex(newIndex)
      incrementCardsRead()
    },
    [cards.length, currentIndex, trackEngagement, incrementCardsRead, isFetching, fetchMore]
  )

  // Handle drag end
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info
      if (offset.y < -SWIPE_THRESHOLD || velocity.y < -500) {
        goToCard(currentIndex + 1, 1) // Swipe up → next
      } else if (offset.y > SWIPE_THRESHOLD || velocity.y > 500) {
        goToCard(currentIndex - 1, -1) // Swipe down → prev
      }
    },
    [currentIndex, goToCard]
  )

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
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

  // Scroll wheel navigation
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
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

  const currentCard = cards[currentIndex]
  const prevCard = currentIndex > 0 ? cards[currentIndex - 1] : null
  const nextCard = currentIndex < cards.length - 1 ? cards[currentIndex + 1] : null

  if (!currentCard) {
    return (
      <div className="feed-container flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          {isFetching ? (
            <>
              <motion.img
                src="/plaxlabs_logo.png"
                alt="Plax"
                className="w-14 h-14 rounded-2xl"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              />
              <p className="text-dark-muted text-sm">Fetching fresh content…</p>
            </>
          ) : (
            <>
              <p className="text-dark-muted text-lg">No content available</p>
              <button
                onClick={() => fetchMore(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-cyan-500 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const variants = {
    enter: (dir: number) => ({
      y: dir > 0 ? '40%' : '-40%',
      opacity: 0,
    }),
    center: {
      y: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      y: dir > 0 ? '-20%' : '20%',
      opacity: 0,
    }),
  }

  return (
    <div className="feed-container">
      {/* Infinite progress pulse at top */}
      {isFetching && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-dark-border overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-transparent via-plax-accent to-transparent w-1/3"
            animate={{ x: ['-100%', '400%'] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Card counter */}
      <div className="fixed top-16 right-4 z-40">
        <div className="flex items-center gap-2 text-dark-subtle text-xs bg-dark-card/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-dark-border">
          <span className="text-white font-medium">#{currentIndex + 1}</span>
          {isFetching && (
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="text-plax-accent"
            >
              ⟳
            </motion.span>
          )}
        </div>
      </div>

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
            y: { type: 'tween', duration: 0.15, ease: [0.25, 0.1, 0.25, 1] },
            opacity: { duration: 0.12 },
          }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
          className="card-slot cursor-grab active:cursor-grabbing"
        >
          <Card card={currentCard} isActive={true} />
        </motion.div>
      </AnimatePresence>

      {/* Side progress dots */}
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1">
        {cards.slice(
          Math.max(0, currentIndex - 4),
          Math.min(cards.length, currentIndex + 5)
        ).map((card, i) => {
          const actualIndex = Math.max(0, currentIndex - 4) + i
          return (
            <motion.div
              key={card.id}
              animate={{
                height: actualIndex === currentIndex ? 24 : 6,
                opacity: actualIndex === currentIndex ? 1 : 0.3,
              }}
              className="w-1 rounded-full bg-white"
              transition={{ duration: 0.2 }}
            />
          )
        })}
      </div>

      {/* Loading indicator when fetching more at the end */}
      {isFetching && currentIndex >= cards.length - 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30"
        >
          <div className="flex items-center gap-2 bg-dark-card/90 backdrop-blur-md px-4 py-2 rounded-full border border-dark-border">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-4 h-4 border-2 border-plax-accent border-t-transparent rounded-full"
            />
            <span className="text-dark-subtle text-xs">Loading more...</span>
          </div>
        </motion.div>
      )}

      {/* Swipe hint on first card */}
      {currentIndex === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 text-dark-subtle text-xs flex flex-col items-center gap-2"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
            </svg>
          </motion.div>
          <span>Swipe up or press ↓</span>
        </motion.div>
      )}
    </div>
  )
}
