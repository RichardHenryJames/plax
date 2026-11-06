/**
 * Text rules of the native app's Java, kept so that what the app reads, writes and compares stays what it was: String.strip() and
 * isBlank() judge white space by Character.isWhitespace, and the cache key of a set of topics is a String.hashCode().
 */

// Unlike trim(), Character.isWhitespace keeps the no-break spaces and the byte order mark, and it also strips U+001C to U+001F.
function isWhitespace(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    (code >= 0x1c && code <= 0x20) ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x2006) ||
    (code >= 0x2008 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x205f ||
    code === 0x3000
  )
}

/** The text without the white space at its ends (Java's String.strip()). */
export function strip(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && isWhitespace(text.charCodeAt(start))) start++
  while (end > start && isWhitespace(text.charCodeAt(end - 1))) end--
  return text.slice(start, end)
}

/** Whether the text is empty or only white space (Java's String.isBlank()). */
export function isBlank(text: string): boolean {
  for (let index = 0; index < text.length; index++) if (!isWhitespace(text.charCodeAt(index))) return false
  return true
}

/** Java's String.hashCode(): a 32-bit signed number. */
export function javaHash(text: string): number {
  let hash = 0
  for (let index = 0; index < text.length; index++) hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0
  return hash
}

/** Java's Integer.toHexString(text.hashCode()): lower-case hexadecimal of the 32 bits, with no sign. */
export const hexHash = (text: string): string => (javaHash(text) >>> 0).toString(16)
