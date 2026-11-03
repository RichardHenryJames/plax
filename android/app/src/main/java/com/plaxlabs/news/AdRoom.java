package com.plaxlabs.news;

/**
 * When the ad strip at the foot of the screen keeps its room from the start, and when it waits for its ad.
 *
 * <p>Keeping the room from the start spares the story a jump when the ad arrives, and costs an empty bar for as long as the ad takes. That
 * is worth it only where an ad is known to come: in a strip that was served an ad within the last week. Where none has been (a first
 * run, or an AdMob app that has not been approved and serves nothing), the strip takes no room and shows nothing until an ad has come,
 * so that an ask answered with no ad leaves no empty bar and no story that shrinks and grows back.
 */
final class AdRoom {
    /** How long after an ad last arrived in the strip it keeps its room from the start. */
    static final long SERVED_MS = 7L * 24 * 60 * 60 * 1000;

    private AdRoom() { }

    /** Whether the strip keeps its room from the start: an ad arrived in it within a week of {@code now}. {@code servedAt} is 0 if none ever did. */
    static boolean keepsRoom(long servedAt, long now) {
        // A time in the future is a clock that was set back: it keeps nothing.
        return servedAt > 0 && now >= servedAt && now - servedAt < SERVED_MS;
    }
}
