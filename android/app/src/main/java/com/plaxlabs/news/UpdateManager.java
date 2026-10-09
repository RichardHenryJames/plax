package com.plaxlabs.news;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.io.IOException;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.function.LongSupplier;

/**
 * Tells the reader when the Plax website advertises a newer build of the app: by itself at most once a day
 * while the app is on screen, and whenever they ask from the menu. Everything here runs on the main thread
 * except the request, which runs on a worker and reports back through {@code main}.
 *
 * What it keeps to the same rules as the one in Vanishr:
 * - A check is counted when it starts, so a failed one is not retried before the day is up.
 * - A release the reader put off with Later, or downloaded, is not offered again for a day; a newer
 *   release is offered at once, and asking from the menu always offers it.
 * - Nothing is offered over a sheet or dialog that is open, or while sign-in is in progress; it waits for
 *   the next time the app comes to the front.
 * - Store builds never look for updates: Google Play does that, and the menu opens the listing instead.
 *
 * Unlike Vanishr, a release that is found stays here when the screen is recreated (a rotation), so the offer
 * comes back with it; and asking from the menu while a check is already running makes that check report
 * back instead of being ignored.
 */
final class UpdateManager {
    /** The screen the offer appears on. Every call is on the main thread. */
    interface Host {
        /** True when nothing is open that an offer would cover. */
        boolean idle();
        /** Shows "Update available" with Later and Download; the answer comes back through {@link #dismiss}. */
        void offer(AppUpdates.Release release);
        /** Says something short, given as a string resource. */
        void say(int message);
        /** Opens the store listing. */
        void store();
    }

    /** What is remembered between launches. */
    interface Memory {
        long lastCheck();
        long dismissedVersion();
        long dismissedAt();
        void checked(long at);
        void dismissed(long version, long at);
    }

    /** Asks the website for the newest release. Called on the worker. */
    interface Feed { AppUpdates.Release newest(long installedVersion, int androidVersion) throws IOException; }

    private final Memory memory;
    private final Feed feed;
    private final Executor worker, main;
    private final LongSupplier clock;
    private final long installed;
    private final int sdk;
    private final boolean storeBuild;
    private Host host;
    private AppUpdates.Release available;
    private boolean checking, report;

    UpdateManager(Memory memory, Feed feed, Executor worker, Executor main, LongSupplier clock, long installed, int sdk,
                  boolean storeBuild) {
        this.memory = memory; this.feed = feed; this.worker = worker; this.main = main; this.clock = clock;
        this.installed = installed; this.sdk = sdk; this.storeBuild = storeBuild;
    }

    private static UpdateManager instance;

    /** The app-wide manager. */
    static synchronized UpdateManager get(Context context) {
        if (instance == null) {
            SharedPreferences preferences = context.getApplicationContext().getSharedPreferences("updates", Context.MODE_PRIVATE);
            Handler handler = new Handler(Looper.getMainLooper());
            Executor worker = Executors.newSingleThreadExecutor(task -> {
                Thread thread = new Thread(task, "plax-update"); thread.setDaemon(true); return thread;
            });
            instance = new UpdateManager(new Memory() {
                @Override public long lastCheck() { return preferences.getLong("last-check", 0); }
                @Override public long dismissedVersion() { return preferences.getLong("dismissed-version", 0); }
                @Override public long dismissedAt() { return preferences.getLong("dismissed-at", 0); }
                @Override public void checked(long at) { preferences.edit().putLong("last-check", at).apply(); }
                @Override public void dismissed(long version, long at) {
                    preferences.edit().putLong("dismissed-version", version).putLong("dismissed-at", at).apply();
                }
            }, (version, android) -> {
                try (AppUpdates updates = new AppUpdates()) { return updates.check(version, android); }
            }, worker, handler::post, System::currentTimeMillis, BuildConfig.VERSION_CODE, Build.VERSION.SDK_INT, BuildConfig.PLAY_STORE);
        }
        return instance;
    }

    /** Replaces the app-wide manager, for tests. */
    static synchronized void use(UpdateManager replacement) { instance = replacement; }

    /** The screen is in front: look for an update if a day has passed, or offer one that is already known. */
    void attach(Host next) {
        host = next;
        check(false);
    }

    /** The screen left the front. A check still running finishes and is remembered, but says nothing. */
    void detach(Host previous) {
        if (host == previous) host = null;
    }

    /** True when asking would open the store listing rather than look for an update. */
    boolean storeBuild() { return storeBuild; }

    /**
     * Looks for an update. {@code manual} is the reader asking from the menu: it ignores the daily limit, always
     * ends in something visible (the offer, "up to date" or "cannot check"), and offers a release that was put off.
     */
    void check(boolean manual) {
        if (storeBuild) {
            if (manual && host != null) host.store();
            return;
        }
        if (host == null) return;
        if (checking) { report |= manual; return; }
        long now = clock.getAsLong();
        if (!manual && !AppUpdates.due(now, memory.lastCheck())) { offer(false); return; }
        checking = true; report = manual;
        memory.checked(now);
        worker.execute(() -> {
            AppUpdates.Release release = null;
            boolean failed = false;
            try { release = feed.newest(installed, sdk); }
            catch (IOException | RuntimeException unavailable) { failed = true; }
            AppUpdates.Release found = release;
            boolean failure = failed;
            main.execute(() -> finished(found, failure));
        });
    }

    private void finished(AppUpdates.Release found, boolean failed) {
        boolean asked = report;
        checking = false; report = false;
        if (failed) {
            if (asked && host != null) host.say(R.string.update_failed);
            return;
        }
        available = found;
        if (asked && found == null && host != null) host.say(R.string.update_current);
        else offer(asked);
    }

    private void offer(boolean asked) {
        AppUpdates.Release release = available;
        if (storeBuild || release == null || host == null || !host.idle()) return;
        if (!asked && !AppUpdates.shouldPrompt(release, memory.dismissedVersion(), memory.dismissedAt(), clock.getAsLong())) return;
        host.offer(release);
    }

    /** The reader answered the offer, by choosing Later, closing it or starting the download. */
    void dismiss(AppUpdates.Release release) {
        memory.dismissed(release.versionCode(), clock.getAsLong());
        if (available != null && available.versionCode() == release.versionCode()) available = null;
    }
}
