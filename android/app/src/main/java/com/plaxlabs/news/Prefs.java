package com.plaxlabs.news;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.appcompat.app.AppCompatDelegate;

/** Settings kept on the device: the colour theme, which feed the reader was last in, and when an ad last arrived in the strip (a time, nothing about the reader). */
final class Prefs {
    static final int SYSTEM = 0, LIGHT = 1, DARK = 2;
    private static final String FILE = "plax", THEME = "theme", FOR_YOU = "for_you", BANNER_SERVED = "banner_served_at";

    private Prefs() { }

    private static SharedPreferences store(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** When an ad last arrived in the strip at the foot of the screen (ms since 1970), or 0 if none ever did: see {@link AdRoom}. */
    static long bannerServedAt(Context context) { return store(context).getLong(BANNER_SERVED, 0L); }

    static void bannerServedAt(Context context, long at) { store(context).edit().putLong(BANNER_SERVED, at).apply(); }

    /** True when the reader last used For you, so the app opens there again. */
    static boolean forYou(Context context) { return store(context).getBoolean(FOR_YOU, false); }

    static void forYou(Context context, boolean selected) { store(context).edit().putBoolean(FOR_YOU, selected).apply(); }

    static int theme(Context context) {
        int value = store(context).getInt(THEME, SYSTEM);
        return value == LIGHT || value == DARK ? value : SYSTEM;
    }

    static void theme(Context context, int mode) {
        store(context).edit().putInt(THEME, mode).apply();
        apply(mode);
    }

    static void apply(int mode) {
        AppCompatDelegate.setDefaultNightMode(mode == LIGHT ? AppCompatDelegate.MODE_NIGHT_NO
                : mode == DARK ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
    }
}
