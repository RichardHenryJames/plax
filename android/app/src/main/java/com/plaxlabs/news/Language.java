package com.plaxlabs.news;

import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;
import java.util.Locale;

/** The reading language: it selects both the interface strings and the Hindi or English feed. */
final class Language {
    static final String ENGLISH = "en", HINDI = "hi";

    private Language() { }

    static String current() {
        LocaleListCompat chosen = AppCompatDelegate.getApplicationLocales();
        Locale locale = chosen.isEmpty() ? Locale.getDefault() : chosen.get(0);
        return of(locale);
    }

    static String of(Locale locale) {
        return locale != null && HINDI.equals(locale.getLanguage()) ? HINDI : ENGLISH;
    }

    static void apply(String language) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language));
    }
}
