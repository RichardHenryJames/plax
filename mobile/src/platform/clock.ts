/** The time, as a function, so that a test can set it. Milliseconds since 1970, like Date.now(). */
export type Clock = () => number

export const systemClock: Clock = () => Date.now()

/** A clock a test moves by hand. */
export function fakeClock(start = 1_800_000_000_000): Clock & { advance(ms: number): void; set(ms: number): void } {
  let now = start
  const clock = (() => now) as Clock & { advance(ms: number): void; set(ms: number): void }
  clock.advance = (ms: number) => {
    now += ms
  }
  clock.set = (ms: number) => {
    now = ms
  }
  return clock
}
