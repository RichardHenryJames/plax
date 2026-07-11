import { ImageResponse } from 'next/og'

// Dynamic 1200×630 OpenGraph image for the whole site (much better for social
// shares than the square logo). Rendered at the edge, cached by Next.
export const runtime = 'edge'
export const alt = 'Plax — Get Smarter Every Day'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
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
            'radial-gradient(900px 500px at 12% -10%, rgba(245,177,58,0.28), transparent 60%)',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#f5b13a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 38,
              fontWeight: 800,
              color: 'white',
            }}
          >
            P
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Plax</div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            Get smarter,
          </div>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              background: '#f5b13a',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            one swipe at a time.
          </div>
          <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.6)', marginTop: 28, maxWidth: 900 }}>
            Bite-sized, AI-summarized insights on the topics you love.
          </div>
        </div>

        {/* Footer chips */}
        <div style={{ display: 'flex', gap: 14 }}>
          {['Science', 'Technology', 'Space', 'Philosophy', 'Finance'].map((c) => (
            <div
              key={c}
              style={{
                fontSize: 24,
                color: 'rgba(255,255,255,0.82)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 999,
                padding: '10px 20px',
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
