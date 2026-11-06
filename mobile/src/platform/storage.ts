import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

/** The phone's plain key-value store: stories, settings, what has been seen. Public content only, never a credential. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export const storage: KeyValueStore = AsyncStorage

/** Reads a JSON value; anything missing, unreadable or of another shape is `null`, never an exception. */
export async function readJson<T>(key: string, store: KeyValueStore = storage): Promise<T | null> {
  try {
    const text = await store.getItem(key)
    return text === null ? null : (JSON.parse(text) as T)
  } catch {
    return null
  }
}

export async function writeJson(key: string, value: unknown, store: KeyValueStore = storage): Promise<void> {
  await store.setItem(key, JSON.stringify(value))
}

/**
 * Where credentials live: Android's Keystore through expo-secure-store. A value that cannot be stored or read is an error the caller
 * must handle (fail closed), never silently kept somewhere less safe.
 */
export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export const secrets: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
}
