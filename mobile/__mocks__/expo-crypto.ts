import { createHash, randomBytes } from 'node:crypto'

export enum CryptoDigestAlgorithm {
  SHA1 = 'SHA-1',
  SHA256 = 'SHA-256',
  SHA384 = 'SHA-384',
  SHA512 = 'SHA-512',
}
export enum CryptoEncoding {
  HEX = 'hex',
  BASE64 = 'base64',
}

const NODE_NAMES: Record<string, string> = { 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' }

export async function digestStringAsync(algorithm: CryptoDigestAlgorithm, data: string, options?: { encoding?: CryptoEncoding }): Promise<string> {
  return createHash(NODE_NAMES[algorithm]).update(data, 'utf8').digest(options?.encoding === CryptoEncoding.BASE64 ? 'base64' : 'hex')
}

export function getRandomBytes(length: number): Uint8Array {
  return new Uint8Array(randomBytes(length))
}
export async function getRandomBytesAsync(length: number): Promise<Uint8Array> {
  return getRandomBytes(length)
}
export function randomUUID(): string {
  return require('node:crypto').randomUUID()
}
