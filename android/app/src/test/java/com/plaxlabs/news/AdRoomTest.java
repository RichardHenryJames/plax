package com.plaxlabs.news;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * When the strip at the foot of the screen keeps its room from the start and when it waits for its ad ({@link AdRoom}): room is kept
 * only where an ad is known to come, so that an AdMob app with no ad to give (not yet approved) shows no empty bar.
 */
public class AdRoomTest {
    private static final long NOW = 1_800_000_000_000L;
    private static final long HOUR = 60L * 60 * 1000;
    private static final long DAY = 24 * HOUR;

    @Test public void aStripThatHasNeverBeenServedAnAdTakesNoRoomUntilOneComes() {
        assertFalse(AdRoom.keepsRoom(0, NOW));
    }

    @Test public void aStripServedAnAdWithinTheLastWeekKeepsItsRoomFromTheStart() {
        assertTrue(AdRoom.keepsRoom(NOW, NOW));
        assertTrue(AdRoom.keepsRoom(NOW - HOUR, NOW));
        assertTrue(AdRoom.keepsRoom(NOW - 6 * DAY, NOW));
        assertTrue(AdRoom.keepsRoom(NOW - AdRoom.SERVED_MS + 1, NOW));
    }

    @Test public void aStripNotServedForAWeekOrMoreWaitsForItsAdAgain() {
        assertFalse(AdRoom.keepsRoom(NOW - AdRoom.SERVED_MS, NOW));
        assertFalse(AdRoom.keepsRoom(NOW - 30 * DAY, NOW));
    }

    @Test public void aClockThatWasSetBackKeepsNothing() {
        assertFalse(AdRoom.keepsRoom(NOW + HOUR, NOW));
        assertFalse(AdRoom.keepsRoom(-5, NOW));
    }

    @Test public void aWeekIsAWeek() {
        assertEquals(7 * DAY, AdRoom.SERVED_MS);
    }
}
