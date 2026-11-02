// What a story's page gives (the opening of its article and its picture), kept across requests and server instances.
//
// A server instance lives for minutes, and the page of every story is worth reading once, not once for each instance: what a page gave is
// kept in Next's data cache for hours, which every instance shares, so the pages the feed has not got to yet are read on the next
// refresh and the ones it has are free. A page that gave nothing, or could not be read, is not kept here (lead.ts remembers that for a
// few minutes in the instance, so that the next refresh looks at it again later).
import { unstable_cache } from 'next/cache'
import { NoPage, fetchPageInfo, type PageInfo } from './lead.ts'

/** How long what a page gave is kept. */
const KEPT_SECONDS = 12 * 60 * 60
/** How long one page may take; the shared budget of the feed is shorter still. */
const PAGE_MS = 3000

const kept = unstable_cache(
  async (link: string, userAgent: string): Promise<PageInfo> => {
    const info = await fetchPageInfo(link, userAgent, PAGE_MS)
    if (info.lead === '' && info.image === '') throw new NoPage()
    return info
  },
  ['article-page-v2'],
  { revalidate: KEPT_SECONDS },
)

/** A reader of pages for lead.ts that keeps what it finds across requests. */
export function keptPageReader(userAgent: string): (link: string) => Promise<PageInfo> {
  return (link) => kept(link, userAgent)
}
