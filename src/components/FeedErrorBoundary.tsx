'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// Catches render errors anywhere in the feed subtree (e.g. a malformed card that
// would otherwise white-screen the whole app) and shows a recoverable fallback
// instead. A rare-but-catastrophic safety net.
export class FeedErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[Plax] Feed render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="feed-container flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center max-w-sm">
            <span className="text-4xl">😕</span>
            <div>
              <p className="text-white text-lg font-semibold mb-1">Something went wrong</p>
              <p className="text-dark-subtle text-sm">The feed hit a snag. Reload to get back to reading.</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-full bg-[color:var(--signal)] text-black text-sm font-semibold"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
