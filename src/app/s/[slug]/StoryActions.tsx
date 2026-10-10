'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string
  title: string
  labels: { share: string; copy: string; copied: string }
}

// Share with the phone's own sheet when there is one, and always offer the plain link.
export default function StoryActions({ url, title, labels }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2200)
  }

  async function share() {
    if (typeof navigator.share !== 'function') return copy()
    try {
      await navigator.share({ title, text: title, url })
    } catch (error) {
      // Closing the sheet is not a failure.
      if ((error as { name?: string })?.name !== 'AbortError') await copy()
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={share} className="btn-secondary focus-ring inline-flex items-center gap-2 px-4 py-2.5 text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4m0 0L8 6m4-4v13" /></svg>
        {labels.share}
      </button>
      <button type="button" onClick={copy} className="btn-secondary focus-ring inline-flex items-center gap-2 px-4 py-2.5 text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        {copied ? labels.copied : labels.copy}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? labels.copied : ''}</span>
    </div>
  )
}
