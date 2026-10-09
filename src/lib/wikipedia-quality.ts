// Wikipedia disambiguation pages ("X may refer to: …") are lists of other articles, not something to
// read. The extract keeps going after "may refer to:" (it carries the list), so the phrase is looked
// for near the start rather than at the very end.
export function isDisambiguationPage(description: string, title: string, extract: string): boolean {
  if (/\(disambiguation\)/i.test(title)) return true
  if (/\bdisambiguation\b/i.test(description)) return true // Wikidata: "Wikimedia disambiguation page"
  return /^[^.!?]{0,120}\b(may|can|could) (also )?refer to\b/i.test(extract.trimStart())
}
