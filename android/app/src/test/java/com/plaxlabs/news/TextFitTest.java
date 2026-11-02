package com.plaxlabs.news;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Where a summary ends when its room does. The cases mirror text-fit.test.mjs on the website: the same texts and widths give the
 * same cuts on both. A text is measured as a column of 40 characters would hold it (words are not broken, as in a layout).
 */
public class TextFitTest {
    private static final int COLUMN = 40;
    private static final TextFit.LineCounter COUNT = text -> {
        int lines = 1, used = 0;
        for (String word : text.trim().split("\\s+")) {
            if (word.isEmpty()) continue;
            if (used == 0) used = word.length();
            else if (used + 1 + word.length() <= COLUMN) used += 1 + word.length();
            else { lines++; used = word.length(); }
        }
        return lines;
    };

    private static final String STORY = "Uganda has begun withdrawing its troops from Somalia after nearly two decades of military involvement. "
            + "The first group of troops deployed under a bilateral arrangement had already arrived back home. "
            + "Others will follow in a few days, the army said on Monday, and all forces will exit by the end of 2027 in a phased withdrawal.";
    private static final String FIRST = "Uganda has begun withdrawing its troops from Somalia after nearly two decades of military involvement.";

    @Test public void aTextThatFitsIsShownWholeAsItIs() {
        assertEquals(STORY, TextFit.fit(STORY, 20, COUNT));
        assertEquals("Short.", TextFit.fit("Short.", 1, COUNT));
        assertEquals("", TextFit.fit("", 3, COUNT));
    }

    @Test public void aTextThatDoesNotFitEndsAfterAWordNeverInTheMiddleOfOneWithAnEllipsisAndFits() {
        for (int lines = 1; lines <= 8; lines++) {
            String shown = TextFit.fit(STORY, lines, COUNT, 0);
            assertTrue(lines + ": " + shown, COUNT.lines(shown) <= lines);
            assertTrue(shown, shown.endsWith(TextFit.ELLIPSIS) || shown.matches(".*[.!?]$"));
            String start = shown.replace(TextFit.ELLIPSIS, "").trim();
            assertTrue("the start of the text: " + start, STORY.startsWith(start));
            for (String word : start.split(" ")) assertTrue("a whole word: " + word, STORY.contains(word));
        }
    }

    @Test public void theEllipsisFollowsTheLastWordNotACommaOrADashThatLedToTheNext() {
        String text = "Officials said the review would take several weeks, according to people familiar with it, and more would follow soon after.";
        for (int lines = 1; lines <= 4; lines++) assertFalse(String.valueOf(lines), TextFit.fit(text, lines, COUNT, 0).matches(".*[,;:\u2013\u2014-]\u2026$"));
    }

    @Test public void aSentenceThatEndsWithinALineOrTwoOfTheEndOfTheRoomIsWhereTheTextStopsWithNoEllipsis() {
        String shown = TextFit.fit(STORY, COUNT.lines(FIRST) + 1, COUNT);
        assertEquals(FIRST, shown);
        assertFalse(shown.endsWith(TextFit.ELLIPSIS));
    }

    @Test public void aSentenceFurtherThanThatFromTheEndOfTheRoomIsNotWorthTheGapItLeavesTheTextRunsOnToTheLastWordThatFits() {
        int lines = COUNT.lines(FIRST) + TextFit.SLACK_LINES + 3;
        String shown = TextFit.fit(STORY, lines, COUNT);
        assertTrue(shown.length() > FIRST.length());
        assertTrue(COUNT.lines(shown) <= lines);
        assertTrue(shown.endsWith(TextFit.ELLIPSIS) || shown.matches(".*[.!?]$"));
    }

    @Test public void aFullStopAfterATitleOrAnInitialIsNotTheEndOfASentence() {
        String text = "Dr. Rao said on Monday that M. K. Stalin would arrive at 4:30 p.m. in the U.S. capital with Mr. Singh and Prof. Das and others.";
        for (int lines = 1; lines <= 3; lines++) {
            String shown = TextFit.fit(text, lines, COUNT);
            assertFalse(lines + ": " + shown, shown.matches(".*(Dr|Mr|Prof|K|U\\.S|p\\.m)\\.$"));
        }
    }

    @Test public void aClosingQuoteAfterTheFullStopBelongsToTheSentenceAndAHindiSentenceEndsAtItsDanda() {
        String quoted = "He said \u201cnothing will change before the vote\u201d. The ministry has not said more on the matter since then, officials added.";
        assertTrue(TextFit.fit(quoted, 3, COUNT).startsWith("He said \u201cnothing will change before the vote\u201d."));
        String hindi = "रविवार को दिल्ली में विपक्षी दलों के कई नेता जुटे। हज़ारों लोगों की भीड़ इकट्ठा हुई और नारे लगे। सरकार ने कोई बयान नहीं दिया।";
        String cut = TextFit.fit(hindi, 2, COUNT);
        assertTrue(COUNT.lines(cut) <= 2);
        assertTrue(cut, cut.endsWith("\u0964") || cut.endsWith(TextFit.ELLIPSIS));
    }

    @Test public void whateverTheRoomTheTextShownFitsItAndNothingIsMadeUp() {
        String[] words = "the minister said on monday that the review of every district would take several weeks and that figures would be asked for first".split(" ");
        int checked = 0;
        for (int size = 5; size <= 60; size += 5) {
            StringBuilder text = new StringBuilder();
            for (int i = 0; i < size; i++) text.append(i == 0 ? "" : " ").append(words[i % words.length]).append(i % 11 == 10 ? "." : "");
            for (int lines = 1; lines <= 9; lines++) {
                String shown = TextFit.fit(text.toString(), lines, COUNT);
                assertTrue(size + "/" + lines + ": " + shown, COUNT.lines(shown) <= lines);
                assertTrue(size + "/" + lines + ": the start of the text", text.toString().startsWith(shown.replace(TextFit.ELLIPSIS, "").stripTrailing()));
                checked++;
            }
        }
        assertTrue(checked > 100);
        assertEquals("", TextFit.fit(STORY, 0, COUNT));
        // A word wider than the room: nothing but the ellipsis fits.
        assertEquals(TextFit.ELLIPSIS, TextFit.fit("Pneumonoultramicroscopicsilicovolcanoconiosis is long", 1, text -> text.length() > 20 ? 2 : 1));
    }
}
