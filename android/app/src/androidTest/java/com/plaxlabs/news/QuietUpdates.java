package com.plaxlabs.news;

import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.Executor;

/**
 * An update manager that never looks for anything, for tests that open the real screen but are not about
 * updates: a real check would call the website and could put a prompt over the screen under test.
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
    }

    static void remove() { UpdateManager.use(null); }
}
