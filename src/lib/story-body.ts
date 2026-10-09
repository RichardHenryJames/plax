// What a card shows under its headline, without the headline said twice. A port of Story.body() in the
// Android app (android/app/src/main/java/com/plaxlabs/news/Story.java), so both read alike.
const MINIMUM_BODY = 12

// Two spellings of one sentence compare equal: case, spacing and a trailing full stop or ellipsis do not matter.
const comparable = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').replace(/[.\u2026\s]+$/, '')

// What sets a repeated headline apart from the text after it: a colon, full stop, bar, dash, ellipsis or danda.
const AFTER_HEADLINE = /^(?:\s*[:.|\u2013\u2014\u2026\u0964]|\s+-)[\s:.|\u2013\u2014\u2026\u0964-]*/

/**
 * The body text without the headline repeated: the feed often returns it again as the whole text, or as a
 * first sentence set apart by a separator. A sentence that merely begins with the headline stays whole, so
 * "Evolution" over "Evolution is the change in..." never becomes "is the change in...".
 */
export function bodyWithoutHeadline(title: string | undefined, content: string): string {
  const text = content.trim()
  const lead = (title ?? '').trim()
  if (lead === '') return text
  if (comparable(text) === comparable(lead)) return ''
  if (text.length > lead.length && text.slice(0, lead.length).toLowerCase() === lead.toLowerCase()) {
    const separator = AFTER_HEADLINE.exec(text.slice(lead.length))
    if (separator) {
      const rest = text.slice(lead.length + separator[0].length).trim()
      return rest.length < MINIMUM_BODY ? '' : rest
    }
  }
  return text
}
