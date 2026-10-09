package com.plaxlabs.news;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.*;

/** The topics the reader picked to personalise For you. They stay on the phone whether or not there is an account. */
final class Interests {
    private static final String FILE = "plax", KEY = "interests";

    private Interests() { }

    private static SharedPreferences store(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static Set<String> read(Context context) {
        return sanitize(Arrays.asList(store(context).getString(KEY, "").split(",")));
    }

    static void write(Context context, Collection<String> topics) {
        store(context).edit().putString(KEY, categories(sanitize(topics))).apply();
    }

    /** Known topics only, in a fixed order, so one choice always makes the same request and cache key. */
    static Set<String> sanitize(Collection<String> candidates) {
        Set<String> clean = new TreeSet<>();
        for (String candidate : candidates) {
            if (candidate != null && Topic.byId(candidate.strip()) != null) clean.add(candidate.strip());
        }
        return Collections.unmodifiableSet(clean);
    }

    static String categories(Collection<String> topics) { return String.join(",", topics); }
}
