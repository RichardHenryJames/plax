import { HINDI_SHARE, devanagariShare, isHindiText } from '../devanagari'

describe('the share of a text that is Devanagari', () => {
  it('is 1 for Hindi, 0 for English, and nothing for a text with no letters of either', () => {
    expect(devanagariShare('रुपया डॉलर के मुक़ाबले स्थिर रहा')).toBe(1)
    expect(devanagariShare('Rupee steadies against the dollar')).toBe(0)
    expect(devanagariShare('1234 !?, ।')).toBeNull()
    expect(devanagariShare('')).toBeNull()
  })

  it('counts the letters of the two scripts, not the marks, digits or punctuation between them', () => {
    // Three Latin letters (NSE) and four Devanagari code points (क म ा ई); the digits and the colon do not count.
    expect(devanagariShare('NSE 2026: कमाई')).toBeCloseTo(4 / 7, 5)
    expect(devanagariShare('12345 क')).toBe(1)
    expect(devanagariShare('abc अब')).toBeCloseTo(2 / 5, 5)
  })

  it('treats news in Hindi that names a company or a ticker in Latin letters as Hindi', () => {
    expect(isHindiText('हिंदुस्तान कोका-कोला होल्डिंग्स ने SEBI के पास ड्राफ्ट प्रॉस्पेक्टस दाखिल किया है, जो IPO का संकेत देता है।')).toBe(true)
    expect(isHindiText('Maharashtra Board Date Sheet 2027: महाराष्ट्र बोर्ड की परीक्षाओं का कार्यक्रम जारी, देखें पूरी तारीख़ें और विषय')).toBe(true)
  })

  it('does not take English for Hindi, or an English text with one Hindi word', () => {
    expect(isHindiText('Hindustan Coca-Cola Holdings files draft papers with SEBI for IPO and the market welcomed it')).toBe(false)
    expect(isHindiText('The minister said नमस्ते to the crowd and then spoke for an hour about the budget and the economy')).toBe(false)
  })

  it('has its line at 30 %', () => {
    expect(HINDI_SHARE).toBe(0.3)
    const share = (devanagari: number) => 'क'.repeat(devanagari) + 'a'.repeat(10 - devanagari)
    expect(isHindiText(share(3))).toBe(true)
    expect(isHindiText(share(2))).toBe(false)
  })

  it('is not fooled by text with no letters', () => {
    expect(isHindiText('2026-11-07 12:30')).toBe(false)
  })
})
