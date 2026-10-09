package com.plaxlabs.news;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.security.NetworkSecurityPolicy;
import android.view.*;
import android.widget.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import okhttp3.OkHttpClient;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PlaxDeviceTest {
    private static final class FakeBriefs implements BriefSource {
        record Call(Story story, String lang, Result result, AtomicBoolean cancelled) { }
        final List<Call> calls = Collections.synchronizedList(new ArrayList<>());

        @Override public Cancelable brief(Story story, String lang, Result result) {
            AtomicBoolean cancelled = new AtomicBoolean();
            calls.add(new Call(story, lang, result, cancelled));
            return () -> cancelled.set(true);
        }
    }

    private Context context;
    private File directory;

    @Before public void isolatedPreview() {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        assertTrue(Build.MODEL.contains("sdk_gphone") || Build.FINGERPRINT.contains("generic"));
        directory = new File(context.getCacheDir(), "test-" + UUID.randomUUID());
        assertTrue(directory.mkdir());
        BriefApi.CACHE.clear();
        QuietUpdates.install();
    }

    @After public void cleanupFixtureOnly() {
        BriefSheet.source = new BriefApi();
        QuietUpdates.remove();
        if (directory == null) return;
        delete(directory);
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        assertTrue(file.delete());
    }

    private Story fixture() {
        return new Story("fixture", "A saved story", "A local reading fixture.", "news", "world",
                "Fixture publisher", "https://example.com/story", "", "1 min", 0);
    }

    @Test public void localBookmarksPersistWithoutAnAccountAndCanBeRemoved() throws Exception {
        SavedStories storage = new SavedStories(directory);
        assertTrue(storage.read().isEmpty());
        storage.write(List.of(fixture()));
        assertEquals(List.of(fixture()), new SavedStories(directory).read());
        storage.write(List.of());
        assertTrue(new SavedStories(directory).read().isEmpty());
    }

    @Test public void corruptedSavedDataIsNotSilentlyReplaced() throws Exception {
        File file = new File(directory, "saved-stories.json");
        byte[] invalid = "{bad json".getBytes(StandardCharsets.UTF_8);
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(invalid); }
        assertThrows(IOException.class, () -> new SavedStories(directory).read());
        assertArrayEquals(invalid, java.nio.file.Files.readAllBytes(file.toPath()));
    }

    @Test public void oversizedBookmarkWritePreservesThePreviousSavedStories() throws Exception {
        SavedStories storage = new SavedStories(directory);
        storage.write(List.of(fixture()));
        List<Story> tooMany = new ArrayList<>();
        for (int index = 0; index <= SavedStories.LIMIT; index++) tooMany.add(fixture());
        assertThrows(IOException.class, () -> storage.write(tooMany));
        assertEquals(List.of(fixture()), storage.read());
    }

    @Test public void feedCacheRoundTripsKeepsLanguagesApartAndDropsDamagedFiles() throws Exception {
        FeedCache cache = new FeedCache(directory);
        String news = FeedCache.key(Topic.NEWS, "en");
        assertNull(cache.read(news));
        cache.write(news, List.of(fixture()));
        FeedCache.Entry entry = new FeedCache(directory).read(news);
        assertNotNull(entry);
        assertEquals(List.of(fixture()), entry.stories());
        assertTrue(entry.age(System.currentTimeMillis()) < 60_000);
        assertNull("Each language has its own cache", cache.read(FeedCache.key(Topic.NEWS, "hi")));
        assertNull("Each topic has its own cache", cache.read(FeedCache.key(Topic.SCIENCE, "en")));
        assertNull("Each choice of interests has its own cache", cache.read(FeedCache.key("science,space", "en")));
        cache.write(FeedCache.key("science,space", "en"), List.of(fixture()));
        assertNotNull(cache.read(FeedCache.key("science,space", "en")));
        assertThrows(IllegalArgumentException.class, () -> cache.read("../escape"));

        File file = new File(new File(directory, "feed"), "news-en.json");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write("{bad json".getBytes(StandardCharsets.UTF_8)); }
        assertNull("A damaged cache is ignored, not trusted", cache.read(news));
        assertFalse("and removed so it cannot fail again", file.exists());
        cache.write(news, List.of());
        assertNull("An empty page is never cached", cache.read(news));
    }

    @Test public void seenHistoryIsKeptOnTheDeviceAndADamagedFileIsRejected() throws Exception {
        SeenFile file = new SeenFile(directory);
        assertEquals("Nothing is seen before the first launch", 0, file.read(System.currentTimeMillis()).size());
        SeenStore seen = new SeenStore();
        assertTrue(seen.mark(fixture(), System.currentTimeMillis()));
        file.write(seen);
        SeenStore reloaded = new SeenFile(directory).read(System.currentTimeMillis());
        assertTrue(reloaded.contains(fixture(), System.currentTimeMillis()));
        try (FileOutputStream output = new FileOutputStream(new File(directory, "seen-stories.json"))) {
            output.write("{bad json".getBytes(StandardCharsets.UTF_8));
        }
        assertThrows(IOException.class, () -> new SeenFile(directory).read(System.currentTimeMillis()));
    }

    @Test public void interestsStayOnThePhoneInAFixedOrder() {
        Set<String> original = Interests.read(context);
        try {
            Interests.write(context, List.of("space", "history", "nonsense"));
            assertEquals(List.of("history", "space"), List.copyOf(Interests.read(context)));
            Interests.write(context, List.of());
            assertTrue(Interests.read(context).isEmpty());
        } finally { Interests.write(context, original); }
    }

    @Test public void appNeedsNoLoginAndSupportsTopicsSavedAndRotation() {
        assertFalse(NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted());
        assertEquals(0, context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_ALLOW_BACKUP);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                clickLabel(activity, "Topics");
                assertNotNull(find(activity.getWindow().getDecorView(), "Follow your curiosity."));
                assertNotNull(find(activity.getWindow().getDecorView(), "Science"));
                clickLabel(activity, "Saved");
                assertNotNull(find(activity.getWindow().getDecorView(), "Keep the good reads."));
            });
            scenario.recreate();
            scenario.onActivity(activity -> {
                assertNotNull("The chosen screen survives rotation", find(activity.getWindow().getDecorView(), "Keep the good reads."));
                assertNull(find(activity.getWindow().getDecorView(), "Sign in"));
                clickLabel(activity, "Feed");
            });
        }
    }

    @Test public void nativeStoryCardRendersRealFieldsWithoutAWebView() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Context themed = new androidx.appcompat.view.ContextThemeWrapper(context, R.style.Theme_Plax);
            Ui ui = new Ui(themed);
            ImageLoader images = new ImageLoader(themed, 1080);
            try {
                int[] calls = new int[4];
                StoryAdapter adapter = new StoryAdapter(ui, images, new StoryAdapter.Actions() {
                    public void save(Story story) { calls[0]++; }
                    public void share(Story story) { calls[1]++; }
                    public void source(Story story) { calls[2]++; }
                    public void brief(Story story) { calls[3]++; }
                    public void check() { }
                    public void earlier() { }
                }, 360, 800);
                Story repeated = new Story("repeat", "Same words", "Same words", "news", "", "Publisher",
                        "https://example.com/repeat", "", "", 0);
                adapter.submit(List.of(fixture(), repeated), Set.of("repeat"), false, true, 0);
                var holder = (StoryAdapter.Holder) adapter.onCreateViewHolder(new FrameLayout(themed), adapter.getItemViewType(0));
                adapter.onBindViewHolder(holder, 0);
                assertEquals("A saved story", holder.title.getText().toString());
                assertEquals("A local reading fixture.", holder.content.getText().toString());
                assertTrue(holder.credit.getText().toString().contains("Fixture publisher"));
                assertEquals("WORLD", holder.category.getText().toString());
                assertEquals("example.com", holder.ctaHost.getText().toString());
                assertEquals(View.VISIBLE, holder.hero.getVisibility());
                assertEquals("A story without a picture gets a poster", View.VISIBLE, holder.poster.getVisibility());
                assertEquals("\uD83C\uDF0D", holder.poster.getText().toString());
                holder.save.performClick(); holder.share.performClick(); holder.cta.performClick(); holder.brief.performClick();
                assertArrayEquals(new int[]{1, 1, 1, 1}, calls);
                adapter.onBindViewHolder(holder, 1);
                assertEquals("A repeated headline is not shown twice", View.GONE, holder.content.getVisibility());
                assertEquals("Remove saved story", holder.save.getContentDescription().toString());
                adapter.onViewRecycled(holder);
            } finally { images.close(); }
        });
    }

    /**
     * OkHttp is written in Kotlin, which does not declare InterruptedException. Closing the screen interrupts a loader
     * thread that is still connecting, and the exception then comes out of execute() where Java code does not expect it.
     */
    @Test public void aPictureCutOffByAnInterruptIsMissingNotACrash() throws Exception {
        OkHttpClient interrupted = new OkHttpClient.Builder().addInterceptor(chain -> {
            throw PlaxDeviceTest.<RuntimeException>sneaky(new InterruptedException("closed while connecting"));
        }).build();
        AtomicReference<Throwable> uncaught = new AtomicReference<>();
        Thread.UncaughtExceptionHandler before = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> uncaught.compareAndSet(null, error));
        ImageLoader[] images = new ImageLoader[1];
        CountDownLatch answered = new CountDownLatch(1);
        AtomicBoolean loaded = new AtomicBoolean(true);
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                Context themed = new androidx.appcompat.view.ContextThemeWrapper(context, R.style.Theme_Plax);
                images[0] = new ImageLoader(themed, 1080, interrupted);
                images[0].load("https://example.com/a.jpg", new ImageView(themed), ok -> { loaded.set(ok); answered.countDown(); });
            });
            boolean answeredInTime = answered.await(10, TimeUnit.SECONDS);
            assertTrue("The loader still answers when its thread is interrupted (thread died with " + uncaught.get() + ")",
                    answeredInTime);
            assertFalse("An interrupted download is a missing picture", loaded.get());
            assertNull("No loader thread dies from it", uncaught.get());
        } finally {
            Thread.setDefaultUncaughtExceptionHandler(before);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { if (images[0] != null) images[0].close(); });
        }
    }

    @SuppressWarnings("unchecked")
    private static <T extends Throwable> RuntimeException sneaky(Throwable error) throws T { throw (T) error; }

    @Test public void skeletonCardHasItsOwnHeightInsteadOfFillingTheScreen() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Context themed = new androidx.appcompat.view.ContextThemeWrapper(context, R.style.Theme_Plax);
            Ui ui = new Ui(themed);
            for (boolean compact : new boolean[]{false, true}) {
                View card = ui.skeletonCard(compact);
                card.measure(View.MeasureSpec.makeMeasureSpec(ui.dp(360), View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(ui.dp(900), View.MeasureSpec.AT_MOST));
                assertTrue("The placeholder must leave room below it", card.getMeasuredHeight() < ui.dp(600));
                assertTrue(card.getMeasuredHeight() > ui.dp(200));
            }
        });
    }

    @Test public void theCaughtUpCardExplainsItselfAndOffersBothWaysForward() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Context themed = new androidx.appcompat.view.ContextThemeWrapper(context, R.style.Theme_Plax);
            Ui ui = new Ui(themed);
            ImageLoader images = new ImageLoader(themed, 1080);
            try {
                int[] calls = new int[2];
                StoryAdapter adapter = new StoryAdapter(ui, images, new StoryAdapter.Actions() {
                    public void save(Story story) { }
                    public void share(Story story) { }
                    public void source(Story story) { }
                    public void brief(Story story) { }
                    public void check() { calls[0]++; }
                    public void earlier() { calls[1]++; }
                }, 360, 800);
                adapter.submit(List.of(fixture(), Story.caughtUp()), Set.of(), false, true, 3);
                assertEquals(2, adapter.getItemCount());
                assertNotEquals(adapter.getItemViewType(0), adapter.getItemViewType(1));
                var holder = (StoryAdapter.Caught) adapter.onCreateViewHolder(new FrameLayout(themed), adapter.getItemViewType(1));
                adapter.onBindViewHolder(holder, 1);
                ViewGroup card = (ViewGroup) holder.itemView;
                assertNotNull(findAny(card, "You're all caught up"));
                assertNotNull(findAny(card, "Check for new stories"));
                assertEquals("Read 3 earlier stories", holder.earlier.getText().toString());
                assertEquals(View.VISIBLE, holder.earlier.getVisibility());
                findAny(card, "Check for new stories").performClick(); holder.earlier.performClick();
                assertArrayEquals(new int[]{1, 1}, calls);
                adapter.submit(List.of(fixture(), Story.caughtUp()), Set.of(), false, true, 1);
                adapter.onBindViewHolder(holder, 1);
                assertEquals("Read 1 earlier story", holder.earlier.getText().toString());
                adapter.submit(List.of(fixture(), Story.caughtUp()), Set.of(), false, true, 0);
                adapter.onBindViewHolder(holder, 1);
                assertEquals("Nothing to go back to hides the control", View.GONE, holder.earlier.getVisibility());
                adapter.onViewRecycled(holder);
            } finally { images.close(); }
        });
    }

    @Test public void choosingTopicsNeedsAtLeastOneAndReturnsTheKnownOnes() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            InterestsSheet[] sheet = new InterestsSheet[1];
            List<Set<String>> chosen = Collections.synchronizedList(new ArrayList<>());
            scenario.onActivity(activity -> sheet[0] = InterestsSheet.show(activity, new Ui(activity), Set.of(), chosen::add));
            View root = sheet[0].dialog.getWindow().getDecorView();
            assertNotNull(find(root, "Your topics"));
            assertNotNull("Saving needs a choice", find(root, "Pick at least one topic"));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> find(root, "Save topics").performClick());
            assertTrue("Nothing is chosen with no topic picked", chosen.isEmpty());
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                clickAround(find(root, "Science")); clickAround(find(root, "Space")); clickAround(find(root, "History"));
                clickAround(find(root, "History"));
            });
            assertNotNull(find(root, "2 selected"));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> find(root, "Save topics").performClick());
            assertEquals(List.of(Set.of("science", "space")), chosen);
            await("the sheet to close", () -> !sheet[0].isShowing());
        }
    }

    @Test public void forYouWithoutTopicsInvitesAChoiceAndNeedsNoAccount() {
        Set<String> original = Interests.read(context);
        Interests.write(context, List.of());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> clickLabel(activity, "For you"));
            scenario.onActivity(activity -> {
                View root = activity.getWindow().getDecorView();
                assertNotNull(find(root, "Make Plax yours"));
                assertNotNull(find(root, "Choose topics"));
                assertNotNull("An existing account holder can sign in here", find(root, "I have a Plax account"));
                assertNull("Nothing blocks reading", find(root, "Sign in to continue"));
                clickLabel(activity, "Feed");
            });
        } finally { Interests.write(context, original); Prefs.forYou(context, false); }
    }

    private static void clickAround(View view) {
        assertNotNull(view);
        View target = view;
        while (target != null && !target.isClickable()) target = target.getParent() instanceof View parent ? parent : null;
        assertNotNull(target);
        target.performClick();
    }

    @Test public void everyScreenAndLoadingStateRendersWithoutCrashing() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                try {
                    var render = MainActivity.class.getDeclaredMethod("render", FeedViewModel.State.class);
                    render.setAccessible(true);
                    for (String lang : List.of(Language.ENGLISH, Language.HINDI)) {
                        for (FeedViewModel.Screen screen : FeedViewModel.Screen.values()) {
                            render.invoke(activity, state(screen, lang, List.of(), false, R.string.network_error, Set.of()));
                            render.invoke(activity, state(screen, lang, List.of(), true, 0, Set.of()));
                            render.invoke(activity, state(screen, lang, List.of(fixture()), false, 0, Set.of("space", "science")));
                            render.invoke(activity, state(screen, lang, List.of(fixture(), Story.caughtUp()), false, 0, Set.of("art", "books", "math")));
                            render.invoke(activity, state(screen, lang, List.of(Story.caughtUp()), false, R.string.network_error, Set.of()));
                        }
                    }
                } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
            });
        }
    }

    private static FeedViewModel.State state(FeedViewModel.Screen screen, String lang, List<Story> stories,
                                             boolean loading, int error, Set<String> interests) {
        return new FeedViewModel.State(screen, Topic.NEWS, lang, "", stories, Set.of(), loading, false, false, true,
                false, false, error, 0, 0, 0, 2, interests);
    }

    @Test public void briefSheetShowsLoadingThenTheBriefAndSwitchesLanguageWithoutRefetching() {
        FakeBriefs briefs = new FakeBriefs();
        BriefSheet.source = briefs;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            BriefSheet[] sheet = new BriefSheet[1];
            scenario.onActivity(activity -> sheet[0] = BriefSheet.show(activity, new Ui(activity), fixture(), "en"));
            await("the first brief request", () -> briefs.calls.size() == 1);
            assertEquals("en", briefs.calls.get(0).lang());
            assertNotNull("A loading state is visible", findInDialog(sheet[0], "Writing your brief\u2026"));
            briefs.calls.get(0).result().done(new Brief("AI title", "Body with **key** phrase."));
            await("the brief", () -> findInDialog(sheet[0], "Body with key phrase.") != null);
            assertNotNull(findInDialog(sheet[0], "AI title"));

            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> findInDialog(sheet[0], "\u0939\u093f\u0928\u094d\u0926\u0940").performClick());
            await("the Hindi request", () -> briefs.calls.size() == 2);
            assertEquals("hi", briefs.calls.get(1).lang());
            briefs.calls.get(1).result().done(new Brief("\u0936\u0940\u0930\u094d\u0937\u0915", "\u0939\u093f\u0928\u094d\u0926\u0940 \u092a\u093e\u0920"));
            await("the Hindi brief", () -> findInDialog(sheet[0], "\u0939\u093f\u0928\u094d\u0926\u0940 \u092a\u093e\u0920") != null);

            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> findInDialog(sheet[0], "English").performClick());
            await("the cached English brief", () -> findInDialog(sheet[0], "Body with key phrase.") != null);
            assertEquals("Switching back must reuse the written brief", 2, briefs.calls.size());
            InstrumentationRegistry.getInstrumentation().runOnMainSync(sheet[0]::dismiss);
        }
    }

    @Test public void briefFailureOffersRetryAndDismissingCancelsTheRequest() {
        FakeBriefs briefs = new FakeBriefs();
        BriefSheet.source = briefs;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            BriefSheet[] sheet = new BriefSheet[1];
            scenario.onActivity(activity -> sheet[0] = BriefSheet.show(activity, new Ui(activity), fixture(), "en"));
            await("the request", () -> briefs.calls.size() == 1);
            briefs.calls.get(0).result().failed(R.string.brief_error);
            await("the error", () -> findInDialog(sheet[0], context.getString(R.string.brief_error)) != null);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> findInDialog(sheet[0], "Try again").performClick());
            await("the retry", () -> briefs.calls.size() == 2);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(sheet[0]::dismiss);
            await("the abandoned request to be cancelled", () -> briefs.calls.get(1).cancelled().get());
        }
    }

    @Test public void themeChoiceIsRemembered() {
        int original = Prefs.theme(context);
        try {
            Prefs.theme(context, Prefs.DARK);
            assertEquals(Prefs.DARK, Prefs.theme(context));
            Prefs.theme(context, Prefs.LIGHT);
            assertEquals(Prefs.LIGHT, Prefs.theme(context));
            Prefs.theme(context, Prefs.SYSTEM);
            assertEquals(Prefs.SYSTEM, Prefs.theme(context));
        } finally {
            Prefs.theme(context, original);
        }
    }

    @Test public void interfaceStringsAreTranslatedToHindiAndKeepTheirPlaceholders() {
        android.content.res.Configuration hindi = new android.content.res.Configuration(context.getResources().getConfiguration());
        hindi.setLocale(new Locale("hi"));
        android.content.res.Resources localized = context.createConfigurationContext(hindi).getResources();
        int[] translated = {R.string.feed, R.string.topics, R.string.saved, R.string.about_text, R.string.retry,
                R.string.network_error, R.string.topic_news, R.string.brief, R.string.theme_dark, R.string.read_in_hindi,
                R.string.new_stories, R.string.empty_saved, R.string.read_full_story, R.string.brief_note,
                R.string.for_you, R.string.caught_up, R.string.caught_up_detail, R.string.check_new, R.string.no_new_stories,
                R.string.for_you_title, R.string.for_you_detail, R.string.choose_interests, R.string.interests_detail,
                R.string.account_intro, R.string.account_upload_note, R.string.sign_in_google, R.string.account_unavailable};
        for (int id : translated) {
            String name = context.getResources().getResourceEntryName(id);
            assertNotEquals("Missing Hindi translation for " + name, context.getString(id), localized.getString(id));
        }
        assertEquals("\u0935\u093f\u0937\u092f", localized.getString(R.string.topics));
        assertEquals("5 \u092e\u093f\u0928\u091f \u092a\u0939\u0932\u0947", localized.getString(R.string.minutes_ago, 5));
        assertEquals("5 min ago", context.getString(R.string.minutes_ago, 5));
        assertTrue(localized.getQuantityString(R.plurals.read_earlier, 3, 3).contains("3"));
        assertNotEquals(context.getResources().getQuantityString(R.plurals.read_earlier, 3, 3),
                localized.getQuantityString(R.plurals.read_earlier, 3, 3));
        assertTrue("The version placeholder survives translation", localized.getString(R.string.about_text, "9.9.9").contains("9.9.9"));
        assertTrue(context.getString(R.string.about_text, "9.9.9").contains("9.9.9"));
    }

    private static void await(String what, BooleanSupplier condition) {
        long deadline = SystemClock.uptimeMillis() + 5000;
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            if (condition.getAsBoolean()) return;
            SystemClock.sleep(10);
        }
        fail("Timed out waiting for: " + what);
    }

    private static View findInDialog(BriefSheet sheet, String text) {
        return find(sheet.dialog.getWindow().getDecorView(), text);
    }

    private static View find(View view, String text) {
        if (view instanceof TextView label && text.contentEquals(label.getText()) && view.isShown()) return view;
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) {
            View found = find(group.getChildAt(index), text); if (found != null) return found;
        }
        return null;
    }

    /** Like {@link #find} but for a view that is not attached to a window, so it can never count as shown. */
    private static View findAny(View view, String text) {
        if (view instanceof TextView label && text.contentEquals(label.getText())) return view;
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) {
            View found = findAny(group.getChildAt(index), text); if (found != null) return found;
        }
        return null;
    }

    private static void clickLabel(MainActivity activity, String text) {
        View found = find(activity.getWindow().getDecorView(), text);
        assertNotNull("Missing native control: " + text, found);
        View target = found;
        while (target != null && !target.isClickable()) target = target.getParent() instanceof View parent ? parent : null;
        assertNotNull("Nothing clickable around: " + text, target);
        assertTrue(target.performClick());
    }
}
