package com.plaxlabs.news;

import java.net.URI;
import java.util.Locale;

record Story(String id, String title, String content, String category, String section,
             String source, String sourceUrl, String image, String readTime, long publishedAt, String sig) {
    private static final int MINIMUM_BODY = 12;
    static final String CAUGHT_UP_ID = "__caught_up__";
    private static final Story CAUGHT_UP = new Story(CAUGHT_UP_ID, "", "", "news", "", "", "", "", "", 0);

    Story {
        if (sig == null) sig = "";
    }

    /** A story without the server's signature: one saved before it existed, restored from the cloud, or a quote. */
    Story(String id, String title, String content, String category, String section,
          String source, String sourceUrl, String image, String readTime, long publishedAt) {
        this(id, title, content, category, section, source, sourceUrl, image, readTime, publishedAt, "");
    }

    /** The server's signature over a story as it served it: 32 lower-case hexadecimal characters. */
    static boolean isSignature(String value) {
        if (value == null || value.length() != 32) return false;
        for (int index = 0; index < value.length(); index++) {
            char digit = value.charAt(index);
            if ((digit < '0' || digit > '9') && (digit < 'a' || digit > 'f')) return false;
        }
        return true;
    }

    /** Marks the end of the new stories. It is shown like a card but is never a real story. */
    static Story caughtUp() { return CAUGHT_UP; }

    boolean isCaughtUp() { return CAUGHT_UP_ID.equals(id); }

    /**
     * The full-page ad that stands between stories, after every fifth one. Like the caught-up card it is shown as a page of the pager
     * but is never a story: the feed model never holds one (the pager's list is made from the model's with the ads put in), so it is
     * never read, saved or shared.
     */
    static Story ad(int ordinal) { return new Story("__ad_" + ordinal + "__", "", "", "news", "", "", "", "", "", 0); }

    boolean isAd() { return id.startsWith("__ad_") && id.endsWith("__") && id.length() > 6; }

    /** The number of the slot an ad page stands in, from 1, or 0 for anything else. */
    int adOrdinal() {
        if (!isAd()) return 0;
        try { return Integer.parseInt(id.substring(5, id.length() - 2)); } catch (NumberFormatException none) { return 0; }
    }

    String headlineKey() {
        return title.isBlank() ? id : title.strip().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    /**
     * Body text without the headline repeated: the feed often returns it again as the whole text, or as a
     * first sentence set apart by a separator. A sentence that merely begins with the headline stays whole,
     * so "Evolution" over "Evolution is the change in..." never becomes "is the change in...".
     */
    String body() {
        String text = content.strip();
        String lead = title.strip();
        if (lead.isEmpty()) return text;
        if (comparable(text).equals(comparable(lead))) return "";
        if (text.length() > lead.length() && text.regionMatches(true, 0, lead, 0, lead.length())) {
            java.util.regex.Matcher separator = AFTER_HEADLINE.matcher(text.substring(lead.length()));
            if (separator.find()) {
                String rest = text.substring(lead.length() + separator.end()).strip();
                return rest.length() < MINIMUM_BODY ? "" : rest;
            }
        }
        return text;
    }

    /** What sets a repeated headline apart from the text after it: a colon, full stop, bar, dash, ellipsis or danda. */
    private static final java.util.regex.Pattern AFTER_HEADLINE = java.util.regex.Pattern.compile(
            "^(?:\\s*[:.|\u2013\u2014\u2026\u0964]|\\s+-)[\\s:.|\u2013\u2014\u2026\u0964-]*");

    private static String comparable(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").replaceAll("[.\u2026\\s]+$", "");
    }

    static boolean isWebLink(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                    && uri.getUserInfo() == null && uri.getPort() == -1;
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    /** Reading time from the feed ("13s", "30 sec", "2 min") in seconds, or -1 when it has another form. */
    int readSeconds() {
        java.util.regex.Matcher time = READ_TIME.matcher(readTime.strip());
        if (!time.matches()) return -1;
        int amount = Integer.parseInt(time.group(1));
        return time.group(2).toLowerCase(Locale.ROOT).startsWith("m") ? amount * 60 : amount;
    }

    private static final java.util.regex.Pattern READ_TIME = java.util.regex.Pattern.compile(
            "^(\\d{1,4})\\s*(s|secs?|seconds?|m|mins?|minutes?)$", java.util.regex.Pattern.CASE_INSENSITIVE);

    boolean hasSource() { return isWebLink(sourceUrl); }
    boolean hasImage() { return isWebLink(image); }

    /** Publisher host for the read-more control, without a leading www. */
    String sourceHost() {
        if (!hasSource()) return "";
        String host = URI.create(sourceUrl).getHost().toLowerCase(Locale.ROOT);
        return host.startsWith("www.") ? host.substring(4) : host;
    }
}
