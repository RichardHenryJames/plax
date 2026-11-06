import type { SecretStore } from '@/platform/storage'
import { StorageError } from './errors'

/** Where the account's secrets live: the phone's Keystore, through platform/storage's `secrets`. */
export const ACCOUNT_KEY = 'plax-account-v1'

/** The most the sealed text may hold: the same bound the native app had. */
export const MAX_BYTES = 256 * 1024

/**
 * Keeps the account's secrets. An implementation must never fall back to storing them in the clear: if they cannot be kept safely,
 * nothing is kept and the reader is not signed in.
 */
export interface TokenStore {
  /** The stored text, or null when nothing usable is stored. Throws a StorageError when the store cannot be opened right now. */
  read(): Promise<string | null>
  /** Throws a StorageError when the text cannot be kept safely; the caller then refuses to sign in. */
  write(text: string): Promise<void>
  /** Forgets everything. It never fails: when the store cannot be reached there is nothing more to do. */
  clear(): Promise<void>
}

/** How many bytes a text takes as UTF-8. */
export function utf8Length(text: string): number {
  let bytes = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00) {
      bytes += 4
      index++
    } else bytes += 3
  }
  return bytes
}

/** The account's secrets in a SecretStore (the Android Keystore): one sealed text under one key. */
export function createTokenStore(secrets: SecretStore, key: string = ACCOUNT_KEY): TokenStore {
  const clear = async (): Promise<void> => {
    try {
      await secrets.remove(key)
    } catch {
      // The entry cannot be reached either, so it cannot be read back by anyone else.
    }
  }
  return {
    async read() {
      let text: string | null
      try {
        text = await secrets.get(key)
      } catch {
        throw new StorageError()
      }
      if (text === null) return null
      // Nothing of ours is empty or this large: what is there is damaged, and is dropped rather than kept.
      if (text === '' || utf8Length(text) > MAX_BYTES) {
        await clear()
        return null
      }
      return text
    },
    async write(text) {
      if (utf8Length(text) > MAX_BYTES - 64) throw new StorageError('Account data is too large')
      try {
        await secrets.set(key, text)
      } catch {
        throw new StorageError()
      }
    },
    clear,
  }
}
