package com.plaxlabs.news;

import android.app.Application;

public final class PlaxApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        Prefs.apply(Prefs.theme(this));
        // The feed hands saved stories and topics to the account, which does nothing until the reader signs in.
        FeedViewModel.clouds = AccountManager::get;
    }

    @Override public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        ImageLoader.trim(level);
    }
}
