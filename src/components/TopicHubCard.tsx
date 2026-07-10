'use client'

import Link from 'next/link'
import { usePlaxStore } from '@/lib/store'

/**
 * TopicHubCard — a /topics grid card with an inline Follow / Following toggle.
 * The card body still links to the SEO topic page (crawlable); the button lets
 * users build their feed straight from the hub without opening each page.
 */
export function TopicHubCard({
  id,
  emoji,
  label,
  description,
}: {
  id: string
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
    <div className="card-elevated group p-5 relative">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
          {emoji}
        </span>
        <Link href={`/topics/${id}`} className="focus-ring rounded-md min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white truncate hover:text-violet-200 transition-colors">{label}</h3>
        </Link>
        <button
          onClick={onToggle}
          aria-pressed={isFollowing}
          aria-label={isFollowing ? `Unfollow ${label}` : `Follow ${label}`}
          className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            isFollowing
              ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30'
              : 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white hover:shadow-lg hover:shadow-violet-500/20'
          }`}
        >
          {isFollowing ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Following
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Follow
            </>
          )}
        </button>
      </div>
      <Link href={`/topics/${id}`} className="block">
        <p className="text-sm text-dark-muted leading-relaxed line-clamp-2 hover:text-dark-text transition-colors">{description}</p>
      </Link>
    </div>
  )
}
