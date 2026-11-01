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

            // The button floats in the top-left corner; the three buttons stand at the right end of the source line, which is
            // above the headline, and nothing is pinned to the bottom any more.
            var button = device.findObject(By.desc(text(R.string.menu))).getVisibleBounds();
            assertTrue("the menu button is in the top-left corner " + button, button.left < width / 4 && button.top < height * .15f);
            assertTrue("the headline is the way to the full story", device.findObject(By.text("The first story of the day")).isClickable());
            assertFalse("there is no Read full story row", device.hasObject(By.descContains(text(R.string.read_full_story))));
            var title = device.findObject(By.text("The first story of the day")).getVisibleBounds();
            var source = device.findObject(By.textStartsWith("Publisher")).getVisibleBounds();
            assertTrue("the source line is above the headline " + source + " " + title, source.bottom <= title.top + 4);
            for (int label : new int[]{R.string.brief_description, R.string.save_description, R.string.share}) {
                var buttonBounds = device.findObject(By.desc(text(label))).getVisibleBounds();
                assertTrue(text(label) + " is on the source line " + buttonBounds + " beside " + source,
                        buttonBounds.centerY() >= source.top - 40 && buttonBounds.centerY() <= source.bottom + 40);
                assertTrue(text(label) + " is to the right of the source " + buttonBounds + " " + source, buttonBounds.left >= source.right - 2);
                assertTrue(text(label) + " is in the right half " + buttonBounds + " of " + width, buttonBounds.left > width * .5f);
                assertTrue(text(label) + " is a full-size touch target " + buttonBounds,
                        buttonBounds.height() >= Math.round(context.getResources().getDisplayMetrics().density * 47));
            }
            var last = device.findObject(By.desc(text(R.string.share))).getVisibleBounds();
            assertTrue("the buttons end at the right edge, inside the page margin " + last + " of " + width, last.right > width * .9f && last.right <= width);
            assertFalse("the menu button does not cover the headline " + button + " " + title, android.graphics.Rect.intersects(button, title));
            assertTrue("the summary is on the page", device.hasObject(By.textStartsWith("A summary of the first story")));
            var summary = device.findObject(By.textStartsWith("A summary of the first story")).getVisibleBounds();
            assertTrue("the story uses the space the bottom row had: its summary ends low on the screen " + summary + " of " + height,
                    summary.bottom < height);
        }
    }

    @Test public void theMenuHoldsWhatTheHeaderAndTheBottomBarHeldAndNothingThatRepeatsAnotherPlace() throws UiObjectNotFoundException {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(device.wait(Until.hasObject(By.text("The first story of the day")), 15_000));
            openMenu();
            for (int label : new int[]{R.string.language_english, R.string.language_hindi, R.string.feed, R.string.for_you, R.string.topics, R.string.saved,
                    R.string.section_world, R.string.section_tech, R.string.section_business, R.string.section_science,
                    R.string.account, R.string.theme, R.string.about})
                assertTrue(text(label) + " is in the menu", device.hasObject(By.text(text(label))));
            // Looking for new stories happens by itself, topics are chosen on the Topics screen, and the website is in the account
            // sheet, so none of them has a row here.
            assertFalse("no Check for new stories row", device.hasObject(By.text(text(R.string.check_new))));
            assertFalse("no Your topics row", device.hasObject(By.text(text(R.string.interests_title))));
            assertFalse("no Open Plax website row", device.hasObject(By.text("Open Plax website")));

            // The menu is longer than a screen on some phones: it scrolls, and the last row can be reached.
            UiScrollable list = new UiScrollable(new UiSelector().className("android.widget.ScrollView").scrollable(true));
            assertTrue("the menu scrolls to its last row", list.scrollIntoView(new UiSelector().text(text(R.string.clear_saved))));
            for (int label : new int[]{R.string.contact_us, R.string.privacy_policy, R.string.update_check})
                assertTrue(text(label) + " is in the menu", device.hasObject(By.text(text(label))));
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
