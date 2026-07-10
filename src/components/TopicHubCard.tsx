'use client'

import Link from 'next/link'
import { usePlaxStore } from '@/lib/store'

/**
 * TopicHubCard — one row of the editorial Topic Index. A large ghost index
 * number, the topic set in serif display, a one-line description, and an inline
 * Follow / Following toggle. The label + description still link to the crawlable
 * SEO topic page; the button builds the feed straight from the hub.
 */
export function TopicHubCard({
  id,
  index,
  emoji,
  label,
  description,
}: {
  id: string
  index: number
  emoji: string
  label: string
  description: string
}) {
  const selectedTopics = usePlaxStore((s) => s.selectedTopics)
  const toggleTopic = usePlaxStore((s) => s.toggleTopic)
  const setOnboarded = usePlaxStore((s) => s.setOnboarded)
  const hasOnboarded = usePlaxStore((s) => s.hasOnboarded)
  const isFollowing = selectedTopics.includes(id)

  const onToggle = () => {
    toggleTopic(id)
    if (!hasOnboarded) setOnboarded() // following from the hub counts as onboarded
  }

  return (
    <li className="index-row group">
      <div className="flex items-center gap-4 sm:gap-7 py-5">
        {/* Index number */}
        <span className="index-num text-sm w-8 shrink-0 tabular-nums">
          {String(index).padStart(2, '0')}
        </span>

        {/* Emoji mark */}
        <span className="text-2xl shrink-0 w-9 text-center transition-transform duration-300 group-hover:-translate-y-0.5">
          {emoji}
        </span>

        {/* Label + description */}
        <div className="min-w-0 flex-1">
          <Link href={`/topics/${id}`} className="focus-ring">
            <h3 className="display-serif text-white text-2xl sm:text-[2rem] leading-none inline-block link-ed">
              {label}
            </h3>
          </Link>
          <Link href={`/topics/${id}`} className="block">
            <p className="text-sm text-dark-muted leading-snug mt-1.5 line-clamp-1 sm:max-w-xl group-hover:text-dark-text transition-colors">
              {description}
            </p>
          </Link>
        </div>

        {/* Follow toggle */}
        <button
          onClick={onToggle}
          aria-pressed={isFollowing}
          aria-label={isFollowing ? `Unfollow ${label}` : `Follow ${label}`}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-mono uppercase tracking-widest transition-all ${
            isFollowing
              ? 'border border-[color:var(--signal)]/40 text-[color:var(--signal)] hover:border-red-500/50 hover:text-red-300'
              : 'border border-white/15 text-dark-text hover:border-[color:var(--signal)] hover:text-[color:var(--signal)]'
          }`}
        >
          {isFollowing ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="hidden sm:inline">Following</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Follow</span>
            </>
          )}
        </button>
      </div>
    </li>
  )
}
