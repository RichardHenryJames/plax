'use client'

import { BrandMark } from '@/components/BrandMark'

// The story store could not be reached. The page is answered as a server error (so search engines come back later
// instead of dropping the link) and the reader can simply try again.
export default function StoryError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen bg-dark-bg text-dark-text grid place-items-center px-6">
      <div className="max-w-md text-center">
        <BrandMark size="lg" href={null} className="mb-5" />
        <h1 className="headline text-3xl text-white mb-2">Couldn&rsquo;t load this story</h1>
        <p className="text-dark-muted leading-relaxed mb-6">Plax is having trouble right now. Please try again in a moment.</p>
        <button type="button" onClick={reset} className="btn-flat focus-ring px-5 h-12 text-[15px]">Try again</button>
      </div>
    </main>
  )
}
