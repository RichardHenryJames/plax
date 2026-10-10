package com.plaxlabs.news;

import android.content.Context;
import android.os.SystemClock;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * Tapping Share on the real screen: when a story asks the site for a page of its own, when it does not, and that
 * the system share sheet opens only when it should. The site is replaced by a fake, so none of it depends on the network.
 */
@RunWith(AndroidJUnit4.class)
public class ShareDeviceTest {
    private static final String SIG = "45cf1f8654294cfdfa03b1376166de5b";
    private static final String PAGE = FeedApi.SITE + "/s/regional-parties-join-protests-" + SIG.substring(0, 16);

    private static final class FakeShares implements ShareSource {
        record Call(Story story, Result result, AtomicBoolean cancelled) { }
        final List<Call> calls = Collections.synchronizedList(new ArrayList<>());

        @Override public Cancelable link(Story story, Result result) {
            AtomicBoolean cancelled = new AtomicBoolean();
            calls.add(new Call(story, result, cancelled));
            return () -> cancelled.set(true);
        }
    }

    private Context context;
    private UiDevice device;
    private FakeShares shares;

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        shares = new FakeShares();
        ShareLinks.source = shares;
        QuietUpdates.install();
    }

    @After public void restoreProductionWiring() {
        ShareLinks.source = new ShareLinks();
        QuietUpdates.remove();
    }

    private static Story story(String sig, String link) {
        return new Story("hindu-1", "Regional parties join protests", "A march in Srinagar on Friday, with enough words.",
                "news", "india", "The Hindu", link, "", "20s", 1_791_621_638_608L, sig);
    }

    private static Story signed() { return story(SIG, "https://www.thehindu.com/a"); }

    /** The system share sheet lives in its own package ("android" before Android 14), not in the app's. */
    private boolean sheetShown(long waitMs) {
        String sheet = android.os.Build.VERSION.SDK_INT >= 34 ? "com.android.intentresolver" : "android";
        long deadline = SystemClock.uptimeMillis() + waitMs;
        do {
            if (sheet.equals(device.getCurrentPackageName())) return true;
            SystemClock.sleep(150);
        } while (SystemClock.uptimeMillis() < deadline);
        return false;
    }

    private void closeSheet() {
        device.pressBack();
        assertTrue("the app is back in front", device.wait(Until.hasObject(By.pkg(context.getPackageName())), 8_000));
    }

    private static void awaitCalls(FakeShares shares, int count) {
        long deadline = SystemClock.uptimeMillis() + 5_000;
        while (shares.calls.size() < count && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(20);
        assertEquals(count, shares.calls.size());
    }

    @Test public void aSignedStoryAsksForItsPageAndTheShareSheetOpensOnlyOnceTheLinkIsMade() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 1);
            assertEquals("the story, as it is, is what is asked about", signed(), shares.calls.get(0).story());
            assertFalse("nothing opens while the link is still being made", sheetShown(0));
            shares.calls.get(0).result().done(PAGE);
            assertTrue("the share sheet opens with the link", sheetShown(8_000));
            closeSheet();
        }
    }

    @Test public void aStoryTheServerDidNotSignIsSharedAtOnceWithoutAskingAnyone() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.share(story("", "https://www.thehindu.com/a")));
            assertTrue("the share sheet opens straight away", sheetShown(8_000));
            assertTrue("and the site was never asked", shares.calls.isEmpty());
            closeSheet();
            scenario.onActivity(activity -> activity.share(story(SIG, "")));
            assertTrue("a story with no publisher link has no page either", sheetShown(8_000));
            assertTrue(shares.calls.isEmpty());
            closeSheet();
        }
    }

    @Test public void whenThePageCannotBeMadeThePublishersLinkIsSharedInstead() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 1);
            shares.calls.get(0).result().done("");
            assertTrue("sharing still works", sheetShown(8_000));
            closeSheet();
        }
    }

    @Test public void tappingTheSameStoryAgainWhileWaitingSharesThePublishersLinkAtOnce() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 1);
            assertFalse("nothing opens while the link is still being made", sheetShown(0));
            scenario.onActivity(activity -> activity.share(signed()));
            assertTrue("a second tap stops the wait and the share sheet opens at once", sheetShown(8_000));
            assertTrue("the request for the link was given up on", shares.calls.get(0).cancelled().get());
            assertEquals("and no second request was made", 1, shares.calls.size());
            closeSheet();
            // Whatever the abandoned request says later is not obeyed.
            shares.calls.get(0).result().done(PAGE);
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            assertFalse("a late answer opens nothing", sheetShown(1_500));
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 2);
            shares.calls.get(1).result().done(PAGE);
            assertTrue("and sharing works again afterwards", sheetShown(8_000));
            closeSheet();
        }
    }

    @Test public void tappingAnotherStoryWhileWaitingMakesThatStorysLinkInstead() {
        Story other = new Story("hindu-2", "Another headline altogether", "A second story, with enough words.",
                "news", "india", "The Hindu", "https://www.thehindu.com/b", "", "20s", 1_791_621_638_700L, "0123456789abcdef0123456789abcdef");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 1);
            scenario.onActivity(activity -> activity.share(other));
            awaitCalls(shares, 2);
            assertEquals(other, shares.calls.get(1).story());
            assertTrue("the first story's request was given up on", shares.calls.get(0).cancelled().get());
            assertFalse("and nothing opened for the first story", sheetShown(0));
            shares.calls.get(1).result().done(FeedApi.SITE + "/s/another-headline-altogether-0123456789abcdef");
            assertTrue("the second story's link opens the share sheet", sheetShown(8_000));
            closeSheet();
        }
    }

    @Test public void leavingTheScreenAbandonsTheLinkBeingMade() {
        FakeShares.Call call;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 1);
            call = shares.calls.get(0);
            assertFalse(call.cancelled().get());
        }
        assertTrue("closing the screen cancels the request", call.cancelled().get());
        call.result().done(PAGE);
        assertFalse("a link that arrives for a closed screen opens nothing", sheetShown(1_500));
    }

    @Test public void aLinkThatArrivesAfterTheAppWasLeftIsNotOpenedOverWhateverIsOnScreen() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 1);
            scenario.moveToState(Lifecycle.State.CREATED);
            shares.calls.get(0).result().done(PAGE);
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            assertFalse("the share sheet is not opened from the background", sheetShown(1_500));
            scenario.moveToState(Lifecycle.State.RESUMED);
            scenario.onActivity(activity -> activity.share(signed()));
            awaitCalls(shares, 2);
            shares.calls.get(1).result().done(PAGE);
            assertTrue("and back in front, sharing works as before", sheetShown(8_000));
            closeSheet();
        }
    }
}
