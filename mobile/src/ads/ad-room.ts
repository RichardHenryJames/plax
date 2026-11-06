/**
 * When the ad strip at the foot of the screen keeps its room from the start, and when it waits for its ad.
 *
 * Keeping the room from the start spares the story a jump when the ad arrives, and costs an empty bar for as long as the ad takes. That
 * is worth it only where an ad is known to come: in a strip that was served an ad within the last week. Where none has been (a first
 * run, or an AdMob app that has not been approved and serves nothing), the strip takes no room and shows nothing until an ad has come,
 * so that an ask answered with no ad leaves no empty bar and no story that shrinks and grows back. A port of AdRoom.java.
 */

/** How long after an ad last arrived in the strip it keeps its room from the start: a week. */
export const SERVED_MS = 7 * 24 * 60 * 60 * 1000

/** Whether the strip keeps its room from the start: an ad arrived in it within a week of `now`. `servedAt` is 0 if none ever did. */
export function keepsRoom(servedAt: number, now: number): boolean {
  // A time in the future is a clock that was set back: it keeps nothing.
  return servedAt > 0 && now >= servedAt && now - servedAt < SERVED_MS
}
