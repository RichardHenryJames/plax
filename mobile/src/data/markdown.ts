/**
 * The small subset of Markdown the Plax AI writes in Go deeper: **bold**, *italic* and "* " bullets (the native app's Markdown.java).
 * The text becomes spans in a row, each plain, bold or italic; a screen draws them as nested text. A marker with no partner is dropped,
 * never shown, and a bullet at the start of a line becomes "\u2022 ".
 */
export interface MarkdownSpan {
  readonly text: string
  readonly bold: boolean
  readonly italic: boolean
}

export function parseMarkdown(input: string): MarkdownSpan[] {
  const spans: MarkdownSpan[] = []
  let plain = ''
  const flush = () => {
    if (plain === '') return
    spans.push({ text: plain, bold: false, italic: false })
    plain = ''
  }
  let index = 0
  const length = input.length
  while (index < length) {
    const current = input[index]
    const lineStart = index === 0 || input[index - 1] === '\n'
    if (current === '*' && lineStart && index + 1 < length && input[index + 1] === ' ') {
      plain += '\u2022 '
      index += 2
    } else if (input.startsWith('**', index)) {
      const end = input.indexOf('**', index + 2)
      if (end > index + 2) {
        flush()
        spans.push({ text: input.slice(index + 2, end), bold: true, italic: false })
        index = end + 2
      } else {
        index += 2
      }
    } else if (current === '*') {
      const end = input.indexOf('*', index + 1)
      if (end > index + 1 && !input.startsWith('**', end)) {
        flush()
        spans.push({ text: input.slice(index + 1, end), bold: false, italic: true })
        index = end + 1
      } else {
        index++
      }
    } else {
      plain += current
      index++
    }
  }
  flush()
  return spans
}

/** The text without any marker: what a screen reader is given, or what is copied. */
export const plainText = (spans: readonly MarkdownSpan[]): string => spans.map((span) => span.text).join('')
