'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from './Card'
import { CardActions } from './CardActions'
import { CardSkeleton } from './Skeleton'
import { CaughtUp } from './CaughtUp'
import { CardData } from '@/lib/sample-data'
import { usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { translate } from '@/lib/i18n'
import { NEWS_SECTIONS } from '@/lib/types'
import { withBase } from '@/lib/base-path'
import { SeenStore, replace, append, EARLIER_LIMIT } from '@/lib/story-engine'
import { loadSeen, saveSeen } from '@/lib/seen-storage'

const LOAD_MORE_THRESHOLD = 10 // fetch more when 10 cards from end
const CARD_CACHE_KEY = 'plax-card-cache-v2'
const CARD_CACHE_NEWS_AGE = 2 * 60 * 60 * 1000 // news goes stale fast: an older page is not shown as current
const CARD_CACHE_EVERGREEN_AGE = 24 * 60 * 60 * 1000
const CARD_CACHE_ENTRIES = 4 // the last few feeds, so switching back to one is instant
const SEEN_IDS_CAP = 1500 // bound the in-session seen-id set (memory safety)
const EXCLUDE_LIMIT = 200 // ids sent to the server so paging skips what is already loaded or read
const MORE_ATTEMPTS = 3 // pages tried before concluding nothing new is left
const DWELL_MS = 1200 // a story on screen this long counts as read
const GLANCE_MS = 500 // a shorter glance still counts when the reader moves on
const REVISIT_MS = 2 * 60 * 1000 // away this long: quietly look for newer stories
const NEW_SESSION_MS = 30 * 60 * 1000 // away this long: start again from the newest stories
const SWAP_WINDOW_MS = 1500 // new stories replace the list only while the reader has not moved
const PLACE_KEEP_MS = 2 * 60 * 1000 // a feed left this recently (for Topics or Saved) is found as it was, with no request
const PLACES_KEPT = 6
export const CAUGHT_UP_ID = '__caught_up__'

const isMarker = (c: CardData) => c.id === CAUGHT_UP_ID
const withoutMarker = (cards: CardData[]) => cards.filter((c) => !isMarker(c))
const marker = (): CardData => ({ id: CAUGHT_UP_ID, type: 'microessay', content: '', category: 'news', readTime: '' })

// Where each feed was left (what was loaded, what was held back, and the story being read), so going to Topics
// or Saved and back finds the same story, as in the app. Kept for the life of the page only.
type Place = { cards: CardData[]; earlier: CardData[]; index: number; exhausted: boolean; at: number; session: number; focus: CardData | null }
const places = new Map<string, Place>()

function rememberPlace(sig: string, place: Place) {
  if (place.cards.length === 0) return
  places.delete(sig)
  places.set(sig, place)
  while (places.size > PLACES_KEPT) {
    const oldest = places.keys().next().value
    if (oldest === undefined) break
    places.delete(oldest)
  }
}

// fetch() with a hard timeout so a slow/hung network never leaves the feed
// spinning forever (mobile networks especially). Aborts after `ms`.
//
// Root-relative URLs are sent through withBase() here rather than at each call
// site: this app is proxied at /news, and a bare /api/... would leave the zone
// and 404 against the app that owns the domain root.
async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url.startsWith('/') ? withBase(url) : url, { signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// Keep a Set bounded (drop oldest entries) so a long-lived session can't grow it
// without limit. Sets preserve insertion order, so the first N are the oldest.
function trimSet(set: Set<string>, cap: number): void {
  if (set.size <= cap) return
  let toDrop = set.size - cap
  for (const k of set) {
    if (toDrop-- <= 0) break
    set.delete(k)
  }
}

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

// ── Client-side card cache (localStorage), one entry per feed signature, newest few kept ──
type CacheEntry = { cards: CardData[]; ts: number }

function readCache(): Record<string, CacheEntry> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CARD_CACHE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// What a feed was last showing, if it is recent enough to be worth drawing before the network answers.
// It is cached as it came (seen or not); what the reader has read is filtered out afresh when it is read.
function getCachedCards(sig: string): CardData[] {
  const entry = readCache()[sig]
  if (!entry || !Array.isArray(entry.cards)) return []
  const limit = sig.split(',').includes('news') ? CARD_CACHE_NEWS_AGE : CARD_CACHE_EVERGREEN_AGE
  return Date.now() - entry.ts > limit ? [] : withoutMarker(entry.cards)
}

function setCachedCards(cards: CardData[], sig: string) {
  try {
    const all = readCache()
    all[sig] = { cards: withoutMarker(cards).slice(-60), ts: Date.now() }
    const newest = Object.entries(all).sort((a, b) => b[1].ts - a[1].ts).slice(0, CARD_CACHE_ENTRIES)
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify(Object.fromEntries(newest)))
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
// card (so the whole feed reads in Hindi — incl. short news blurbs, which used to
// stay English). Mirrors the logic in enhanceCard.
function needsEnhance(card: CardData, lang: string): boolean {
  const base = card.originalContent ?? card.content
  if (lang === 'en') return card.type === 'microessay' && (base?.length ?? 0) >= 240
  return (base?.length ?? 0) >= 40
}

export function Feed({ categories }: { categories: string[] }) {
  const { bookmarkedIds, engagements, addEngagement, incrementCardsRead, markCardRead } = usePlaxStore()
  const language = usePlaxStore((s) => s.language)
  const newsSection = useUIStore((s) => s.newsSection)
  const setNewsSection = useUIStore((s) => s.setNewsSection)
  const setCurrentCard = useUIStore((s) => s.setCurrentCard)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const cardEntryTime = useRef(Date.now())
  const [cards, setCards] = useState<CardData[]>([])
  const [focusCard, setFocusCard] = useState<CardData | null>(null) // a saved card opened from the Saved tab
  const focusRef = useRef<CardData | null>(null)
  useEffect(() => { focusRef.current = focusCard }, [focusCard])
  const [isFetching, setIsFetching] = useState(false)
  const isFetchingRef = useRef(false) // ref to avoid stale closure
  const [isInitialLoad, setIsInitialLoad] = useState(true) // true until first fetch completes
  const fetchCountRef = useRef(0)
  const seenIdsRef = useRef(new Set<string>()) // ids loaded this session: what the server is asked to skip
  const lastFetchTimeRef = useRef(0)

  // ── Never show a story twice ─────────────────────────────────────────────
  // The same rules as the Android app (see story-engine.ts): a story counts as read once it has been on screen
  // for a moment, the history survives reloads (bounded, on this device only), and another outlet's version of
  // an event the reader has seen is held back too. Held-back stories are not lost: the caught-up card offers them.
  const catKey = categories.join(',')
  const sig = feedSig(categories)
  const seenRef = useRef<SeenStore | null>(null)
  const seen = useCallback(() => (seenRef.current ??= loadSeen()), [])
  const cardsRef = useRef<CardData[]>([])
  const earlierRef = useRef<CardData[]>([])
  const [earlierCount, setEarlierCount] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const exhaustedRef = useRef(false)
  const pendingRef = useRef<CardData[] | null>(null) // a fresher page the reader was told about
  const [hasPending, setHasPending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false) // the newest page could not be fetched and nothing is cached
  const [notice, setNotice] = useState('')
  const shownAtRef = useRef(0)
  const currentIndexRef = useRef(0)
  const sigRef = useRef(sig)
  const [session, setSession] = useState(0) // bumped to start again from the newest stories
  useEffect(() => { cardsRef.current = cards }, [cards])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])
  sigRef.current = sig

  const flash = useCallback((message: string) => {
    setNotice(message)
    setTimeout(() => setNotice((current) => (current === message ? '' : current)), 2600)
  }, [])

  // Map API response to CardData. Pure: duplicates are the engine's business.
  const mapApiCards = (apiCards: Record<string, string>[]): CardData[] => {
    return apiCards.map((c) => ({
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
      publishedAt: c.publishedAt ? Number(c.publishedAt) : undefined,
      image: c.image || undefined,
      section: c.section || undefined,
    }))
  }

  // Both the list on screen and a ref to it move together, so the engine always sees the current list.
  const commit = (next: CardData[]) => {
    cardsRef.current = next
    setCards(next)
  }
  // At the end of the list, once nothing newer is left, the caught-up card closes it.
  const settle = (list: CardData[], done: boolean, earlierN: number) =>
    done && (list.length > 0 || earlierN > 0) ? [...list, marker()] : list

  // What the server is asked to leave out: everything loaded or held back, then what was read most recently.
  const excludeIds = () => {
    const ids = new Set<string>()
    for (const c of cardsRef.current) if (!isMarker(c)) ids.add(c.id)
    for (const c of earlierRef.current) ids.add(c.id)
    for (const id of seen().recentIds(EXCLUDE_LIMIT)) ids.add(id)
    return [...ids].slice(0, EXCLUDE_LIMIT)
  }

  // One page from the server, always in the base language (English): the article set is then the same
  // whatever language the reader uses, and the AI step translates each card in place. Null = it failed.
  const requestPage = useCallback(async (exclude: string[], live: boolean): Promise<CardData[] | null> => {
    try {
      const query = `categories=${catKey}&limit=30&refresh=${live}&lang=en` + (exclude.length ? `&exclude=${encodeURIComponent(exclude.join(','))}` : '')
      const res = await fetchWithTimeout(`/api/feed?${query}`)
      if (!res.ok) return null
      const data = await res.json()
      return rankByEngagement(mapApiCards(data.cards || []), usePlaxStore.getState().getCategoryScore)
    } catch {
      return null
    }
  }, [catKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shows a merged page: what is new first, what was read held back (and offered by the caught-up card).
  const install = (merged: { visible: CardData[]; earlier: CardData[] }, done: boolean) => {
    earlierRef.current = merged.earlier
    setEarlierCount(merged.earlier.length)
    pendingRef.current = null
    setHasPending(false)
    shownAtRef.current = Date.now()
    exhaustedRef.current = done
    setExhausted(done)
    setCurrentIndex(0)
    commit(settle(merged.visible, done, merged.earlier.length))
    if (merged.visible.length > 0) setCachedCards(merged.visible, sigRef.current)
  }

  // Older stories: the next pages, until one has something the reader has not seen.
  const fetchMore = useCallback(async () => {
    if (isFetchingRef.current || exhaustedRef.current) return
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 1_500) return // cooldown: don't hammer the server

    setIsFetching(true)
    isFetchingRef.current = true
    lastFetchTimeRef.current = now
    fetchCountRef.current++
    let grew = false
    let answered = false
    try {
      for (let attempt = 0; attempt < MORE_ATTEMPTS && !grew; attempt++) {
        const page = await requestPage(excludeIds(), false)
        if (page === null) break // network trouble: say nothing is left only when the server said so
        answered = true
        if (page.length === 0) break
        const merged = append(withoutMarker(cardsRef.current), earlierRef.current, page, seen(), Date.now())
        earlierRef.current = merged.earlier
        setEarlierCount(merged.earlier.length)
        if (merged.fresh.length > 0) {
          grew = true
          merged.fresh.forEach((c) => seenIdsRef.current.add(c.id))
          trimSet(seenIdsRef.current, SEEN_IDS_CAP)
          console.log(`[Plax Feed] Loaded ${merged.fresh.length} new cards (batch #${fetchCountRef.current})`)
          commit(merged.visible)
          setCachedCards(merged.visible, sigRef.current)
        }
      }
    } catch {
      console.log('[Plax Feed] API fetch failed')
    }
    if (answered && !grew) {
      exhaustedRef.current = true
      setExhausted(true)
      commit(settle(withoutMarker(cardsRef.current), true, earlierRef.current.length))
    }
    setIsFetching(false)
    isFetchingRef.current = false
    setIsInitialLoad(false)
  }, [requestPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // The newest page. With nothing on screen it is drawn at once. With stories on screen, new ones go first
  // only when the reader asked or has not moved; otherwise they are offered as "New stories" instead of
  // changing the card under their finger. 'deeper' means the page was read in full, so older pages are
  // worth a look; 'failed' means the server could not be reached.
  const loadFirst = useCallback(async (forced: boolean, isCancelled: () => boolean): Promise<'done' | 'deeper' | 'failed'> => {
    const live = forced && !catKey.includes(',') // one topic can ask the server for a live refresh
    const page = await requestPage([], live)
    if (isCancelled()) return 'done'
    if (page === null) return 'failed'
    const shown = withoutMarker(cardsRef.current)
    const merged = replace(shown, earlierRef.current, page, seen(), Date.now())
    const news = merged.fresh.length > 0
    const idle = currentIndexRef.current === 0 && Date.now() - shownAtRef.current < SWAP_WINDOW_MS && !pendingRef.current
    let result: 'done' | 'deeper' = 'done'
    if (shown.length === 0 || (news && (forced || idle))) {
      // With nothing new on this page, what was already known about the end of the list still holds.
      const done = page.length === 0 || (!news && exhaustedRef.current)
      install(merged, done)
      // A page the reader has already seen entirely may still hide stories further down the server's list.
      if (merged.visible.length === 0 && page.length > 0 && !done) result = 'deeper'
    } else if (news) {
      pendingRef.current = page
      setHasPending(true)
    }
    if (forced && !news) flash(translate(usePlaxStore.getState().language, 'noNewStories'))
    return result
  }, [catKey, requestPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // The reader asked for newer stories (the caught-up card, or the refresh button).
  const checkNew = useCallback(async () => {
    if (isFetchingRef.current) return
    setChecking(true)
    setLoadFailed(false)
    const result = await loadFirst(true, () => false)
    if (result === 'failed') { setLoadFailed(cardsRef.current.length === 0); flash(translate(usePlaxStore.getState().language, 'feedError')) }
    setChecking(false)
    if (result === 'deeper') void fetchMore()
  }, [loadFirst, fetchMore, flash])

  // Takes the page behind the "New stories" button, merged with what has been read since.
  const applyPending = useCallback(() => {
    const page = pendingRef.current
    if (!page) return
    install(replace(withoutMarker(cardsRef.current), earlierRef.current, page, seen(), Date.now()), false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lets the reader go back over stories already read: they follow the caught-up card.
  const revealEarlier = useCallback(() => {
    const held = [...earlierRef.current].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)).slice(0, EARLIER_LIMIT)
    if (held.length === 0) return
    const at = cardsRef.current.findIndex(isMarker)
    if (at < 0) return
    earlierRef.current = []
    setEarlierCount(0)
    commit([...cardsRef.current.slice(0, at + 1), ...held])
    setDirection(1)
    setCurrentIndex(at + 1)
  }, [])

  // Initial load + RELOAD whenever the feed changes (a different topic or choice of topics), NOT language.
  // Language changes are handled separately by re-translating the loaded cards in place, so toggling
  // EN⇄HI keeps the SAME articles and never empties the feed. `session` starts it afresh after a long absence.
  useEffect(() => {
    // Full reset for the new feed.
    seenIdsRef.current = new Set<string>()
    fetchCountRef.current = 0
    lastFetchTimeRef.current = 0
    earlierRef.current = []
    pendingRef.current = null
    exhaustedRef.current = false
    setEarlierCount(0)
    setHasPending(false)
    setExhausted(false)
    setLoadFailed(false)
    setFocusCard(null)
    setCurrentIndex(0)
    setIsInitialLoad(true)
    cardEntryTime.current = Date.now()
    shownAtRef.current = Date.now()

    let cancelled = false
    let settled = false // the first load has finished (or this place was restored), so what is on screen is worth keeping
    // Leaving this feed (for Topics, Saved or another topic): note the place so coming straight back is instant.
    const leave = () => {
      cancelled = true
      if (!settled) return
      rememberPlace(sig, {
        cards: cardsRef.current,
        earlier: earlierRef.current,
        index: currentIndexRef.current,
        exhausted: exhaustedRef.current,
        at: Date.now(),
        session,
        focus: focusRef.current,
      })
    }

    // 0. Back to a feed that was left a moment ago: the same story, and no request. A new session (after a
    //    long absence) always starts afresh.
    const kept = places.get(sig)
    places.delete(sig)
    if (kept && kept.session === session && kept.cards.length > 0 && Date.now() - kept.at < PLACE_KEEP_MS) {
      kept.cards.forEach((c) => seenIdsRef.current.add(c.id))
      earlierRef.current = kept.earlier
      setEarlierCount(kept.earlier.length)
      exhaustedRef.current = kept.exhausted
      setExhausted(kept.exhausted)
      commit(kept.cards)
      setFocusCard(kept.focus) // the index counts a pinned saved story, so it comes back too
      setCurrentIndex(Math.min(kept.index, kept.cards.length - 1 + (kept.focus ? 1 : 0)))
      setIsInitialLoad(false)
      settled = true
      return leave
    }

    // 1. Instant: this feed as it was last shown, minus what has been read since.
    const cached = getCachedCards(sig)
    cached.forEach((c) => seenIdsRef.current.add(c.id))
    const merged = replace([], [], cached, seen(), Date.now())
    earlierRef.current = merged.earlier
    setEarlierCount(merged.earlier.length)
    commit(merged.visible)
    if (merged.visible.length > 0) console.log(`[Plax Feed] Instant load: ${merged.visible.length} cached cards`)

    // 2. Background: the newest page.
    const run = async () => {
      setIsFetching(true)
      isFetchingRef.current = true
      let result: 'done' | 'deeper' | 'failed' = 'done'
      try {
        result = await loadFirst(false, () => cancelled)
        if (!cancelled && result === 'failed') setLoadFailed(cardsRef.current.length === 0)
      } catch (err) {
        console.error('[Plax Feed] Live fetch failed:', err)
      } finally {
        if (!cancelled) {
          setIsFetching(false)
          isFetchingRef.current = false
          setIsInitialLoad(false)
          settled = true
        }
      }
      // Everything on the first page was read already: look further down the list.
      if (!cancelled && result === 'deeper') void fetchMore()
    }
    void run()
    return leave
  }, [sig, session]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cards on screen: a saved story opened from the Saved tab is pinned to the front. A news section
  //    (India / World / …) narrows the news cards. ──
  const visibleCards = useMemo(
    () => {
      let base = cards
      // News sub-section filter (India / World / Tech / …). Works whenever news is
      // part of the feed (single OR multi-interest). Picking a section focuses the
      // feed on that news section.
      if (newsSection) base = base.filter((c) => c.category === 'news' && c.section === newsSection)
      // A saved card is pinned to the FRONT (deduped) so the reader lands on it
      // regardless of when the live feed finishes loading.
      if (focusCard && !base.some((c) => c.id === focusCard.id)) return [focusCard, ...base]
      return base
    },
    [cards, focusCard, newsSection]
  )

  // Reset to the top whenever the news section changes (not when the feed is merely mounted again)
  const lastNewsSection = useRef(newsSection)
  useEffect(() => {
    if (lastNewsSection.current === newsSection) return
    lastNewsSection.current = newsSection
    setCurrentIndex(0)
    cardEntryTime.current = Date.now()
  }, [newsSection])

  // ── Open a saved story from the Saved tab: the saved card (kept in the store) is pinned to the FRONT of
  //    the feed and the reader jumps to it, so tapping a saved story reads it in the normal reader. ──
  const pinnedCardId = useUIStore((s) => s.pinnedCardId)
  const pinCard = useUIStore((s) => s.pinCard)
  useEffect(() => {
    if (!pinnedCardId) return
    const saved = usePlaxStore.getState().bookmarkedCards[pinnedCardId]
    pinCard(null)
    if (!saved) return
    setFocusCard({
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
    })
    setCurrentIndex(0)
  }, [pinnedCardId, pinCard])

  // The header's refresh button looks for newer stories.
  const refreshTick = useUIStore((s) => s.refreshTick)
  const lastRefreshTick = useRef(refreshTick)
  useEffect(() => {
    if (refreshTick === lastRefreshTick.current) return
    lastRefreshTick.current = refreshTick
    void checkNew()
  }, [refreshTick, checkNew])

  // Publish the current card so the desktop right rail can show it
  useEffect(() => {
    const shown = visibleCards[currentIndex]
    setCurrentCard(shown && !isMarker(shown) ? shown : null)
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
    // Hindi: enhance every substantive card so the whole feed reads in Hindi
    // (incl. short news blurbs — they used to stay English below the old 120 gate).
    if (lang === 'en') {
      if (card.type !== 'microessay' || (baseContent?.length ?? 0) < 240) return
    } else {
      if ((baseContent?.length ?? 0) < 40) return
    }
    enhanceCounts.current.set(key, (enhanceCounts.current.get(key) ?? 0) + 1)
    enhanceInflight.current.add(key)
    setEnhancingIds((s) => new Set(s).add(card.id))
    try {
      const res = await fetch(withBase('/api/summarize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: baseContent, title: baseTitle, type: 'microessay', lang, category: card.category }),
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
        setCachedCards(updated, sigRef.current)
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

  // Fire-and-forget: warm the SERVER cache for a card in the language the user is
  // NOT currently viewing, so that when they toggle the language the same request
  // is a cache hit and the flip feels instant instead of a ~2s live LLM call. We
  // deliberately do NOT apply the result to state (that would clobber the card the
  // user is reading). Dedup by a separate inflight set so we only warm each card
  // once per session.
  const prewarmedRef = useRef<Set<string>>(new Set())
  const prewarmOppositeLang = useCallback(async (card: CardData | undefined) => {
    if (!card) return
    const current = usePlaxStore.getState().language
    const other = current === 'en' ? 'hi' : 'en'
    if (!needsEnhance(card, other)) return
    const key = `${card.id}:${other}`
    if (prewarmedRef.current.has(key)) return
    prewarmedRef.current.add(key)
    const baseContent = card.originalContent ?? card.content
    const baseTitle = card.originalTitle ?? card.title
    try {
      await fetch(withBase('/api/summarize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: baseContent, title: baseTitle, type: 'microessay', lang: other, category: card.category }),
      })
    } catch {
      // Best-effort warm-up; allow a retry later by clearing the dedup mark.
      prewarmedRef.current.delete(key)
    }
  }, [])

  // Enhance the current card + prefetch a WINDOW of upcoming cards so that by the
  // time the user swipes (or toggles language), the translation/summary is already
  // ready — no "Translating…" flash. The AI-cache + per-card attempt cap + inflight
  // dedup keep this cheap (already-enhanced cards no-op, repeats are cache hits).
  useEffect(() => {
    // Current first (highest priority), then look ahead. 4 ahead is a good balance:
    // enough runway that scrolling always lands on a ready card, without burning
    // the daily AI quota prefetching cards the user may never reach.
    const AHEAD = 4
    enhanceCard(visibleCards[currentIndex])
    for (let i = 1; i <= AHEAD; i++) enhanceCard(visibleCards[currentIndex + i])
    // Pre-warm the OPPOSITE language for the card the user is on (+1 ahead) so a
    // language toggle is INSTANT (server cache hit) instead of a ~2s live call.
    // Fire-and-forget: only warms the shared server cache, never touches state.
    prewarmOppositeLang(visibleCards[currentIndex])
    prewarmOppositeLang(visibleCards[currentIndex + 1])
  }, [currentIndex, visibleCards, enhanceCard, prewarmOppositeLang, language])

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
    setSearchItems(withoutMarker(cards).map((c) => ({ id: c.id, title: c.title, category: c.category, content: c.content.slice(0, 200) })))
  }, [cards, setSearchItems])

  // Jump the feed to a specific card (from search); clears the news section if it hides the card
  const pendingJumpId = useUIStore((s) => s.pendingJumpId)
  useEffect(() => {
    if (!pendingJumpId) return
    const idx = visibleCards.findIndex((c) => c.id === pendingJumpId)
    if (idx >= 0) {
      setDirection(idx >= currentIndex ? 1 : -1)
      setCurrentIndex(idx)
      cardEntryTime.current = Date.now()
      useUIStore.getState().setPendingJumpId(null)
    } else if (newsSection) {
      setNewsSection(null) // filtered out → clear the section, retry next pass
    } else {
      useUIStore.getState().setPendingJumpId(null) // not loaded → give up
    }
  }, [pendingJumpId, visibleCards, currentIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Infinite scroll: auto-fetch when near end ──
  useEffect(() => {
    const remaining = visibleCards.length - currentIndex
    if (remaining <= LOAD_MORE_THRESHOLD && !isFetching && cards.length > 0) {
      console.log(`[Plax Feed] ${remaining} cards left, fetching more...`)
      fetchMore()
    }
  }, [currentIndex, visibleCards.length, cards.length, isFetching, fetchMore])

  // Mark the current card as read as soon as it's displayed
  useEffect(() => {
    const shown = visibleCards[currentIndex]
    if (shown && !isMarker(shown)) markCardRead(shown.id)
  }, [currentIndex, visibleCards]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track engagement on card change
  const trackEngagement = useCallback(
    (cardIndex: number) => {
      if (cardIndex >= 0 && cardIndex < visibleCards.length && !isMarker(visibleCards[cardIndex])) {
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
        // At the edge — trigger fetch & don't move yet (cache-first for speed).
        if (!isFetching) fetchMore()
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
  // to the next/prev card once the content reaches its scroll boundary AND the
  // user makes a decisive push past the edge. Trackpad/mouse momentum fires a long
  // tail of events, so after each navigation we LOCK until the wheel goes fully
  // idle (drains the momentum) — guaranteeing at most ONE card per gesture. This
  // matches the mobile "one decisive swipe = one card" feel (desktop was skipping
  // multiple articles on a single flick / accidental scroll).
  const overscroll = useRef(0)
  const navLocked = useRef(false)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const OVERSCROLL_THRESHOLD = 160 // px past the edge before navigating
    const IDLE_MS = 220 // no wheel for this long = gesture over → unlock + reset
    const handleWheel = (e: WheelEvent) => {
      const ui = useUIStore.getState()
      if (ui.commandOpen || ui.topicsOpen) return

      // Ignore wheel events over the desktop rails / any other scrollable chrome
      // so they scroll natively instead of navigating the feed.
      const target = e.target as HTMLElement | null
      if (target && typeof target.closest === 'function' && target.closest('aside, [data-no-feed-scroll]')) return

      // Reset the idle detector: when the wheel stops for IDLE_MS, the gesture is
      // over — unlock navigation and clear any accumulated overscroll.
      if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current)
      wheelIdleTimer.current = setTimeout(() => {
        navLocked.current = false
        overscroll.current = 0
      }, IDLE_MS)

      // Let the active card's content scroll while it still can in this direction.
      const scroller = document.querySelector<HTMLElement>('[data-card-scroll]')
      if (scroller) {
        const { scrollTop, scrollHeight, clientHeight } = scroller
        const canScrollDown = Math.ceil(scrollTop + clientHeight) < scrollHeight - 1
        const canScrollUp = scrollTop > 1
        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
          overscroll.current = 0 // scrolling content, not overscrolling
          return // native scroll handles it; don't navigate
        }
      }

      // At a boundary. If we already navigated this gesture, swallow the momentum
      // tail until the wheel goes idle (prevents multi-card skips).
      e.preventDefault()
      if (navLocked.current) return

      overscroll.current += e.deltaY
      if (overscroll.current > OVERSCROLL_THRESHOLD) {
        navLocked.current = true
        overscroll.current = 0
        goToCard(currentIndex + 1, 1)
      } else if (overscroll.current < -OVERSCROLL_THRESHOLD) {
        navLocked.current = true
        overscroll.current = 0
        goToCard(currentIndex - 1, -1)
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
      if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current)
    }
  }, [currentIndex, goToCard])

  const currentCard = visibleCards[currentIndex]
  const prevCard = currentIndex > 0 ? visibleCards[currentIndex - 1] : null
  const nextCard = currentIndex < visibleCards.length - 1 ? visibleCards[currentIndex + 1] : null
  const currentCardRef = useRef<CardData | undefined>(undefined)
  currentCardRef.current = currentCard

  // ── Reading marks stories as read ─────────────────────────────────────────
  // A story counts once it has been on screen for a moment, or when the reader moves on after a glance. The
  // history is written a few seconds later, and at once when the tab is hidden or closed.
  const viewingRef = useRef<{ card: CardData; since: number } | null>(null)
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushSeen = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (seenRef.current) saveSeen(seenRef.current)
  }, [])
  const markSeen = useCallback((card: CardData) => {
    if (isMarker(card)) return
    if (seen().mark(card, Date.now()) && !saveTimer.current) {
      saveTimer.current = setTimeout(() => { saveTimer.current = null; if (seenRef.current) saveSeen(seenRef.current) }, 3000)
    }
  }, [seen])
  const leaveCard = useCallback(() => {
    if (dwellTimer.current) { clearTimeout(dwellTimer.current); dwellTimer.current = null }
    const viewing = viewingRef.current
    viewingRef.current = null
    if (viewing && Date.now() - viewing.since >= GLANCE_MS) markSeen(viewing.card)
  }, [markSeen])
  const startViewing = useCallback((card: CardData | undefined) => {
    leaveCard()
    if (!card || isMarker(card) || document.visibilityState !== 'visible') return
    viewingRef.current = { card, since: Date.now() }
    dwellTimer.current = setTimeout(() => markSeen(card), DWELL_MS)
  }, [leaveCard, markSeen])

  const currentCardId = currentCard?.id
  useEffect(() => { startViewing(currentCardRef.current) }, [currentCardId, startViewing])

  // Leaving the tab counts what is on screen and saves the history; coming back after a while looks for newer
  // stories quietly, and after a long while starts again from the newest ones (as the app does).
  useEffect(() => {
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        leaveCard()
        flushSeen()
        return
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      if (away >= NEW_SESSION_MS) setSession((n) => n + 1)
      else if (away >= REVISIT_MS && !isFetchingRef.current) void loadFirst(false, () => false)
      startViewing(currentCardRef.current)
    }
    const onHide = () => { leaveCard(); flushSeen() }
    // A tab left open is also checked now and then, so it never goes stale.
    const auto = setInterval(() => {
      if (document.visibilityState === 'visible' && !isFetchingRef.current) void loadFirst(false, () => false)
    }, 5 * 60_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      clearInterval(auto)
    }
  }, [leaveCard, flushSeen, startViewing, loadFirst])
  useEffect(() => () => { leaveCard(); flushSeen() }, [leaveCard, flushSeen])

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

  if (!currentCard) {
    // Premium skeleton while first content loads
    if (isFetching || isInitialLoad) {
      return (
        <div className="feed-container">
          <CardSkeleton />
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 text-dark-subtle text-xs">
            <span className="w-3.5 h-3.5 border-2 border-[color:var(--signal)] border-t-transparent rounded-full animate-spin" />
            {translate(language, 'findingNext')}
          </div>
        </div>
      )
    }
    return (
      <div className="feed-container flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex flex-col items-center gap-5 px-6 text-center max-w-sm ${language === 'hi' ? 'lang-hi' : ''}`}
        >
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">{loadFailed ? '📡' : '📭'}</div>
          <div>
            <p className="text-white text-lg font-semibold mb-1">{translate(language, loadFailed ? 'feedError' : 'noNewStories')}</p>
          </div>
          <button onClick={() => void checkNew()} disabled={checking} className="btn-primary focus-ring px-5 py-2.5 text-sm">
            {translate(language, loadFailed ? 'tryAgain' : 'checkNew')}
          </button>
        </motion.div>
      </div>
    )
  }

  const variants = {
    enter: (dir: number) => ({
      y: dir > 0 ? '32%' : '-32%',
      opacity: 0,
    }),
    center: {
      y: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      y: dir > 0 ? '-14%' : '14%',
      opacity: 0,
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

      {/* News sub-section filter bar (India / World / Tech / …) — shown whenever
          the reader is on a NEWS card (news-only feed, or a news card in a mixed
          feed), or a section filter is already active. News cards reserve top
          space for these pills so they never overlap content. */}
      {(currentCard?.category === 'news' || !!newsSection) && (
        <div className="absolute top-[calc(4.75rem+env(safe-area-inset-top))] left-0 right-0 z-30 lg:top-5 pointer-events-none">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar px-4 justify-start lg:justify-center pointer-events-auto">
            <button
              onClick={() => setNewsSection(null)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                newsSection === null
                  ? 'bg-[color:var(--signal)] text-black'
                  : 'glass text-dark-text hover:text-white'
              }`}
            >
              {language === 'hi' ? 'सभी' : 'All'}
            </button>
            {NEWS_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setNewsSection(s.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  newsSection === s.id
                    ? 'bg-[color:var(--signal)] text-black'
                    : 'glass text-dark-text hover:text-white'
                }`}
              >
                {language === 'hi' ? s.labelHi : s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main swipe area. After the last new story comes the caught-up card instead of a story. */}
      {isMarker(currentCard) ? (
        <div
          className="card-slot"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <CaughtUp earlier={earlierCount} checking={checking} onCheck={() => void checkNew()} onEarlier={revealEarlier} />
        </div>
      ) : (
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentCard.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              y: { type: 'spring', stiffness: 550, damping: 42, mass: 0.7 },
              opacity: { duration: 0.14 },
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="card-slot"
          >
            <Card card={currentCard} isActive={true} translating={currentTranslating} />
          </motion.div>
        </AnimatePresence>
      )}

      {/* New stories arrived while the reader was busy: offered, never forced on them */}
      {hasPending && (
        <button
          onClick={applyPending}
          className="btn-primary focus-ring absolute top-[calc(4.75rem+env(safe-area-inset-top))] lg:top-5 left-1/2 -translate-x-1/2 z-40 rounded-full px-4 py-2 text-xs shadow-lg"
          aria-live="polite"
        >
          ↑ {translate(language, 'newStories')}
        </button>
      )}

      {/* Short confirmations ("No new stories right now") */}
      {notice && (
        <div
          role="status"
          className={`absolute bottom-28 left-1/2 -translate-x-1/2 z-40 glass-strong px-4 py-2 rounded-full text-xs font-medium text-white shadow-lg ${language === 'hi' ? 'lang-hi' : ''}`}
        >
          {notice}
        </div>
      )}

      {/* Fixed action dock (Inshorts-style) — stays put while cards flip */}
      {!isMarker(currentCard) && <CardActions card={currentCard} />}

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
            <span className={`text-dark-text/80 text-xs font-medium ${language === 'hi' ? 'lang-hi' : ''}`}>{translate(language, 'loadingMore')}</span>
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
