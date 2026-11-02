// The step that gives a news pool its articles' openings and pictures (lib/lead.ts), with a reader that keeps what it finds across requests
// and server instances (lib/lead-cache.ts). Done by the feed route after it has the pool, not inside it: the pool is itself cached, and a
// cache inside a cache is not read, so the pool could not share the pages it had read with the next instance.
import { extendSummaries, type LeadStory } from './lead'
import { keptPageReader } from './lead-cache'
import { SITE_URL } from './site'

/** How long the pages that are not yet kept may take, all together. */
const BUDGET_MS = 2800

/** Changes the stories in place. A failure of any kind leaves them as the feed gave them. */
export async function enrichNews(stories: LeadStory[]): Promise<void> {
  const userAgent = `Mozilla/5.0 (compatible; PlaxReader/1.0; +${SITE_URL})`
  const started = Date.now()
  try {
    await extendSummaries(stories, {
      userAgent,
      readInfo: keptPageReader(userAgent),
      budgetMs: BUDGET_MS,
      maxPages: 30,
      concurrency: 10,
      report: (report) => {
        if (report.read === 0 && report.texts === 0 && report.pictures === 0 && report.failed.length === 0) return
        const refused = report.failed.length > 0 ? `, no answer from ${report.failed.join(', ')}` : ''
        console.log(`[Plax Leads] ${report.read} pages read in ${Date.now() - started} ms, ${report.texts} openings and ${report.pictures} pictures added${refused}`)
      },
    })
  } catch {
    /* the stories stay as the feed gave them */
  }
}
