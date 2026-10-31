package com.plaxlabs.news;

import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.UiObjectNotFoundException;
import androidx.test.uiautomator.UiScrollable;
import androidx.test.uiautomator.UiSelector;
import androidx.test.uiautomator.Until;
import java.io.File;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * A story has the whole screen: no header, no bottom bar. What they held is in a menu that a round button on the story opens,
 * and that the button, the back button, a tap beside it and a swipe to the left all close.
 */
@RunWith(AndroidJUnit4.class)
public class MenuDeviceTest {
    private Context context;
    private UiDevice device;
    private File cacheDir, seenDir;

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        cacheDir = new File(context.getCacheDir(), "menu-" + UUID.randomUUID());
        seenDir = new File(context.getCacheDir(), "menu-seen-" + UUID.randomUUID());
        assertTrue(cacheDir.mkdirs()); assertTrue(seenDir.mkdirs());
        FeedViewModel.caches = base -> new FeedCache(cacheDir);
        FeedViewModel.histories = base -> new SeenFile(seenDir);
        FeedViewModel.dwellMs = 600_000; FeedViewModel.glanceMs = 600_000;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        QuietUpdates.install();
        List<Story> stories = List.of(
                story("one", "The first story of the day", "A summary of the first story, long enough to read."),
                story("two", "The second story of the day", "A summary of the second story."));
        FeedViewModel.sources = () -> new FakeSource(stories);
    }

    @After public void restoreProductionWiring() {
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

    private static Story story(String id, String title, String body) {
        return new Story(id, title, body, "news", "india", "Publisher", "https://example.com/" + id, "", "20s", 1_791_621_638_608L);
    }

    private static final class FakeSource implements FeedSource {
        private final List<Story> first;
        private int calls;
        FakeSource(List<Story> first) { this.first = first; }

        @Override public synchronized Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result) {
            result.loaded(calls++ == 0 ? first : List.of());
            return () -> { };
        }
    }

    private String text(int resource) { return context.getString(resource); }

    private boolean menuIsOpen(long waitMs) { return device.wait(Until.hasObject(By.desc(text(R.string.close_menu))), waitMs); }

    private boolean menuIsClosed() { return device.wait(Until.gone(By.desc(text(R.string.close_menu))), 5_000); }

    private void openMenu() {
        UiObject2 button = device.wait(Until.findObject(By.desc(text(R.string.menu))), 10_000);
        assertNotNull("the menu button is on the screen", button);
        button.click();
        assertTrue("the menu opens", menuIsOpen(5_000));
    }

    @Test public void aStoryHasTheWholeScreenWithNoHeaderAndNoBottomBar() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue("the first story is shown", device.wait(Until.hasObject(By.text("The first story of the day")), 15_000));
            int width = device.getDisplayWidth(), height = device.getDisplayHeight();

            // What the header and the bottom bar said is not on a story.
            for (int label : new int[]{R.string.feed, R.string.for_you, R.string.topics, R.string.saved, R.string.language_english, R.string.language_hindi})
                assertFalse(text(label) + " is not on a story", device.hasObject(By.text(text(label))));
            assertFalse("no header with the name on it", device.hasObject(By.text(text(R.string.app_name))));

            // The button floats in the top-left corner and the row of buttons is at the very bottom, where the bar used to be.
            var button = device.findObject(By.desc(text(R.string.menu))).getVisibleBounds();
            assertTrue("the menu button is in the top-left corner " + button, button.left < width / 4 && button.top < height * .15f);
            var row = device.findObject(By.descContains(text(R.string.read_full_story))).getVisibleBounds();
            assertTrue("the Read full story row reaches the bottom of the screen " + row + " of " + height, row.bottom > height * .92f);
            var title = device.findObject(By.text("The first story of the day")).getVisibleBounds();
            assertFalse("the menu button does not cover the headline " + button + " " + title, android.graphics.Rect.intersects(button, title));
            assertTrue("the summary is on the page", device.hasObject(By.textStartsWith("A summary of the first story")));
        }
    }

    @Test public void theMenuHoldsWhatTheHeaderAndTheBottomBarHeld() throws UiObjectNotFoundException {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(device.wait(Until.hasObject(By.text("The first story of the day")), 15_000));
            openMenu();
            for (int label : new int[]{R.string.language_english, R.string.language_hindi, R.string.feed, R.string.for_you, R.string.topics, R.string.saved,
                    R.string.section_world, R.string.section_tech, R.string.section_business, R.string.section_science, R.string.check_new,
                    R.string.interests_title, R.string.account, R.string.theme, R.string.about})
                assertTrue(text(label) + " is in the menu", device.hasObject(By.text(text(label))));

            // The menu is longer than a screen on some phones: it scrolls, and the last row can be reached.
            UiScrollable list = new UiScrollable(new UiSelector().className("android.widget.ScrollView").scrollable(true));
            assertTrue("the menu scrolls to its last row", list.scrollIntoView(new UiSelector().text(text(R.string.clear_saved))));
        }
    }

    @Test public void theBackButtonTheCrossATapBesideItAndASwipeToTheLeftCloseTheMenu() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(device.wait(Until.hasObject(By.text("The first story of the day")), 15_000));
            int width = device.getDisplayWidth(), height = device.getDisplayHeight();

            openMenu();
            device.pressBack();
            assertTrue("the back button closes the menu", menuIsClosed());
            assertTrue("and the story is still there", device.hasObject(By.text("The first story of the day")));

            openMenu();
            device.findObject(By.desc(text(R.string.close_menu))).click();
            assertTrue("the cross closes the menu", menuIsClosed());

            openMenu();
            device.click(width - 24, height / 2);
            assertTrue("a tap beside the menu closes it", menuIsClosed());

            openMenu();
            device.swipe((int) (width * .6), height / 2, (int) (width * .1), height / 2, 20);
            assertTrue("a swipe to the left closes it", menuIsClosed());
            assertTrue("and the story is still the first", device.hasObject(By.text("The first story of the day")));
        }
    }

    @Test public void choosingAPlaceMovesThereAndTheMenuIsStillOneTapAway() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(device.wait(Until.hasObject(By.text("The first story of the day")), 15_000));

            openMenu();
            device.findObject(By.text(text(R.string.topics))).click();
            assertTrue("the menu closes", menuIsClosed());
            assertTrue("Topics is shown", device.wait(Until.hasObject(By.text(text(R.string.choose_topic))), 5_000));
            assertTrue("with the menu button in the corner", device.hasObject(By.desc(text(R.string.menu))));

            openMenu();
            device.findObject(By.text(text(R.string.feed))).click();
            assertTrue("the menu closes again", menuIsClosed());
            assertTrue("the feed is back", device.wait(Until.hasObject(By.text("The first story of the day")), 5_000));
        }
    }
}
