// A Hindi word never has letters of another script inside it. A language model now and then lets one slip in, and the word then
// reads as broken text ("पाльше" for "पाले में"). This finds that, so that the translation can be refused and another provider's
// answer used. Latin is left alone (names and abbreviations are written in it), and so is a word of another script that stands on
// its own, between spaces (a Chinese name, say): only a word that MIXES Devanagari with another script is the glitch.
const DEVANAGARI = '\\u0900-\\u097F'
// Greek, Cyrillic, Hebrew, Arabic, the other Indian scripts, Thai, Japanese kana, Chinese characters and Hangul.
const OTHER = '\\u0370-\\u052F\\u0590-\\u06FF\\u0980-\\u0DFF\\u0E00-\\u0E7F\\u3040-\\u30FF\\u3400-\\u9FFF\\uAC00-\\uD7AF'
const MIXED = new RegExp(`[${DEVANAGARI}][${OTHER}]|[${OTHER}][${DEVANAGARI}]`)

export function hasMixedScriptWord(text: string): boolean {
  return MIXED.test(text)
}
