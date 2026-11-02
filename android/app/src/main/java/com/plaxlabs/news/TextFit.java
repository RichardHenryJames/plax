package com.plaxlabs.news;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Where a summary ends when its room does: at the end of a sentence when one falls close to the end of the room, else after the last
 * word that fits and can end a text (not "and", "of the", an initial: "…Bagchi and V…"), with an ellipsis. Never in the middle of a
 * word ("prope…"), which a text view's own ellipsis does, and never so early
 * that the page is left with a hole: a sentence is a better place to stop than a word only when it is within {@link #SLACK_LINES} lines
 * of the room.
 *
 * <p>Pure, with the measuring passed in (how many lines a text takes where it is shown), so that it can be tested without a screen.
 * {@link StoryPage} measures with a layout. The website does the same, in src/lib/text-fit.ts, with the same test cases.
 */
final class TextFit {
    static final String ELLIPSIS = "\u2026";
    /** A sentence that ends this many lines or fewer short of the room is where the text stops. */
    static final int SLACK_LINES = 2;

    /** How many lines a text takes where it is shown. */
    interface LineCounter { int lines(String text); }

    private static final Pattern WORD = Pattern.compile("\\S+");
    private static final Pattern TAIL = Pattern.compile("[\\s,;:\u2013\u2014-]+$");
    private static final java.util.Set<String> NOT_AN_END = java.util.Set.of(
            "dr", "mr", "mrs", "ms", "mx", "prof", "sr", "jr", "st", "mt", "gen", "col", "capt", "lt", "sgt", "cmdr", "adm", "sen", "rep",
            "gov", "hon", "rev", "vs", "etc", "inc", "ltd", "corp", "rs", "approx", "dept");
    private static final Pattern LAST_WORD = Pattern.compile("([\\p{L}.]+)$");

    // Words that cannot end a text that is cut short, because what follows is what they are about ("compared to a…", "Bagchi and V…",
    // "Dr.…", "a 1.7…"): a cut that lands after one stops before it. The Hindi are the postpositions, the conjunctions and the pronouns
    // that lead into a noun. The same list as WEAK_WORDS in src/lib/sentence.ts.
    private static final java.util.Set<String> WEAK_WORDS = new java.util.HashSet<>(java.util.Arrays.asList(
            "a", "an", "the", "and", "or", "but", "nor", "so", "yet", "as", "if", "than", "that", "which", "who", "whom", "whose", "whether",
            "because", "although", "though", "while", "when", "where", "once", "until", "unless", "of", "in", "on", "at", "to", "for", "from",
            "by", "with", "into", "onto", "over", "under", "about", "after", "before", "between", "through", "during", "against", "among",
            "per", "via", "amid", "across", "within", "without", "upon", "toward", "towards", "near", "beside", "behind", "beyond", "around",
            "is", "are", "was", "were", "be", "been", "being", "am", "has", "have", "had", "do", "does", "did", "will", "would", "shall",
            "should", "can", "could", "may", "might", "must", "his", "her", "its", "their", "our", "your", "my", "this", "these", "those",
            "such", "any", "some", "each", "every", "both", "all", "another", "other", "more", "most", "less", "many", "much", "few", "not",
            "also", "even", "just", "only", "very", "like",
            "dr", "mr", "mrs", "ms", "mx", "prof", "sr", "jr", "st", "mt", "gen", "col", "capt", "lt", "sgt", "cmdr", "adm", "sen", "rep",
            "gov", "hon", "rev", "vs",
            "के", "की", "का", "में", "से", "को", "पर", "ने", "और", "या", "भी", "तो", "कि", "जो", "यह", "वह", "इस", "उस", "एक", "कुछ", "सभी",
            "अपने", "अपनी", "अपना", "उनके", "उनकी", "इसके", "इसकी", "लिए", "साथ", "बाद", "पहले", "द्वारा", "तक", "बीच", "ही"));
    private static final Pattern WEAK_INITIAL = Pattern.compile("^\\p{Lu}$");
    private static final Pattern WEAK_NUMBER = Pattern.compile("^\\p{Sc}?\\d[\\d,.]*%?$");
    private static final Pattern MARKS_BEFORE = Pattern.compile("^[^\\p{L}\\p{M}\\p{N}\\p{Sc}]+");
    private static final Pattern MARKS_AFTER = Pattern.compile("[^\\p{L}\\p{M}\\p{N}%]+$");
    private static final Pattern SPACES_AFTER = Pattern.compile("\\s+$");

    private TextFit() { }

    /** Takes off what must not stand before an ellipsis: spaces, and the marks that lead into a next word (a comma, a dash). */
    private static String trimTail(String text) { return TAIL.matcher(text).replaceFirst(""); }

    private static boolean isWeak(String word) {
        String core = MARKS_AFTER.matcher(MARKS_BEFORE.matcher(word).replaceFirst("")).replaceFirst("");
        return core.isEmpty() || WEAK_WORDS.contains(core.toLowerCase(java.util.Locale.ROOT))
                || WEAK_INITIAL.matcher(core).matches() || WEAK_NUMBER.matcher(core).matches();
    }

    /** An opening bracket that is never closed, close to the end, is no place to stop: the text is cut before it. */
    private static String beforeOpenBracket(String text, int minWords) {
        int open = text.lastIndexOf('(');
        if (open < 0 || open < text.lastIndexOf(')') || text.length() - open > 48) return text;
        String before = SPACES_AFTER.matcher(text.substring(0, open)).replaceFirst("");
        return before.split("\\s+").length >= minWords ? before : text;
    }

    static String trimWeakTail(String text) { return trimWeakTail(text, 4, 4); }

    /**
     * The text without the words at its end that cannot end it, up to {@code limit} of them and never leaving fewer than
     * {@code minWords} words, and without an opening bracket that is never closed: "…Joymalya Bagchi…" and not "…Bagchi and V…".
     */
    static String trimWeakTail(String text, int limit, int minWords) {
        String kept = SPACES_AFTER.matcher(text).replaceFirst("");
        for (int round = 0; round < 2; round++) {
            List<int[]> words = new ArrayList<>();
            Matcher found = WORD.matcher(kept);
            while (found.find()) words.add(new int[] {found.start(), found.end()});
            int keep = words.size();
            while (keep > minWords && words.size() - keep < limit && isWeak(kept.substring(words.get(keep - 1)[0], words.get(keep - 1)[1]))) keep--;
            if (keep < words.size()) kept = kept.substring(0, words.get(keep - 1)[1]);
            String closed = beforeOpenBracket(kept, minWords);
            if (closed.equals(kept)) break;
            kept = closed;
        }
        return kept;
    }

    /** Whether the mark at this index closes a sentence: not a full stop after a title, an initial or an abbreviation with stops of its own. */
    static boolean endsSentence(String text, int index) {
        if (text.charAt(index) != '.') return true;
        Matcher word = LAST_WORD.matcher(text.substring(0, index));
        String last = word.find() ? word.group(1) : "";
        if (last.isEmpty()) return true;
        if (last.codePointCount(0, last.length()) == 1 && Character.isUpperCase(last.codePointAt(0)) || last.indexOf('.') >= 0) return false;
        return !NOT_AN_END.contains(last.toLowerCase(java.util.Locale.ROOT));
    }

    /** Whether the text ends a sentence at this index: ".", "!", "?" or a danda, and a closing quote after it. */
    private static boolean sentenceEndsAt(String text, int end) {
        int mark = end - 1;
        if (mark > 0 && "\"\u201d\u2019')]".indexOf(text.charAt(mark)) >= 0 && ".!?\u0964".indexOf(text.charAt(mark - 1)) >= 0) mark--;
        return ".!?\u0964".indexOf(text.charAt(mark)) >= 0 && endsSentence(text, mark);
    }

    /**
     * The text as it is shown in {@code lines} lines: all of it when it fits, else the most of it that does, ending as above.
     */
    static String fit(String text, int lines, LineCounter counter) { return fit(text, lines, counter, SLACK_LINES); }

    static String fit(String text, int lines, LineCounter counter, int slack) {
        if (lines <= 0) return "";
        String full = text.trim();
        if (full.isEmpty() || counter.lines(full) <= lines) return text;
        // The index after each word.
        List<Integer> ends = new ArrayList<>();
        Matcher words = WORD.matcher(full);
        while (words.find()) ends.add(words.end());
        // The most words that fit with an ellipsis after them (a text that fits with n words fits with fewer).
        int low = 0, high = ends.size() - 1, best = -1;
        while (low <= high) {
            int middle = (low + high) >> 1;
            if (counter.lines(trimTail(full.substring(0, ends.get(middle))) + ELLIPSIS) <= lines) { best = middle; low = middle + 1; }
            else high = middle - 1;
        }
        if (best < 0) return ELLIPSIS;
        // The last sentence that ends within what fits: a better place to stop than a word when it is close to the end of the room.
        for (int index = best; index >= 0; index--) {
            if (!sentenceEndsAt(full, ends.get(index))) continue;
            String sentence = full.substring(0, ends.get(index));
            if (counter.lines(sentence) >= lines - slack) return sentence;
            break; // an earlier sentence is further from the end still
        }
        return trimTail(trimWeakTail(full.substring(0, ends.get(best)))) + ELLIPSIS;
    }
}
