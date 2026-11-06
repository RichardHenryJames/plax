import { imageCandidates, sampleSize } from '../image-sizing'
import { parseMarkdown, plainText, type MarkdownSpan } from '../markdown'

const plain = (text: string): MarkdownSpan => ({ text, bold: false, italic: false })
const bold = (text: string): MarkdownSpan => ({ text, bold: true, italic: false })
const italic = (text: string): MarkdownSpan => ({ text, bold: false, italic: true })

describe('the pictures asked for', () => {
  it('upgrade a BBC thumbnail, and keep the original as the fallback', () => {
    const small = 'https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/0816/live/photo.jpg'
    expect(imageCandidates(small, 1080)).toEqual(['https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/0816/live/photo.jpg', small])
    expect(imageCandidates('https://ichef.bbci.co.uk/ace/ws/240/cpsprodpb/x/photo.jpg', 700)).toEqual([
      'https://ichef.bbci.co.uk/ace/ws/800/cpsprodpb/x/photo.jpg',
      'https://ichef.bbci.co.uk/ace/ws/240/cpsprodpb/x/photo.jpg',
    ])
  })

  it('take the smallest width the service has that is large enough', () => {
    const at = (width: number) => imageCandidates('https://ichef.bbci.co.uk/ace/standard/240/p.jpg', width)[0]
    expect(at(1)).toBe('https://ichef.bbci.co.uk/ace/standard/240/p.jpg')
    expect(at(241)).toBe('https://ichef.bbci.co.uk/ace/standard/320/p.jpg')
    expect(at(320)).toBe('https://ichef.bbci.co.uk/ace/standard/320/p.jpg')
    expect(at(481)).toBe('https://ichef.bbci.co.uk/ace/standard/624/p.jpg')
    expect(at(800)).toBe('https://ichef.bbci.co.uk/ace/standard/800/p.jpg')
    expect(at(977)).toBe('https://ichef.bbci.co.uk/ace/standard/976/p.jpg')
    expect(at(5000)).toBe('https://ichef.bbci.co.uk/ace/standard/976/p.jpg')
  })

  it('do not rewrite a large BBC picture or another host\u2019s', () => {
    const large = 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/0816/live/photo.jpg'
    expect(imageCandidates(large, 1080)).toEqual([large])
    const other = 'https://c.ndtvimg.com/2026-10/a_625x300.jpeg?im=FeatureCrop,width=1280'
    expect(imageCandidates(other, 1080)).toEqual([other])
    const wider = 'https://ichef.bbci.co.uk/ace/standard/1024/cpsprodpb/x.jpg'
    expect(imageCandidates(wider, 1080)).toEqual([wider])
  })

  it('leave alone what is not the BBC\u2019s picture service', () => {
    for (const url of ['', 'not a link', 'http://ichef.bbci.co.uk/ace/standard/240/p.jpg', 'https://ichef.bbci.co.uk/ace/other/240/p.jpg', 'https://ichef.bbci.co.uk/ace/standard/2/p.jpg', 'https://ichef.bbci.co.uk/ace/standard/240', 'https://evil.example/https://ichef.bbci.co.uk/ace/standard/240/p.jpg', 'https://ichef.bbci.co.uk/ace/standard/240/p.jpg\n']) {
      expect({ url, candidates: imageCandidates(url, 1080) }).toEqual({ url, candidates: [url] })
    }
  })

  it('also upgrade a picture two to four digits wide', () => {
    expect(imageCandidates('https://ichef.bbci.co.uk/ace/standard/320/p.jpg', 1080)[0]).toBe('https://ichef.bbci.co.uk/ace/standard/976/p.jpg')
    expect(imageCandidates('https://ichef.bbci.co.uk/ace/standard/99/p.jpg', 1080)[0]).toBe('https://ichef.bbci.co.uk/ace/standard/976/p.jpg')
  })
})

describe('the size a picture is decoded at', () => {
  it('keeps the decoded width at or above the target', () => {
    expect(sampleSize(1200, 1080)).toBe(1)
    expect(sampleSize(2000, 1080)).toBe(1)
    expect(sampleSize(2160, 1080)).toBe(2)
    expect(sampleSize(4500, 1080)).toBe(4)
    expect(sampleSize(240, 1080)).toBe(1)
  })

  it('is a power of two, the largest that keeps the target', () => {
    expect(sampleSize(8640, 1080)).toBe(8)
    expect(sampleSize(8639, 1080)).toBe(4)
    expect(sampleSize(1080, 1080)).toBe(1)
    expect(sampleSize(0, 1080)).toBe(1)
  })

  it('does not loop for a width or a target that makes no sense', () => {
    expect(sampleSize(1000, 0)).toBe(1)
    expect(sampleSize(1000, -5)).toBe(1)
    expect(sampleSize(1000, Number.NaN)).toBe(1)
    expect(sampleSize(Number.NaN, 100)).toBe(1)
    expect(sampleSize(Number.POSITIVE_INFINITY, 100)).toBe(1)
    expect(sampleSize(-100, 50)).toBe(1)
  })
})

describe('the Go deeper text', () => {
  it('makes bold and italic spans without the markers', () => {
    expect(parseMarkdown('The **key phrase** and *emphasis*.')).toEqual([plain('The '), bold('key phrase'), plain(' and '), italic('emphasis'), plain('.')])
  })

  it('drops a marker with no partner instead of showing it', () => {
    expect(parseMarkdown('a **b')).toEqual([plain('a b')])
    expect(parseMarkdown('open ** text')).toEqual([plain('open  text')])
    expect(parseMarkdown('price *5 up')).toEqual([plain('price 5 up')])
  })

  it('makes a bullet of "* " at the start of a line', () => {
    expect(parseMarkdown('* one\n* two')).toEqual([plain('\u2022 one\n\u2022 two')])
    expect(parseMarkdown('* one')).toEqual([plain('\u2022 one')])
    expect(parseMarkdown('text\n* item')).toEqual([plain('text\n\u2022 item')])
  })

  it('does not make a bullet of a star that is not at the start of a line or has no space after it', () => {
    expect(parseMarkdown('a * b')).toEqual([plain('a  b')])
    expect(parseMarkdown('*b* text')).toEqual([italic('b'), plain(' text')])
    expect(parseMarkdown('*')).toEqual([])
  })

  it('leaves plain Hindi untouched', () => {
    const hindi = 'भारत ने जीत दर्ज की।'
    expect(parseMarkdown(hindi)).toEqual([plain(hindi)])
  })

  it('keeps the spacing around Hindi bold', () => {
    const spans = parseMarkdown('समय **13 अक्टूबर** तक')
    expect(spans).toHaveLength(3)
    expect(spans[1].bold).toBe(true)
    expect(spans[0].text.endsWith(' ')).toBe(true)
    expect(spans[2].text.startsWith(' ')).toBe(true)
  })

  it('has nothing to show for an empty text, or one of markers alone', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('****')).toEqual([])
    expect(parseMarkdown('**')).toEqual([])
    expect(parseMarkdown('***')).toEqual([])
  })

  it('reads one marker after another, and bold inside a line of a list', () => {
    expect(parseMarkdown('**a****b**')).toEqual([bold('a'), bold('b')])
    expect(parseMarkdown('* **Bold** item\n* *Slanted* item')).toEqual([plain('\u2022 '), bold('Bold'), plain(' item\n\u2022 '), italic('Slanted'), plain(' item')])
  })

  it('takes an italic that runs into a bold marker as unfinished', () => {
    // The first star finds the star of the bold marker, which is not its own closing, so it is dropped; the bold marker has no partner.
    expect(parseMarkdown('*a**b')).toEqual([plain('ab')])
  })

  it('never takes a character apart, whatever the text', () => {
    const emoji = 'fact \u{1F389} **party \u{1F389}** done'
    expect(parseMarkdown(emoji)).toEqual([plain('fact \u{1F389} '), bold('party \u{1F389}'), plain(' done')])
  })

  it('gives the text without its markers', () => {
    expect(plainText(parseMarkdown('The **key** and *more*'))).toBe('The key and more')
    expect(plainText([])).toBe('')
  })

  it('keeps a long text whole', () => {
    const text = `${'word '.repeat(300)}**end**`
    const spans = parseMarkdown(text)
    expect(spans).toHaveLength(2)
    expect(spans[0].text).toHaveLength(1500)
    expect(spans[1]).toEqual(bold('end'))
  })
})
