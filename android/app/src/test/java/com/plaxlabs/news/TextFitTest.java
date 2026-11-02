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

    private static final String COURT = "The Supreme Court on Monday (November 2, 2026) set aside an order of the Rajasthan State Election Commission (SEC) refusing permission to a civil society organisation to conduct voter awareness campaigns. "
            + "Observing that voters\u2019 awareness initiatives by such organisations should be encouraged rather than restricted, a bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi and V Viswanathan said the order was unsustainable.";
    private static final String SHARES = "IDBI Bank shares ended 2.1 per cent lower in Mumbai on Monday compared to a 1.7 per cent rise in the Sensex as staff began a two-day strike against the planned sale of the lender to a foreign investor.";

    @Test public void aCutAfterAWordStopsOnOneThatSaysAThingNotOnAndOfTheAnInitialATitleOrANumber() {
        assertTrue("not \"\u2026 Bagchi and V\u2026\"", TextFit.fit(COURT, 11, COUNT, 0).endsWith("Justices Joymalya Bagchi\u2026"));
        assertTrue("not \"\u2026 the order was\u2026\"", TextFit.fit(COURT, 12, COUNT, 0).endsWith("and V Viswanathan said the order\u2026"));
        assertTrue("not \"\u2026 initiatives by such\u2026\"", TextFit.fit(COURT, 7, COUNT, 0).endsWith("awareness initiatives\u2026"));
        assertTrue("not \"\u2026 an order of the\u2026\"", TextFit.fit(COURT, 2, COUNT, 0).endsWith("set aside an order\u2026"));
        assertTrue("not \"\u2026 of 2027 in a\u2026\"", TextFit.fit(STORY, 8, COUNT, 0).endsWith("will exit by the end\u2026"));
        assertTrue("not \"\u2026 compared to a\u2026\"", TextFit.fit(SHARES, 2, COUNT, 0).endsWith("Monday compared\u2026"));
        assertTrue("not \"\u2026 against the\u2026\"", TextFit.fit(SHARES, 4, COUNT, 0).endsWith("a two-day strike\u2026"));
    }

    @Test public void whateverTheRoomACutEndsOnAWordThatCanEndATextAndTheTextShownStillFits() {
        java.util.Set<String> weak = java.util.Set.of("a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "by", "with", "from", "as", "that", "was", "is", "v");
        for (String text : new String[] {COURT, SHARES, STORY}) {
            for (int lines = 3; lines <= 12; lines++) {
                String shown = TextFit.fit(text, lines, COUNT, 0);
                assertTrue(lines + ": " + shown, COUNT.lines(shown) <= lines);
                if (!shown.endsWith(TextFit.ELLIPSIS)) continue;
                String[] words = shown.substring(0, shown.length() - 1).trim().split(" ");
                String last = words[words.length - 1].replaceAll("[^\\p{L}\\p{N}]+", "").toLowerCase(java.util.Locale.ROOT);
                assertFalse(lines + ": " + shown, weak.contains(last));
            }
        }
    }

    @Test public void aTextCutAtAWordStopsBeforeTheWordsThatNeedTheNextOne() {
        assertEquals("a bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi",
                TextFit.trimWeakTail("a bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi and V"));
        assertEquals("shares ended 2.1 per cent lower in Mumbai on Monday compared", TextFit.trimWeakTail("shares ended 2.1 per cent lower in Mumbai on Monday compared to a 1.7"));
        assertEquals("all forces will exit by the end", TextFit.trimWeakTail("all forces will exit by the end of 2027 in a"));
        assertEquals("the minister said on Monday that he would meet", TextFit.trimWeakTail("the minister said on Monday that he would meet Dr."));
        assertEquals("Officials said the review would take several weeks", TextFit.trimWeakTail("Officials said the review would take several weeks \u2013"));
        for (String kept : new String[] {
                "Officials said the review would take several weeks",
                "The bench comprising Chief Justice of India Surya Kant and Justices Joymalya Bagchi",
                "the study of 4,000 patients found that nothing changed, researchers said.",
                "Officials said the review would take several weeks,"}) assertEquals(kept, TextFit.trimWeakTail(kept));
    }

    @Test public void anOpeningBracketThatIsNeverClosedNearTheEndIsNoPlaceToStop() {
        assertEquals("The Supreme Court on Monday", TextFit.trimWeakTail("The Supreme Court on Monday (November 2"));
        assertEquals("Raids were carried out on Monday by officers of the Directorate of Revenue Intelligence",
                TextFit.trimWeakTail("Raids were carried out on Monday by officers of the Directorate of Revenue Intelligence (DRI"));
        String closed = "The Supreme Court on Monday (November 2, 2026) set aside the order";
        assertEquals(closed, TextFit.trimWeakTail(closed));
        String far = "(the first line of a long note that goes on for a good while and says several things about the case";
        assertEquals(far, TextFit.trimWeakTail(far));
        assertEquals("A (short note", TextFit.trimWeakTail("A (short note"));
    }

    @Test public void atMostFourWordsAreTakenOffAndNeverSoManyThatFewerThanFourAreLeft() {
        assertEquals("the minister said that", TextFit.trimWeakTail("the minister said that the"));
        assertEquals("one two three", TextFit.trimWeakTail("one two three"));
        assertEquals("they said it was one of the in", TextFit.trimWeakTail("they said it was one of the in a of the to"));
        assertEquals("a b c of the", TextFit.trimWeakTail("a b c of the in a", 2, 3));
    }

    @Test public void hindiPostpositionsAndConjunctionsDoNotEndACutEither() {
        assertEquals("रविवार को दिल्ली के रामलीला मैदान में विपक्षी दलों के कई नेता", TextFit.trimWeakTail("रविवार को दिल्ली के रामलीला मैदान में विपक्षी दलों के कई नेता और"));
        assertEquals("रविवार को दिल्ली में हज़ारों लोगों की भीड़ इकट्ठा हुई और हज़ारों लोगों",
                TextFit.trimWeakTail("रविवार को दिल्ली में हज़ारों लोगों की भीड़ इकट्ठा हुई और हज़ारों लोगों की"));
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
