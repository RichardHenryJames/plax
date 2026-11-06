import AsyncStorage from '@react-native-async-storage/async-storage'
import { secrets as phoneSecrets } from '@/platform/storage'
import { StorageError } from '../errors'
import { ACCOUNT_KEY, createTokenStore, MAX_BYTES, utf8Length } from '../token-store'
import { memorySecrets } from './helpers'

describe('utf8Length', () => {
  it('counts the bytes of the text as UTF-8', () => {
    expect(utf8Length('')).toBe(0)
    expect(utf8Length('a')).toBe(1)
    expect(utf8Length('\u00e9')).toBe(2)
    expect(utf8Length('\u20ac')).toBe(3)
    expect(utf8Length('\u{1F600}')).toBe(4)
    expect(utf8Length('a\u00e9\u20ac\u{1F600}')).toBe(10)
    // A surrogate that has no partner is written as U+FFFD, three bytes.
    expect(utf8Length('\ud83d')).toBe(3)
    expect(utf8Length('\ude00a')).toBe(4)
    for (const text of ['hello', 'h\u00e9llo w\u00f6rld', '\u0928\u092e\u0938\u094d\u0924\u0947', '\u{1F600}\u{1F4F0}']) expect(utf8Length(text)).toBe(Buffer.byteLength(text, 'utf8'))
  })
})

describe('the sealed store', () => {
  it('keeps the text in the secure store under its own key, and reads it back', async () => {
    const secrets = memorySecrets()
    const store = createTokenStore(secrets)
    expect(await store.read()).toBeNull()
    await store.write('{"schema":1}')
    expect([...secrets.values.keys()]).toEqual([ACCOUNT_KEY])
    expect(await store.read()).toBe('{"schema":1}')
    await store.write('{"schema":1,"x":2}')
    expect(await store.read()).toBe('{"schema":1,"x":2}')
  })

  it('forgets everything on clear, and clearing nothing is fine', async () => {
    const secrets = memorySecrets()
    const store = createTokenStore(secrets)
    await store.clear()
    await store.write('text')
    await store.clear()
    expect(secrets.values.size).toBe(0)
    expect(await store.read()).toBeNull()
  })

  it('uses the phone\u2019s Keystore store by default, and never the plain one', async () => {
    const store = createTokenStore(phoneSecrets)
    await store.write('{"secret":"access-token"}')
    expect(await phoneSecrets.get(ACCOUNT_KEY)).toBe('{"secret":"access-token"}')
    expect(await AsyncStorage.getAllKeys()).toEqual([])
    await store.clear()
    expect(await phoneSecrets.get(ACCOUNT_KEY)).toBeNull()
  })

  it('refuses to open when the secure store cannot be read right now, and leaves what is there alone', async () => {
    const secrets = memorySecrets()
    const store = createTokenStore(secrets)
    await store.write('kept')
    secrets.failReads = true
    await expect(store.read()).rejects.toBeInstanceOf(StorageError)
    expect(secrets.removes).toBe(0)
    secrets.failReads = false
    expect(await store.read()).toBe('kept')
  })

  it('refuses to write when the secure store cannot keep the text, and says so without the reason', async () => {
    const secrets = memorySecrets()
    const store = createTokenStore(secrets)
    secrets.failWrites = true
    const failure = await store.write('access-token-secret').catch((error: Error) => error)
    expect(failure).toBeInstanceOf(StorageError)
    expect((failure as Error).message).toBe('Secure storage unavailable')
    expect((failure as Error).message).not.toMatch(/keystore|access-token/)
    expect(secrets.values.size).toBe(0)
  })

  it('never falls back to another place when the secure store fails', async () => {
    const secrets = memorySecrets()
    secrets.failWrites = true
    const store = createTokenStore(secrets)
    await expect(store.write('access-token-secret')).rejects.toBeInstanceOf(StorageError)
    expect(await AsyncStorage.getAllKeys()).toEqual([])
    expect(await phoneSecrets.get(ACCOUNT_KEY)).toBeNull()
  })

  it('does not fail when it cannot clear: there is nothing more to do', async () => {
    const secrets = memorySecrets()
    secrets.failRemoves = true
    await expect(createTokenStore(secrets).clear()).resolves.toBeUndefined()
  })

  it('drops what is empty or larger than any text of its own, instead of keeping it', async () => {
    const secrets = memorySecrets()
    const store = createTokenStore(secrets)
    secrets.values.set(ACCOUNT_KEY, '')
    expect(await store.read()).toBeNull()
    expect(secrets.values.has(ACCOUNT_KEY)).toBe(false)
    secrets.values.set(ACCOUNT_KEY, 'x'.repeat(MAX_BYTES + 1))
    expect(await store.read()).toBeNull()
    expect(secrets.values.has(ACCOUNT_KEY)).toBe(false)
  })

  it('takes text up to the limit less a margin, counted in bytes, and refuses more', async () => {
    const secrets = memorySecrets()
    const store = createTokenStore(secrets)
    const most = MAX_BYTES - 64
    await store.write('x'.repeat(most))
    expect((await store.read())?.length).toBe(most)
    await expect(store.write('x'.repeat(most + 1))).rejects.toThrow('Account data is too large')
    // Two bytes a character: half as many characters fill it.
    await store.write('\u00e9'.repeat(most / 2))
    await expect(store.write('\u00e9'.repeat(most / 2 + 1))).rejects.toBeInstanceOf(StorageError)
    expect((await store.read())?.length).toBe(most / 2)
  })

  it('keeps the account under a key of its own, so another may be used in a test', async () => {
    const secrets = memorySecrets()
    await createTokenStore(secrets, 'other-key').write('x')
    expect([...secrets.values.keys()]).toEqual(['other-key'])
  })
})
