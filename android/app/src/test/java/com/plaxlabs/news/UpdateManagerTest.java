package com.plaxlabs.news;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

/** When the app looks for an update, when it offers one, and what it says, with the clock and threads under control. */
public class UpdateManagerTest {
    private static final long NOW = 1_800_000_000_000L, HOUR = 3_600_000L, DAY = AppUpdates.CHECK_INTERVAL;
    private static final int INSTALLED = 4, ANDROID = 36;
    private static final AppUpdates.Release RELEASE = new AppUpdates.Release(5, "1.4.0", AppUpdates.ORIGIN + "/plax-1.4.0.apk");
    private static final AppUpdates.Release NEWER = new AppUpdates.Release(6, "1.5.0", AppUpdates.ORIGIN + "/plax-1.5.0.apk");

    private interface Answer { AppUpdates.Release get() throws IOException; }

    private static final class Memory implements UpdateManager.Memory {
        long lastCheck, dismissedVersion, dismissedAt;
        @Override public long lastCheck() { return lastCheck; }
        @Override public long dismissedVersion() { return dismissedVersion; }
        @Override public long dismissedAt() { return dismissedAt; }
        @Override public void checked(long at) { lastCheck = at; }
        @Override public void dismissed(long version, long at) { dismissedVersion = version; dismissedAt = at; }
    }

    private static final class Screen implements UpdateManager.Host {
        boolean idle = true;
        final List<AppUpdates.Release> offers = new ArrayList<>();
        final List<Integer> said = new ArrayList<>();
        int stores;
        @Override public boolean idle() { return idle; }
        @Override public void offer(AppUpdates.Release release) { offers.add(release); }
        @Override public void say(int message) { said.add(message); }
        @Override public void store() { stores++; }
    }

    private final Memory memory = new Memory();
    private final ArrayDeque<Runnable> worker = new ArrayDeque<>(), main = new ArrayDeque<>();
    private final List<long[]> requests = new ArrayList<>();
    private Answer answer = () -> null;
    private long clock = NOW;

    private UpdateManager manager(boolean store) {
        return new UpdateManager(memory, (version, android) -> { requests.add(new long[]{version, android}); return answer.get(); },
                worker::add, main::add, () -> clock, INSTALLED, ANDROID, store);
    }

    private UpdateManager manager() { return manager(false); }

    /** Runs the request on the worker, then what it reports to the screen. */
    private void settle() {
        while (!worker.isEmpty()) worker.poll().run();
        while (!main.isEmpty()) main.poll().run();
    }

    @Test public void aFirstLaunchLooksForAnUpdateAndOffersIt() {
        answer = () -> RELEASE;
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        assertEquals("the request waits for the worker, never the screen", 0, requests.size());
        assertTrue(screen.offers.isEmpty());
        settle();
        assertEquals(List.of(RELEASE), screen.offers);
        assertArrayEquals("it asks about the installed version and this Android release", new long[]{INSTALLED, ANDROID}, requests.get(0));
        assertEquals(NOW, memory.lastCheck);
        assertTrue(screen.said.isEmpty());
    }

    @Test public void withinADayTheWebsiteIsNotAskedAgain() {
        memory.lastCheck = NOW - HOUR;
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        settle();
        assertEquals(0, requests.size());
        assertTrue(worker.isEmpty());
        assertTrue(screen.offers.isEmpty());
        assertTrue(screen.said.isEmpty());
        assertEquals("the time of the last check is left alone", NOW - HOUR, memory.lastCheck);
    }

    @Test public void aCheckIsCountedWhenItStartsSoAFailureIsNotRetriedBeforeTheDayIsUp() {
        answer = () -> { throw new IOException("offline"); };
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        assertEquals("counted before the answer", NOW, memory.lastCheck);
        settle();
        assertEquals(1, requests.size());
        assertTrue("an automatic check says nothing when it fails", screen.said.isEmpty());
        assertTrue(screen.offers.isEmpty());
        clock = NOW + HOUR;
        updates.attach(new Screen()); settle();
        assertEquals("not again within the day", 1, requests.size());
        clock = NOW + DAY;
        updates.attach(new Screen()); settle();
        assertEquals("once the day is up", 2, requests.size());
    }

    @Test public void aClockThatWentBackwardsDoesNotSilenceChecks() {
        memory.lastCheck = NOW + 5 * HOUR;
        UpdateManager updates = manager();
        updates.attach(new Screen()); settle();
        assertEquals(1, requests.size());
        assertEquals(NOW, memory.lastCheck);
    }

    @Test public void aKnownReleaseIsOfferedAgainWhenTheScreenIsRecreated() {
        answer = () -> RELEASE;
        UpdateManager updates = manager(); Screen first = new Screen();
        updates.attach(first); settle();
        assertEquals(List.of(RELEASE), first.offers);
        updates.detach(first);
        Screen second = new Screen();
        updates.attach(second); settle();
        assertEquals("the new screen has the offer too, with no new request", List.of(RELEASE), second.offers);
        assertEquals(1, requests.size());
    }

    @Test public void laterOrDownloadSilencesTheOfferForADayButANewerReleaseComesAtOnce() {
        answer = () -> RELEASE;
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen); settle();
        updates.dismiss(screen.offers.get(0));
        assertEquals(RELEASE.versionCode(), memory.dismissedVersion);
        assertEquals(NOW, memory.dismissedAt);
        updates.attach(screen); settle();
        assertEquals("nothing known any more, and the day is not up", 1, screen.offers.size());

        // The next check, an hour later, finds the same release.
        memory.lastCheck = 0; clock = NOW + HOUR;
        updates.attach(screen); settle();
        assertEquals("the same release is not offered within a day of putting it off", 1, screen.offers.size());

        memory.lastCheck = 0; answer = () -> NEWER;
        updates.attach(screen); settle();
        assertEquals("a newer release is offered at once", List.of(RELEASE, NEWER), screen.offers);

        updates.dismiss(NEWER);
        memory.lastCheck = 0; clock = NOW + DAY + HOUR; answer = () -> NEWER;
        updates.attach(screen); settle();
        assertEquals("after a day the same one is offered again", List.of(RELEASE, NEWER, NEWER), screen.offers);
    }

    @Test public void askingFromTheMenuAlwaysEndsInSomethingVisible() {
        UpdateManager updates = manager(); Screen screen = new Screen();
        memory.lastCheck = NOW - HOUR;
        updates.attach(screen);

        updates.check(true); settle();
        assertEquals("it ignores the daily limit", 1, requests.size());
        assertEquals("nothing newer: it says so", List.of(R.string.update_current), screen.said);
        assertTrue(screen.offers.isEmpty());
        assertEquals(NOW, memory.lastCheck);

        answer = () -> { throw new IOException("down"); };
        updates.check(true); settle();
        assertEquals(List.of(R.string.update_current, R.string.update_failed), screen.said);

        answer = () -> RELEASE;
        updates.check(true); settle();
        assertEquals(List.of(RELEASE), screen.offers);
        assertEquals(2, screen.said.size());
    }

    @Test public void askingFromTheMenuOffersAReleaseThatWasPutOffButAnAutomaticCheckDoesNot() {
        memory.dismissedVersion = RELEASE.versionCode(); memory.dismissedAt = NOW - HOUR;
        answer = () -> RELEASE;
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        settle();
        assertEquals("the check ran and found it", 1, requests.size());
        assertTrue("but the reader put it off an hour ago", screen.offers.isEmpty());
        assertTrue(screen.said.isEmpty());
        updates.check(true); settle();
        assertEquals("the reader asked, so they are told", List.of(RELEASE), screen.offers);
    }

    @Test public void askingWhileACheckIsRunningMakesThatCheckReportBack() {
        answer = () -> null;
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        updates.check(true);
        assertEquals("only one request is made", 1, worker.size());
        settle();
        assertEquals(1, requests.size());
        assertEquals("the tap is answered, not ignored", List.of(R.string.update_current), screen.said);

        answer = () -> { throw new IOException("down"); };
        clock = NOW + DAY; Screen later = new Screen();
        updates.attach(later);
        updates.check(true);
        settle();
        assertEquals(List.of(R.string.update_failed), later.said);
    }

    @Test public void anAutomaticCheckIsSilentWhenNothingIsFoundOrTheNetworkFails() {
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen); settle();
        assertTrue(screen.said.isEmpty());
        assertTrue(screen.offers.isEmpty());
        memory.lastCheck = 0;
        answer = () -> { throw new IOException("offline"); };
        updates.attach(screen); settle();
        assertTrue(screen.said.isEmpty());
        assertEquals(2, requests.size());
    }

    @Test public void aRuntimeFailureInTheRequestIsAFailureNotACrash() {
        answer = () -> { throw new IllegalStateException("unexpected"); };
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        updates.check(true); settle();
        assertEquals(List.of(R.string.update_failed), screen.said);
        assertTrue("and later checks still work", main.isEmpty() && worker.isEmpty());
        answer = () -> RELEASE;
        updates.check(true); settle();
        assertEquals(List.of(RELEASE), screen.offers);
    }

    @Test public void nothingIsOfferedOverAnOpenSheetButItComesBackWhenTheAppIsNextInFront() {
        answer = () -> RELEASE;
        UpdateManager updates = manager(); Screen screen = new Screen();
        screen.idle = false;
        updates.attach(screen); settle();
        assertTrue("a sheet is open", screen.offers.isEmpty());
        updates.check(true); settle();
        assertTrue("even when asked, it does not cover an open sheet", screen.offers.isEmpty());
        screen.idle = true;
        updates.detach(screen);
        updates.attach(screen);
        assertEquals("the next time it is in front", List.of(RELEASE), screen.offers);
        assertEquals(2, requests.size());
    }

    @Test public void aCheckThatFinishesAfterTheScreenLeftSaysNothingButIsRemembered() {
        answer = () -> RELEASE;
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        updates.check(true);
        updates.detach(screen);
        settle();
        assertTrue(screen.offers.isEmpty());
        assertTrue("not even the answer to a tap on a screen that is gone", screen.said.isEmpty());
        Screen next = new Screen();
        updates.attach(next);
        assertEquals("the release was kept for the next screen", List.of(RELEASE), next.offers);
        assertEquals(1, requests.size());
    }

    @Test public void aSecondCheckIsNotStartedWhileOneIsRunning() {
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen);
        updates.attach(screen);
        updates.check(false);
        assertEquals(1, worker.size());
        settle();
        assertEquals(1, requests.size());
    }

    @Test public void aDetachedManagerDoesNothing() {
        UpdateManager updates = manager();
        updates.check(false); updates.check(true);
        assertTrue(worker.isEmpty());
        Screen gone = new Screen(), current = new Screen();
        updates.attach(gone); updates.attach(current);
        updates.detach(gone);
        settle();
        assertEquals("detaching a screen that is no longer the current one changes nothing", 1, requests.size());
        updates.check(true); settle();
        assertEquals("the current screen still hears the answer", List.of(R.string.update_current), current.said);
        assertTrue(gone.said.isEmpty());
    }

    @Test public void dismissingOneReleaseDoesNotForgetADifferentOne() {
        answer = () -> NEWER;
        UpdateManager updates = manager(); Screen screen = new Screen();
        updates.attach(screen); settle();
        assertEquals(List.of(NEWER), screen.offers);
        updates.dismiss(RELEASE);
        assertEquals(RELEASE.versionCode(), memory.dismissedVersion);
        updates.detach(screen);
        Screen next = new Screen();
        updates.attach(next);
        assertEquals("the newer release is still known and was not the one put off", List.of(NEWER), next.offers);
    }

    @Test public void storeBuildsNeverLookForUpdatesAndTheMenuOpensTheListing() {
        answer = () -> RELEASE;
        UpdateManager updates = manager(true); Screen screen = new Screen();
        assertTrue(updates.storeBuild());
        updates.attach(screen); settle();
        assertTrue("Google Play does the updating", worker.isEmpty());
        assertEquals(0, requests.size());
        assertEquals("not even the time is recorded", 0, memory.lastCheck);
        assertTrue(screen.offers.isEmpty());
        assertEquals(0, screen.stores);
        updates.check(true); settle();
        assertEquals("asking opens the listing", 1, screen.stores);
        assertEquals(0, requests.size());
        assertTrue(screen.said.isEmpty());
        updates.check(false);
        assertEquals(1, screen.stores);
        updates.detach(screen);
        updates.check(true);
        assertEquals("with no screen there is nowhere to open it", 1, screen.stores);
    }

    @Test public void theWebsiteBuildsAreNotStoreBuilds() {
        assertFalse(manager().storeBuild());
    }
}
