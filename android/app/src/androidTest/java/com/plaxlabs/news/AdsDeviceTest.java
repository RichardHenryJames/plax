package com.plaxlabs.news;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * The ads on a real screen, with a fake ad network in place of Google's so that what the app does around an ad can be tested whatever
 * Google serves: the strip under the story, the full page after every fifth story, and what is never allowed to happen (a page put
 * in at or before the one the reader is on, an ad page counted as a story, a gap where an ad did not come, an ad before consent).
 * What Google's own SDK draws is not tested here; it is looked at on the emulator with Google's demo ad units.
 */
@RunWith(AndroidJUnit4.class)
public class AdsDeviceTest {
    private static final String BANNER = "FAKE BANNER AD";
    private static final int STORIES = 14;

    private Context context;
    private UiDevice device;
    private File cacheDir, seenDir;
    private FakeAds ads;
    private int themeBefore;

    /** A banner and a full-page ad of the plainest kind, answering when the test says. */
    private static final class FakeAds implements AdNetwork {
        enum Mode { FILL, NOFILL, HOLD }

        final Handler main = new Handler(Looper.getMainLooper());
        volatile Mode mode = Mode.FILL;
        volatile boolean banner = true, page = true, options, consentAtOnce = true;
        final AtomicInteger bannerLoads = new AtomicInteger(), pageRequests = new AtomicInteger(), optionsShown = new AtomicInteger();
        final List<Held> held = Collections.synchronizedList(new ArrayList<>());
        final List<FakePage> pages = Collections.synchronizedList(new ArrayList<>());
        private Runnable pendingConsent;

        final class Held {
            final Page.Listener listener;
            final int serial;
            volatile boolean cancelled, delivered;

            Held(Page.Listener listener, int serial) { this.listener = listener; this.serial = serial; }

            void fill() {
                main.post(() -> {
                    if (cancelled || delivered) return;
                    delivered = true;
                    FakePage page = new FakePage(serial);
                    pages.add(page);
                    listener.loaded(page);
                });
            }

            void miss() { main.post(() -> { if (!cancelled && !delivered) { delivered = true; listener.failed(); } }); }
        }

        static final class FakePage implements Page {
            final int serial;
            volatile boolean destroyed;
            private View view;

            FakePage(int serial) { this.serial = serial; }

            @Override public View view(Context context, Ui ui) {
                if (view == null) {
                    FrameLayout card = new FrameLayout(context);
                    card.setBackgroundColor(0xFFE8E0F0);
                    TextView words = new TextView(context);
                    words.setText("FAKE AD PAGE " + serial);
                    words.setTextColor(Color.BLACK); words.setTextSize(20);
                    words.setPadding(40, 160, 40, 160);
                    card.addView(words, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
                    view = card;
                }
                return view;
            }

            @Override public void destroy() {
                destroyed = true;
                if (view != null && view.getParent() instanceof android.view.ViewGroup parent) parent.removeView(view);
            }
        }

        @Override public boolean banner() { return banner; }
        @Override public boolean page() { return page; }

        @Override public void start(AppCompatActivity activity, Runnable ready) {
            if (consentAtOnce) main.post(ready);
            else pendingConsent = ready;
        }

        void consent() { Runnable ready = pendingConsent; if (ready != null) main.post(ready); }

        @Override public boolean privacyOptions(Context context) { return options; }

        @Override public void showPrivacyOptions(AppCompatActivity activity, Runnable done) { optionsShown.incrementAndGet(); done.run(); }

        @Override public Banner loadBanner(Context context, int widthDp, Banner.Listener listener) {
            bannerLoads.incrementAndGet();
            TextView view = new TextView(context);
            view.setText(BANNER); view.setGravity(Gravity.CENTER);
            view.setBackgroundColor(0xFFD0D8E0); view.setTextColor(Color.BLACK);
            int height = Math.round(50 * context.getResources().getDisplayMetrics().density);
            main.post(listener::loaded);
            return new Banner() {
                @Override public View view() { return view; }
                @Override public int heightPx() { return height; }
                @Override public void pause() { }
                @Override public void resume() { }
                @Override public void destroy() { if (view.getParent() instanceof android.view.ViewGroup parent) parent.removeView(view); }
            };
        }

        @Override public Cancelable loadPage(Context context, Page.Listener listener) {
            Held request = new Held(listener, pageRequests.incrementAndGet());
            switch (mode) {
                case FILL: request.fill(); break;
                case NOFILL: request.miss(); break;
                default: held.add(request);
            }
            return () -> request.cancelled = true;
        }
    }

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        cacheDir = new File(context.getCacheDir(), "ads-" + UUID.randomUUID());
        seenDir = new File(context.getCacheDir(), "ads-seen-" + UUID.randomUUID());
        assertTrue(cacheDir.mkdirs()); assertTrue(seenDir.mkdirs());
        themeBefore = Prefs.theme(context);
        FeedViewModel.caches = base -> new FeedCache(cacheDir);
        FeedViewModel.histories = base -> new SeenFile(seenDir);
        // Nothing counts as read while the test pages around, so no story vanishes from under it.
        FeedViewModel.dwellMs = 600_000; FeedViewModel.glanceMs = 600_000;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        QuietUpdates.install();
        List<Story> stories = new ArrayList<>();
        for (int number = 1; number <= STORIES; number++)
            stories.add(new Story("story-" + number, headline(number), "The summary of story number " + number + ", long enough to read.",
                    "news", "", "Publisher", "https://example.com/" + number, "", "20s", 1_791_621_638_608L));
        FeedViewModel.sources = () -> new FakeSource(stories);
        ads = new FakeAds();
        Ads.network = ads;
    }

    @After public void restoreProductionWiring() throws IOException {
        Ads.network = null;
        try { device.setOrientationNatural(); device.unfreezeRotation(); } catch (Exception ignored) { }
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> Prefs.theme(context, themeBefore));
        FeedViewModel.sources = FeedApi::new;
        FeedViewModel.caches = FeedCache::new;
        FeedViewModel.histories = SeenFile::new;
        FeedViewModel.dwellMs = 1200; FeedViewModel.glanceMs = 500;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        QuietUpdates.remove();
        delete(cacheDir); delete(seenDir);
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }

    private static String headline(int number) { return "Headline number " + number; }

    private static String adPage(int serial) { return "FAKE AD PAGE " + serial; }

    private static final class FakeSource implements FeedSource {
        private final List<Story> stories;
        FakeSource(List<Story> stories) { this.stories = stories; }

        @Override public synchronized Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result) {
            result.loaded(excluded.isEmpty() ? stories : List.of());
            return () -> { };
        }
    }

    private String text(int resource) { return context.getString(resource); }

    private boolean shown(String text) { return device.wait(Until.hasObject(By.text(text)), 15_000); }

    private boolean gone(String text) { return device.wait(Until.gone(By.text(text)), 5_000); }

    private static void await(String what, BooleanSupplier condition) {
        long end = SystemClock.uptimeMillis() + 15_000;
        while (SystemClock.uptimeMillis() < end) {
            if (condition.getAsBoolean()) return;
            SystemClock.sleep(100);
        }
        fail("Timed out waiting for " + what);
    }

    private void swipeUp() {
        int width = device.getDisplayWidth(), height = device.getDisplayHeight();
        device.waitForIdle();
        device.swipe(width / 2, (int) (height * .78), width / 2, (int) (height * .20), 80);
    }

    private void swipeDown() {
        int width = device.getDisplayWidth(), height = device.getDisplayHeight();
        device.waitForIdle();
        device.swipe(width / 2, (int) (height * .20), width / 2, (int) (height * .78), 80);
    }

    /** Swipes on until this headline is on the screen, one story at a time, with no ad page in between. */
    private void readTo(int number) {
        assertTrue(headline(number - 1) + " is on the screen", shown(headline(number - 1)));
        swipeUp();
        assertTrue("then " + headline(number), shown(headline(number)));
    }

    private int modelPosition(ActivityScenario<MainActivity> scenario) {
        int[] position = new int[1];
        scenario.onActivity(activity -> position[0] = new ViewModelProvider(activity).get(FeedViewModel.class).current().position());
        return position[0];
    }

    private Rect bounds(String text) {
        UiObject2 object = device.wait(Until.findObject(By.text(text)), 10_000);
        assertNotNull(text + " is on the screen", object);
        return object.getVisibleBounds();
    }

    private void openMenu() {
        UiObject2 button = device.wait(Until.findObject(By.desc(text(R.string.menu))), 10_000);
        assertNotNull("the menu button is on the screen", button);
        button.click();
        assertTrue("the menu opens", device.wait(Until.hasObject(By.desc(text(R.string.close_menu))), 5_000));
    }

    @Test public void theStripStandsUnderTheStoryAtTheFootOfTheScreenAndTheStoryEndsAboveIt() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            assertTrue("the strip appears once ads may be shown", shown(BANNER));
            Rect strip = bounds(BANNER), title = bounds(headline(1));
            float density = context.getResources().getDisplayMetrics().density;
            assertEquals("the strip is as tall as the ad it holds", Math.round(50 * density), strip.height(), 2);
            assertTrue("the story ends above the strip: " + title + " over " + strip, title.bottom <= strip.top);
            assertTrue("the strip is at the foot of the screen: " + strip, strip.bottom >= device.getDisplayHeight() - Math.round(80 * density));
            UiObject2 pager = device.findObject(By.clazz("androidx.recyclerview.widget.RecyclerView"));
            assertNotNull(pager);
            assertTrue("no gap between the story page and the strip but a hairline: pager " + pager.getVisibleBounds() + ", strip " + strip,
                    strip.top - pager.getVisibleBounds().bottom <= Math.round(3 * density));
            assertEquals("one banner asked for", 1, ads.bannerLoads.get());
        }
    }

    @Test public void aBuildWithoutAdsShowsNoStripAndNoAdPageAndEveryStoryFollowsTheOneBefore() {
        Ads.network = NoAds.INSTANCE;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            for (int number = 2; number <= 7; number++) readTo(number);
            assertFalse("no strip", device.hasObject(By.text(BANNER)));
            assertFalse("no ad page", device.hasObject(By.textStartsWith("FAKE AD PAGE")));
            assertEquals(0, ads.pageRequests.get() + ads.bannerLoads.get());
            assertEquals(6, modelPosition(scenario));
        }
    }

    @Test public void anAdPageStandsAfterTheFifthStoryNotBeforeAndIsNotCountedAsAStory() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            for (int number = 2; number <= 5; number++) {
                readTo(number);
                assertFalse("no ad page among the first five stories", device.hasObject(By.textStartsWith("FAKE AD PAGE")));
            }
            assertEquals("the reader is on the fifth story", 4, modelPosition(scenario));
            swipeUp();
            assertTrue("the ad page comes next", shown(adPage(1)));
            assertTrue("and it is a page of its own: the story is gone", gone(headline(5)));
            assertEquals("the ad page is not a story: the reader's place is still the fifth", 4, modelPosition(scenario));
            assertTrue("the strip stays under it", device.hasObject(By.text(BANNER)));
            assertTrue("the menu button is on it", device.hasObject(By.desc(text(R.string.menu))));
            assertTrue("and the hint of how to go on", device.hasObject(By.text(text(R.string.ad_next_hint))));
            swipeUp();
            assertTrue("the sixth story follows the ad", shown(headline(6)));
            assertEquals(5, modelPosition(scenario));
        }
    }

    @Test public void anAdThatDoesNotComeLeavesNoGap() {
        ads.mode = FakeAds.Mode.NOFILL;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            for (int number = 2; number <= 6; number++) readTo(number);
            assertFalse("no ad page", device.hasObject(By.textStartsWith("FAKE AD PAGE")));
            assertTrue("the ad was asked for", ads.pageRequests.get() >= 1);
            assertEquals(5, modelPosition(scenario));
        }
    }

    @Test public void anAdThatArrivesWhileTheReaderIsReadingJoinsAheadOfThemAndNothingMoves() {
        ads.mode = FakeAds.Mode.HOLD;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            readTo(2); readTo(3);
            await("the ad of the first slot to be asked for", () -> !ads.held.isEmpty());
            readTo(4);
            ads.held.get(0).fill();
            await("the ad to be in the pager", () -> !ads.pages.isEmpty());
            device.waitForIdle();
            assertTrue("the reader is still on the fourth story", device.hasObject(By.text(headline(4))));
            assertEquals(3, modelPosition(scenario));
            readTo(5);
            swipeUp();
            assertTrue("the ad is the page after the fifth story", shown(adPage(1)));
        }
    }

    @Test public void anAdThatArrivesAfterItsSlotWasPassedIsNeverShown() {
        ads.mode = FakeAds.Mode.HOLD;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            for (int number = 2; number <= 6; number++) readTo(number);
            assertEquals(1, ads.held.size());
            assertTrue("the request was given up on when the slot was passed", ads.held.get(0).cancelled);
            ads.held.get(0).fill();
            device.waitForIdle();
            assertTrue("nothing was delivered for it", ads.pages.isEmpty());
            assertFalse(device.hasObject(By.textStartsWith("FAKE AD PAGE")));
            assertEquals(5, modelPosition(scenario));
        }
    }

    @Test public void goingBackToAnAdShowsTheSamePageAndLeavingItFarBehindFindsANewOneOnTheNextPass() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            for (int number = 2; number <= 5; number++) readTo(number);
            swipeUp();
            assertTrue(shown(adPage(1)));
            swipeDown();
            assertTrue("back to the fifth story", shown(headline(5)));
            swipeUp();
            assertTrue("and the same ad page again", shown(adPage(1)));
            swipeUp();
            assertTrue(shown(headline(6)));
            swipeUp();
            assertTrue(shown(headline(7)));
            // The reader has left the ad two stories behind: it is let go, so going back over it finds a gap, not the same ad.
            await("the first ad to be let go", () -> ads.pages.get(0).destroyed);
            swipeDown(); swipeDown();
            assertTrue("back on the fifth story", shown(headline(5)));
            assertFalse("the old ad page is gone", device.hasObject(By.text(adPage(1))));
            swipeDown();
            assertTrue(shown(headline(4)));
            swipeUp();
            assertTrue("on the way down again there is a new ad after the fifth story", shown(headline(5)));
            swipeUp();
            assertTrue("a new ad, not the old one", shown(adPage(2)));
        }
    }

    @Test public void nothingIsAskedForBeforeTheReaderHasGivenConsent() {
        ads.consentAtOnce = false;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            readTo(2); readTo(3); readTo(4);
            assertEquals("no banner asked for", 0, ads.bannerLoads.get());
            assertEquals("no ad page asked for", 0, ads.pageRequests.get());
            assertFalse("no strip", device.hasObject(By.text(BANNER)));
            ads.consent();
            assertTrue("the strip comes with consent", shown(BANNER));
            await("the ad of the first slot to be asked for", () -> ads.pageRequests.get() == 1);
            readTo(5);
            swipeUp();
            assertTrue("and the ad page", shown(adPage(1)));
        }
    }

    @Test public void theStripGoesWithTheStoriesAndComesBackWithThem() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            assertTrue(shown(BANNER));
            openMenu();
            device.wait(Until.findObject(By.text(text(R.string.topics))), 5_000).click();
            assertTrue("Topics opens", shown(text(R.string.choose_topic)));
            assertTrue("it has no strip", gone(BANNER));
            openMenu();
            device.wait(Until.findObject(By.text(text(R.string.feed))), 5_000).click();
            assertTrue("the feed is back", shown(headline(1)));
            assertTrue("and so is the strip", shown(BANNER));
            assertEquals("the strip was not made again", 1, ads.bannerLoads.get());
        }
    }

    @Test public void aPhoneOnItsSideHasNoStripAndNoAdPageAndTheyReturnWhenItIsUpright() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            assertTrue(shown(BANNER));
            device.setOrientationLeft();
            await("the screen to be on its side", () -> context.getResources().getConfiguration().screenHeightDp < 500
                    || device.getDisplayWidth() > device.getDisplayHeight());
            assertTrue("the story is still there", shown(headline(1)));
            assertTrue("with no strip: the story needs the height", gone(BANNER));
            for (int number = 2; number <= 6; number++) readTo(number);
            assertFalse("and no ad page", device.hasObject(By.textStartsWith("FAKE AD PAGE")));
            device.setOrientationNatural();
            assertTrue("upright, the strip is back", shown(BANNER));
            assertTrue("on the story the reader was on", shown(headline(6)));
        }
    }

    @Test public void theAdChoicesAreInTheMenuOnlyWhereTheyApplyAndOpenTheConsentTool() {
        ads.options = true;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            openMenu();
            UiObject2 row = device.wait(Until.findObject(By.text(text(R.string.ad_choices))), 5_000);
            assertNotNull("the menu offers the ad choices", row);
            row.click();
            await("the consent tool to be asked to show its choices", () -> ads.optionsShown.get() == 1);
        }
        ads.options = false;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            openMenu();
            assertTrue("the menu has the privacy policy", device.hasObject(By.text(text(R.string.privacy_policy))));
            assertFalse("and not the ad choices", device.hasObject(By.text(text(R.string.ad_choices))));
        }
    }

    @Test public void aboutSaysThereAreAdsOnlyWhenThereAre() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            openMenu();
            device.wait(Until.findObject(By.text(text(R.string.about))), 5_000).click();
            assertTrue("About says the ads are from Google", device.wait(Until.hasObject(By.textContains("Plax shows ads from Google")), 5_000));
            assertFalse("and no longer says there is no ad SDK", device.hasObject(By.textContains("no ad or analytics SDK")));
        }
        Ads.network = NoAds.INSTANCE;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(shown(headline(1)));
            openMenu();
            device.wait(Until.findObject(By.text(text(R.string.about))), 5_000).click();
            assertTrue("with no ads About says so", device.wait(Until.hasObject(By.textContains("no ad or analytics SDK")), 5_000));
        }
    }
}
