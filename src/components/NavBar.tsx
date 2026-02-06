'use client'

import Link from 'next/link'

export function NavBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 gradient-top pointer-events-none">
      <div className="flex items-center justify-between px-5 py-4 pointer-events-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-lg flex items-center justify-center group-hover:shadow-lg group-hover:shadow-violet-500/20 transition-shadow">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <span className="text-lg font-bold text-white/90">Plax</span>
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <button className="p-2 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button className="p-2 text-dark-muted hover:text-white transition-colors rounded-full hover:bg-white/5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}
