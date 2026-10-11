import Link from 'next/link'
import { NextRequest } from 'next/server'
import { HomeApp } from '@/components/HomeApp'
import { GET as readFeed } from '@/app/api/feed/route'
import { SITE_URL } from '@/lib/seo'

// The page is the app, and the app reads its stories from /api/feed in the browser. robots.txt keeps crawlers off
// /news/api/, so Google saw "Could not load stories" and Search Console reported a soft 404. The server therefore reads
// the first stories itself with the code the endpoint runs (so ids and signatures match) and gives them to the app, which
// shows them only when the browser cannot reach the endpoint, and lists them as plain text in the HTML for anything that
// does not run scripts. Rebuilt every five minutes; if the read fails the page is built without them.
export const revalidate = 300

const FIRST_STORIES = 12

async function firstStories(): Promise<Record<string, string>[]> {
  try {
    const res = await readFeed(new NextRequest(`${SITE_URL}/api/feed?categories=news&limit=${FIRST_STORIES}&refresh=false&lang=en`))
    if (!res.ok) return []
    const body = (await res.json()) as { cards?: Record<string, string>[] }
    return Array.isArray(body.cards) ? body.cards.slice(0, FIRST_STORIES) : []
  } catch {
    return []
  }
}

export default async function Page() {
  const stories = await firstStories()
  return (
    <>
      <HomeApp seed={stories} />
      {/* After the app, so a screen reader reaches the app first; text only, nothing to tab to. */}
      <section aria-label="Latest headlines" className="sr-only">
        <h1>Plax: the day&apos;s news in short</h1>
        <p>
          Plax shows the top stories from India and the world in a few lines each, in English and Hindi, with a link to the
          publisher for the full report. No account is needed to read.
        </p>
        {stories.length > 0 && (
          <ul>
            {stories.filter((s) => s.title).map((s) => (
              <li key={s.id}>{s.source ? `${s.title} (${s.source})` : s.title}</li>
            ))}
          </ul>
        )}
        <p>
          <Link href="/headlines" tabIndex={-1}>All headlines</Link>
          {' · '}
          <Link href="/samachar" tabIndex={-1}>हिन्दी में ताज़ा खबरें</Link>
        </p>
      </section>
    </>
  )
}
