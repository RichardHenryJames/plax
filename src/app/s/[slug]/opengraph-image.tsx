import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { excerpt, latinCardText, parseShareSegment } from '@/lib/share'
import { loadShare } from '@/lib/share-store'
import { getTopicSeo } from '@/lib/seo'
import { NEWS_SECTIONS } from '@/lib/types'

// The picture a chat app shows when a Plax story link is pasted: the headline set large on the brand colours. It is
// drawn, not copied from the publisher, and kept small so every app will show it. Hindi headlines are not drawn
// (see latinCardText); those links still carry the Hindi headline as text, which the chat app sets itself.
export const runtime = 'nodejs'
export const alt = 'A story on Plax'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

let font: Promise<Buffer | null> | null = null
function headlineFont(): Promise<Buffer | null> {
  font ??= readFile(join(process.cwd(), 'assets/og/Newsreader-700-latin.woff')).catch(() => null)
  return font
}

// A stored story never changes, so its picture is kept for good. The plain card is only a stand-in.
const FOR_GOOD = 'public, max-age=31536000, immutable'
const FOR_NOW = 'public, max-age=300'

function headlineSize(text: string): number {
  if (text.length <= 60) return 78
  if (text.length <= 100) return 68
  if (text.length <= 150) return 58
  return 50
}

type Params = { params: Promise<{ slug: string }> }

export default async function Image({ params }: Params) {
  const { slug } = await params
  let headline: string | null = null
  let chip = 'News'
  let source: string | null = null
  let final = false
  try {
    const parsed = parseShareSegment(slug)
    const record = parsed ? await loadShare(parsed.id) : null
    if (record) {
      final = true
      const section = NEWS_SECTIONS.find((s) => s.id === record.section)
      chip = section?.label ?? getTopicSeo(record.category)?.label ?? 'News'
      const drawn = latinCardText(record.title || record.content)
      headline = drawn === null ? null : excerpt(drawn, 170)
      source = latinCardText(record.source)
    }
  } catch {
    // The store could not be asked: draw the plain card, briefly, rather than fail the preview.
  }

  const data = await headlineFont()
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
          backgroundImage: 'radial-gradient(900px 520px at 8% -12%, rgba(245,177,58,0.30), transparent 62%)',
          padding: '64px 80px 60px 88px',
          fontFamily: 'Newsreader',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: '#f5b13a', display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 60, height: 60, borderRadius: 17, background: '#f5b13a', color: '#17130a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700,
              }}
            >
              P
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, color: 'rgba(255,255,255,0.94)', letterSpacing: '-0.01em' }}>Plax</div>
          </div>
          <div
            style={{
              display: 'flex', fontSize: 26, fontWeight: 700, color: '#f5b13a', letterSpacing: '0.12em', textTransform: 'uppercase',
              background: 'rgba(245,177,58,0.14)', borderRadius: 999, padding: '10px 26px',
            }}
          >
            {chip}
          </div>
        </div>

        {headline ? (
          <div style={{ display: 'flex', fontSize: headlineSize(headline), fontWeight: 700, color: '#ffffff', lineHeight: 1.12, letterSpacing: '-0.015em' }}>
            {headline}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, color: '#ffffff', lineHeight: 1.05, letterSpacing: '-0.02em' }}>The news,</div>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, color: '#f5b13a', lineHeight: 1.05, letterSpacing: '-0.02em' }}>short and clear.</div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 28, color: 'rgba(255,255,255,0.62)' }}>
          <div style={{ display: 'flex' }}>{source ? `via ${source}` : 'Read it on Plax'}</div>
          <div style={{ display: 'flex', color: '#f5b13a' }}>plaxlabs.com/news</div>
        </div>
      </div>
    ),
    {
      ...size,
      ...(data ? { fonts: [{ name: 'Newsreader', data, weight: 700 as const, style: 'normal' as const }] } : {}),
      headers: { 'Cache-Control': final ? FOR_GOOD : FOR_NOW },
    }
  )
}
