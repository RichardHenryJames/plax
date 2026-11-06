/** Durations in milliseconds, as the clock counts them. */
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/**
 * Whether it is time to do something again: it was never done (or the time kept for it is nothing), the clock has gone back since
 * (which must not silence it for days), or the wait since the last time is over.
 */
export function dueAfter(now: number, last: number, wait: number): boolean {
  return last <= 0 || now < last || now - last >= wait
}

/**
 * How many bytes a text takes as UTF-8. The size limits of the website's files are in bytes, and what they hold is not only ASCII
 * (the Hindi names of the topics take three bytes a letter). A lone surrogate, which UTF-8 cannot hold, is counted as the three bytes
 * of the replacement character it would be written as.
 */
export function utf8Length(text: string): number {
  let bytes = 0
  for (let at = 0; at < text.length; at++) {
    const unit = text.charCodeAt(at)
    if (unit < 0x80) bytes += 1
    else if (unit < 0x800) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff && at + 1 < text.length && isLowSurrogate(text.charCodeAt(at + 1))) {
      bytes += 4
      at++
    } else bytes += 3
  }
  return bytes
}

const isLowSurrogate = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff
