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

// Words that cannot end a text that is cut short, because what follows is what they are about: "compared to a…", "Justices Bagchi and
// V…", "Dr.…", "a 1.7…". A cut that lands after one stops before it. The Hindi are the postpositions, the conjunctions and the
// pronouns that lead into a noun.
const WEAK_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'as', 'if', 'than', 'that', 'which', 'who', 'whom', 'whose', 'whether',
  'because', 'although', 'though', 'while', 'when', 'where', 'once', 'until', 'unless', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by',
  'with', 'into', 'onto', 'over', 'under', 'about', 'after', 'before', 'between', 'through', 'during', 'against', 'among', 'per', 'via',
  'amid', 'across', 'within', 'without', 'upon', 'toward', 'towards', 'near', 'beside', 'behind', 'beyond', 'around', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'am', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could',
  'may', 'might', 'must', 'his', 'her', 'its', 'their', 'our', 'your', 'my', 'this', 'these', 'those', 'such', 'any', 'some', 'each',
  'every', 'both', 'all', 'another', 'other', 'more', 'most', 'less', 'many', 'much', 'few', 'not', 'also', 'even', 'just', 'only', 'very',
  'like',
  'dr', 'mr', 'mrs', 'ms', 'mx', 'prof', 'sr', 'jr', 'st', 'mt', 'gen', 'col', 'capt', 'lt', 'sgt', 'cmdr', 'adm', 'sen', 'rep', 'gov',
  'hon', 'rev', 'vs',
  'के', 'की', 'का', 'में', 'से', 'को', 'पर', 'ने', 'और', 'या', 'भी', 'तो', 'कि', 'जो', 'यह', 'वह', 'इस', 'उस', 'एक', 'कुछ', 'सभी',
  'अपने', 'अपनी', 'अपना', 'उनके', 'उनकी', 'इसके', 'इसकी', 'लिए', 'साथ', 'बाद', 'पहले', 'द्वारा', 'तक', 'बीच', 'ही',
])
const WEAK_INITIAL = /^\p{Lu}$/u
const WEAK_NUMBER = /^\p{Sc}?\d[\d,.]*%?$/u

/** A word without the marks around it: quotes, brackets, a comma or a full stop. */
const bare = (word: string) => word.replace(/^[^\p{L}\p{M}\p{N}\p{Sc}]+/u, '').replace(/[^\p{L}\p{M}\p{N}%]+$/u, '')

function isWeak(word: string): boolean {
  const core = bare(word)
  return core === '' || WEAK_WORDS.has(core.toLowerCase()) || WEAK_INITIAL.test(core) || WEAK_NUMBER.test(core)
}

/** An opening bracket that is never closed, close to the end, is no place to stop: the text is cut before it. */
function beforeOpenBracket(text: string, minWords: number): string {
  const open = text.lastIndexOf('(')
  if (open < 0 || open < text.lastIndexOf(')') || text.length - open > 48) return text
  const before = text.slice(0, open).trimEnd()
  return before.split(/\s+/).length >= minWords ? before : text
}

/**
 * The text without the words at its end that cannot end it (see WEAK_WORDS), up to `limit` of them and never leaving fewer than
 * `minWords` words, and without an opening bracket that is never closed. For a text that is cut at a word, so that it stops on
 * something that says a thing: "…Joymalya Bagchi…" and not "…Joymalya Bagchi and V…".
 */
export function trimWeakTail(text: string, limit: number = 4, minWords: number = 4): string {
  let kept = text.trimEnd()
  for (let round = 0; round < 2; round++) {
    const words = [...kept.matchAll(/\S+/g)]
    let keep = words.length
    while (keep > minWords && words.length - keep < limit && isWeak(words[keep - 1][0])) keep--
    if (keep < words.length) kept = kept.slice(0, (words[keep - 1].index ?? 0) + words[keep - 1][0].length)
    const closed = beforeOpenBracket(kept, minWords)
    if (closed === kept) break
    kept = closed
  }
  return kept
}
