import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandMark } from '@/components/BrandMark'

// The frame and type of the policy pages (privacy, delete account), in the same voice as the story pages: the mark,
// a serif headline, plain body text and a way back to the news.

export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-dark-bg text-dark-text">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-5 pb-16">
        <header className="flex items-center justify-between mb-8">
          <BrandMark />
          <Link href="/" className="focus-ring text-sm font-semibold text-[color:var(--signal-text)] hover:underline rounded">
            Open Plax →
          </Link>
        </header>

        <article>
          <h1 className="headline text-[30px] sm:text-[40px] text-white mb-2">{title}</h1>
          {updated && <p className="text-sm text-dark-subtle mb-8">Last updated {updated}</p>}
          {children}
        </article>

        <nav aria-label="Plax policies" className="mt-12 pt-6 border-t border-white/[0.08] flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
          <Link href="/privacy" className="focus-ring text-[color:var(--signal-text)] hover:underline rounded">Privacy policy</Link>
          <Link href="/delete-account" className="focus-ring text-[color:var(--signal-text)] hover:underline rounded">Delete your account</Link>
          <Link href="/" className="focus-ring text-[color:var(--signal-text)] hover:underline rounded">Plax news</Link>
        </nav>
      </div>
    </main>
  )
}

export function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-9 scroll-mt-6">
      <h2 className="headline text-[22px] sm:text-[26px] text-white mb-3">{title}</h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="reading-text">{children}</p>
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="reading-text list-disc pl-5 space-y-2 marker:text-[color:var(--signal-text)]">{children}</ul>
}
