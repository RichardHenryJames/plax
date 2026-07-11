import { NextRequest, NextResponse } from 'next/server'

// Node runtime (NOT edge): Open Library's Cloudflare 403s Vercel's edge-function
// IPs, but the nodejs runtime IPs pass — this is the same reason the feed route
// (which fetches Open Library) runs on nodejs.
export const runtime = 'nodejs'

const OL_HEADERS = { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' }

type Doc = { title: string; key: string; editions: number; authors: string[] }

// "More by this author" — given an author name, return a few of their other
// notable works from Open Library (free, no key). Powers the book-card hook so a
// reader who likes a book can instantly discover more by the same author. Results
// are filtered to English-titled, substantial works and de-duped against the
// current title.
//
// Open Library blocks the /search.json endpoint from datacenter IPs (403 on
// Vercel) but serves the /works and /authors endpoints fine. So we try search
// first (clean, popularity-ranked — great locally) and fall back to the author's
// works list resolved from the current book's work key (reachable in prod).
export async function POST(request: NextRequest) {
  try {
    const { author, exclude = '', excludeUrl = '' } = await request.json()
    if (!author || typeof author !== 'string') {
      return NextResponse.json({ error: 'author required' }, { status: 400 })
    }

    // Extract the current work's Open Library key (e.g. /works/OL53908W) so we can
    // exclude the exact book the reader is on — the card title is often AI-rewritten,
    // so a title match alone misses it — and resolve the author key for the fallback.
    const excludeKey = (String(excludeUrl || '').match(/\/works\/OL\d+W/) || [''])[0]

    let docs = await fetchViaSearch(author)
    let via = 'search'
    let fbDbg = ''
    if (!docs.length) {
      const fb = await fetchViaAuthorKey(excludeKey, author)
      docs = fb.docs
      fbDbg = fb.dbg
      via = 'authorKey'
    }

    const excludeNorm = String(exclude || '').toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim()
    // Normalize the requested author so we can verify each result is actually by them
    // (Open Library's author= is a loose match and leaks other authors' books).
    const authorNorm = author.toLowerCase().replace(/[^a-z\s]/g, '').trim()
    const seen = new Set<string>()
    const works = docs
      .filter((w) => {
        if (!w.title || !w.key) return false
        // Exclude the exact book the reader is currently on (by OL work key).
        if (excludeKey && w.key === excludeKey) return false
        // Verify the book is genuinely by the requested author (guards against
        // Open Library returning co-mentioned / wrongly-attributed authors).
        if (
          w.authors.length &&
          authorNorm &&
          !w.authors.some((a) => {
            const an = a.toLowerCase().replace(/[^a-z\s]/g, '').trim()
            return an === authorNorm || an.includes(authorNorm) || authorNorm.includes(an)
          })
        )
          return false
        // English-alphabet titles only (drops foreign-language editions).
        if (!/^[\x20-\x7E]+$/.test(w.title)) return false
        // Drop foreign-language editions that slip past the ASCII test by
        // containing tell-tale non-English function words (German/French/Spanish/
        // Italian editions of the same book leak into the popularity ranking).
        if (/\b(und|der|die|das|den|dem|ein|eine|brief|briefe|vater|le|la|les|des|du|un|une|el|los|las|y|il|di|della|dello)\b/i.test(w.title)) return false
        // Skip collections / letters / adaptations noise, plus omnibus volumes
        // that just bundle already-listed works (e.g. "Novels (A / B)").
        if (/\b(letters?|collected|complete works|selected|anthology|zombies|companion|guide|novels|works|omnibus|reader|short stories|stories|poems|essays)\b/i.test(w.title)) return false
        if (w.title.includes('/')) return false
        // Require some real edition presence so obscure entries don't surface
        // (skipped when editions are unknown — the authorKey path has none).
        if (w.editions > 0 && w.editions < 5) return false
        const norm = w.title.toLowerCase().trim()
        if (excludeNorm && (norm === excludeNorm || norm.includes(excludeNorm) || excludeNorm.includes(norm))) return false
        if (seen.has(norm)) return false
        seen.add(norm)
        return true
      })
      .slice(0, 4)
      .map((w) => ({
        // Omit the year — Open Library's first_publish_year is frequently the date
        // of a mis-catalogued edition (wrong by decades), so a bare canonical title
        // is more trustworthy than a confidently-wrong date.
        title: w.title,
        url: `https://openlibrary.org${w.key}`,
      }))

    return NextResponse.json({ works, _dbg: `via=${via} docs=${docs.length} ${fbDbg}`.trim() })
  } catch (e) {
    return NextResponse.json({ works: [], _dbg: `catch ${e instanceof Error ? e.message : String(e)}` })
  }
}

// Popularity-ranked search — best quality, but 403s from datacenter IPs.
async function fetchViaSearch(author: string): Promise<Doc[]> {
  try {
    const url =
      `https://openlibrary.org/search.json?author=${encodeURIComponent(author)}` +
      `&sort=readinglog&limit=18&fields=title,key,edition_count,author_name`
    const r = await fetch(url, { cache: 'no-store', headers: OL_HEADERS })
    if (!r.ok) return []
    const data = await r.json()
    return (data?.docs || []).map((d: any) => ({
      title: (d?.title || '').trim(),
      key: d?.key || '',
      editions: d?.edition_count || 0,
      authors: Array.isArray(d?.author_name) ? d.author_name : [],
    }))
  } catch {
    return []
  }
}

// Fallback that only uses /works and /authors endpoints (reachable in prod).
// Resolve the author key from the current book, then list their works.
async function fetchViaAuthorKey(workKey: string, author: string): Promise<{ docs: Doc[]; dbg: string }> {
  const dbg: string[] = []
  try {
    let authorKey = ''
    if (workKey) {
      const wr = await fetch(`https://openlibrary.org${workKey}.json`, { cache: 'no-store', headers: OL_HEADERS })
      dbg.push(`work=${wr.status}`)
      if (wr.ok) {
        const wd = await wr.json()
        authorKey = wd?.authors?.[0]?.author?.key || ''
      }
    }
    // Fallback: resolve the author key by name if the work didn't yield one.
    if (!authorKey) {
      const sr = await fetch(
        `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(author)}`,
        { cache: 'no-store', headers: OL_HEADERS },
      )
      dbg.push(`authSearch=${sr.status}`)
      if (sr.ok) {
        const sd = await sr.json()
        const k = sd?.docs?.[0]?.key || ''
        authorKey = k ? `/authors/${k}` : ''
      }
    }
    dbg.push(`authorKey=${authorKey || 'none'}`)
    if (!authorKey) return { docs: [], dbg: dbg.join(' ') }

    const ar = await fetch(`https://openlibrary.org${authorKey}/works.json?limit=50`, {
      cache: 'no-store',
      headers: OL_HEADERS,
    })
    dbg.push(`works=${ar.status}`)
    if (!ar.ok) return { docs: [], dbg: dbg.join(' ') }
    const ad = await ar.json()
    const docs = (ad?.entries || []).map((e: any) => ({
      title: (e?.title || '').trim(),
      key: e?.key || '',
      editions: 0,
      authors: [author],
    }))
    dbg.push(`entries=${docs.length}`)
    return { docs, dbg: dbg.join(' ') }
  } catch (e) {
    dbg.push(`err=${e instanceof Error ? e.message : String(e)}`)
    return { docs: [], dbg: dbg.join(' ') }
  }
}
