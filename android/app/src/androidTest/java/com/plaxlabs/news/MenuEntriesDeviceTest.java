package com.plaxlabs.news;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.PatternMatcher;
import android.os.SystemClock;
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
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * Every entry of the menu, and the buttons on a story, used on a real screen: each must do what its label says. (Contact us and
 * About are in ContactDeviceTest, and the update check in UpdateDeviceTest.) The feed is a fixed list of three stories, one in
 * each of three sections, so that what a section or a place shows can be told by its headline.
 */
@RunWith(AndroidJUnit4.class)
public class MenuEntriesDeviceTest {
    private static final String INDIA = "India story of the day", WORLD = "World story of the day", TECH = "Tech story of the day";

    private Context context;
    private UiDevice device;
    private File cacheDir, seenDir, savedFile;
    private byte[] savedBackup;
    private int themeBefore;

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        cacheDir = new File(context.getCacheDir(), "entries-" + UUID.randomUUID());
        seenDir = new File(context.getCacheDir(), "entries-seen-" + UUID.randomUUID());
        assertTrue(cacheDir.mkdirs()); assertTrue(seenDir.mkdirs());
        // The saved stories are the reader's own: kept aside while the test saves and clears, and put back after.
        savedFile = new File(context.getFilesDir(), "saved-stories.json");
        savedBackup = savedFile.exists() ? java.nio.file.Files.readAllBytes(savedFile.toPath()) : null;
        savedFile.delete();
        themeBefore = Prefs.theme(context);
        FeedViewModel.caches = base -> new FeedCache(cacheDir);
        FeedViewModel.histories = base -> new SeenFile(seenDir);
        // Nothing counts as read while the test pages around, so no story vanishes from under it.
        FeedViewModel.dwellMs = 600_000; FeedViewModel.glanceMs = 600_000;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        QuietUpdates.install();
        List<Story> stories = List.of(
                story("india-1", INDIA, "A summary of the India story, long enough to read.", "india"),
                story("world-1", WORLD, "A summary of the world story.", "world"),
                story("tech-1", TECH, "A summary of the tech story.", "tech"));
        FeedViewModel.sources = () -> new FakeSource(stories);
    }

    @After public void restoreProductionWiring() throws IOException {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> Prefs.theme(context, themeBefore));
        // The language is a setting of the whole device for this app, and a test that failed halfway must not leave the next class with
        // a Hindi interface. AppCompat's setApplicationLocales does nothing when no activity is open (which is when this runs), so
        // the system's locale manager is asked directly, and the app is waited for until it is English again.
        if (android.os.Build.VERSION.SDK_INT >= 33)
            context.getSystemService(android.app.LocaleManager.class).setApplicationLocales(android.os.LocaleList.forLanguageTags(Language.ENGLISH));
        await("the interface to be English again",
                () -> Language.ENGLISH.equals(context.getResources().getConfiguration().getLocales().get(0).getLanguage()));
        BriefSheet.source = new BriefApi();
        FeedViewModel.sources = FeedApi::new;
        FeedViewModel.caches = FeedCache::new;
        FeedViewModel.histories = SeenFile::new;
        FeedViewModel.dwellMs = 1200; FeedViewModel.glanceMs = 500;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        QuietUpdates.remove();
        if (savedBackup == null) savedFile.delete();
        else try (FileOutputStream output = new FileOutputStream(savedFile)) { output.write(savedBackup); }
        delete(cacheDir); delete(seenDir);
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }

    private static Story story(String id, String title, String body, String section) {
        return new Story(id, title, body, "news", section, "Publisher", "https://example.com/" + id, "", "20s", 1_791_621_638_608L);
    }

    /** The stories as the first page; asking for more (with some to leave out) finds there are none. */
    private static final class FakeSource implements FeedSource {
        private final List<Story> stories;
        FakeSource(List<Story> stories) { this.stories = stories; }

        @Override public synchronized Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result) {
            result.loaded(excluded.isEmpty() ? stories : List.of());
            return () -> { };
        }
    }

    private String text(int resource) { return context.getString(resource); }

    /** A string in one language whatever the app is showing now: the test's own context follows the app's language. */
    private String in(String language, int resource) {
        Configuration configuration = new Configuration(context.getResources().getConfiguration());
        configuration.setLocale(Locale.forLanguageTag(language));
        return context.createConfigurationContext(configuration).getString(resource);
    }

    private String inHindi(int resource) { return in(Language.HINDI, resource); }

    private String inEnglish(int resource) { return in(Language.ENGLISH, resource); }

    private boolean titleShown(String title) { return device.wait(Until.hasObject(By.text(title)), 15_000); }

    private boolean menuIsClosed() { return device.wait(Until.gone(By.desc(text(R.string.close_menu))), 5_000); }

    private static void await(String what, BooleanSupplier condition) {
        long end = SystemClock.uptimeMillis() + 15_000;
        while (SystemClock.uptimeMillis() < end) {
            if (condition.getAsBoolean()) return;
            SystemClock.sleep(100);
        }
        fail("Timed out waiting for " + what);
    }

    private void openMenu() {
        UiObject2 button = device.wait(Until.findObject(By.desc(text(R.string.menu))), 10_000);
        assertNotNull("the menu button is on the screen", button);
        button.click();
        assertTrue("the menu opens", device.wait(Until.hasObject(By.desc(text(R.string.close_menu))), 5_000));
    }

    /** Opens the menu and presses an entry, scrolling to it first when it is below the fold. The menu closes behind it. */
    private void choose(String label) {
        openMenu();
        try { new UiScrollable(new UiSelector().className("android.widget.ScrollView").scrollable(true)).scrollIntoView(new UiSelector().text(label)); }
        catch (UiObjectNotFoundException none) { /* the check below says so */ }
        UiObject2 entry = device.wait(Until.findObject(By.text(label)), 5_000);
        assertNotNull(label + " is in the menu", entry);
        entry.click();
    }

    /** The menu marks the place (or section, or language) the reader is in. */
    private void assertMarked(String label, boolean row) {
        openMenu();
        UiObject2 entry = device.wait(Until.findObject(By.text(label)), 5_000);
        assertNotNull(label + " is in the menu", entry);
        assertTrue("the menu marks " + label + " as chosen", (row ? entry.getParent() : entry).isSelected());
        device.pressBack();
        assertTrue("the back button closes the menu", menuIsClosed());
    }

    private Instrumentation.ActivityMonitor watchPage(String authority, String path) {
        IntentFilter page = new IntentFilter(Intent.ACTION_VIEW);
        page.addCategory(Intent.CATEGORY_DEFAULT);
        page.addCategory(Intent.CATEGORY_BROWSABLE);
        page.addDataScheme("https");
        page.addDataAuthority(authority, null);
        page.addDataPath(path, PatternMatcher.PATTERN_LITERAL);
        return InstrumentationRegistry.getInstrumentation().addMonitor(page, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
    }

    private void swipeUp() {
        int width = device.getDisplayWidth(), height = device.getDisplayHeight();
        device.waitForIdle();
        device.swipe(width / 2, (int) (height * .78), width / 2, (int) (height * .20), 80);
    }

    @Test public void theFourPlacesOpenWhatTheirNamesSayAndTheMenuMarksTheOneThatIsOpen() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue("the feed opens on the first story", titleShown(INDIA));
            assertMarked(text(R.string.feed), true);

            choose(text(R.string.saved));
            assertTrue("Saved opens its page, empty before anything is saved", device.wait(Until.hasObject(By.text(text(R.string.empty_saved))), 10_000));
            assertMarked(text(R.string.saved), true);

            choose(text(R.string.topics));
            assertTrue("Topics opens the choice of topics", device.wait(Until.hasObject(By.text(text(R.string.choose_topic))), 10_000));
            assertMarked(text(R.string.topics), true);

            // With no topics chosen yet, For you invites a choice: a card with a button that opens the choice of topics.
            choose(text(R.string.for_you));
            assertTrue("For you invites a choice", device.wait(Until.hasObject(By.text(text(R.string.for_you_title))), 10_000));
            assertMarked(text(R.string.for_you), true);
            device.wait(Until.findObject(By.text(text(R.string.choose_interests))), 5_000).click();
            assertTrue("its button opens the choice of topics", device.wait(Until.hasObject(By.text(text(R.string.interests_detail))), 10_000));
            device.pressBack();
            assertTrue("the choice closes with the back button", device.wait(Until.gone(By.text(text(R.string.interests_detail))), 5_000));

            choose(text(R.string.feed));
            assertTrue("Feed brings the stories back", titleShown(INDIA));
            assertMarked(text(R.string.feed), true);
        }
    }

    @Test public void aSectionNarrowsTheNewsToItAndAllBringsTheRestBack() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));

            choose(text(R.string.section_world));
            assertTrue("World shows the world story", titleShown(WORLD));
            assertTrue("and not the India one", device.wait(Until.gone(By.text(INDIA)), 5_000));
            assertMarked(text(R.string.section_world), false);

            choose(text(R.string.section_tech));
            assertTrue("Tech shows the tech story", titleShown(TECH));
            assertTrue("and not the world one", device.wait(Until.gone(By.text(WORLD)), 5_000));

            choose(text(R.string.section_india));
            assertTrue("India shows the India story", titleShown(INDIA));

            choose(text(R.string.all));
            assertTrue("All starts again from the first story", titleShown(INDIA));
            assertMarked(text(R.string.all), false);
            swipeUp();
            assertTrue("and the other sections' stories follow it", titleShown(WORLD));
        }
    }

    @Test public void theLanguageTurnsTheWholeInterfaceToHindiAndBackAndTheMenuMarksIt() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));
            assertMarked(text(R.string.language_english), false);

            choose(text(R.string.language_hindi));
            assertTrue("the interface turns Hindi", device.wait(Until.hasObject(By.desc(inHindi(R.string.menu))), 20_000));
            assertTrue("and the English menu button is gone", device.wait(Until.gone(By.desc(inEnglish(R.string.menu))), 10_000));
            device.findObject(By.desc(inHindi(R.string.menu))).click();
            assertTrue("the menu is in Hindi", device.wait(Until.hasObject(By.desc(inHindi(R.string.close_menu))), 5_000));
            assertTrue("its places are in Hindi", device.hasObject(By.text(inHindi(R.string.saved))));
            assertTrue("and it marks Hindi as the language", device.findObject(By.text(inHindi(R.string.language_hindi))).isSelected());

            device.findObject(By.text(inEnglish(R.string.language_english))).click();
            assertTrue("English brings the English interface back", device.wait(Until.hasObject(By.desc(inEnglish(R.string.menu))), 20_000));
            assertTrue("and the story", titleShown(INDIA));
            await("the test's own strings to follow the app back to English", () -> text(R.string.menu).equals(inEnglish(R.string.menu)));
            assertMarked(text(R.string.language_english), false);
        }
    }

    @Test public void accountOpensTheAccountSheet() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));
            choose(text(R.string.account));
            assertTrue("the account sheet opens", device.wait(Until.hasObject(By.text(text(R.string.account_title))), 10_000));
            device.pressBack();
            assertTrue("the back button closes it", device.wait(Until.gone(By.text(text(R.string.account_title))), 5_000));
            assertTrue("and the story is there", device.hasObject(By.text(INDIA)));
        }
    }

    @Test public void themeOffersThreeChoicesAndKeepsTheOneChosen() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));
            choose(text(R.string.theme));
            for (int label : new int[]{R.string.theme_system, R.string.theme_light, R.string.theme_dark})
                assertTrue(text(label) + " is offered", device.wait(Until.hasObject(By.text(text(label))), 5_000));
            device.findObject(By.text(text(R.string.theme_light))).click();
            await("Light to be kept", () -> Prefs.theme(context) == Prefs.LIGHT);
            assertTrue("the story is there after the screen is redrawn", titleShown(INDIA));

            choose(text(R.string.theme));
            assertTrue(device.wait(Until.hasObject(By.text(text(R.string.theme_dark))), 5_000));
            device.findObject(By.text(text(R.string.theme_dark))).click();
            await("Dark to be kept", () -> Prefs.theme(context) == Prefs.DARK);
            assertTrue(titleShown(INDIA));
        }
    }

    @Test public void privacyPolicyOpensThePolicyPage() {
        Instrumentation.ActivityMonitor monitor = watchPage("plax-rouge.vercel.app", "/news/privacy");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));
            choose(text(R.string.privacy_policy));
            await("the privacy policy to be opened", () -> monitor.getHits() == 1);
            assertTrue("the menu closed behind it", menuIsClosed());
        } finally { InstrumentationRegistry.getInstrumentation().removeMonitor(monitor); }
    }

    @Test public void theHeadlineOpensTheFullStoryAtThePublisher() {
        Instrumentation.ActivityMonitor monitor = watchPage("example.com", "/india-1");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));
            assertFalse("there is no Read full story row", device.hasObject(By.descContains(text(R.string.read_full_story))));
            device.findObject(By.text(INDIA)).click();
            await("the story's page at the publisher to be opened", () -> monitor.getHits() == 1);
        } finally { InstrumentationRegistry.getInstrumentation().removeMonitor(monitor); }
    }

    @Test public void saveOnTheSourceLineTogglesAndTheBriefButtonOpensTheBrief() {
        // The brief never answers, so its sheet stays as it opens, and no request leaves the phone.
        BriefSheet.source = (story, lang, result) -> () -> { };
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));
            UiObject2 save = device.wait(Until.findObject(By.desc(text(R.string.save_description)).enabled(true)), 10_000);
            assertNotNull("Save is ready", save);
            save.click();
            assertTrue("Save turns into Remove saved story", device.wait(Until.hasObject(By.desc(text(R.string.unsave_description))), 10_000));
            device.findObject(By.desc(text(R.string.unsave_description))).click();
            assertTrue("a second press takes it off again", device.wait(Until.hasObject(By.desc(text(R.string.save_description))), 10_000));

            device.findObject(By.desc(text(R.string.brief_description))).click();
            assertTrue("the brief opens", device.wait(Until.hasObject(By.text(text(R.string.brief_loading))), 10_000));
            assertTrue("with its note", device.hasObject(By.text(text(R.string.brief_note))));
            device.findObject(By.desc(text(R.string.close))).click();
            assertTrue("and its cross closes it", device.wait(Until.gone(By.text(text(R.string.brief_loading))), 5_000));
            assertTrue("leaving the story as it was", titleShown(INDIA));
        }
    }

    @Test public void clearSavedStoriesAsksFirstAndThenClearsThem() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown(INDIA));
            UiObject2 save = device.wait(Until.findObject(By.desc(text(R.string.save_description)).enabled(true)), 10_000);
            assertNotNull("Save is ready", save);
            save.click();
            assertTrue("the story is saved", device.wait(Until.hasObject(By.desc(text(R.string.unsave_description))), 10_000));

            choose(text(R.string.saved));
            assertTrue("it is on the Saved page", titleShown(INDIA));
            assertFalse("which is no longer empty", device.hasObject(By.text(text(R.string.empty_saved))));

            choose(text(R.string.clear_saved));
            assertTrue("the reader is asked first", device.wait(Until.hasObject(By.text(text(R.string.clear_confirm))), 5_000));
            device.findObject(By.text(text(R.string.cancel))).click();
            assertTrue("Cancel closes the question", device.wait(Until.gone(By.text(text(R.string.clear_confirm))), 5_000));
            assertTrue("and keeps the story", titleShown(INDIA));

            choose(text(R.string.clear_saved));
            assertTrue(device.wait(Until.hasObject(By.text(text(R.string.clear_confirm))), 5_000));
            device.findObject(By.text(text(R.string.clear))).click();
            assertTrue("Clear empties the Saved page", device.wait(Until.hasObject(By.text(text(R.string.empty_saved))), 10_000));
        }
    }
}
