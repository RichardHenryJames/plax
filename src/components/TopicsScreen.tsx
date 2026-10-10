'use client'

import { useMemo } from 'react'
import { TOPICS, usePlaxStore } from '@/lib/store'
import { useUIStore } from '@/lib/ui-store'
import { useT } from '@/lib/i18n'

/**
 * The Topics tab: every topic as a tile (tap one to read just that topic), and a card for choosing the
 * topics that fill For you. Works for everyone, signed in or not.
 */
export function TopicsScreen() {
  const selectedTopics = usePlaxStore((s) => s.selectedTopics)
  const feedFilter = useUIStore((s) => s.feedFilter)
  const setFeedFilter = useUIStore((s) => s.setFeedFilter)
  const setTopicsOpen = useUIStore((s) => s.setTopicsOpen)
  const { t, tp, lang } = useT()

  const summary = useMemo(() => {
    const names = TOPICS.filter((x) => selectedTopics.includes(x.id)).map((x) => tp(x.id, x.label))
    if (names.length === 0) return ''
    return names.length <= 2 ? names.join(', ') : t('topicsSummary', { x: names.slice(0, 2).join(', '), y: String(names.length - 2) })
  }, [selectedTopics, t, tp])

  return (
    <div className={`feed-container overflow-y-auto thin-scrollbar overscroll-contain ${lang === 'hi' ? 'lang-hi' : ''}`} data-no-feed-scroll>
      <div className="mx-auto w-full max-w-3xl px-5 pt-[calc(4.75rem+env(safe-area-inset-top))] lg:pt-10 pb-10">
        <h1 className="headline text-3xl text-white">{t('topicsHeading')}</h1>
        <p className="mt-2 mb-5 text-sm text-dark-muted">{t('topicsSub')}</p>

        <button
          onClick={() => setTopicsOpen(true)}
          className="focus-ring w-full mb-5 flex items-center gap-3 rounded-2xl border border-dark-border bg-[color:var(--signal)]/10 px-4 py-3.5 text-left hover:bg-[color:var(--signal)]/15 transition"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-white">
              {selectedTopics.length === 0 ? t('topicsCardEmpty') : t('topicsCardTitle')}
            </span>
            <span className="block text-[13px] text-dark-muted truncate">
              {selectedTopics.length === 0 ? t('topicsCardEmptyDetail') : summary}
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-[color:var(--signal)]">
            {selectedTopics.length === 0 ? t('chooseTopics') : t('edit')}
          </span>
        </button>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {TOPICS.map((topic) => {
            const current = feedFilter === topic.id
            return (
              <button
                key={topic.id}
                onClick={() => setFeedFilter(topic.id)}
                aria-pressed={current}
                className={`focus-ring flex h-24 flex-col justify-between rounded-2xl border p-3.5 text-left transition ${
                  current
                    ? 'border-[color:var(--signal)] bg-[color:var(--signal)]/12'
                    : 'border-dark-border bg-dark-card hover:bg-dark-card-hover'
                }`}
              >
                <span className="text-2xl" aria-hidden>{topic.emoji}</span>
                <span>
                  <span className="block text-[15px] font-semibold text-white truncate">{tp(topic.id, topic.label)}</span>
                  {current && <span className="block text-[11px] font-semibold text-[color:var(--signal)]">{t('readingNow')}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
