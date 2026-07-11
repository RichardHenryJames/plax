'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from './Card'
import { CardActions } from './CardActions'
import { CardSkeleton } from './Skeleton'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { translate } from '@/lib/i18n'

const LOAD_MORE_THRESHOLD = 10 // fetch more when 10 cards from end
const CARD_CACHE_KEY = 'plax-card-cache'
const CARD_CACHE_MAX_AGE = 30 * 60 * 1000 // 30 minutes

// A stable signature of the current topic selection, so the cache is scoped to
// the topics it was built for (prevents stale cards from a previous topic pick
// showing first when the user changes what they follow).
function topicsSig(topics: string[]): string {
  return [...topics].sort().join(',')
}

// Cache/reload signature scoped to the TOPIC selection only. Language is handled
// separately (by re-translating loaded cards in place), so switching language
// keeps the SAME articles — it never refetches or empties the feed.
function feedSig(topics: string[]): string {
  return topicsSig(topics)
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

// Whether a card is eligible for AI enhancement/translation in the given language.
// EN: only long-form raw extracts (skip quotes/short facts). HI: every substantive
// card (so the whole feed reads in Hindi). Mirrors the logic in enhanceCard.
function needsEnhance(card: CardData, lang: string): boolean {
  const base = card.originalContent ?? card.content
  if (lang === 'en') return card.type === 'microessay' && (base?.length ?? 0) >= 240
  return (base?.length ?? 0) >= 120
}

export function Feed() {
  const { selectedTopics, bookmarkedIds, engagements, addEngagement, incrementCardsRead, readCardIds, markCardRead } = usePlaxStore()
  const language = usePlaxStore((s) => s.language)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const setCurrentCard = useUIStore((s) => s.setCurrentCard)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const cardEntryTime = useRef(Date.now())
  const [cards, setCards] = useState<CardData[]>([])
  const [focusCard, setFocusCard] = useState<CardData | null>(null) // a saved card opened via /?card=<id>
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
      const res = await fetch(`/api/feed?categories=${cats}&limit=30&refresh=${refresh}&lang=en&exclude=${encodeURIComponent(excludeIds)}`)
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
              setCachedCards(updated, feedSig(selectedTopics))
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

  // Initial load + RELOAD whenever the selected topics change (NOT language).
  // Keyed on the topic signature so editing interests fully resets the feed.
  // Language changes are handled separately by re-translating the loaded cards
  // in place, so toggling EN⇄HI keeps the SAME articles and never empties the feed.
  const sig = feedSig(selectedTopics)
  useEffect(() => {
    // Full reset for the new topic selection.
    seenIdsRef.current = new Set<string>()
    emptyFetchCountRef.current = 0
    fetchCountRef.current = 0
    lastFetchTimeRef.current = 0
    setCurrentIndex(0)
    setIsInitialLoad(true)
    cardEntryTime.current = Date.now()

    // 1. Instant: load from localStorage cache for THIS sig (skip read cards)
    const cached = getCachedCards(sig).filter((c) => !readCardIds.includes(c.id))
    if (cached.length > 0) {
      cached.forEach((c) => {
        seenIdsRef.current.add(c.id)
        const titleKey = (c.title || c.content.slice(0, 80)).toLowerCase().trim()
        seenIdsRef.current.add(`t:${titleKey}`)
      })
      setCards(cached)
      console.log(`[Plax Feed] Instant load: ${cached.length} cached cards`)
    } else {
      setCards([]) // no cache for this sig → clear the old cards immediately
    }

    // 2. Background: fetch fresh cards. We ALWAYS source in a stable base language
    //    (English) so the article SET is identical regardless of the UI language;
    //    the AI-enhance step translates each card into the current language. This
    //    is what makes toggling language translate the SAME article in place.
    let cancelled = false
    const fetchLive = async () => {
      setIsFetching(true)
      isFetchingRef.current = true
      try {
        const cats = selectedTopics.join(',')
        const excludeIds = [...seenIdsRef.current].filter((id) => !id.startsWith('t:')).join(',')
        const res = await fetch(`/api/feed?categories=${cats}&limit=30&refresh=true&lang=en&exclude=${encodeURIComponent(excludeIds)}`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data.cards?.length > 0) {
            const liveCards = rankByEngagement(mapApiCards(data.cards), usePlaxStore.getState().getCategoryScore)
            liveCards.forEach((c) => seenIdsRef.current.add(c.id))
            console.log(`[Plax Feed] Live refresh: ${liveCards.length} new cards`)
            setCards((prev) => {
              const updated = prev.length > 0 ? [...prev, ...liveCards] : liveCards
              setCachedCards(updated, sig)
              return updated
            })
          }
        }
      } catch (err) {
        console.error('[Plax Feed] Live fetch failed:', err)
      } finally {
        if (!cancelled) {
          setIsFetching(false)
          isFetchingRef.current = false
          setIsInitialLoad(false)
        }
      }
    }
    fetchLive()
    return () => { cancelled = true }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter loaded cards by the active desktop topic filter ──
  const visibleCards = useMemo(
    () => {
      const base = feedFilter ? cards.filter((c) => c.category === feedFilter) : cards
      // A saved card opened via /?card= is pinned to the FRONT (deduped) so the
      // reader lands on it regardless of when the live feed finishes loading.
      if (focusCard && !base.some((c) => c.id === focusCard.id)) return [focusCard, ...base]
      return base
    },
    [cards, feedFilter, focusCard]
  )

  // Reset to the top whenever the filter changes
  useEffect(() => {
    setCurrentIndex(0)
    cardEntryTime.current = Date.now()
  }, [feedFilter])

  // ── Open a specific saved article: /?card=<id> (from the Bookmarks list). We
  //    inject the saved card (persisted in the store) at the FRONT of the feed and
  //    jump to it, so tapping a bookmark reads it in the normal feed reader. Runs
  //    once on mount; the id is also seeded into seenIds so the live fetch won't
  //    duplicate it. ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wantId = params.get('card')
    if (!wantId) return
    // Read the saved card. Prefer the live store, but fall back to the persisted
    // localStorage snapshot because zustand's persist may not have rehydrated yet
    // on first mount (which would otherwise leave bookmarkedCards empty → no pin).
    let saved = usePlaxStore.getState().bookmarkedCards[wantId]
    if (!saved) {
      try {
        const persisted = JSON.parse(localStorage.getItem('plax-store-v2') || '{}')
        saved = persisted?.state?.bookmarkedCards?.[wantId]
      } catch { /* ignore malformed cache */ }
    }
    if (!saved) return
    const focus: CardData = {
      id: saved.id,
      type: 'microessay',
      title: saved.title,
      content: saved.content,
      source: saved.source,
      sourceUrl: saved.sourceUrl,
      category: saved.category,
      readTime: '1m',
      emoji: saved.emoji,
      aiEnhanced: true,
      enhancedLang: 'en',
      originalContent: saved.content,
      originalTitle: saved.title,
    }
    seenIdsRef.current.add(saved.id)
    const titleKey = (saved.title || saved.content.slice(0, 80)).toLowerCase().trim()
    seenIdsRef.current.add(`t:${titleKey}`)
    setFocusCard(focus)
    setCurrentIndex(0)
    // Clear the query param so a later refresh doesn't re-pin the same card.
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // Publish the current card so the desktop right rail can show it
  useEffect(() => {
    setCurrentCard(visibleCards[currentIndex] ?? null)
  }, [currentIndex, visibleCards, setCurrentCard])

  // ── Lazy AI enhancement / translation: rewrite the raw extract of the card
  //    being read INTO the current language. Re-runs when the language changes so
  //    the SAME article is translated in place (never a different card). ──
  // We track ATTEMPT COUNTS per (card, language) instead of a boolean, so a
  // transient failure (e.g. Gemini quota 429) RETRIES on the next view/poll
  // instead of leaving raw English forever (the "still English in Hindi" bug).
  const enhanceCounts = useRef(new Map<string, number>())
  const enhanceInflight = useRef(new Set<string>())
  const [enhancingIds, setEnhancingIds] = useState<Set<string>>(new Set())
  const [enhanceFailed, setEnhanceFailed] = useState<Set<string>>(new Set()) // `${id}:${lang}` gave up
  const MAX_ENHANCE_ATTEMPTS = 4
  const enhanceCard = useCallback(async (card: CardData | undefined) => {
    if (!card) return
    const lang = usePlaxStore.getState().language
    // Already rendered in the current language → nothing to do.
    if (card.aiEnhanced && card.enhancedLang === lang) return
    const key = `${card.id}:${lang}`
    if (enhanceInflight.current.has(key)) return // already fetching this one
    if ((enhanceCounts.current.get(key) ?? 0) >= MAX_ENHANCE_ATTEMPTS) return

    // Always translate from the ORIGINAL raw extract (so we never translate an
    // already-translated string, which would degrade quality).
    const baseContent = card.originalContent ?? card.content
    const baseTitle = card.originalTitle ?? card.title
    // English: only transform long-form raw extracts (skip quotes, short facts).
    // Hindi: enhance every substantive card so the whole feed reads in Hindi.
    if (lang === 'en') {
      if (card.type !== 'microessay' || (baseContent?.length ?? 0) < 240) return
    } else {
      if ((baseContent?.length ?? 0) < 120) return
    }
    enhanceCounts.current.set(key, (enhanceCounts.current.get(key) ?? 0) + 1)
    enhanceInflight.current.add(key)
    setEnhancingIds((s) => new Set(s).add(card.id))
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: baseContent, title: baseTitle, type: 'microessay', lang }),
      })
      if (!res.ok) return // transient (5xx / network) → will retry next view
      const data = await res.json()
      // Accept the response if we got translated/enhanced CONTENT (title may be
      // empty when the LLM is down but the dedicated translator still worked).
      if (!data?.content) return
      // For Hindi, require the body to actually be Hindi — otherwise it's an
      // English fallback (translator unavailable) and we should retry, not accept.
      if (lang === 'hi' && !/[\u0900-\u097F]/.test(data.content)) return
      // Guard against a stale response: only apply if the language is still current.
      if (usePlaxStore.getState().language !== lang) return
      setCards((prev) => {
        const updated = prev.map((c) =>
          c.id === card.id
            ? {
                ...c,
                title: data.title || baseTitle,
                content: data.content,
                aiEnhanced: true,
                enhancedLang: lang,
                originalContent: baseContent,
                originalTitle: baseTitle,
              }
            : c
        )
        setCachedCards(updated, feedSig(usePlaxStore.getState().selectedTopics))
        return updated
      })
    } catch {
      /* keep the original extract on failure — will retry on next view */
    } finally {
      enhanceInflight.current.delete(key)
      setEnhancingIds((s) => { const n = new Set(s); n.delete(card.id); return n })
      // If we've exhausted attempts and it's STILL not in the target language,
      // mark it failed so the UI can stop showing the translating shimmer and
      // fall back to the raw extract instead of shimmering forever.
      if ((enhanceCounts.current.get(key) ?? 0) >= MAX_ENHANCE_ATTEMPTS) {
        setEnhanceFailed((s) => new Set(s).add(key))
      }
    }
  }, [])

  // Enhance the current card + prefetch the NEXT one so that by the time the user
  // swipes (or toggles language), the translation is already ready — makes it feel
  // instant. We prefetch only ONE ahead to conserve the AI token budget (each
  // enhancement is an AI call; prefetching many ahead burns the daily quota fast).
  useEffect(() => {
    enhanceCard(visibleCards[currentIndex])
    enhanceCard(visibleCards[currentIndex + 1])
  }, [currentIndex, visibleCards, enhanceCard, language])

  // Retry loop: if the CURRENT card still isn't rendered in the active language
  // (e.g. a transient AI-quota failure), retry every couple seconds until it is
  // (up to the per-card attempt cap). This fixes "still English in Hindi mode"
  // when the first enhancement attempt failed.
  useEffect(() => {
    const cur = visibleCards[currentIndex]
    if (!cur) return
    if (cur.aiEnhanced && cur.enhancedLang === language) return
    const id = setInterval(() => {
      const c = visibleCards[currentIndex]
      if (c && !(c.aiEnhanced && c.enhancedLang === language)) enhanceCard(c)
      else clearInterval(id)
    }, 2000)
    return () => clearInterval(id)
  }, [currentIndex, visibleCards, language, enhanceCard])

  // When the language toggles, immediately revert any card that was enhanced in
  // the OTHER language back to its raw extract so the user sees the same article
  // (briefly raw) and then the re-translation — never a stale wrong-language text
  // and never an emptied feed.
  const prevLangRef = useRef(language)
  useEffect(() => {
    if (prevLangRef.current === language) return
    prevLangRef.current = language
    setCards((prev) =>
      prev.map((c) =>
        c.aiEnhanced && c.enhancedLang !== language
          ? {
              ...c,
              content: c.originalContent ?? c.content,
              title: c.originalTitle ?? c.title,
              aiEnhanced: false,
            }
          : c
      )
    )
  }, [language])

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
  const touchStartRef = useRef<{ y: number; x: number; t: number; atTop: boolean; atBottom: boolean; onInteractive: boolean } | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scroller = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-card-scroll]')
    let atTop = true
    let atBottom = true
    if (scroller) {
      atTop = scroller.scrollTop <= 1
      atBottom = Math.ceil(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight - 1
    }
    // If the gesture starts on an interactive element (buttons, links, the quiz,
    // dropdowns) don't treat it as a feed swipe — prevents accidental next-card
    // when tapping "Go deeper"/"Test yourself"/topic chip/actions.
    const target = e.target as HTMLElement | null
    const onInteractive = !!target?.closest('button, a, input, textarea, [data-no-feed-scroll]')
    touchStartRef.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now(), atTop, atBottom, onInteractive }
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || start.onInteractive) return
    const dy = e.changedTouches[0].clientY - start.y
    const dx = e.changedTouches[0].clientX - start.x
    const dt = Date.now() - start.t
    const SWIPE = 72 // require a decisive swipe (was 55 — too easy to trigger accidentally)
    // Must be mostly VERTICAL (ignore diagonal/horizontal drags) and a real
    // gesture (either a quick flick or a clearly long drag), so tiny reading
    // adjustments don't flip the card.
    if (Math.abs(dy) < SWIPE) return
    if (Math.abs(dy) < Math.abs(dx) * 1.4) return // too diagonal → not a feed swipe
    const isDeliberate = dt < 700 || Math.abs(dy) > 120
    if (!isDeliberate) return
    if (dy < 0 && start.atBottom) goToCard(currentIndex + 1, 1) // swipe up → next
    else if (dy > 0 && start.atTop) goToCard(currentIndex - 1, -1) // swipe down → prev
  }, [currentIndex, goToCard])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const ui = useUIStore.getState()
      if (ui.commandOpen || ui.topicsOpen) return
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
      const ui = useUIStore.getState()
      if (ui.commandOpen || ui.topicsOpen) return

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
      if (e.deltaY > 45) goToCard(currentIndex + 1, 1)
      if (e.deltaY < -45) goToCard(currentIndex - 1, -1)
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [currentIndex, goToCard])

  const currentCard = visibleCards[currentIndex]
  const prevCard = currentIndex > 0 ? visibleCards[currentIndex - 1] : null
  const nextCard = currentIndex < visibleCards.length - 1 ? visibleCards[currentIndex + 1] : null

  // The current card is "processing" when it's eligible for AI enhancement but not
  // yet rendered for the active language, and we haven't given up. The Card shows a
  // clean shimmer for this instead of showing the raw extract and then FLICKERING to
  // the AI summary in place. Applies to BOTH: English (long raw extract → AI summary)
  // and Hindi (English raw → Hindi translation) — either way the reader only ever
  // sees skeleton → final text, never a jarring content swap.
  const currentTranslating = !!currentCard
    && needsEnhance(currentCard, language)
    && !(currentCard.aiEnhanced && currentCard.enhancedLang === language)
    && !enhanceFailed.has(`${currentCard.id}:${language}`)

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
            <span className="w-3.5 h-3.5 border-2 border-[color:var(--signal)] border-t-transparent rounded-full animate-spin" />
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
            className="h-full bg-gradient-to-r from-transparent via-[color:var(--signal)] to-transparent w-1/3"
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
                className="w-3.5 h-3.5 border-[1.5px] border-[color:var(--signal)] border-t-transparent rounded-full inline-block"
              />
              <span className={language === 'hi' ? 'lang-hi' : ''}>{translate(language, 'loading')}</span>
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
          <Card card={currentCard} isActive={true} translating={currentTranslating} />
        </motion.div>
      </AnimatePresence>

      {/* Fixed action dock (Inshorts-style) — stays put while cards flip */}
      <CardActions card={currentCard} />

      {/* Stories-style reading-progress bar (Instagram/Inshorts). PAGED into rows
          of 7: within a row the segments to the left of the current card are
          filled, the current card fills by read progress, and the rest are empty.
          After card 7 the bar RESETS — card 8 starts a fresh row at segment 1 —
          so it reads like a repeating 1→7 cycle instead of pinning at the end. */}
      {(() => {
        const SEG = 7
        const posInPage = currentIndex % SEG // 0..6 within the current row of 7
        return (
          <div className="absolute left-1/2 -translate-x-1/2 z-40 top-[calc(4.5rem+env(safe-area-inset-top))] lg:top-4 w-[min(60%,20rem)] flex items-center gap-1">
            {Array.from({ length: SEG }).map((_, j) => {
              const fill = j < posInPage ? 100 : j === posInPage ? readProgress : 0
              return (
                <div key={j} className="h-[3px] flex-1 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--signal)] transition-[width] duration-200 ease-out"
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
              className="w-4 h-4 border-2 border-[color:var(--signal)] border-t-transparent rounded-full"
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
          <span className={`hidden sm:block ${language === 'hi' ? 'lang-hi' : ''}`}>{translate(language, 'swipeOrPress')}</span>
        </motion.div>
      )}
    </div>
  )
}
