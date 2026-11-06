import * as Crypto from 'expo-crypto'

/** Where the random bytes of a code verifier come from; a test hands in its own so that nothing depends on chance. */
export type RandomBytes = (length: number) => Uint8Array

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** The bytes in URL-safe base64 with no padding (RFC 4648, section 5): the form RFC 7636 asks for. */
export function base64Url(bytes: Uint8Array): string {
  let text = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    text += ALPHABET[first >> 2]
    text += ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)]
    if (second !== undefined) text += ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)]
    if (third !== undefined) text += ALPHABET[third & 63]
  }
  return text
}

/** The number of random bytes behind a verifier: 48 of them are 64 characters, inside the 43 to 128 the standard allows. */
export const VERIFIER_BYTES = 48

/**
 * Proof Key for Code Exchange (RFC 7636). The browser hands back a one-time code; it is worth nothing without the secret that only
 * this app holds, so another app that sees the redirect cannot sign in with it.
 */
export function verifier(random: RandomBytes = Crypto.getRandomBytes): string {
  return base64Url(random(VERIFIER_BYTES))
}

/** The challenge for a verifier: the SHA-256 of its characters, in the same base64 form (the S256 method). */
export async function challenge(code: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, code, { encoding: Crypto.CryptoEncoding.BASE64 })
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
