'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: string
  run: () => void
}

/**
 * CommandPalette — ⌘K / Ctrl-K launcher for search, topic filtering, and navigation.
 * Always mounted; self-hides when closed. Registers the global hotkey.
 */
export function CommandPalette() {
  const router = useRouter()
  const selectedTopics = usePlaxStore((s) => s.selectedTopics)
  const open = useUIStore((s) => s.commandOpen)
  const setOpen = useUIStore((s) => s.setCommandOpen)
  const toggle = useUIStore((s) => s.toggleCommand)
  const setFeedFilter = useUIStore((s) => s.setFeedFilter)
  const searchItems = useUIStore((s) => s.searchItems)
  const setPendingJumpId = useUIStore((s) => s.setPendingJumpId)
  const { t, tp, lang } = useT()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global ⌘K / Ctrl-K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  // Reset + focus when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'home', group: t('cmdGoTo'), label: t('forYou'), hint: t('cmdHomeFeed'), icon: '🏠', run: () => { setFeedFilter(null); router.push('/') } },
      { id: 'bookmarks', group: t('cmdGoTo'), label: t('bookmarks'), hint: t('cmdSavedCards'), icon: '🔖', run: () => router.push('/profile') },
      { id: 'profile', group: t('cmdGoTo'), label: t('profileStats'), hint: t('cmdReadingStats'), icon: '👤', run: () => router.push('/profile') },
    ]
    const topicList = selectedTopics.length ? TOPICS.filter((t) => selectedTopics.includes(t.id)) : [...TOPICS]
    const topicCmds: Command[] = topicList.map((topic) => {
      const label = tp(topic.id, topic.label)
      return {
        id: `topic-${topic.id}`,
        group: t('cmdFilterFeed'),
        label,
        hint: t('cmdShowOnly', { x: label }),
        icon: topic.emoji,
        run: () => { setFeedFilter(topic.id); router.push('/') },
      }
    })
    return [...nav, ...topicCmds]
  }, [selectedTopics, router, setFeedFilter, t, tp])

  // Content matches from the loaded feed (real search)
  const contentMatches = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return searchItems
      .filter((it) => `${it.title ?? ''} ${it.content}`.toLowerCase().includes(q))
      .slice(0, 6)
      .map((it) => {
        const topic = TOPICS.find((x) => x.id === it.category)
        return {
          id: `card-${it.id}`,
          group: t('cmdInYourFeed'),
          label: it.title || it.content.slice(0, 60),
          hint: topic ? tp(topic.id, topic.label) : undefined,
          icon: topic?.emoji || '📄',
          run: () => { setFeedFilter(null); setPendingJumpId(it.id); router.push('/') },
        }
      })
  }, [query, searchItems, router, setFeedFilter, setPendingJumpId, t, tp])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(q))
      : commands
    return [...base, ...contentMatches]
  }, [commands, query, contentMatches])

  // Keep active index in range
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, filtered.length - 1))) }, [filtered.length])

  const runActive = () => {
    const cmd = filtered[active]
    if (cmd) { cmd.run(); setOpen(false) }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runActive() }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  // Group for display
  let lastGroup = ''

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className={`w-full max-w-xl glass-strong rounded-2xl shadow-2xl shadow-black/60 overflow-hidden ${lang === 'hi' ? 'lang-hi' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-dark-border">
              <svg className="w-5 h-5 text-dark-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={onKeyDown}
                placeholder={t('cmdPlaceholder')}
                className="flex-1 bg-transparent text-white placeholder:text-dark-subtle text-[15px] outline-none"
              />
              <kbd className="text-[10px] font-medium text-dark-subtle bg-dark-bg border border-dark-border rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto hide-scrollbar py-2">
              {filtered.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl">🔍</div>
                  <p className="text-sm text-dark-muted">{t('cmdNoMatches', { x: query })}</p>
                </div>
              )}
              {filtered.map((cmd, i) => {
                const showGroup = cmd.group !== lastGroup
                lastGroup = cmd.group
                return (
                  <div key={cmd.id}>
                    {showGroup && (
                      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-dark-subtle">{cmd.group}</div>
                    )}
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={runActive}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === active ? 'bg-[color:var(--signal)]/12' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="text-lg w-6 text-center">{cmd.icon}</span>
                      <span className="flex-1">
                        <span className="block text-sm text-white">{cmd.label}</span>
                        {cmd.hint && <span className="block text-xs text-dark-muted">{cmd.hint}</span>}
                      </span>
                      {i === active && (
                        <kbd className="text-[10px] font-medium text-dark-subtle bg-dark-bg border border-dark-border rounded px-1.5 py-0.5">↵</kbd>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
