// Translation engines add spaces just inside markdown markers (`** x **`, `* x *`).
// Trim only the inside of each marker pair so the client's bold/italic renderer
// matches, keep the spacing outside the pair, and drop stray spaces an engine
// introduced before punctuation.
export function tidyMarkers(s: string): string {
  return s
    .replace(/\*\*\s*([^*]+?)\s*\*\*/g, '**$1**')
    .replace(/(^|[\s(])\*\s*([^*\s][^*]*?)\s*\*(?=$|[\s).,;:!?।])/g, '$1*$2*')
    .replace(/\s+([।,.;:!?])/g, '$1')
    .trim()
}
