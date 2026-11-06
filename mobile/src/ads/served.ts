import { readJson, storage, writeJson, type KeyValueStore } from '../platform/storage'

/** The height of a standard banner, in dp: what the strip keeps for an ad whose height has not been seen on this phone. */
export const DEFAULT_BANNER_DP = 50
const LEAST_BANNER_DP = 30
const MOST_BANNER_DP = 200

/** Whether this is a height an anchored adaptive banner can have (a number the library or a stored file made up is not kept). */
export const isPlausibleHeight = (height: number): boolean => Number.isFinite(height) && height >= LEAST_BANNER_DP && height <= MOST_BANNER_DP

/**
 * What the phone remembers of the strip: when an ad last arrived in it (nothing about the reader), and how tall that ad was, so that a
 * strip that keeps its room from the start (see ad-room.ts) keeps exactly the room the ad will take. Android's preferences gave the
 * native app the time (Prefs.bannerServedAt) and a banner view that knew its height at once; here the height of an adaptive banner is
 * only told by the library when it is on the screen.
 */
export interface BannerServed {
  /** Milliseconds since 1970 when an ad last arrived in the strip, or 0 if none ever did. */
  readonly at: number
  readonly heightDp: number
}

export const NEVER_SERVED: BannerServed = Object.freeze({ at: 0, heightDp: DEFAULT_BANNER_DP })

export const BANNER_SERVED_KEY = 'plax.ads.bannerServed'

/** Whatever was stored, made a valid record: a time that is not a positive number is none, a height that is not plausible is the standard one. */
export function parseServed(value: unknown): BannerServed {
  if (typeof value !== 'object' || value === null) return NEVER_SERVED
  const { at, heightDp } = value as { at?: unknown; heightDp?: unknown }
  return {
    at: typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.floor(at) : 0,
    heightDp: typeof heightDp === 'number' && isPlausibleHeight(heightDp) ? Math.round(heightDp) : DEFAULT_BANNER_DP,
  }
}

/** Where the record is kept. A test passes its own. */
export interface ServedMemory {
  /** The record; never rejects (what cannot be read is a strip never served). */
  read(): Promise<BannerServed>
  /** Keeps the record. May reject; the strip then simply has nothing to keep next time. */
  write(record: BannerServed): Promise<void>
}

export function storedServedMemory(store: KeyValueStore = storage): ServedMemory {
  return {
    read: async () => parseServed(await readJson<unknown>(BANNER_SERVED_KEY, store)),
    write: (record) => writeJson(BANNER_SERVED_KEY, record, store),
  }
}
