import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// "More by this author" — given an author name, return a few of their other
// notable works from Open Library (free, no key). Powers the book-card hook so a
// reader who likes a book can instantly discover more by the same author. Results
// are filtered to English-titled, substantial works and de-duped against the
// current title.
export async function POST(request: NextRequest) {
  try {
    const { author, exclude = '' } = await request.json()
    if (!author || typeof author !== 'string') {
      return NextResponse.json({ error: 'author required' }, { status: 400 })
    }

    // Use the search endpoint sorted by reading-log popularity — it returns clean,
    // canonical English titles (the author-works endpoint is polluted with foreign
    // editions). Ranked by how many readers have logged the book = the author's
    // best-known works surface first.
    const url =
      `https://openlibrary.org/search.json?author=${encodeURIComponent(author)}` +
      `&sort=readinglog&limit=18&fields=title,first_publish_year,key,edition_count`
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'PlaxReader/1.0 (plaxlabs.com)' },
    })
    if (!r.ok) return NextResponse.json({ works: [] })
    const data = await r.json()
    const docs: any[] = data?.docs || []

    const excludeNorm = String(exclude || '').toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim()
    const seen = new Set<string>()
    const works = docs
      .map((d) => ({
        title: (d?.title || '').trim(),
        year: d?.first_publish_year,
        key: d?.key || '',
        editions: d?.edition_count || 0,
      }))
      .filter((w) => {
        if (!w.title || !w.key) return false
        // English-alphabet titles only (drops foreign-language editions).
        if (!/^[\x20-\x7E]+$/.test(w.title)) return false
        // Skip collections / letters / adaptations noise.
        if (/\b(letters?|collected|complete works|selected|anthology|zombies|companion|guide)\b/i.test(w.title)) return false
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
        title: w.year ? `${w.title} (${w.year})` : w.title,
        url: `https://openlibrary.org${w.key}`,
      }))

    return NextResponse.json({ works })
  } catch {
    return NextResponse.json({ works: [] })
  }
}
