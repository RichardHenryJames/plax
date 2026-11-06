import { createHash } from 'node:crypto'
import { base64Url, challenge, verifier, VERIFIER_BYTES } from '../pkce'

// The worked example of RFC 7636, appendix B.
const RFC_OCTETS = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

const bytes = (text: string) => new Uint8Array([...Buffer.from(text, 'latin1')])

describe('base64Url', () => {
  it('turns the octets of RFC 7636 into its verifier', () => {
    expect(base64Url(new Uint8Array(RFC_OCTETS))).toBe(RFC_VERIFIER)
  })

  it('follows the test vectors of RFC 4648, without padding', () => {
    expect(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'].map((text) => base64Url(bytes(text)))).toEqual(['', 'Zg', 'Zm8', 'Zm9v', 'Zm9vYg', 'Zm9vYmE', 'Zm9vYmFy'])
  })

  it('writes the URL-safe alphabet: a hyphen for plus and an underscore for slash', () => {
    expect(base64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_')
    expect(base64Url(new Uint8Array([0xff]))).toBe('_w')
    expect(base64Url(new Uint8Array([0xff, 0xfe]))).toBe('__4')
  })

  it('agrees with the platform on every length and on random contents', () => {
    for (let length = 0; length < 70; length++) {
      const data = new Uint8Array(length).map((_, index) => (index * 37 + length * 11) & 0xff)
      expect(base64Url(data)).toBe(Buffer.from(data).toString('base64url'))
    }
  })
})

describe('the code challenge', () => {
  it('is the S256 of the verifier, as RFC 7636 shows', async () => {
    expect(await challenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE)
  })

  it('is 43 URL-safe characters with no padding, and never the verifier itself', async () => {
    for (let round = 0; round < 20; round++) {
      const secret = verifier()
      const code = await challenge(secret)
      expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(code).not.toBe(secret)
      expect(code).toBe(createHash('sha256').update(secret, 'ascii').digest('base64url'))
    }
  })

  it('differs for different verifiers and is the same for the same one', async () => {
    expect(await challenge('a'.repeat(43))).toBe(await challenge('a'.repeat(43)))
    expect(await challenge('a'.repeat(43))).not.toBe(await challenge('b'.repeat(43)))
  })
})

describe('the code verifier', () => {
  it('is 64 URL-safe characters, inside the 43 to 128 the standard allows', () => {
    const secret = verifier()
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(secret).toHaveLength(64)
  })

  it('is new every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => verifier()))
    expect(seen.size).toBe(50)
  })

  it('is made of 48 random bytes from the source it is given', () => {
    const asked: number[] = []
    const secret = verifier((length) => {
      asked.push(length)
      return new Uint8Array(length).fill(7)
    })
    expect(asked).toEqual([VERIFIER_BYTES])
    expect(VERIFIER_BYTES).toBe(48)
    expect(secret).toBe(base64Url(new Uint8Array(48).fill(7)))
  })
})
