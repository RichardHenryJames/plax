'use client'

import { useState } from 'react'

// The picture is the publisher's, loaded straight from them without telling them which page asked. If they refuse
// or it is gone, the page simply reads without it.
export default function StoryImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        decoding="async"
        fetchPriority="high"
        className="w-full h-56 sm:h-72 object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
