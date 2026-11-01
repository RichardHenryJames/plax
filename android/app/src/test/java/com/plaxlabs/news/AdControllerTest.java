package com.plaxlabs.news;

import android.content.Context;
import android.view.View;
import androidx.appcompat.app.AppCompatActivity;
import java.util.ArrayList;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * When a full-page ad is asked for, joins the pager and is let go. The network is a fake that answers when the test says so, and the
 * clock is the test's: nothing here touches Google.
 */
public class AdControllerTest {
    private static final int LIST = 40;

    private static final class Request implements Cancelable {
        final AdNetwork.Page.Listener listener;
        boolean cancelled;

        Request(AdNetwork.Page.Listener listener) { this.listener = listener; }

        @Override public void cancel() { cancelled = true; }
    }

    private static final class FakePage implements AdNetwork.Page {
        boolean destroyed;

        @Override public View view(Context context, Ui ui) { throw new UnsupportedOperationException("no views in a unit test"); }

        @Override public void destroy() { destroyed = true; }
    }

    private static final class Network implements AdNetwork {
        final List<Request> requests = new ArrayList<>();
        boolean pages = true;
        /** When set, a request is answered before loadPage returns. */
        Boolean answerAtOnce;
        final List<FakePage> made = new ArrayList<>();

        @Override public boolean banner() { return false; }
        @Override public boolean page() { return pages; }
        @Override public void start(AppCompatActivity activity, Runnable ready) { }
        @Override public boolean privacyOptions(Context context) { return false; }
        @Override public void showPrivacyOptions(AppCompatActivity activity, Runnable done) { }
        @Override public Banner loadBanner(Context context, int widthDp, Banner.Listener listener) { return null; }

        @Override public Cancelable loadPage(Context context, AdNetwork.Page.Listener listener) {
            Request request = new Request(listener);
            requests.add(request);
            if (answerAtOnce != null) {
                if (answerAtOnce) { FakePage page = new FakePage(); made.add(page); listener.loaded(page); }
                else listener.failed();
            }
            return request;
        }

        Request last() { return requests.get(requests.size() - 1); }

        FakePage arrive(Request request) {
            FakePage page = new FakePage();
            made.add(page);
            request.listener.loaded(page);
            return page;
        }
    }

    private Network network;
    private long now;
    private int changes;
    private AdController ads;

    @Before public void setUp() {
        network = new Network();
        now = 1_000_000L;
        changes = 0;
        ads = new AdController(network, null, () -> now, 5);
        ads.listen(() -> changes++);
        ads.ready();
    }

    @Test public void nothingIsAskedForBeforeTheReaderHasAllowedIt() {
        AdController early = new AdController(network, null, () -> now, 5);
        early.reader(2, LIST, -1);
        assertEquals(0, network.requests.size());
        early.ready();
        assertEquals("asked as soon as it may", 1, network.requests.size());
    }

    @Test public void aSlotIsAskedForWhenTheReaderIsThreeStoriesBeforeItAndNotSooner() {
        ads.reader(0, LIST, -1);
        ads.reader(1, LIST, -1);
        assertEquals(0, network.requests.size());
        ads.reader(2, LIST, -1);
        assertEquals(1, network.requests.size());
    }

    @Test public void aSlotTheReaderHasReachedOrPassedIsNotAskedForButTheNextOneIs() {
        ads.reader(5, LIST, -1);
        assertEquals("slot 5 is behind the reader and slot 10 is five stories away", 0, network.requests.size());
        ads.reader(7, LIST, -1);
        assertEquals(1, network.requests.size());
    }

    @Test public void aSlotJustAheadOfTheReaderIsStillAskedFor() {
        ads.reader(4, LIST, -1);
        assertEquals(1, network.requests.size());
    }

    @Test public void aSlotIsAskedForOnceHoweverOftenTheReaderMovesWithinItsReach() {
        ads.reader(2, LIST, -1);
        ads.reader(3, LIST, -1);
        ads.reader(4, LIST, -1);
        assertEquals(1, network.requests.size());
    }

    @Test public void noSlotIsAskedForWhereNoStoryFollowsIt() {
        ads.reader(2, 5, -1);
        assertEquals("five stories have no slot", 0, network.requests.size());
    }

    @Test public void anAdThatArrivesJoinsThePagerAndIsReportedOnce() {
        ads.reader(2, LIST, -1);
        FakePage page = network.arrive(network.last());
        assertArrayEquals(new int[]{5}, ads.shown());
        assertSame(page, ads.page(1));
        assertEquals(1, changes);
        assertNull("there is no ad in slot 2", ads.page(2));
    }

    @Test public void anAdThatArrivesAfterItsSlotWasPassedIsLetGoAndNeverShown() {
        ads.reader(2, LIST, -1);
        Request request = network.last();
        ads.reader(5, LIST, -1);
        assertTrue("the request was given up on", request.cancelled);
        FakePage page = network.arrive(request);
        assertTrue(page.destroyed);
        assertEquals(0, ads.shown().length);
        assertEquals(0, changes);
    }

    @Test public void anAdIsKeptWhileTheReaderIsWithinAStoryOfItAfterSeeingItAndLetGoBeyondThat() {
        ads.reader(2, LIST, -1);
        FakePage page = network.arrive(network.last());
        ads.reader(4, LIST, -1);
        ads.reader(4, LIST, 5);
        assertArrayEquals("on the ad", new int[]{5}, ads.shown());
        ads.reader(5, LIST, -1);
        assertArrayEquals("on the story after it", new int[]{5}, ads.shown());
        assertFalse(page.destroyed);
        int before = changes;
        ads.reader(6, LIST, -1);
        assertEquals("a story further on", 0, ads.shown().length);
        assertTrue(page.destroyed);
        assertEquals("the pager is told its ad page is gone", before + 1, changes);
    }

    @Test public void aSeenAdIsLetGoWhenTheReaderGoesBackTwoStories() {
        ads.reader(2, LIST, -1);
        FakePage page = network.arrive(network.last());
        ads.reader(4, LIST, 5);
        ads.reader(3, LIST, -1);
        assertEquals("one story back, the ad is two pages ahead", 0, ads.shown().length);
        assertTrue(page.destroyed);
    }

    @Test public void goingBackOverTheAdAsksForAFreshOneForTheNextPass() {
        ads.reader(2, LIST, -1);
        FakePage first = network.arrive(network.last());
        ads.reader(4, LIST, 5);
        ads.reader(5, LIST, -1);
        ads.reader(6, LIST, -1);
        assertTrue(first.destroyed);
        int asked = network.requests.size();
        ads.reader(3, LIST, -1);
        assertEquals("slot 5 is asked for again", asked + 1, network.requests.size());
        FakePage second = network.arrive(network.last());
        assertNotSame(first, second);
        assertArrayEquals(new int[]{5}, ads.shown());
    }

    @Test public void anAdTheReaderHasNotSeenStaysWhileItIsStillAhead() {
        ads.reader(2, LIST, -1);
        FakePage page = network.arrive(network.last());
        ads.reader(0, LIST, -1);
        assertArrayEquals(new int[]{5}, ads.shown());
        assertFalse(page.destroyed);
    }

    @Test public void anAdTheReaderJumpedPastWithoutSeeingIsLetGo() {
        ads.reader(2, LIST, -1);
        FakePage page = network.arrive(network.last());
        int before = changes;
        ads.reader(8, LIST, -1);
        assertTrue(page.destroyed);
        assertEquals(0, ads.shown().length);
        assertEquals(before + 1, changes);
    }

    @Test public void anAdHeldTooLongWithoutBeingSeenIsLetGoAndAskedForAgain() {
        ads.reader(2, LIST, -1);
        FakePage old = network.arrive(network.last());
        now += AdController.STALE_MS + 1;
        int asked = network.requests.size();
        ads.reader(3, LIST, -1);
        assertTrue(old.destroyed);
        assertEquals(0, ads.shown().length);
        assertEquals("and a fresh one is on its way", asked + 1, network.requests.size());
    }

    @Test public void aSeenAdIsNeverTreatedAsStale() {
        ads.reader(2, LIST, -1);
        FakePage page = network.arrive(network.last());
        ads.reader(4, LIST, 5);
        now += AdController.STALE_MS * 3;
        ads.reader(5, LIST, -1);
        assertFalse(page.destroyed);
    }

    @Test public void twoMissesInARowStopTheAskingForAWhileAndThenItStartsAgain() {
        ads.reader(2, LIST, -1);
        network.last().listener.failed();
        ads.reader(7, LIST, -1);
        assertEquals(2, network.requests.size());
        network.last().listener.failed();
        ads.reader(12, LIST, -1);
        assertEquals("paused: no third request", 2, network.requests.size());
        now += AdController.PAUSE_MS - 1;
        ads.reader(12, LIST, -1);
        assertEquals(2, network.requests.size());
        now += 2;
        ads.reader(12, LIST, -1);
        assertEquals("the pause is over", 3, network.requests.size());
    }

    @Test public void anAdThatArrivesClearsTheCountOfMisses() {
        ads.reader(2, LIST, -1);
        network.last().listener.failed();
        ads.reader(7, LIST, -1);
        network.arrive(network.last());
        ads.reader(12, LIST, -1);
        network.last().listener.failed();
        ads.reader(17, LIST, -1);
        assertEquals("one miss since the last ad is not a streak", 4, network.requests.size());
    }

    @Test public void aMissedSlotIsNotAskedForAgainWhileTheReaderStaysNearItButIsOnTheNextPass() {
        ads.reader(2, LIST, -1);
        network.last().listener.failed();
        ads.reader(3, LIST, -1);
        ads.reader(4, LIST, -1);
        assertEquals(1, network.requests.size());
        ads.reader(7, LIST, -1);
        int asked = network.requests.size();
        ads.reader(2, LIST, -1);
        assertEquals("slot 5 is asked for again on the way back", asked + 1, network.requests.size());
    }

    @Test public void adsAreOnlyShownWhereAStoryFollowsThem() {
        ads.reader(2, LIST, -1);
        network.arrive(network.last());
        assertArrayEquals(new int[]{5}, ads.shown());
        ads.reader(2, 5, -1);
        assertEquals("the list shrank to five stories", 0, ads.shown().length);
        ads.reader(2, LIST, -1);
        assertArrayEquals("and grew again", new int[]{5}, ads.shown());
    }

    @Test public void aBuildWithoutFullPageAdsNeverAsks() {
        network.pages = false;
        assertFalse(ads.enabled());
        ads.reader(2, LIST, -1);
        assertEquals(0, network.requests.size());
        assertEquals(0, ads.shown().length);
    }

    @Test public void aNetworkThatAnswersAtOnceLeavesNothingHanging() {
        network.answerAtOnce = false;
        ads.reader(2, LIST, -1);
        assertEquals(1, network.requests.size());
        assertEquals(0, ads.shown().length);
        network.answerAtOnce = true;
        ads.reader(7, LIST, -1);
        assertArrayEquals(new int[]{10}, ads.shown());
        assertEquals(1, changes);
    }

    @Test public void destroyingLetsEverythingGoAndIgnoresWhatArrivesLater() {
        ads.reader(2, LIST, -1);
        FakePage held = network.arrive(network.last());
        ads.reader(7, LIST, -1);
        Request waiting = network.last();
        // The ad of slot 5 is behind the reader by now, so only the one being waited for is left to cancel.
        int before = changes;
        ads.destroy();
        assertTrue(waiting.cancelled);
        FakePage late = network.arrive(waiting);
        assertTrue(late.destroyed);
        assertEquals(0, ads.shown().length);
        assertEquals(before, changes);
        assertTrue(held.destroyed);
    }

    @Test public void readingThroughALongFeedShowsEachAdOnceAndKeepsAtMostTwoAlive() {
        network.answerAtOnce = true;
        List<Integer> shownOnce = new ArrayList<>();
        for (int item = 0; item < LIST - 1; item++) {
            ads.reader(item, LIST, -1);
            // Swiping down one more page lands on the ad of the slot right after this story, if there is one.
            int next = item + 1;
            for (int slot : ads.shown()) if (slot == next) {
                ads.reader(item, LIST, slot);
                shownOnce.add(slot);
            }
            long alive = network.made.stream().filter(page -> !page.destroyed).count();
            assertTrue("alive at item " + item + ": " + alive, alive <= 2);
        }
        assertEquals(List.of(5, 10, 15, 20, 25, 30, 35), shownOnce);
        assertEquals("every ad is shown once, with no repeat", 7, network.made.size());
    }

    @Test public void anAdIsFoundByTheNumberOfItsSlotWhateverTheStep() {
        AdController wide = new AdController(network, null, () -> now, 3);
        wide.listen(() -> { });
        wide.ready();
        wide.reader(0, LIST, -1);
        FakePage page = network.arrive(network.last());
        assertSame(page, wide.page(1));
        assertNull(wide.page(2));
    }
}
