package com.plaxlabs.news;

import android.app.Application;
import android.os.SystemClock;
import androidx.lifecycle.ViewModelProvider;
import androidx.lifecycle.ViewModelStore;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** The cache-first, never-repeat behaviour of the feed, driven with a controllable network. */
@RunWith(AndroidJUnit4.class)
public class FeedFlowTest {
    private static final class FakeSource implements FeedSource {
        record Call(String categories, String lang, List<String> excluded, boolean refresh, Result result, AtomicBoolean cancelled) { }
        final List<Call> calls = Collections.synchronizedList(new ArrayList<>());

        @Override public Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result) {
            AtomicBoolean cancelled = new AtomicBoolean();
            calls.add(new Call(categories, lang, List.copyOf(excluded), refresh, result, cancelled));
            return () -> cancelled.set(true);
        }
        Call last() { return calls.get(calls.size() - 1); }
        Call call(int index) { return calls.get(index); }
    }

    private static final long HOUR = 3_600_000, PUBLISHED = 1_780_000_000_000L;

    private Application app;
    private File cacheDir, seenDir;
    private FakeSource source;
    private ViewModelStore store;
    private FeedViewModel model;
    private final AtomicLong clock = new AtomicLong();

    @Before public void controllableNetworkAndIsolatedStorage() {
        app = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", app.getPackageName());
        cacheDir = new File(app.getCacheDir(), "flow-" + UUID.randomUUID());
        seenDir = new File(app.getCacheDir(), "seen-" + UUID.randomUUID());
        assertTrue(cacheDir.mkdirs()); assertTrue(seenDir.mkdirs());
        source = new FakeSource();
        clock.set(System.currentTimeMillis());
        FeedViewModel.sources = () -> source;
        FeedViewModel.caches = base -> new FeedCache(cacheDir);
        FeedViewModel.histories = base -> new SeenFile(seenDir);
        FeedViewModel.clock = clock::get;
        // Nothing counts as read unless a test lowers these, so stories never vanish by accident.
        FeedViewModel.dwellMs = 600_000; FeedViewModel.glanceMs = 600_000;
        Interests.write(app, Set.of()); Prefs.forYou(app, false);
    }

    @After public void restoreProductionWiring() {
        FeedViewModel.sources = FeedApi::new;
        FeedViewModel.caches = FeedCache::new;
        FeedViewModel.histories = SeenFile::new;
        FeedViewModel.clock = System::currentTimeMillis;
        FeedViewModel.dwellMs = 1200; FeedViewModel.glanceMs = 500;
        if (store != null) InstrumentationRegistry.getInstrumentation().runOnMainSync(store::clear);
        Interests.write(app, Set.of()); Prefs.forYou(app, false);
        delete(cacheDir); delete(seenDir);
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }

    private static Story story(String id) { return story(id, "Headline " + id, PUBLISHED); }

    private static Story story(String id, String title, long published) {
        return new Story(id, title, "A short body for " + id + " with enough words.", "news", "", "Publisher",
                "https://example.com/" + id, "", "1 min", published);
    }

    private static List<Story> stories(String prefix, int count) {
        List<Story> list = new ArrayList<>();
        for (int index = 1; index <= count; index++) list.add(story(prefix + index));
        return list;
    }

    private static List<String> ids(List<Story> stories) {
        List<String> ids = new ArrayList<>();
        for (Story story : stories) ids.add(story.id());
        return ids;
    }

    private void create() {
        store = new ViewModelStore();
        AtomicReference<FeedViewModel> created = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> created.set(new ViewModelProvider(store,
                ViewModelProvider.AndroidViewModelFactory.getInstance(app)).get(FeedViewModel.class)));
        model = created.get();
    }

    /** Ends the model the way leaving the app for good does, then starts a new one on the same storage. */
    private void relaunch() {
        onMain(model::background);
        onMain(store::clear);
        source = new FakeSource();
        create();
    }

    private void onMain(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }

    private static void await(String what, BooleanSupplier condition) {
        long deadline = SystemClock.uptimeMillis() + 5000;
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            if (condition.getAsBoolean()) return;
            SystemClock.sleep(10);
        }
        fail("Timed out waiting for: " + what);
    }

    private FeedViewModel.State state() { return model.current(); }

    private List<Story> real() {
        List<Story> list = new ArrayList<>();
        for (Story story : state().stories()) if (!story.isCaughtUp()) list.add(story);
        return list;
    }

    private void loadFirstPage(List<Story> stories) {
        await("the first request", () -> !source.calls.isEmpty());
        source.last().result().loaded(stories);
        await("stories shown", () -> real().size() == stories.size() && !state().loading());
    }

    private void writeCache(Topic topic, String lang, List<Story> stories) {
        try { new FeedCache(cacheDir).write(FeedCache.key(topic, lang), stories); }
        catch (IOException failure) { throw new AssertionError(failure); }
    }

    private void writeSeen(Story... stories) {
        try {
            SeenStore seen = new SeenStore();
            for (Story story : stories) seen.mark(story, clock.get());
            new SeenFile(seenDir).write(seen);
        } catch (IOException failure) { throw new AssertionError(failure); }
    }

    private SeenStore readSeen() {
        try { return new SeenFile(seenDir).read(clock.get()); }
        catch (IOException failure) { throw new AssertionError(failure); }
    }

    @Test public void cachedStoriesAreDrawnBeforeTheNetworkAnswers() {
        writeCache(Topic.NEWS, "en", stories("c", 3));
        create();
        await("cached stories", () -> state().stories().size() == 3);
        assertEquals(List.of("c1", "c2", "c3"), ids(state().stories()));
        assertTrue("The network request must be running in the background", state().loading());
        assertTrue(state().refreshing());
        assertFalse(state().fresh());
        assertTrue(model.ready());
        assertEquals(1, source.calls.size());
        assertEquals("news", source.call(0).categories());
    }

    @Test public void freshStoriesLeadAndUnreadCachedOnesFollowWhenTheReaderHasNotMoved() {
        writeCache(Topic.NEWS, "en", stories("c", 3));
        create();
        await("cached stories", () -> state().stories().size() == 3);
        source.last().result().loaded(stories("f", 2));
        await("fresh stories", () -> ids(state().stories()).equals(List.of("f1", "f2", "c1", "c2", "c3")));
        assertFalse(state().loading()); assertFalse(state().fresh()); assertEquals(0, state().position());
    }

    @Test public void aReaderWhoMovedOnIsOfferedFreshStoriesInsteadOfASwap() {
        writeCache(Topic.NEWS, "en", stories("c", 3));
        create();
        await("cached stories", () -> state().stories().size() == 3);
        onMain(() -> model.position(1));
        source.last().result().loaded(stories("f", 2));
        await("the new-stories offer", () -> state().fresh());
        assertEquals(List.of("c1", "c2", "c3"), ids(state().stories()));
        onMain(model::applyFresh);
        assertEquals(List.of("f1", "f2", "c1", "c2", "c3"), ids(state().stories()));
        assertFalse(state().fresh()); assertEquals(0, state().position());
    }

    @Test public void aRefreshThatFindsNothingNewDoesNotInterruptTheReader() {
        writeCache(Topic.NEWS, "en", stories("c", 3));
        create();
        await("cached stories", () -> state().stories().size() == 3);
        onMain(() -> model.position(1));
        source.last().result().loaded(stories("c", 3));
        await("the refresh to finish", () -> !state().loading());
        assertFalse("Identical stories must not trigger a new-stories offer", state().fresh());
        assertEquals(List.of("c1", "c2", "c3"), ids(state().stories())); assertEquals(1, state().position());
    }

    @Test public void offlineKeepsCachedStoriesAndExplainsWhy() {
        writeCache(Topic.NEWS, "en", stories("c", 3));
        create();
        await("cached stories", () -> state().stories().size() == 3);
        source.last().result().failed(R.string.network_error);
        await("the error", () -> state().feedError() == R.string.network_error);
        assertEquals(3, state().stories().size()); assertFalse(state().loading()); assertFalse(state().refreshing());
    }

    @Test public void firstRunShowsLoadingThenStoriesAndCachesThePageAsItCame() {
        create();
        await("the first screen to be decided", () -> model.ready());
        assertTrue(state().stories().isEmpty()); assertTrue(state().loading()); assertEquals(0, state().feedError());
        source.last().result().loaded(stories("n", 2));
        await("stories", () -> state().stories().size() == 2);
        await("the cache file", () -> new FeedCache(cacheDir).read(FeedCache.key(Topic.NEWS, "en")) != null);
        assertEquals(List.of("n1", "n2"), ids(new FeedCache(cacheDir).read(FeedCache.key(Topic.NEWS, "en")).stories()));
    }

    @Test public void anExpiredCacheIsNotShownAsCurrentNews() {
        writeCache(Topic.NEWS, "en", stories("old", 3));
        clock.addAndGet(3 * HOUR);
        create();
        await("the first screen to be decided", () -> model.ready());
        assertTrue(state().stories().isEmpty()); assertTrue(state().loading());
    }

    @Test public void revisitingATopicIsInstantAndKeepsTheReadersPlace() {
        create();
        loadFirstPage(stories("n", 12));
        onMain(() -> model.position(4));
        onMain(() -> model.topic(Topic.SCIENCE));
        assertEquals(Topic.SCIENCE, state().topic()); assertTrue(state().stories().isEmpty()); assertTrue(state().loading());
        assertEquals("science", source.last().categories());
        source.last().result().loaded(stories("s", 2));
        await("science stories", () -> state().stories().size() == 2);
        onMain(() -> model.topic(Topic.NEWS));
        assertEquals(12, state().stories().size()); assertEquals(4, state().position()); assertFalse(state().loading());
        assertEquals("Returning to a fresh topic must not hit the network again", 2, source.calls.size());
    }

    @Test public void nearingTheEndOfTheFeedLoadsMoreWithoutAskingTheReader() {
        create();
        loadFirstPage(stories("n", 12));
        onMain(() -> model.position(7));
        assertEquals("Four or more stories from the end nothing is requested yet", 1, source.calls.size());
        onMain(() -> model.position(8));
        assertEquals("Within four stories of the end the next page is requested", 2, source.calls.size());
        assertEquals(12, source.last().excluded().size());
        source.last().result().loaded(stories("m", 5));
        await("the next page", () -> state().stories().size() == 17);
        assertEquals(8, state().position());
    }

    @Test public void leavingTheFeedAndComingBackKeepsThePosition() {
        create();
        loadFirstPage(stories("n", 12));
        onMain(() -> model.position(3));
        onMain(() -> model.screen(FeedViewModel.Screen.TOPICS));
        onMain(() -> model.screen(FeedViewModel.Screen.FEED));
        assertEquals(3, state().position());
    }

    @Test public void staleAnswersCannotReplaceANewlySelectedTopic() {
        create();
        await("the first request", () -> !source.calls.isEmpty());
        FakeSource.Call newsCall = source.call(0);
        onMain(() -> model.topic(Topic.SCIENCE));
        assertTrue("The abandoned request is cancelled", newsCall.cancelled().get());
        newsCall.result().loaded(stories("late", 3));
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        assertTrue(state().stories().isEmpty()); assertEquals(Topic.SCIENCE, state().topic());
        source.last().result().loaded(stories("s", 2));
        await("science stories", () -> ids(state().stories()).equals(List.of("s1", "s2")));
    }

    @Test public void languageSwitchLoadsThatLanguagesFeedAndRemembersTheOther() {
        create();
        loadFirstPage(stories("en", 4));
        onMain(() -> model.language(Language.HINDI));
        assertEquals(Language.HINDI, source.last().lang()); assertTrue(state().stories().isEmpty());
        source.last().result().loaded(stories("hi", 3));
        await("Hindi stories", () -> state().stories().size() == 3);
        onMain(() -> model.language(Language.ENGLISH));
        assertEquals(List.of("en1", "en2", "en3", "en4"), ids(state().stories()));
        assertEquals(2, source.calls.size());
    }

    @Test public void refreshPutsNewStoriesFirstAndStartsAtTheTop() {
        create();
        loadFirstPage(stories("n", 12));
        onMain(() -> model.position(4));
        onMain(model::refresh);
        assertTrue(source.last().refresh()); assertTrue(state().refreshing()); assertEquals(12, state().stories().size());
        source.last().result().loaded(stories("r", 3));
        await("refreshed stories", () -> ids(state().stories()).subList(0, 3).equals(List.of("r1", "r2", "r3")));
        assertEquals("Stories not yet read stay available after the new ones", 15, state().stories().size());
        assertEquals(0, state().position()); assertFalse(state().refreshing());
    }

    @Test public void aRefreshWithNothingNewSaysSoAndLeavesTheListAlone() {
        create();
        loadFirstPage(stories("n", 4));
        onMain(() -> model.position(2));
        onMain(model::refresh);
        source.last().result().loaded(stories("n", 4));
        await("the refresh to finish", () -> !state().loading());
        assertEquals(R.string.no_new_stories, state().notice());
        assertEquals(List.of("n1", "n2", "n3", "n4"), ids(state().stories())); assertEquals(2, state().position());
    }

    @Test public void paginationExcludesShownStoriesAndEndsWithTheCaughtUpCard() {
        create();
        loadFirstPage(stories("n", 6));
        onMain(model::more);
        assertEquals(List.of("n1", "n2", "n3", "n4", "n5", "n6"), source.last().excluded());
        source.last().result().loaded(stories("m", 2));
        await("more stories", () -> state().stories().size() == 8);
        onMain(model::more);
        source.last().result().loaded(List.of());
        await("the end of the feed", () -> state().exhausted() && !state().loading());
        assertEquals(9, state().stories().size());
        assertTrue("The caught-up card closes the list", state().stories().get(8).isCaughtUp());
        assertEquals(8, real().size()); assertEquals(0, state().earlier());
    }

    @Test public void failuresCanBeRetried() {
        create();
        await("the first request", () -> !source.calls.isEmpty());
        source.last().result().failed(R.string.service_error);
        await("the error", () -> state().feedError() == R.string.service_error);
        onMain(model::retry);
        assertEquals(2, source.calls.size()); assertEquals(0, state().feedError()); assertTrue(state().loading());
        source.last().result().loaded(stories("n", 2));
        await("stories", () -> state().stories().size() == 2);
    }

    @Test public void sectionFilterShowsOnlyThatSectionWithoutChangingTheFeed() {
        create();
        List<Story> page = new ArrayList<>();
        for (String section : List.of("india", "world", "india")) {
            page.add(new Story("s" + page.size(), "Headline s" + page.size(), "Body text for the story.", "news", section,
                    "Publisher", "https://example.com/s", "", "1 min", PUBLISHED));
        }
        loadFirstPage(page);
        onMain(() -> model.section("india"));
        assertEquals(List.of("s0", "s2"), ids(state().stories()));
        onMain(() -> model.section("tech"));
        assertTrue(state().stories().isEmpty());
        onMain(() -> model.section(""));
        assertEquals(3, state().stories().size());
    }

    @Test public void storiesTheReaderLookedAtDoNotComeBackOnTheNextLaunch() {
        FeedViewModel.dwellMs = 40; FeedViewModel.glanceMs = 20;
        create();
        loadFirstPage(stories("n", 6));
        SystemClock.sleep(200);
        onMain(() -> model.position(1));
        SystemClock.sleep(200);
        onMain(model::background);
        await("the history to be written", () -> readSeen().contains(story("n1"), clock.get())
                && readSeen().contains(story("n2"), clock.get()));
        relaunch();
        await("the remaining stories", () -> real().size() == 4);
        assertEquals(List.of("n3", "n4", "n5", "n6"), ids(real()));
        assertEquals("The two read stories are withheld, not lost", 2, state().earlier());
    }

    @Test public void aStoryOnlyGlancedAtIsStillNew() {
        FeedViewModel.dwellMs = 400; FeedViewModel.glanceMs = 300;
        create();
        loadFirstPage(stories("n", 12));
        onMain(() -> { model.position(1); model.position(2); model.position(3); });
        SystemClock.sleep(700);
        onMain(model::background);
        await("the story left on screen to be written", () -> readSeen().contains(story("n4"), clock.get()));
        SeenStore seen = readSeen();
        assertFalse("A story flicked past in an instant is not read", seen.contains(story("n2"), clock.get()));
        assertFalse(seen.contains(story("n3"), clock.get()));
    }

    @Test public void aFeedReadEntirelyShowsTheCaughtUpCardInsteadOfRepeating() {
        List<Story> page = stories("n", 3);
        writeCache(Topic.NEWS, "en", page);
        writeSeen(page.toArray(new Story[0]));
        create();
        await("the first screen to be decided", () -> model.ready());
        assertTrue("Everything cached was read, so none of it is drawn", real().isEmpty());
        assertTrue(state().loading());
        await("the request", () -> !source.calls.isEmpty());
        source.last().result().loaded(page);
        await("the search for older stories", () -> source.calls.size() == 2);
        assertTrue("Older stories are asked for without the ones already read", source.last().excluded().containsAll(List.of("n1", "n2", "n3")));
        source.last().result().loaded(List.of());
        await("the caught-up card", () -> state().stories().size() == 1 && state().stories().get(0).isCaughtUp() && !state().loading());
        assertEquals(3, state().earlier()); assertTrue(state().exhausted());
    }

    @Test public void oldStoriesFurtherDownTheServersListAreFoundWhenThePageIsAllRead() {
        List<Story> page = stories("n", 3);
        writeSeen(page.toArray(new Story[0]));
        create();
        await("the request", () -> !source.calls.isEmpty());
        source.last().result().loaded(page);
        await("the second request", () -> source.calls.size() == 2);
        source.last().result().loaded(stories("older", 2));
        await("older unread stories", () -> ids(real()).equals(List.of("older1", "older2")) && !state().loading());
        assertEquals(3, state().earlier()); assertFalse(state().exhausted());
    }

    @Test public void anotherOutletsVersionOfAReadStoryIsNotShownAgain() {
        Story read = story("a", "Lena Okafor wins Nobel Peace Prize", PUBLISHED);
        writeSeen(read);
        create();
        await("the request", () -> !source.calls.isEmpty());
        Story sameEvent = story("b", "South African human rights lawyer Lena Okafor wins the Nobel Peace Prize", PUBLISHED + HOUR);
        Story other = story("c", "Glacier survey finds Himalayan ice melting faster than models predicted", PUBLISHED + HOUR);
        source.last().result().loaded(List.of(sameEvent, other));
        await("the new story", () -> ids(real()).equals(List.of("c")));
        assertEquals(1, state().earlier());
    }

    @Test public void earlierStoriesCanBeReadAgainAfterTheCaughtUpCard() {
        List<Story> page = new ArrayList<>(List.of(
                story("old", "Harbour bridge reopens after three year repair programme", PUBLISHED),
                story("newer", "Council approves riverside housing development despite objections", PUBLISHED + HOUR)));
        writeSeen(page.toArray(new Story[0]));
        create();
        await("the request", () -> !source.calls.isEmpty());
        source.last().result().loaded(page);
        await("the search for older stories", () -> source.calls.size() == 2);
        source.last().result().loaded(List.of());
        await("the caught-up card", () -> state().stories().size() == 1 && !state().loading());
        onMain(model::revealEarlier);
        assertEquals(List.of("__caught_up__", "newer", "old"), ids(state().stories()));
        assertEquals("The reader lands on the first earlier story", 1, state().position());
        assertEquals(0, state().earlier());
    }

    @Test public void offlineWithOnlyReadStoriesStillShowsTheCaughtUpCardAndTheReason() {
        List<Story> page = stories("n", 3);
        writeCache(Topic.NEWS, "en", page);
        writeSeen(page.toArray(new Story[0]));
        create();
        await("the request", () -> !source.calls.isEmpty());
        await("the cache to be read", () -> state().earlier() == 3);
        source.last().result().failed(R.string.network_error);
        await("the error", () -> state().feedError() == R.string.network_error);
        assertEquals(1, state().stories().size()); assertTrue(state().stories().get(0).isCaughtUp());
    }

    @Test public void aDamagedHistoryNeverBlocksTheFeed() throws Exception {
        try (java.io.FileOutputStream broken = new java.io.FileOutputStream(new File(seenDir, "seen-stories.json"))) {
            broken.write("not json".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        create();
        loadFirstPage(stories("n", 3));
        assertEquals(3, real().size());
    }

    @Test public void leavingForAWhileStartsFromTheNewestStories() {
        create();
        loadFirstPage(stories("n", 12));
        onMain(() -> model.position(3));
        onMain(model::background);
        clock.addAndGet(31 * 60_000);
        onMain(model::foreground);
        assertEquals("A new visit starts at the top", 0, state().position());
        await("a new request", () -> source.calls.size() == 2);
        assertEquals("Reopening asks for the first page, not the next one", List.of(), source.last().excluded());
    }

    @Test public void aShortBreakKeepsThePlaceAndAMediumOneChecksQuietlyForNewStories() {
        create();
        loadFirstPage(stories("n", 12));
        onMain(() -> model.position(3));
        onMain(model::background);
        clock.addAndGet(60_000);
        onMain(model::foreground);
        assertEquals("No request within two minutes", 1, source.calls.size());
        assertEquals(12, state().stories().size());
        onMain(model::background);
        clock.addAndGet(5 * 60_000);
        onMain(model::foreground);
        await("a quiet check", () -> source.calls.size() == 2);
        assertEquals("The reader keeps their place while the check runs", 3, state().position());
        assertEquals(12, state().stories().size());
    }

    @Test public void forYouAsksForAllChosenTopicsAtOnceAndNeverForcesALiveRefresh() {
        Interests.write(app, Set.of("space", "science"));
        Prefs.forYou(app, true);
        create();
        await("the request", () -> !source.calls.isEmpty());
        assertEquals(FeedViewModel.Screen.FOR_YOU, state().screen());
        assertEquals("science,space", source.call(0).categories());
        source.last().result().loaded(stories("y", 3));
        await("stories", () -> state().stories().size() == 3);
        onMain(model::refresh);
        assertEquals("science,space", source.last().categories());
        assertFalse("A mixed feed must not ask the server for a slow live refresh", source.last().refresh());
    }

    @Test public void forYouWithoutTopicsMakesNoRequestUntilTheReaderChoosesSome() {
        create();
        loadFirstPage(stories("n", 2));
        onMain(() -> model.screen(FeedViewModel.Screen.FOR_YOU));
        assertTrue(state().interests().isEmpty()); assertTrue(state().stories().isEmpty()); assertFalse(state().loading());
        assertEquals(1, source.calls.size());
        onMain(() -> model.interests(List.of("history", "bogus")));
        assertEquals(Set.of("history"), state().interests());
        assertEquals(Set.of("history"), Interests.read(app));
        assertEquals("history", source.last().categories());
        assertTrue(state().loading());
        source.last().result().loaded(stories("h", 2));
        await("For you stories", () -> ids(state().stories()).equals(List.of("h1", "h2")));
        onMain(model::refresh);
        assertTrue("One topic may use a live refresh", source.last().refresh());
    }

    @Test public void theChosenFeedIsRememberedForTheNextLaunch() {
        Interests.write(app, Set.of("space"));
        create();
        onMain(() -> model.screen(FeedViewModel.Screen.FOR_YOU));
        assertTrue(Prefs.forYou(app));
        onMain(() -> model.screen(FeedViewModel.Screen.FEED));
        assertFalse(Prefs.forYou(app));
    }

    @Test public void seenStoriesCarryAcrossTopicsAndTheForYouFeed() {
        FeedViewModel.dwellMs = 40; FeedViewModel.glanceMs = 20;
        Interests.write(app, Set.of("science"));
        create();
        Story shared = story("shared", "Glacier survey finds Himalayan ice melting faster than models predicted", PUBLISHED);
        loadFirstPage(List.of(shared, story("other", "Council approves riverside housing development despite objections", PUBLISHED)));
        SystemClock.sleep(200);
        onMain(() -> model.screen(FeedViewModel.Screen.FOR_YOU));
        await("the For you request", () -> source.calls.size() == 2);
        source.last().result().loaded(List.of(
                story("again", "Himalayan glacier survey finds ice melting faster than models predicted", PUBLISHED + HOUR),
                story("fresh", "Central bank holds interest rates steady citing inflation worries", PUBLISHED + HOUR)));
        await("only the unread story", () -> ids(real()).equals(List.of("fresh")));
    }
}
