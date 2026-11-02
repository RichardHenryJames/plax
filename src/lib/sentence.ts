// Where a sentence ends. Shared by the code that cuts a text at a sentence (lib/blurb.ts, lib/lead.ts) and the code that fits one into a
// card (lib/text-fit.ts, which runs in the browser), so it stands alone and imports nothing.

// A full stop after one of these is not the end of a sentence: a title ("Dr. Rao"), a name's abbreviation or a company's.
const NOT_AN_END = new Set([
  'dr', 'mr', 'mrs', 'ms', 'mx', 'prof', 'sr', 'jr', 'st', 'mt', 'gen', 'col', 'capt', 'lt', 'sgt', 'cmdr', 'adm', 'sen', 'rep',
  'gov', 'hon', 'rev', 'vs', 'etc', 'inc', 'ltd', 'corp', 'rs', 'approx', 'dept',
])

/** Whether the mark at this index closes a sentence: not a full stop after a title, an initial ("M. K. Stalin") or an
 * abbreviation with stops of its own ("U.S.", "p.m."). */
export function endsSentence(text: string, index: number): boolean {
  if (text[index] !== '.') return true
  const word = text.slice(0, index).match(/([\p{L}.]+)$/u)?.[1] ?? ''
  if (word === '') return true
  if (/^\p{Lu}$/u.test(word) || word.includes('.')) return false
  return !NOT_AN_END.has(word.toLowerCase())
}
