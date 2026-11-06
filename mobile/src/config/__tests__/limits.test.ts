import { DAY, HOUR, MINUTE, dueAfter, utf8Length } from '../limits'

describe('dueAfter', () => {
  const NOW = 1_800_000_000_000

  it('is due when it was never done, or the time kept is nothing', () => {
    expect(dueAfter(NOW, 0, HOUR)).toBe(true)
    expect(dueAfter(NOW, -5, HOUR)).toBe(true)
  })

  it('is not due until the whole wait is over', () => {
    expect(dueAfter(NOW, NOW - 1, HOUR)).toBe(false)
    expect(dueAfter(NOW, NOW - HOUR + 1, HOUR)).toBe(false)
    expect(dueAfter(NOW, NOW - HOUR, HOUR)).toBe(true)
    expect(dueAfter(NOW, NOW - DAY, HOUR)).toBe(true)
  })

  it('is due when the clock went backwards, which must not silence it for days', () => {
    expect(dueAfter(NOW, NOW + 1, HOUR)).toBe(true)
    expect(dueAfter(NOW, NOW + 5 * HOUR, 3 * HOUR)).toBe(true)
  })

  it('counts in milliseconds', () => {
    expect(MINUTE).toBe(60_000)
    expect(HOUR).toBe(3_600_000)
    expect(DAY).toBe(86_400_000)
  })
})

describe('utf8Length', () => {
  it('counts one byte for ASCII, two for the Latin letters, three for Hindi and four for an emoji', () => {
    expect(utf8Length('')).toBe(0)
    expect(utf8Length('abc')).toBe(3)
    expect(utf8Length('\u00fc')).toBe(2)
    expect(utf8Length('\u0915')).toBe(3)
    expect(utf8Length('\u20ac')).toBe(3)
    expect(utf8Length('\u{1F4F0}')).toBe(4)
    expect(utf8Length('\u2328\ufe0f')).toBe(6)
  })

  it('counts a lone surrogate as the three bytes of the replacement character, as UTF-8 writes it', () => {
    expect(utf8Length('\ud800')).toBe(3)
    expect(utf8Length('\udc00')).toBe(3)
    expect(utf8Length('\udc00\ud800')).toBe(6)
    expect(utf8Length('a\ud800')).toBe(4)
    expect(utf8Length('\ud800a')).toBe(4)
    expect(utf8Length('\ud800\ud83d\udcf0')).toBe(7)
  })

  it('agrees with the byte length of the same text written as UTF-8, whatever the text', () => {
    // A small generator of its own, so that the same texts are tried every run: every kind of unit, halves of pairs included.
    let seed = 12345
    const next = (limit: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % limit
    }
    const pieces = [0x41, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfffd, 0xffff]
    for (let round = 0; round < 300; round++) {
      let text = ''
      for (let at = next(12); at > 0; at--) text += String.fromCharCode(next(3) === 0 ? pieces[next(pieces.length)] : next(0x10000))
      expect(utf8Length(text)).toBe(Buffer.byteLength(text, 'utf8'))
    }
  })
})
