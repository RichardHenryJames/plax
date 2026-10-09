package com.plaxlabs.news;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Decides when two stories are the same event, using only their headlines.
 *
 * Measured on the live feed: outlets word one event very differently (a Nobel Peace Prize
 * win appeared four times, an AI-lab firing four times), so exact titles and the server's
 * "four letter words, 60 % overlap" filter miss most repeats. What identifies an event is
 * the handful of distinctive words (names, places, subjects) the headlines share, while
 * template words ("killed", "injured", "LIVE", "stocks", years) mislead, so those are dropped.
 */
final class Similarity {
    /** A headline reduced to what identifies its event. */
    static final class Print {
        final long[] tokens;      // sorted, unique, hashed distinctive words
        final String key;         // letters and digits only, single spaces
        final long published;     // 0 when the feed gave no publish time
        final boolean timely;     // news-like: only these are matched fuzzily

        Print(long[] tokens, String key, long published, boolean timely) {
            this.tokens = tokens; this.key = key; this.published = published; this.timely = timely;
        }
    }

    static final int MIN_SHARED = 3;
    /** Longest headline key kept, so a stored history stays small. */
    static final int KEY_LIMIT = 160;
    static final long WINDOW_MS = 16L * 3_600_000;
    static final long CLOSE_MS = 3L * 3_600_000;

    private static final Pattern SPLIT = Pattern.compile("[^\\p{L}\\p{M}\\p{N}]+");
    private static final Pattern YEAR = Pattern.compile("^(19|20)\\d\\d$");
    private static final Set<String> STOP = words(
            "the and but for with from this that these those its his her their our your has have had will would can could "
            + "about after over into says say said not how why what who whom when where which while amid more than other you "
            + "may gets get also just still only very much many most some any all both each few such own same too then there "
            + "here out off again once been being are was were new live updates update latest news today breaking first big "
            + "top key major video watch photos explained explainer analysis opinion report reports reportedly reported claims "
            + "claim plans plan set killed injured dead dies die death deaths hurt wounded arrested held detained wins win won "
            + "beats beat leads lead led gains gain falls fall rises rise india indian world minister government govt police "
            + "court high supreme biggest moves stocks making premarket midday morning evening tonight "
            // Hindi function words
            + "का की के में से को है हैं ने पर और यह था थे एक कि भी इस ये वह जो तो हो या कर रहा रही रहे गया गई गए दिया "
            + "लिए साथ बाद अब नए नई नया करने किया जा सकता कहा बोले बताया पहले क्या कैसे क्यों कब तक नहीं लेकिन अपने उन उस इन "
            + "सभी कुछ वाले वाली वाला द्वारा");

    private Similarity() { }

    private static Set<String> words(String list) {
        return new HashSet<>(Arrays.asList(list.split("\\s+")));
    }

    static Print print(Story story) {
        String headline = story.title().isBlank() ? lead(story.content()) : story.title();
        return print(headline, story.publishedAt(), story.publishedAt() > 0 || "news".equals(story.category()));
    }

    static Print print(String headline, long published, boolean timely) {
        String[] words = SPLIT.split(Normalizer.normalize(headline, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT));
        StringBuilder key = new StringBuilder();
        long[] hashes = new long[words.length];
        int count = 0;
        for (String word : words) {
            if (word.isEmpty()) continue;
            if (key.length() > 0) key.append(' ');
            key.append(word);
            String token = stem(word);
            if (token.length() < 3 || STOP.contains(token) || YEAR.matcher(token).matches() || digits(token)) continue;
            hashes[count++] = hash(token);
        }
        long[] sorted = Arrays.copyOf(hashes, count);
        Arrays.sort(sorted);
        String normalised = key.length() > KEY_LIMIT ? key.substring(0, KEY_LIMIT) : key.toString();
        return new Print(unique(sorted), normalised, published, timely);
    }

    /** The first sentence of the body, for quotes and other stories that carry no headline. */
    private static String lead(String content) {
        String text = content.strip();
        int end = text.indexOf('.');
        return text.length() > 140 ? text.substring(0, 140) : end > 20 ? text.substring(0, end) : text;
    }

    private static boolean digits(String token) {
        for (int index = 0; index < token.length(); index++)
            if (!Character.isDigit(token.charAt(index))) return false;
        return true;
    }

    private static String stem(String word) {
        int length = word.length();
        if (length > 4 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is"))
            return word.substring(0, length - 1);
        return word;
    }

    private static long hash(String text) {
        long hash = 0xcbf29ce484222325L;
        for (int index = 0; index < text.length(); index++) {
            hash ^= text.charAt(index);
            hash *= 0x100000001b3L;
        }
        return hash;
    }

    private static long[] unique(long[] sorted) {
        if (sorted.length < 2) return sorted;
        int count = 1;
        for (int index = 1; index < sorted.length; index++) if (sorted[index] != sorted[index - 1]) sorted[count++] = sorted[index];
        return Arrays.copyOf(sorted, count);
    }

    static int shared(long[] a, long[] b) {
        int i = 0, j = 0, common = 0;
        while (i < a.length && j < b.length) {
            if (a[i] == b[j]) { common++; i++; j++; }
            else if (a[i] < b[j]) i++;
            else j++;
        }
        return common;
    }

    /**
     * @param whenA when A happened: its publish time, or when it was first seen if the feed gave none
     * @param whenB the same for B
     */
    static boolean same(Print a, long whenA, Print b, long whenB) {
        if (!a.key.isEmpty() && a.key.equals(b.key)) return true;
        if (!a.timely || !b.timely) return false;
        int shared = shared(a.tokens, b.tokens);
        if (shared < MIN_SHARED) return false;
        long apart = Math.abs(whenA - whenB);
        if (apart > WINDOW_MS) return false;
        double jaccard = shared / (double) (a.tokens.length + b.tokens.length - shared);
        double containment = shared / (double) Math.min(a.tokens.length, b.tokens.length);
        // Stories published together that share their subject are one event even when worded loosely.
        return jaccard >= 0.22 || containment >= 0.5 || apart <= CLOSE_MS && jaccard >= 0.15;
    }

    static boolean same(Print a, Print b) {
        // Without both publish times there is nothing to compare, so only wording decides.
        boolean known = a.published > 0 && b.published > 0;
        return same(a, known ? a.published : 0, b, known ? b.published : 0);
    }
}
