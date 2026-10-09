package com.plaxlabs.news;

enum Topic {
    NEWS("news", R.string.topic_news, "\uD83D\uDCF0"),
    SCIENCE("science", R.string.topic_science, "\uD83D\uDD2C"),
    TECHNOLOGY("technology", R.string.topic_technology, "\uD83D\uDCBB"),
    PHILOSOPHY("philosophy", R.string.topic_philosophy, "\uD83E\uDDE0"),
    PSYCHOLOGY("psychology", R.string.topic_psychology, "\uD83E\uDDE9"),
    HISTORY("history", R.string.topic_history, "\uD83C\uDFDB\uFE0F"),
    FINANCE("finance", R.string.topic_finance, "\uD83D\uDCC8"),
    SPACE("space", R.string.topic_space, "\uD83D\uDE80"),
    PROGRAMMING("programming", R.string.topic_programming, "\u2328\uFE0F"),
    BOOKS("books", R.string.topic_books, "\uD83D\uDCDA"),
    HEALTH("health", R.string.topic_health, "\uD83C\uDF4E"),
    MATH("math", R.string.topic_math, "\u2797"),
    NATURE("nature", R.string.topic_nature, "\uD83C\uDF3F"),
    ART("art", R.string.topic_art, "\uD83C\uDFA8"),
    PHYSICS("physics", R.string.topic_physics, "\u269B\uFE0F"),
    BUSINESS("business", R.string.topic_business, "\uD83D\uDCBC"),
    LANGUAGE("language", R.string.topic_language, "\uD83D\uDDE3\uFE0F");

    final String id;
    final int label;
    final String emoji;
    Topic(String id, int label, String emoji) { this.id = id; this.label = label; this.emoji = emoji; }

    /** The topic with this id, or null when it is not one the app knows. */
    static Topic byId(String id) {
        for (Topic topic : values()) if (topic.id.equals(id)) return topic;
        return null;
    }
}
