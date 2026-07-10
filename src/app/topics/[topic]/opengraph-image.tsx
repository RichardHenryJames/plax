import { ImageResponse } from 'next/og'
import { getTopicSeo, TOPIC_SEO } from '@/lib/seo'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Pre-generate per-topic OG images at build time.
export function generateStaticParams() {
  return TOPIC_SEO.map((t) => ({ topic: t.id }))
}

export default async function TopicOgImage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params
  const t = getTopicSeo(topic)
  const label = t?.label || 'Topics'
  const emoji = t?.emoji || '📚'
  const intro = t?.description || 'Bite-sized, AI-summarized insights on Plax.'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0a0a0c',
          backgroundImage:
            'radial-gradient(900px 500px at 12% -10%, rgba(139,92,246,0.35), transparent 60%), radial-gradient(800px 500px at 100% 0%, rgba(34,211,238,0.22), transparent 55%)',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #8b5cf6, #22d3ee)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
              color: 'white',
            }}
          >
            P
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Plax</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 96, lineHeight: 1 }}>{emoji}</div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              marginTop: 18,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.62)', marginTop: 22, maxWidth: 980, lineHeight: 1.35 }}>
            {intro.length > 130 ? intro.slice(0, 130) + '…' : intro}
          </div>
        </div>

        <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.55)' }}>plaxlabs.com · get smarter every day</div>
      </div>
    ),
    { ...size }
  )
}
