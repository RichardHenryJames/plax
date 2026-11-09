/**
 * The share of a text's letters that are Devanagari (Hindi's script) among the Devanagari and Latin letters it has: 1 for a text in Hindi, 0
 * for one in English, null for a text with neither (numbers, symbols). Digits, spaces and punctuation are not counted, and nor is the other
 * script of a word in both, so "NSE ने ... जारी किया" is Hindi.
 */
export function devanagariShare(text: string): number | null {
  let devanagari = 0
  let latin = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    // The block holds the letters and their vowel signs, and also the danda (U+0964, U+0965), the Devanagari digits and the abbreviation sign (U+0966 to U+0970).
    if (code >= 0x0900 && code <= 0x097f && !(code >= 0x0964 && code <= 0x0970)) devanagari++
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin++
  }
  const letters = devanagari + latin
  return letters === 0 ? null : devanagari / letters
}

/** From this share of Devanagari a text counts as written in Hindi: a Hindi sentence that names a company or a ticker in Latin letters still does. */
export const HINDI_SHARE = 0.3

/** A text that is Hindi (some of its words may be in Latin letters, as news in Hindi often has). */
export function isHindiText(text: string): boolean {
  const share = devanagariShare(text)
  return share !== null && share >= HINDI_SHARE
}
