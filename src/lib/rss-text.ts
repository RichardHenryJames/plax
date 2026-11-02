// The text of an RSS or Atom field: its markup taken out and its entities turned into what they stand for. Pure and standing alone from the
// feed code (lib/sources.ts), so that it can be tested.
import { decodeEntities } from './blurb.ts'

/** What one pass of decodeEntities leaves that is an entity of its own. */
const LEFT_OVER = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i

/**
 * Some feeds escape twice: NDTV sends "Pune&amp;#039;s", which one pass turns into "Pune&#039;s". Another pass, only when something is
 * left, turns it into "Pune's". A named entity that is still not known after that is a space, as before.
 */
export function decodeRss(field: string): string {
  let text = (field || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  text = decodeEntities(text)
  if (LEFT_OVER.test(text)) text = decodeEntities(text)
  return text.replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}
