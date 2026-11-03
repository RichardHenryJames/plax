// What this browser has learned about whether Google serves the site's ads, kept between visits.
//
// While the AdSense account has not approved the site (or has no ad to give), every ask comes back "unfilled", and each visit would go
// through the same empty moment again: a card of nothing after the fifth story, a labelled blank where the panel's ad is meant to be.
// So an ad unit that has been asked and has never been served rests for a while, in this browser, and is not asked for again until
// the rest is over; then one ask finds out whether anything has changed. A unit that has filled lately is only between ads, as every
// account is now and then, and is never put to rest by one that did not come. And a place that has not been asked yet rests too when
// nothing has been served here and another place has been asked in vain (see `resting`): the account serves nothing, and the strip, which
// asks at load, has already said so.
//
// Pure: the storage is passed in, so that it can be tested without a browser.

export type AdKind = 'page' | 'strip' | 'rail'
export const AD_KINDS: readonly AdKind[] = ['page', 'strip', 'rail']

export interface Verdict {
  /** When the last ask came back with nothing (ms since 1970). */
  unfilledAt?: number
  /** When an ask was last answered with an ad. */
  filledAt?: number
}
export type Verdicts = Partial<Record<AdKind, Verdict>>

/** How long a unit that has never been served is left alone after an ask that came back empty. */
export const REST_MS = 6 * 60 * 60 * 1000
/** How long an ad that was served counts as "being served": its place keeps its room from the start, and one that did not come is no news. */
export const SERVED_MS = 7 * 24 * 60 * 60 * 1000
export const VERDICT_KEY = 'plax-ads-verdict-v1'

export interface VerdictStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const time = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined)

/** What is stored, read leniently: anything that is not a plain time for a known kind is ignored, and storage that throws says nothing. */
export function readVerdicts(store: VerdictStore | null): Verdicts {
  if (!store) return {}
  try {
    const raw = store.getItem(VERDICT_KEY)
    if (!raw) return {}
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return {}
    const found: Verdicts = {}
    for (const kind of AD_KINDS) {
      const entry = (data as Record<string, unknown>)[kind]
      if (!entry || typeof entry !== 'object') continue
      const unfilledAt = time((entry as Record<string, unknown>).unfilledAt)
      const filledAt = time((entry as Record<string, unknown>).filledAt)
      if (unfilledAt !== undefined || filledAt !== undefined) found[kind] = { unfilledAt, filledAt }
    }
    return found
  } catch {
    return {}
  }
}

/** Whether an ad of this kind was served lately, so that the place for it is known to be worth its room. */
export function servedRecently(verdicts: Verdicts, kind: AdKind, now: number): boolean {
  const filledAt = verdicts[kind]?.filledAt
  if (filledAt === undefined) return false
  const age = now - filledAt
  return age >= 0 && age < SERVED_MS
}

/** Whether an ask of this kind came back empty within the rest. */
function askedInVain(verdicts: Verdicts, kind: AdKind, now: number): boolean {
  const unfilledAt = verdicts[kind]?.unfilledAt
  if (unfilledAt === undefined) return false
  const age = now - unfilledAt
  // A time in the future is a clock that was set back: it counts for nothing.
  return age >= 0 && age < REST_MS
}

/**
 * Whether this kind is to be left alone now. It is when an ask of its own came back empty lately and it has not been served for a good
 * while, if ever; and it is when it has not been asked at all but the account serves nothing here: no ad of any kind has come lately and
 * another place has just been asked in vain. The strip asks at load, seconds before a reader is at the fifth story, so a first-time
 * visitor is not taken to an empty card to find out what the strip already knows (an account that has not been approved serves none of
 * its units). One ad of any kind that comes ends that, and every kind is asked on its own merits again.
 */
export function resting(verdicts: Verdicts, kind: AdKind, now: number): boolean {
  if (servedRecently(verdicts, kind, now)) return false
  if (askedInVain(verdicts, kind, now)) return true
  const servesNothing = AD_KINDS.every((other) => !servedRecently(verdicts, other, now))
  return servesNothing && AD_KINDS.some((other) => other !== kind && askedInVain(verdicts, other, now))
}

function save(store: VerdictStore | null, verdicts: Verdicts) {
  if (!store) return
  try {
    store.setItem(VERDICT_KEY, JSON.stringify(verdicts))
  } catch {
    // Storage that is full or switched off: the verdict lives only as long as the page does.
  }
}

/** An ask of this kind came back with nothing. Returns what is known now. */
export function noteUnfilled(store: VerdictStore | null, kind: AdKind, now: number, known: Verdicts = readVerdicts(store)): Verdicts {
  const next: Verdicts = { ...known, [kind]: { ...known[kind], unfilledAt: now } }
  save(store, next)
  return next
}

/** An ask of this kind was answered with an ad: the unit is served, and whatever rest it had is over. */
export function noteFilled(store: VerdictStore | null, kind: AdKind, now: number, known: Verdicts = readVerdicts(store)): Verdicts {
  const next: Verdicts = { ...known, [kind]: { filledAt: now } }
  save(store, next)
  return next
}
