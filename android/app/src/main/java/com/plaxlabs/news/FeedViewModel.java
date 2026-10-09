package com.plaxlabs.news;

import android.app.Application;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.lifecycle.AndroidViewModel;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import java.io.File;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Function;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * Single source of truth for the screen. Stories are drawn from memory or the on-device cache first and
 * refreshed in the background, so a topic or language the reader has seen is never a spinner. Stories the
 * reader has already looked at are withheld, so opening the app again shows what is new, not a replay.
 */
public final class FeedViewModel extends AndroidViewModel {
    enum Screen { FEED, FOR_YOU, TOPICS, SAVED }

    /**
     * @param stories what the pager shows; in a feed it ends with the caught-up card when there is nothing newer
     * @param earlier seen stories withheld until the reader asks for them
     */
    record State(Screen screen, Topic topic, String lang, String section, List<Story> stories, Set<String> savedIds,
                 boolean loading, boolean refreshing, boolean saving, boolean storageReady, boolean exhausted,
                 boolean fresh, int feedError, int storageError, int notice, int position,
                 int earlier, Set<String> interests) { }

    /** Where a signed-in account meets the feed: local changes go out, and what the account holds comes in. */
    interface Cloud {
        void saved(Story story, boolean added);
        void interests(Set<String> topics);
        /** Receives cloud data until replaced; null stops delivery. */
        void listen(Sink sink);

        Cloud NONE = new Cloud() {
            @Override public void saved(Story story, boolean added) { }
            @Override public void interests(Set<String> topics) { }
            @Override public void listen(Sink sink) { }
        };
    }

    interface Sink {
        void cloudInterests(Set<String> topics);
        void cloudSaved(List<Story> stories);
    }

    private enum Kind { REPLACE, REVALIDATE, MORE }

    /** Replaceable in tests. */
    static Supplier<FeedSource> sources = FeedApi::new;
    static Function<File, FeedCache> caches = FeedCache::new;
    static Function<File, SeenFile> histories = SeenFile::new;
    static Function<Application, Cloud> clouds = application -> Cloud.NONE;
    static LongSupplier clock = System::currentTimeMillis;
    /** How long a story is on screen before it counts as read, and the shortest glance that still counts when leaving. */
    static long dwellMs = 1200, glanceMs = 500;

    static final long SWAP_WINDOW_MS = 1500;
    static final long REVISIT_AFTER_MS = 2 * 60_000;
    /** Away this long, the app starts over from the newest stories instead of resuming where the reader stopped. */
    static final long NEW_SESSION_AFTER_MS = 30 * 60_000;
    static final int STORY_LIMIT = 180, MORE_ATTEMPTS = 3, EXCLUDE_LIMIT = 200;
    private static final long NEWS_CACHE_MS = 2L * 3_600_000, EVERGREEN_CACHE_MS = 7L * 24 * 3_600_000;
    private static final long SEEN_FLUSH_MS = 3000;

    private static final class Session {
        final String key, categories, lang;
        /** A single topic can ask the server for a live refresh; a personalised mix cannot. */
        final boolean single, news;
        List<Story> stories = List.of(), earlier = List.of(), revealed = List.of();
        /** A fresher page the reader was told about and has not taken yet. */
        List<Story> pending;
        final Map<String, Integer> positions = new HashMap<>();
        boolean exhausted, networkDone;
        long loadedAt, shownAt;

        Session(String key, String categories, String lang) {
            this.key = key; this.categories = categories; this.lang = lang;
            single = !categories.isEmpty() && !categories.contains(",");
            news = Arrays.asList(categories.split(",")).contains("news");
        }

        long cacheLimit() { return news ? NEWS_CACHE_MS : EVERGREEN_CACHE_MS; }

        List<Story> withheld() {
            if (revealed.isEmpty()) return earlier;
            List<Story> all = new ArrayList<>(earlier);
            all.addAll(revealed);
            return all;
        }

        List<Story> shown(String section) {
            if (section.isEmpty()) return stories;
            List<Story> filtered = new ArrayList<>();
            for (Story story : stories) if (section.equals(story.section())) filtered.add(story);
            return filtered;
        }

        List<Story> items(String section, boolean marker) {
            List<Story> shown = shown(section);
            if (!marker) return shown;
            List<Story> all = new ArrayList<>(shown.size() + revealed.size() + 1);
            all.addAll(shown); all.add(Story.caughtUp()); all.addAll(revealed);
            return all;
        }
    }

    private final MutableLiveData<State> state = new MutableLiveData<>();
    private final FeedSource source = sources.get();
    private final FeedCache cache;
    private final SeenFile history;
    private final SavedStories storage;
    private final Cloud cloud;
    private final ExecutorService disk = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "plax-disk"); thread.setDaemon(true); return thread;
    });
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Session> sessions = new LinkedHashMap<>(8, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Session> eldest) { return size() > 8; }
    };
    private volatile SeenStore seen = new SeenStore();
    private boolean seenDirty;               // touched only on the disk thread
    private Session session;
    private List<Story> saved = List.of(), remoteSaved;
    private Set<String> interests;
    private Screen screen, feed;
    private Topic topic = Topic.NEWS;
    private String lang, section = "";
    private boolean loading, replacing, saving, storageReady, closed, ready, lastForced, foreground = true, flushQueued;
    private Kind kind = Kind.REPLACE;
    private int feedError, storageError, notice, position, savedPosition, generation;
    private long awaySince;
    private Story viewing;
    private long viewingSince;
    private Cancelable request;
    private final Runnable dwell = () -> { if (this.viewing != null) markSeen(this.viewing); };

    public FeedViewModel(@NonNull Application application) {
        super(application);
        cache = caches.apply(application.getCacheDir());
        history = histories.apply(application.getFilesDir());
        storage = new SavedStories(application.getFilesDir());
        cloud = clouds.apply(application);
        lang = Language.current();
        interests = Interests.read(application);
        feed = Prefs.forYou(application) && !interests.isEmpty() ? Screen.FOR_YOU : Screen.FEED;
        screen = feed;
        session = feedSession();
        cloud.listen(new Sink() {
            @Override public void cloudInterests(Set<String> topics) { main.post(() -> { if (!closed) setInterests(topics, false); }); }
            @Override public void cloudSaved(List<Story> stories) { main.post(() -> { if (!closed) mergeSaved(stories); }); }
        });
        // The history is read before the cache so the first page is already filtered when it is drawn.
        io(this::loadHistory);
        open();
        io(this::loadSaved);
    }

    LiveData<State> state() { return state; }
    State current() { return state.getValue(); }
    /** True once the first screen is decided: cached stories are drawn, or the cache and network have answered. */
    boolean ready() { return ready; }
    long now() { return clock.getAsLong(); }

    private void io(Runnable task) {
        try { disk.execute(task); } catch (RejectedExecutionException closing) { /* the model is going away */ }
    }

    private void loadHistory() {
        try { seen = history.read(now()); }
        catch (IOException | RuntimeException damaged) { history.delete(); seen = new SeenStore(); }
    }

    private void loadSaved() {
        try {
            List<Story> loaded = storage.read();
            main.post(() -> {
                if (closed) return;
                saved = loaded; storageReady = true;
                List<Story> waiting = remoteSaved;
                remoteSaved = null;
                if (waiting != null) mergeSaved(waiting); else publish();
            });
        } catch (IOException failure) {
            main.post(() -> { if (!closed) { storageError = R.string.storage_error; publish(); } });
        }
    }

    private boolean feeding() { return screen == Screen.FEED || screen == Screen.FOR_YOU; }

    private Session feedSession() { return feed == Screen.FOR_YOU ? forYouSession() : topicSession(); }

    private Session topicSession() {
        return sessions.computeIfAbsent(topic.id + ":" + lang, key -> new Session(FeedCache.key(topic, lang), topic.id, lang));
    }

    private Session forYouSession() {
        String categories = Interests.categories(interests);
        return sessions.computeIfAbsent("foryou:" + lang + ":" + categories,
                key -> new Session(FeedCache.key(categories.isEmpty() ? "none" : categories, lang), categories, lang));
    }

    void screen(Screen destination) {
        if (screen == destination) return;
        savePosition(); leave();
        screen = destination; notice = 0;
        if (destination == Screen.FEED || destination == Screen.FOR_YOU) {
            feed = destination;
            Prefs.forYou(getApplication(), destination == Screen.FOR_YOU);
            Session next = feedSession();
            if (next != session || next.stories.isEmpty() && !loading) { session = next; open(); }
            else { restorePosition(); publish(); }
        } else { restorePosition(); publish(); }
        track();
    }

    void topic(Topic selected) {
        savePosition(); leave();
        screen = Screen.FEED; feed = Screen.FEED;
        Prefs.forYou(getApplication(), false);
        if (topic != selected) { topic = selected; section = ""; }
        Session next = topicSession();
        if (next != session) { session = next; open(); }
        else { restorePosition(); publish(); }
        track();
    }

    void language(String selected) {
        if (selected.equals(lang)) return;
        savePosition(); leave(); lang = selected; section = ""; session = feedSession(); open();
    }

    void section(String selected) {
        if (!Set.of("", "india", "world", "tech", "business", "science").contains(selected))
            throw new IllegalArgumentException("Unknown news section");
        savePosition(); section = selected; restorePosition(); notice = 0; publish(); track();
    }

    /** Looks for newer stories and puts them first. A reader who is up to date is told so. */
    void refresh() {
        if (closed || session.categories.isEmpty()) return;
        if (!feeding()) { screen = feed; restorePosition(); }
        begin(Kind.REPLACE, true);
    }

    void retry() {
        if (closed || session.categories.isEmpty()) return;
        if (kind == Kind.MORE && !session.stories.isEmpty()) more();
        else begin(session.stories.isEmpty() ? Kind.REPLACE : Kind.REVALIDATE, lastForced);
    }

    /** Takes the reader's choice of topics for For you. */
    void interests(Collection<String> selected) { setInterests(Interests.sanitize(selected), true); }

    private void setInterests(Set<String> clean, boolean push) {
        if (clean.equals(interests)) return;
        interests = clean;
        Interests.write(getApplication(), clean);
        if (push) cloud.interests(clean);
        if (feed == Screen.FOR_YOU) {
            savePosition(); leave();
            session = forYouSession();
            open();
            track();
        } else publish();
    }

    void more() {
        if (closed || loading || session.exhausted || !feeding() || session.categories.isEmpty()) return;
        fetchMore(session, 0);
    }

    private void fetchMore(Session target, int attempt) {
        if (closed) return;
        cancelRequest();
        int expected = ++generation;
        loading = true; replacing = false; feedError = 0; kind = Kind.MORE;
        if (attempt == 0) publish();
        request = source.load(target.categories, target.lang, excluded(target), false, new FeedSource.Result() {
            @Override public void loaded(List<Story> page) {
                main.post(() -> { if (!closed && expected == generation) mergeMore(target, page, attempt, expected); });
            }
            @Override public void failed(int message) {
                main.post(() -> {
                    if (closed || expected != generation) return;
                    loading = false; feedError = message; publish();
                });
            }
        });
    }

    /** What the server should leave out: everything already shown or withheld, then the latest seen. */
    private List<String> excluded(Session target) {
        Set<String> ids = new LinkedHashSet<>();
        for (Story story : target.stories) ids.add(story.id());
        for (Story story : target.earlier) ids.add(story.id());
        for (Story story : target.revealed) ids.add(story.id());
        ids.addAll(seen.recentIds(EXCLUDE_LIMIT));
        List<String> list = new ArrayList<>(ids);
        return list.size() > EXCLUDE_LIMIT ? list.subList(0, EXCLUDE_LIMIT) : list;
    }

    private void mergeMore(Session target, List<Story> page, int attempt, int expected) {
        List<Story> shownNow = target.stories, withheld = target.withheld();
        io(() -> {
            FeedMerge.Result merged = FeedMerge.append(shownNow, withheld, page, seen, now());
            main.post(() -> { if (!closed && expected == generation) applyMore(target, page, merged, attempt); });
        });
    }

    private void applyMore(Session target, List<Story> page, FeedMerge.Result merged, int attempt) {
        target.stories = cap(merged.visible());
        target.earlier = minus(merged.earlier(), target.revealed);
        boolean grew = !merged.fresh().isEmpty();
        if (page.isEmpty()) target.exhausted = true;
        else if (!grew && attempt + 1 < MORE_ATTEMPTS) { fetchMore(target, attempt + 1); return; }
        else if (!grew || target.stories.size() >= STORY_LIMIT) target.exhausted = true;
        loading = false; publish(); track();
    }

    /** Called when the reader pages. Deliberately does not publish: paging must not trigger a re-render. */
    void position(int next) {
        if (next == position) return;
        position = next;
        if (feeding()) session.positions.put(section, next);
        else if (screen == Screen.SAVED) savedPosition = next;
        track();
        if (feeding() && !loading && feedError == 0 && !session.exhausted && next >= items().size() - 4) more();
    }

    /** Swaps in the fresher page the reader was told about, merged with what has been read since. */
    void applyFresh() {
        List<Story> page = session.pending;
        if (page == null) return;
        install(session, FeedMerge.replace(session.stories, session.withheld(), page, seen, now()));
        position = 0; publish(); track();
    }

    /** Lets the reader go back over stories already seen; they follow the caught-up card. */
    void revealEarlier() {
        Session target = session;
        if (closed || !feeding() || !section.isEmpty() || target.earlier.isEmpty()) return;
        List<Story> all = new ArrayList<>(target.revealed);
        all.addAll(target.earlier);
        all.sort(Comparator.comparingLong(Story::publishedAt).reversed());
        target.revealed = List.copyOf(all.size() > FeedMerge.EARLIER_LIMIT ? all.subList(0, FeedMerge.EARLIER_LIMIT) : all);
        target.earlier = List.of();
        position = target.stories.size() + 1;
        target.positions.put(section, position);
        publish(); track();
    }

    private List<Story> items() {
        return screen == Screen.SAVED ? saved : session.items(section, marker(session));
    }

    /** The caught-up card: nothing newer remains, or the network is down and only seen stories are left. */
    private boolean marker(Session target) {
        boolean any = !target.stories.isEmpty() || !target.earlier.isEmpty() || !target.revealed.isEmpty();
        boolean offline = feedError != 0 && target.stories.isEmpty();
        return section.isEmpty() && any && (target.exhausted || offline);
    }

    private void savePosition() {
        if (feeding()) session.positions.put(section, position);
        else if (screen == Screen.SAVED) savedPosition = position;
    }

    private void restorePosition() {
        if (feeding()) position = session.positions.getOrDefault(section, 0);
        else if (screen == Screen.SAVED) position = savedPosition;
        else position = 0;
    }

    /** Shows what the session already holds, otherwise reads the on-device cache while the network runs. */
    private void open() {
        cancelRequest(); generation++;
        restorePosition();
        Session target = session;
        if (target.categories.isEmpty()) {
            loading = false; replacing = false; feedError = 0; ready = true; publish();
            return;
        }
        if (!target.stories.isEmpty() || target.loadedAt != 0) {
            loading = false; feedError = 0; ready = true; publish();
            if (target.loadedAt == 0 || now() - target.loadedAt > REVISIT_AFTER_MS) begin(Kind.REVALIDATE, false);
            return;
        }
        target.networkDone = false;
        int expected = beginRequest(Kind.REPLACE, false);
        publish();
        if (closed) return;
        io(() -> {
            FeedCache.Entry entry = cache.read(target.key);
            boolean usable = entry != null && entry.age(now()) <= target.cacheLimit();
            FeedMerge.Result merged = usable ? FeedMerge.replace(List.of(), List.of(), entry.stories(), seen, now()) : null;
            main.post(() -> {
                if (closed || expected != generation) return;
                if (merged != null && !target.networkDone && target.stories.isEmpty()) {
                    target.earlier = merged.earlier();
                    if (!merged.visible().isEmpty()) {
                        target.stories = cap(merged.visible());
                        target.shownAt = SystemClock.uptimeMillis();
                    }
                }
                ready = true; publish(); track();
            });
        });
    }

    private void begin(Kind next, boolean forced) {
        beginRequest(next, forced);
        publish();
    }

    /** Starts a first-page request; the caller publishes. */
    private int beginRequest(Kind next, boolean forced) {
        cancelRequest();
        int expected = ++generation;
        Session target = session;
        loading = true; replacing = true; feedError = 0; notice = 0; kind = next; lastForced = forced;
        request = source.load(target.categories, target.lang, List.of(), forced && target.single, new FeedSource.Result() {
            @Override public void loaded(List<Story> stories) {
                main.post(() -> {
                    if (closed || expected != generation) return;
                    target.networkDone = true; ready = true;
                    firstPage(target, stories, forced, expected);
                });
            }
            @Override public void failed(int message) {
                main.post(() -> {
                    if (closed || expected != generation) return;
                    target.networkDone = true; ready = true;
                    loading = false; replacing = false; feedError = message; publish();
                });
            }
        });
        return expected;
    }

    private void firstPage(Session target, List<Story> page, boolean forced, int expected) {
        List<Story> shownNow = target.stories, withheld = target.withheld();
        io(() -> {
            FeedMerge.Result merged = FeedMerge.replace(shownNow, withheld, page, seen, now());
            main.post(() -> { if (!closed && expected == generation) applyFirst(target, page, merged, forced); });
            // The page is cached as it came, so what has been read is filtered out afresh at every launch.
            if (!page.isEmpty()) {
                try { cache.write(target.key, page); } catch (IOException ignored) { }
            }
        });
    }

    private void applyFirst(Session target, List<Story> page, FeedMerge.Result merged, boolean forced) {
        boolean showing = !target.stories.isEmpty(), news = !merged.fresh().isEmpty();
        boolean idle = target == session && feeding() && position == 0 && target.pending == null
                && SystemClock.uptimeMillis() - target.shownAt < SWAP_WINDOW_MS;
        boolean wasExhausted = target.exhausted;
        target.loadedAt = now();
        loading = false; replacing = false; feedError = 0;
        boolean install = !showing || news && (forced || idle);
        if (install) {
            install(target, merged);
            // With nothing new on the first page, what was already known about the end of the list still holds.
            target.exhausted = page.isEmpty() || !news && wasExhausted;
            if (target == session) position = 0;
        } else if (news) {
            target.pending = page;
        }
        if (forced && !news && target == session) notice = R.string.no_new_stories;
        // A page the reader has already seen entirely may still hide stories further down the server's list.
        if (install && merged.visible().isEmpty() && !page.isEmpty() && !target.exhausted) fetchMore(target, 0);
        else publish();
        track();
    }

    private void install(Session target, FeedMerge.Result merged) {
        target.stories = cap(merged.visible());
        target.earlier = merged.earlier();
        target.revealed = List.of();
        target.positions.clear(); target.pending = null; target.shownAt = SystemClock.uptimeMillis();
    }

    private static List<Story> cap(List<Story> stories) {
        return stories.size() > STORY_LIMIT ? List.copyOf(stories.subList(0, STORY_LIMIT)) : stories;
    }

    private static List<Story> minus(List<Story> stories, List<Story> removed) {
        if (removed.isEmpty()) return stories;
        Set<String> ids = new HashSet<>();
        for (Story story : removed) ids.add(story.id());
        List<Story> kept = new ArrayList<>(stories.size());
        for (Story story : stories) if (!ids.contains(story.id())) kept.add(story);
        return kept;
    }

    private void cancelRequest() {
        if (request != null) { request.cancel(); request = null; }
    }

    /** Called when the app leaves the screen: the story in view is counted, and the history is written out now. */
    void background() {
        if (closed) return;
        leave();
        foreground = false; awaySince = now();
        io(this::writeSeen);
    }

    /** Called when the app returns. After a long absence it starts again from the newest stories. */
    void foreground() {
        if (closed || foreground) return;
        foreground = true;
        long away = awaySince == 0 ? 0 : now() - awaySince;
        awaySince = 0;
        if (away >= NEW_SESSION_AFTER_MS) newSession();
        else if (away >= REVISIT_AFTER_MS && feeding() && !loading && !session.categories.isEmpty()) begin(Kind.REVALIDATE, false);
        track();
    }

    private void newSession() {
        cancelRequest(); generation++;
        sessions.clear();
        section = ""; notice = 0; screen = feed; position = 0;
        session = feedSession();
        open();
    }

    /** The story in view counts as read once it has been on screen for a moment, or when the reader moves on after a glance. */
    private void track() {
        Story current = foreground && feeding() ? currentStory() : null;
        if (current == null ? viewing == null : viewing != null && viewing.id().equals(current.id())) return;
        leave();
        if (current != null) {
            viewing = current; viewingSince = SystemClock.uptimeMillis();
            main.postDelayed(dwell, dwellMs);
        }
    }

    private Story currentStory() {
        List<Story> shown = session.shown(section);
        return position >= 0 && position < shown.size() ? shown.get(position) : null;
    }

    private void leave() {
        main.removeCallbacks(dwell);
        if (viewing != null && SystemClock.uptimeMillis() - viewingSince >= glanceMs) markSeen(viewing);
        viewing = null;
    }

    private void markSeen(Story story) {
        long at = now();
        io(() -> { if (seen.mark(story, at)) seenDirty = true; });
        if (flushQueued) return;
        flushQueued = true;
        main.postDelayed(() -> { flushQueued = false; io(this::writeSeen); }, SEEN_FLUSH_MS);
    }

    private void writeSeen() {
        if (!seenDirty) return;
        try { history.write(seen); seenDirty = false; } catch (IOException ignored) { }
    }

    void toggle(Story story) {
        if (!storageReady || saving || closed || story.isCaughtUp()) return;
        List<Story> updated = new ArrayList<>(saved);
        boolean removed = updated.removeIf(item -> item.id().equals(story.id()));
        if (!removed) {
            if (updated.size() >= SavedStories.LIMIT) { notice = R.string.saved_limit; publish(); return; }
            updated.add(0, story);
        }
        save(updated, removed ? R.string.removed_notice : R.string.saved_notice, () -> cloud.saved(story, !removed));
    }

    void clearSaved() {
        if (!storageReady || saving || closed) return;
        List<Story> removed = saved;
        save(List.of(), R.string.removed_notice, () -> { for (Story story : removed) cloud.saved(story, false); });
    }

    /** Adds bookmarks that exist only in the signed-in account; stories already saved on this phone are kept. */
    private void mergeSaved(List<Story> remote) {
        if (!storageReady) { remoteSaved = remote; return; }
        if (saving) { main.postDelayed(() -> { if (!closed) mergeSaved(remote); }, 250); return; }
        Set<String> have = new HashSet<>();
        for (Story story : saved) have.add(story.id());
        List<Story> updated = new ArrayList<>(saved);
        for (Story story : remote) if (updated.size() < SavedStories.LIMIT && have.add(story.id())) updated.add(story);
        if (updated.size() != saved.size()) save(updated, 0, () -> { });
    }

    private void save(List<Story> updated, int success, Runnable done) {
        saving = true; notice = 0; publish();
        io(() -> {
            try {
                storage.write(updated);
                main.post(() -> {
                    if (closed) return;
                    saved = List.copyOf(updated); saving = false; storageError = 0;
                    if (screen == Screen.SAVED) position = Math.min(position, Math.max(0, saved.size() - 1));
                    savedPosition = Math.min(savedPosition, Math.max(0, saved.size() - 1));
                    notice = success; publish();
                    done.run();
                });
            } catch (IOException failure) {
                main.post(() -> { if (!closed) { saving = false; storageError = R.string.save_error; publish(); } });
            }
        });
    }

    void acknowledgeNotice() { notice = 0; }

    private void publish() {
        Set<String> ids = new HashSet<>();
        for (Story story : saved) ids.add(story.id());
        List<Story> shown = items();
        boolean feeding = feeding();
        state.setValue(new State(screen, topic, lang, section, shown, Set.copyOf(ids), loading,
                loading && replacing && feeding && !shown.isEmpty(), saving, storageReady, session.exhausted,
                feeding && session.pending != null, feedError, storageError, notice, position,
                feeding ? session.earlier.size() : 0, interests));
    }

    @Override protected void onCleared() {
        leave();
        closed = true; generation++;
        cloud.listen(null);
        cancelRequest();
        main.removeCallbacksAndMessages(null);
        io(this::writeSeen);
        disk.shutdown();
    }
}
