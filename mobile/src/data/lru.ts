/**
 * A map that holds at most `max` entries and lets go of the one used least recently when it is full. Reading an entry counts as using
 * it (a LinkedHashMap in access order, as the native app used for its sessions, insights and share links).
 */
export class Lru<K, V> {
  private readonly entries = new Map<K, V>()

  constructor(private readonly max: number) {}

  get size(): number {
    return this.entries.size
  }

  has(key: K): boolean {
    return this.entries.has(key)
  }

  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key) as V
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  /** The entry for the key, made (and kept) by `create` when there is none. */
  getOrCreate(key: K, create: () => V): V {
    const known = this.get(key)
    if (known !== undefined) return known
    const made = create()
    this.set(key, made)
    return made
  }

  delete(key: K): boolean {
    return this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  /** The keys, the one used longest ago first. */
  keys(): K[] {
    return [...this.entries.keys()]
  }
}
