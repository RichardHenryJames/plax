package com.plaxlabs.news;

import android.content.Context;
import java.util.List;

/**
 * A topic the reader can choose. The built-in ones are the topics the app was made with. The website may list others, or the same ones
 * under other names and in another order (see {@link AppConfig}), and what it lists is what the reader is offered. Two topics are the
 * same when their ids are, whatever they are called.
 */
final class Topic {
    static final Topic NEWS = builtIn("news", R.string.topic_news, "\uD83D\uDCF0");
    static final Topic STOCKS = builtIn("stocks", R.string.topic_stocks, "\uD83D\uDCCA");
    static final Topic SCIENCE = builtIn("science", R.string.topic_science, "\uD83D\uDD2C");
    static final Topic TECHNOLOGY = builtIn("technology", R.string.topic_technology, "\uD83D\uDCBB");
    static final Topic PHILOSOPHY = builtIn("philosophy", R.string.topic_philosophy, "\uD83E\uDDE0");
    static final Topic PSYCHOLOGY = builtIn("psychology", R.string.topic_psychology, "\uD83E\uDDE9");
    static final Topic HISTORY = builtIn("history", R.string.topic_history, "\uD83C\uDFDB\uFE0F");
    static final Topic FINANCE = builtIn("finance", R.string.topic_finance, "\uD83D\uDCC8");
    static final Topic SPACE = builtIn("space", R.string.topic_space, "\uD83D\uDE80");
    static final Topic PROGRAMMING = builtIn("programming", R.string.topic_programming, "\u2328\uFE0F");
    static final Topic BOOKS = builtIn("books", R.string.topic_books, "\uD83D\uDCDA");
    static final Topic HEALTH = builtIn("health", R.string.topic_health, "\uD83C\uDF4E");
    static final Topic MATH = builtIn("math", R.string.topic_math, "\u2797");
    static final Topic NATURE = builtIn("nature", R.string.topic_nature, "\uD83C\uDF3F");
    static final Topic ART = builtIn("art", R.string.topic_art, "\uD83C\uDFA8");
    static final Topic PHYSICS = builtIn("physics", R.string.topic_physics, "\u269B\uFE0F");
    static final Topic BUSINESS = builtIn("business", R.string.topic_business, "\uD83D\uDCBC");
    static final Topic LANGUAGE = builtIn("language", R.string.topic_language, "\uD83D\uDDE3\uFE0F");

    private static final List<Topic> BUILT_IN = List.of(NEWS, STOCKS, SCIENCE, TECHNOLOGY, PHILOSOPHY, PSYCHOLOGY, HISTORY, FINANCE, SPACE,
            PROGRAMMING, BOOKS, HEALTH, MATH, NATURE, ART, PHYSICS, BUSINESS, LANGUAGE);

    final String id;
    final String emoji;
    /** The string resource of a built-in topic's name, or 0 for a topic the website listed, which carries its own names. */
    private final int label;
    private final String en, hi;

    private Topic(String id, int label, String emoji, String en, String hi) {
        this.id = id; this.label = label; this.emoji = emoji; this.en = en; this.hi = hi;
    }

    private static Topic builtIn(String id, int label, String emoji) { return new Topic(id, label, emoji, "", ""); }

    /** A topic the website listed, with its own names in English and Hindi. */
    static Topic listed(String id, String emoji, String en, String hi) { return new Topic(id, 0, emoji, en, hi); }

    /** The topics the app was made with, which is what a build that has not read the website's list offers. */
    static List<Topic> builtIn() { return BUILT_IN; }

    /** The topics to offer now: the website's list, or the built-in one. */
    static List<Topic> all() { return AppConfigStore.active().topics(); }

    /** The topic with this id among those on offer now, or null when it is not one. */
    static Topic byId(String id) {
        for (Topic topic : all()) if (topic.id.equals(id)) return topic;
        return null;
    }

    /** The name, in the language the screen is in. */
    String label(Context context) {
        if (label != 0) return context.getString(label);
        return Language.HINDI.equals(Language.of(context.getResources().getConfiguration().getLocales().get(0))) ? hi : en;
    }

    @Override public boolean equals(Object other) { return other instanceof Topic topic && topic.id.equals(id); }

    @Override public int hashCode() { return id.hashCode(); }

    @Override public String toString() { return id; }
}
