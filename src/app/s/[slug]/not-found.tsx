import Link from 'next/link'
import { BrandMark } from '@/components/BrandMark'

// What someone sees from a link whose story is gone, or was never stored. Search engines get the 404.
export default function StoryNotFound() {
  return (
    <main className="min-h-screen bg-dark-bg text-dark-text grid place-items-center px-6">
      <div className="max-w-md text-center">
        <BrandMark size="lg" href={null} className="mb-5" />
        <h1 className="headline text-3xl text-white mb-2">This story isn&rsquo;t available</h1>
        <p className="text-dark-muted leading-relaxed mb-6">The link may be incomplete, or the story is no longer kept. The latest stories are one tap away.</p>
        <Link href="/" className="btn-flat focus-ring px-5 h-12 text-[15px]">Open Plax</Link>
      </div>
    </main>
  )
}
