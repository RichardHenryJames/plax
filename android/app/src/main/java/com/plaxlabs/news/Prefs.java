package com.plaxlabs.news;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.appcompat.app.AppCompatDelegate;

/** Settings kept on the device: the colour theme and which feed the reader was last in. */
final class Prefs {
    static final int SYSTEM = 0, LIGHT = 1, DARK = 2;
    private static final String FILE = "plax", THEME = "theme", FOR_YOU = "for_you";

    private Prefs() { }

    private static SharedPreferences store(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

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
