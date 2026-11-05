package com.plaxlabs.news;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.PatternMatcher;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
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
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * What the website's configuration does on the real screen: the topics and the news sections it lists, the switches it turns off, the
 * notice it shows, the word that a newer version is on Google Play, and the links it adds to the menu. The website, the preferences and
 * the browser are replaced, so nothing here depends on what is published.
 */
@RunWith(AndroidJUnit4.class)
public class ConfigDeviceTest {
    private Context context;
    private UiDevice device;
    private File cacheDir, seenDir;
    private final List<String> asked = Collections.synchronizedList(new ArrayList<>());

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        cacheDir = new File(context.getCacheDir(), "config-" + UUID.randomUUID());
        seenDir = new File(context.getCacheDir(), "config-seen-" + UUID.randomUUID());
        assertTrue(cacheDir.mkdirs()); assertTrue(seenDir.mkdirs());
        FeedViewModel.caches = base -> new FeedCache(cacheDir);
        FeedViewModel.histories = base -> new SeenFile(seenDir);
        FeedViewModel.dwellMs = 600_000; FeedViewModel.glanceMs = 600_000;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        assertTrue(context.getSharedPreferences("config-prompts", Context.MODE_PRIVATE).edit().clear().commit());
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
        MainActivity.playBuild = BuildConfig.PLAY_STORE;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        context.getSharedPreferences("config-prompts", Context.MODE_PRIVATE).edit().clear().commit();
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

    private final class FakeSource implements FeedSource {
        private final List<Story> stories;
        FakeSource(List<Story> stories) { this.stories = stories; }

        @Override public Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result) {
            asked.add(categories);
            result.loaded(stories);
            return () -> { };
        }
    }

    private String text(int resource) { return context.getString(resource); }

    private static AppConfig parse(String body) {
        try { return AppConfig.parse(("{\"schemaVersion\":1," + body + "}").getBytes(StandardCharsets.UTF_8)).config(); }
        catch (IOException refused) { throw new AssertionError(refused); }
    }

    /** Puts what the website would say in force, as if it had been read before the screen was made. */
    private static void website(String body) { AppConfigStore.force(parse(body)); }

    private static String notice(String id, String level, String extra) {
        return "\"notice\":{\"id\":\"" + id + "\",\"level\":\"" + level + "\",\"title\":{\"en\":\"A word from Plax\"},"
                + "\"body\":{\"en\":\"Stocks has a new look.\"}" + extra + "}";
    }

    private static void onMain(Runnable work) { InstrumentationRegistry.getInstrumentation().runOnMainSync(work); }

    private static void await(String what, BooleanSupplier condition) {
        long end = SystemClock.uptimeMillis() + 10_000;
        while (SystemClock.uptimeMillis() < end) {
            if (condition.getAsBoolean()) return;
            SystemClock.sleep(50);
        }
        fail("timed out waiting for " + what);
    }

    private static AlertDialog shownDialog(ActivityScenario<MainActivity> scenario) {
        AtomicReference<AlertDialog> dialog = new AtomicReference<>();
        scenario.onActivity(activity -> dialog.set(activity.openDialog != null && activity.openDialog.isShowing() ? activity.openDialog : null));
        return dialog.get();
    }

    private static AlertDialog awaitDialog(ActivityScenario<MainActivity> scenario) {
        await("a dialog", () -> shownDialog(scenario) != null);
        return shownDialog(scenario);
    }

    private static boolean shows(AlertDialog dialog, String text) { return find(dialog.getWindow().getDecorView(), text) != null; }

    private static TextView find(View view, String text) {
        if (view instanceof TextView label && text.contentEquals(label.getText())) return label;
        if (view instanceof ViewGroup group)
            for (int index = 0; index < group.getChildCount(); index++) {
                TextView found = find(group.getChildAt(index), text);
                if (found != null) return found;
            }
        return null;
    }

    private void waitForFirstStory() {
        assertTrue("the first story is shown", device.wait(Until.hasObject(By.text("The first story of the day")), 15_000));
    }

    private void openMenu() {
        UiObject2 button = device.wait(Until.findObject(By.desc(text(R.string.menu))), 10_000);
        assertNotNull("the menu button is on the screen", button);
        button.click();
        assertTrue("the menu opens", device.wait(Until.hasObject(By.desc(text(R.string.close_menu))), 5_000));
    }

    private void openTopics() {
        openMenu();
        device.wait(Until.findObject(By.text(text(R.string.topics))), 5_000).click();
        assertTrue("the topics are on the screen", device.wait(Until.hasObject(By.text(text(R.string.choose_topic))), 5_000));
    }

    private static final String TOPICS = "\"topics\":[{\"id\":\"news\",\"emoji\":\"\\ud83d\\udcf0\",\"en\":\"Front page\",\"hi\":\"A\"},"
            + "{\"id\":\"stocks\",\"emoji\":\"\\ud83d\\udcca\",\"en\":\"Markets\",\"hi\":\"B\"},"
            + "{\"id\":\"crypto\",\"emoji\":\"\\ud83e\\ude99\",\"en\":\"Crypto\",\"hi\":\"C\"}]";

    @Test public void topicsAreTheWebsitesListInItsOrderUnderItsNames() {
        website(TOPICS);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            openTopics();
            assertTrue(device.hasObject(By.text("Front page")));
            assertTrue("Stocks under the name the website gives it", device.hasObject(By.text("Markets")));
            assertTrue("a topic the app was not made with", device.hasObject(By.text("Crypto")));
            assertFalse("a topic the website does not list is not offered", device.hasObject(By.text("Science")));
            assertFalse(device.hasObject(By.text(text(R.string.topic_stocks))));
            device.findObject(By.text("Crypto")).click();
            await("the feed of that topic to be asked for", () -> asked.contains("crypto"));
        }
    }

    @Test public void aTopicTheAppWasMadeWithIsOfferedWhenTheWebsiteSaysNothing() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            openTopics();
            for (int topic : new int[]{R.string.topic_news, R.string.topic_stocks, R.string.topic_science, R.string.topic_technology, R.string.topic_language})
                assertTrue(text(topic) + " is offered", device.hasObject(By.text(text(topic))) || scrollTo(text(topic)));
        }
    }

    private boolean scrollTo(String label) {
        try { return new UiScrollable(new UiSelector().className("android.widget.ScrollView").scrollable(true)).scrollIntoView(new UiSelector().text(label)); }
        catch (UiObjectNotFoundException none) { return false; }
    }

    @Test public void aListThatArrivesWhileTheAppIsOpenChangesTheTopicsAtOnce() {
        byte[] arrived = ("{\"schemaVersion\":1," + TOPICS + "}").getBytes(StandardCharsets.UTF_8);
        AppConfigStore.Memory never = new AppConfigStore.Memory() {
            @Override public long attempted() { return 0; }
            @Override public long succeeded() { return 0; }
            @Override public void attempted(long at) { }
            @Override public void succeeded(long at) { }
        };
        AppConfigStore.Disk nowhere = new AppConfigStore.Disk() {
            @Override public byte[] read() { return null; }
            @Override public void write(byte[] bytes) { }
            @Override public void delete() { }
        };
        // The website answers when the screen asks, which is as it comes to the front: after the topics were first drawn from the built-in list.
        AppConfigStore.use(new AppConfigStore(() -> arrived, nowhere, never, Runnable::run, Runnable::run, System::currentTimeMillis));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            openTopics();
            assertTrue("the website's list replaced the built-in one", device.hasObject(By.text("Crypto")));
            assertFalse(device.hasObject(By.text("Science")));
        }
    }

    @Test public void theNewsSectionsAreTheWebsitesList() {
        website("\"sections\":[{\"id\":\"us\",\"en\":\"US\",\"hi\":\"A\"},{\"id\":\"india\",\"en\":\"India\",\"hi\":\"B\"},{\"id\":\"world\",\"en\":\"Globe\",\"hi\":\"C\"}]");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            openMenu();
            for (String chip : new String[]{text(R.string.all), "US", "India", "Globe"}) assertTrue(chip + " is a chip", device.hasObject(By.text(chip)));
            assertFalse("a section the website does not list has no chip", device.hasObject(By.text(text(R.string.section_tech))));
            device.findObject(By.text("India")).click();
            assertTrue("the story of that section is still there", device.wait(Until.hasObject(By.text("The first story of the day")), 5_000));
        }
    }

    @Test public void theBuiltInSectionsAreTheWebsitesToo() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            openMenu();
            for (int chip : new int[]{R.string.all, R.string.section_us, R.string.section_india, R.string.section_world, R.string.section_tech,
                    R.string.section_business, R.string.section_science})
                assertTrue(text(chip) + " is a chip", device.hasObject(By.text(text(chip))));
        }
    }

    @Test public void aSectionTheWebsiteNoLongerListsIsIgnoredNotACrash() {
        website("\"sections\":[{\"id\":\"us\",\"en\":\"US\",\"hi\":\"A\"}]");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            scenario.onActivity(activity -> {
                try {
                    java.lang.reflect.Field field = MainActivity.class.getDeclaredField("model");
                    field.setAccessible(true);
                    FeedViewModel model = (FeedViewModel) field.get(activity);
                    model.section("india");
                    assertEquals("an unknown section changes nothing", "", model.current().section());
                    model.section("us");
                    assertEquals("us", model.current().section());
                } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
            });
        }
    }

    @Test public void theGoDeeperButtonIsThereUnlessTheWebsiteSwitchesItOff() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            assertTrue(device.hasObject(By.desc(text(R.string.go_deeper_description))));
        }
        website("\"features\":{\"deeper\":false}");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            assertFalse("no Go deeper button", device.hasObject(By.desc(text(R.string.go_deeper_description))));
            assertTrue("the other two buttons are still there", device.hasObject(By.desc(text(R.string.share))));
            assertTrue(device.hasObject(By.desc(text(R.string.save_description))));
        }
    }

    @Test public void aNoticeIsShownOnceAndNotAgainOnceTheReaderHasSaidDone() {
        website(notice("n1", "info", ""));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            assertTrue(shows(dialog, "A word from Plax"));
            assertTrue(shows(dialog, "Stocks has a new look."));
            assertNotNull(find(dialog.getWindow().getDecorView(), text(R.string.done)));
            assertNull("no Learn more: the notice has no link", find(dialog.getWindow().getDecorView(), text(R.string.notice_more)));
            onMain(() -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick());
            await("the dialog to close", () -> shownDialog(scenario) == null);
        }
        await("Done to be remembered", () -> "n1".equals(context.getSharedPreferences("config-prompts", Context.MODE_PRIVATE).getString("notice-seen", "")));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            SystemClock.sleep(700);
            assertNull("not shown again", shownDialog(scenario));
        }
    }

    @Test public void anOrdinaryNoticeClosedAnyOtherWayIsAlsoCountedAsRead() {
        website(notice("n2", "info", ""));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            onMain(dialog::cancel);
            await("the dialog to close", () -> shownDialog(scenario) == null);
        }
        await("it to be remembered", () -> "n2".equals(context.getSharedPreferences("config-prompts", Context.MODE_PRIVATE).getString("notice-seen", "")));
    }

    @Test public void anImportantNoticeComesBackAtTheNextStartUntilTheReaderHasSaidDone() {
        website(notice("n3", "important", ""));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            onMain(dialog::cancel);
            await("the dialog to close", () -> shownDialog(scenario) == null);
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.STARTED);
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            SystemClock.sleep(600);
            assertNull("not again in the same run of the app", shownDialog(scenario));
        }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            assertTrue("it is back at the next start", shows(dialog, "A word from Plax"));
            onMain(() -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick());
            await("the dialog to close", () -> shownDialog(scenario) == null);
        }
        await("Done to be remembered", () -> "n3".equals(context.getSharedPreferences("config-prompts", Context.MODE_PRIVATE).getString("notice-seen", "")));
    }

    @Test public void aNoticeWithALinkOpensItFromLearnMore() {
        website(notice("n4", "info", ",\"url\":\"https://plax-rouge.vercel.app/news/privacy\""));
        IntentFilter page = new IntentFilter(Intent.ACTION_VIEW);
        page.addDataScheme("https");
        page.addDataAuthority("plax-rouge.vercel.app", null);
        page.addDataPath("/news/privacy", PatternMatcher.PATTERN_LITERAL);
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(page, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            assertNotNull(find(dialog.getWindow().getDecorView(), text(R.string.notice_more)));
            onMain(() -> dialog.getButton(AlertDialog.BUTTON_NEUTRAL).performClick());
            await("the page to be opened", () -> monitor.getHits() == 1);
            await("it to be counted as read", () -> "n4".equals(context.getSharedPreferences("config-prompts", Context.MODE_PRIVATE).getString("notice-seen", "")));
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void aNoticeForTheOtherBuildOrAnEndedOneIsNotShown() {
        website(notice("n5", "info", ",\"build\":\"play\""));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            SystemClock.sleep(700);
            assertNull("this is not the Google Play build", shownDialog(scenario));
        }
        website(notice("n6", "info", ",\"until\":\"2020-01-01T00:00:00Z\""));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            SystemClock.sleep(700);
            assertNull("it ended long ago", shownDialog(scenario));
        }
    }

    private static String update(int latest, int least) {
        return "\"update\":{\"latestVersionCode\":" + latest + ",\"latestVersionName\":\"9.9.9\",\"minSupportedVersionCode\":" + least + "}";
    }

    @Test public void aGooglePlayBuildIsToldThatANewerVersionIsOnGooglePlayAndLaterIsRemembered() {
        MainActivity.playBuild = true;
        website(update(BuildConfig.VERSION_CODE + 1, 0));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            assertTrue(shows(dialog, text(R.string.update_title)));
            assertTrue("it names the version", find(dialog.getWindow().getDecorView(), context.getString(R.string.update_play_message, "9.9.9")) != null);
            assertNotNull(find(dialog.getWindow().getDecorView(), text(R.string.update_later)));
            assertNotNull(find(dialog.getWindow().getDecorView(), text(R.string.update_play_button)));
            onMain(() -> dialog.getButton(AlertDialog.BUTTON_NEGATIVE).performClick());
            await("the dialog to close", () -> shownDialog(scenario) == null);
        }
        await("Later to be remembered", () -> context.getSharedPreferences("config-prompts", Context.MODE_PRIVATE).getLong("update-version", 0) == BuildConfig.VERSION_CODE + 1);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            SystemClock.sleep(700);
            assertNull("not offered again within the day", shownDialog(scenario));
        }
    }

    @Test public void updateOpensTheGooglePlayPage() {
        MainActivity.playBuild = true;
        website(update(BuildConfig.VERSION_CODE + 1, 0));
        IntentFilter listing = new IntentFilter(Intent.ACTION_VIEW);
        listing.addDataScheme("https");
        listing.addDataAuthority("play.google.com", null);
        listing.addDataPath("/store/apps/details", PatternMatcher.PATTERN_LITERAL);
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(listing, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            onMain(() -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick());
            await("Google Play to be opened", () -> monitor.getHits() == 1);
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void aVersionBelowTheLeastSupportedIsToldItIsOutOfDate() {
        MainActivity.playBuild = true;
        website(update(BuildConfig.VERSION_CODE + 1, BuildConfig.VERSION_CODE + 1));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            assertNotNull(find(dialog.getWindow().getDecorView(), context.getString(R.string.update_play_required, "9.9.9")));
            onMain(() -> dialog.getButton(AlertDialog.BUTTON_NEGATIVE).performClick());
            await("the dialog to close", () -> shownDialog(scenario) == null);
        }
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertNotNull("at the next start, whatever Later said", awaitDialog(scenario));
        }
    }

    @Test public void theWebsitesBuildIsNeverToldAboutGooglePlay() {
        MainActivity.playBuild = false;
        website(update(BuildConfig.VERSION_CODE + 1, BuildConfig.VERSION_CODE + 1));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            SystemClock.sleep(700);
            assertNull(shownDialog(scenario));
        }
    }

    @Test public void linksTheWebsiteAddsAreInTheMenuForTheirBuildAndOpenTheirPage() throws UiObjectNotFoundException {
        website("\"links\":[{\"id\":\"rate\",\"en\":\"Follow Plax\",\"hi\":\"A\",\"url\":\"https://github.com/RichardHenryJames/plax\"},"
                + "{\"id\":\"store\",\"en\":\"Rate on Google Play\",\"hi\":\"B\",\"url\":\"https://play.google.com/store/apps/details?id=com.plaxlabs.news\",\"build\":\"play\"}]");
        IntentFilter page = new IntentFilter(Intent.ACTION_VIEW);
        page.addDataScheme("https");
        page.addDataAuthority("github.com", null);
        page.addDataPath("/RichardHenryJames/plax", PatternMatcher.PATTERN_LITERAL);
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(page, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            openMenu();
            new UiScrollable(new UiSelector().className("android.widget.ScrollView").scrollable(true)).scrollIntoView(new UiSelector().text("Follow Plax"));
            assertTrue("a link for every build is in the menu", device.hasObject(By.text("Follow Plax")));
            assertFalse("one for the Google Play build is not in the website's", device.hasObject(By.text("Rate on Google Play")));
            device.findObject(By.text("Follow Plax")).click();
            await("the page to be opened", () -> monitor.getHits() == 1);
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void aStoryNamesItsPublisherSmallAboveTheHeadlineAndNoPosterShoutsItsName() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            assertTrue("the publisher is named in the line above the headline", device.hasObject(By.textStartsWith("Publisher")));
            assertEquals("and only there: the poster of a story with no picture is headed by Plax", 1, device.findObjects(By.textStartsWith("Publisher")).size());
            assertTrue("the poster is headed by Plax", device.hasObject(By.textStartsWith("Plax")));
        }
    }

    @Test public void theWebsiteCanSwitchThePublishersNameOffAndTheAgeStays() {
        website("\"features\":{\"sourceName\":false}");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            assertFalse("no publisher named anywhere on the card", device.hasObject(By.textContains("Publisher")));
            // The story was published on 10 October 2026, so its line says the date, which is all the line says.
            String age = StoryAdapter.age(context, 1_791_621_638_608L, java.util.Locale.getDefault());
            assertFalse(age.isEmpty());
            assertTrue("the age is still there: " + age, device.hasObject(By.text(age.replace(' ', '\u00a0'))));
            assertTrue("and the headline still opens the full story", device.findObject(By.text("The first story of the day")).isClickable());
        }
    }

    @Test public void theGooglePlayBuildNamesItsPublisherWhateverTheWebsiteSays() {
        MainActivity.playBuild = true;
        website("\"features\":{\"sourceName\":false}");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            assertTrue("Google Play asks an aggregator to say where its stories come from: the name is on the card", device.hasObject(By.textStartsWith("Publisher")));
        }
    }

    @Test public void theWebsiteCanAskForABiggerPictureAndTheStoryIsStillOneView() {
        website("\"layout\":{\"heroMaxHeight\":0.7,\"heroMaxWidth\":1.6}");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForFirstStory();
            assertTrue("the story is on the screen with its summary", device.hasObject(By.textStartsWith("A summary of the first story")));
            assertTrue(device.hasObject(By.desc(text(R.string.share))));
        }
    }
}
