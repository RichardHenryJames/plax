'use client'

/**
 * Skeleton loaders — premium shimmer placeholders used for feed + profile
 * loading states. Pure CSS shimmer (see .skeleton in globals.css).
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

/** Full-screen reading-card skeleton that mirrors the real Card layout. */
export function CardSkeleton() {
  return (
    <div className="h-full w-full flex flex-col justify-center px-6 sm:px-10 lg:px-12 py-24">
      <div className="max-w-xl lg:max-w-2xl mx-auto w-full animate-fade-up">
        {/* Category chip + meta */}
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
        {/* Title */}
        <Skeleton className="h-8 w-[92%] mb-3 rounded-lg" />
        <Skeleton className="h-8 w-[64%] mb-8 rounded-lg" />
        {/* Body lines */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-[88%] rounded" />
          <Skeleton className="h-4 w-[95%] rounded" />
          <Skeleton className="h-4 w-[70%] rounded" />
        </div>
        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-dark-border/40">
          <Skeleton className="h-3 w-32 rounded" />
        </div>
      </div>
    </div>
  )
}

/** Compact list-row skeleton (bookmarks / stats lists). */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 card-elevated">
      <Skeleton className="h-9 w-9 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  )
}
