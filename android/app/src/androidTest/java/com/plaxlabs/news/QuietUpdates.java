package com.plaxlabs.news;

import android.os.Handler;
import android.os.Looper;
import java.io.IOException;
import java.util.concurrent.Executor;

/**
 * An update manager that never looks for anything, for tests that open the real screen but are not about updates: a real check would
 * call the website and could put a prompt over the screen under test. The website's configuration is kept quiet the same way: nothing is
 * asked for, and what an earlier run of the app kept on the phone is not in force, so a test starts from the built-in values.
 */
final class QuietUpdates {
    private QuietUpdates() { }

    static void install() {
        Handler handler = new Handler(Looper.getMainLooper());
        Executor now = Runnable::run;
        UpdateManager.use(new UpdateManager(new UpdateManager.Memory() {
            @Override public long lastCheck() { return System.currentTimeMillis(); }
            @Override public long dismissedVersion() { return 0; }
            @Override public long dismissedAt() { return 0; }
            @Override public void checked(long at) { }
            @Override public void dismissed(long version, long at) { }
        }, (version, android) -> null, now, handler::post, System::currentTimeMillis, BuildConfig.VERSION_CODE, 0, false));
        quietConfig();
    }

    static void remove() {
        UpdateManager.use(null);
        restoreConfig();
    }

    /** A store that is never answered, keeps nothing and is never told to ask: the built-in values are in force. */
    static void quietConfig() {
        Executor now = Runnable::run;
        AppConfigStore.use(new AppConfigStore(() -> { throw new IOException("offline"); }, new AppConfigStore.Disk() {
            @Override public byte[] read() { return null; }
            @Override public void write(byte[] bytes) { }
            @Override public void delete() { }
        }, new AppConfigStore.Memory() {
            @Override public long attempted() { return System.currentTimeMillis(); }
            @Override public long succeeded() { return System.currentTimeMillis(); }
            @Override public void attempted(long at) { }
            @Override public void succeeded(long at) { }
        }, now, now, System::currentTimeMillis));
    }

    /** The real store again, and the built-in values in force. */
    static void restoreConfig() { AppConfigStore.use(null); }
}
