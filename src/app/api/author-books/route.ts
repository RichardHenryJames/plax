import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// "More by this author" — given an author name, return a few of their other
// notable works from Open Library (free, no key). Powers the book-card hook so a
// reader who likes a book can instantly discover more by the same author. Results
// are filtered to English-titled, substantial works and de-duped against the
// current title.
export async function POST(request: NextRequest) {
  try {
    const { author, exclude = '', excludeUrl = '' } = await request.json()
    if (!author || typeof author !== 'string') {
      return NextResponse.json({ error: 'author required' }, { status: 400 })
    }

    // Use the search endpoint sorted by reading-log popularity — it returns clean,
    // canonical English titles (the author-works endpoint is polluted with foreign
    // editions). Ranked by how many readers have logged the book = the author's
    // best-known works surface first.
    const url =
      `https://openlibrary.org/search.json?author=${encodeURIComponent(author)}` +
      `&sort=readinglog&limit=18&fields=title,first_publish_year,key,edition_count,author_name`
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
    })
    if (!r.ok) return NextResponse.json({ works: [], _dbg: `upstream ${r.status}` })
    const data = await r.json()
    const docs: any[] = data?.docs || []

    const excludeNorm = String(exclude || '').toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim()
    // Extract the current work's Open Library key (e.g. /works/OL53908W) so we can
    // exclude the exact book the reader is on — the card title is often AI-rewritten,
    // so a title match alone misses it.
    const excludeKey = (String(excludeUrl || '').match(/\/works\/OL\d+W/) || [''])[0]
    // Normalize the requested author so we can verify each result is actually by them
    // (Open Library's author= is a loose match and leaks other authors' books).
    const authorNorm = author.toLowerCase().replace(/[^a-z\s]/g, '').trim()
    const seen = new Set<string>()
    const works = docs
      .map((d) => ({
        title: (d?.title || '').trim(),
        year: d?.first_publish_year,
        key: d?.key || '',
        editions: d?.edition_count || 0,
        authors: (Array.isArray(d?.author_name) ? d.author_name : []) as string[],
      }))
      .filter((w) => {
        if (!w.title || !w.key) return false
        // Exclude the exact book the reader is currently on (by OL work key).
        if (excludeKey && w.key === excludeKey) return false
        // Verify the book is genuinely by the requested author (guards against
        // Open Library returning co-mentioned / wrongly-attributed authors).
        if (
          authorNorm &&
          !w.authors.some((a) => {
            const an = a.toLowerCase().replace(/[^a-z\s]/g, '').trim()
            return an === authorNorm || an.includes(authorNorm) || authorNorm.includes(an)
          })
        )
          return false
        // English-alphabet titles only (drops foreign-language editions).
        if (!/^[\x20-\x7E]+$/.test(w.title)) return false
        // Skip collections / letters / adaptations noise, plus omnibus volumes
        // that just bundle already-listed works (e.g. "Novels (A / B)").
        if (/\b(letters?|collected|complete works|selected|anthology|zombies|companion|guide|novels|works|omnibus|reader)\b/i.test(w.title)) return false
        if (w.title.includes('/')) return false
        // Require some real edition presence so obscure entries don't surface.
        if (w.editions < 5) return false
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

    return NextResponse.json({ works, _dbg: `docs=${docs.length}` })
  } catch (e) {
    return NextResponse.json({ works: [], _dbg: `catch ${e instanceof Error ? e.message : String(e)}` })
  }
}
