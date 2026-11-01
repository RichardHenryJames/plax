package com.plaxlabs.news;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * How a story page shares out its height. The cases mirror card-fit.test.mjs on the website: the same numbers give the same
 * plan on both. They are the pixels of a phone page of 744 high: a 40 source line, a 58 action row, headline lines of 32 under
 * 10 of space, summary lines of 28 under 12 of space, a picture of between 117 and 297 (262 is the usual most, 297 the most
 * when there is little to read).
 */
public class CardFitTest {
    private static CardFit.Input page(int height, int titleNatural, int bodyNatural) {
        return new CardFit.Input(height, 40, 40, 58, 10, 32, titleNatural, 4, 12, 28, bodyNatural, 262, 117, 297);
    }

    private static int used(CardFit.Input in, CardFit.Plan plan) {
        return (plan.hero() > 0 ? in.meta() : in.metaBare()) + in.actions() + plan.hero()
                + (plan.titleLines() == 0 ? 0 : in.titleTop() + plan.titleLines() * in.titleLine())
                + (plan.bodyLines() == 0 ? 0 : in.bodyTop() + plan.bodyLines() * in.bodyLine());
    }

    @Test public void aRoomyPageShowsTheWholeSummaryAndLetsThePictureGrowUpToTheTallestItMayBe() {
        CardFit.Input input = page(744, 3, 7);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals("the picture takes the room the text leaves, up to its most", 297, plan.hero());
        assertEquals(3, plan.titleLines());
        assertEquals("every line of the summary", 7, plan.bodyLines());
        assertTrue(used(input, plan) <= 744);
    }

    @Test public void aLittleToReadGivesThePictureMoreThanASquareSoThatThePageIsFull() {
        CardFit.Input input = page(744, 2, 2);
        CardFit.Plan plan = CardFit.plan(input);
        assertTrue("past the usual most", plan.hero() > input.heroMaximum());
        assertEquals(input.heroTall(), plan.hero());
        assertEquals(2, plan.bodyLines());
        assertTrue(used(input, plan) <= 744);
    }

    @Test public void aLongSummaryIsShownWholeAndThePictureShrinksToWhatIsLeft() {
        CardFit.Input input = page(744, 4, 12);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals(4, plan.titleLines());
        assertEquals("the whole summary when it fits beside the least picture", 12, plan.bodyLines());
        assertEquals("and the picture takes what remains", 744 - 58 - 40 - (10 + 4 * 32) - (12 + 12 * 28), plan.hero());
        assertTrue(plan.hero() >= 117 && plan.hero() < 297);
        assertTrue(used(input, plan) <= 744);
    }

    @Test public void aSummaryALineTooLongForTheLeastPictureIsCutAtAWholeLineAndThePictureStays() {
        CardFit.Input input = page(744, 4, 14);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals("the headline keeps its lines", 4, plan.titleLines());
        assertEquals("the summary is cut by the line that did not fit", 13, plan.bodyLines());
        assertEquals("and the picture takes what the lines leave", 744 - 58 - 40 - (10 + 4 * 32) - (12 + 13 * 28), plan.hero());
        assertTrue("which is its least and less than a line more", plan.hero() >= 117 && plan.hero() < 117 + 28);
        assertTrue(used(input, plan) <= 744);
    }

    @Test public void aPosterOnlyStandsInForAPictureSoItIsDroppedBeforeAnyOfTheSummaryIsCut() {
        CardFit.Input input = withPoster(page(744, 4, 14));
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals(0, plan.hero());
        assertEquals("the headline keeps its lines", 4, plan.titleLines());
        assertEquals("and the summary all of its own", 14, plan.bodyLines());
        assertTrue(used(input, plan) <= 744);
        // With room for all of the summary beside it, a poster is shown like a photograph.
        CardFit.Plan roomy = CardFit.plan(withPoster(page(744, 3, 7)));
        assertEquals(297, roomy.hero());
        assertEquals(7, roomy.bodyLines());
        // And a photograph is kept.
        assertEquals(132, CardFit.plan(page(744, 4, 14)).hero());
    }

    private static CardFit.Input withPoster(CardFit.Input in) {
        return new CardFit.Input(in.height(), in.meta(), in.metaBare(), in.actions(), in.titleTop(), in.titleLine(), in.titleNatural(),
                in.titleMax(), in.bodyTop(), in.bodyLine(), in.bodyNatural(), in.heroMaximum(), in.heroMinimum(), in.heroTall(), false);
    }

    @Test public void aLongSummaryIsCutToWhatFitsBesideTheLeastPictureHoweverLongItIs() {
        for (int natural : new int[]{25, 40, 200}) {
            CardFit.Input input = page(744, 4, natural);
            CardFit.Plan plan = CardFit.plan(input);
            assertEquals(4, plan.titleLines());
            assertEquals(13, plan.bodyLines());
            assertEquals(132, plan.hero());
            assertTrue(used(input, plan) <= 744);
        }
    }

    @Test public void aLongHeadlineKeepsAllItsLinesUpToTheMostItMayTakeAndTheSummaryGivesWayToWhatIsLeft() {
        CardFit.Input input = new CardFit.Input(500, 40, 40, 58, 10, 32, 6, 5, 12, 28, 12, 262, 117, 297);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals("the headline is cut at the most it may take, not shorter", 5, plan.titleLines());
        assertEquals("three lines of the summary beside the least picture", CardFit.MIN_BODY_LINES, plan.bodyLines());
        assertEquals(500 - 58 - 40 - (10 + 5 * 32) - (12 + 3 * 28), plan.hero());
        assertTrue(used(input, plan) <= 500);
    }

    @Test public void aShortPageCutsTheHeadlineBeforeItLeavesTheSummaryLessThanThreeLines() {
        CardFit.Input input = page(330, 4, 6);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals("one line of the headline for the lines of the summary", 3, plan.titleLines());
        assertEquals(0, plan.hero());
        assertEquals(4, plan.bodyLines());
        assertTrue(used(input, plan) <= 330);
    }

    @Test public void aVeryShortPageCutsTheHeadlineAsFarAsTwoLinesAndThenTheSummary() {
        CardFit.Input input = page(240, 4, 12);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals(CardFit.MIN_TITLE_LINES, plan.titleLines());
        assertEquals(0, plan.hero());
        assertEquals((240 - 58 - 40 - (10 + 2 * 32) - 12) / 28, plan.bodyLines());
        assertTrue(used(input, plan) <= 240);
    }

    @Test public void aSummaryTooShortToNeedThreeLinesIsNeverCutForTheHeadline() {
        CardFit.Plan plan = CardFit.plan(page(300, 4, 2));
        assertEquals(2, plan.bodyLines());
        assertTrue(plan.titleLines() >= CardFit.MIN_TITLE_LINES);
    }

    @Test public void theSourceLineIsCountedAsItStandsWithThePictureAboveItOrFirstOnThePage() {
        // With the menu button at its start the line is taller when it has no picture above it, and the summary has less.
        CardFit.Input plain = new CardFit.Input(412, 40, 40, 58, 10, 32, 3, 4, 12, 28, 7, 262, 117, 297);
        assertEquals(0, CardFit.plan(plain).hero());
        assertEquals(7, CardFit.plan(plain).bodyLines());
        CardFit.Input withMenu = new CardFit.Input(412, 40, 48, 58, 10, 32, 3, 4, 12, 28, 7, 262, 117, 297);
        CardFit.Plan plan = CardFit.plan(withMenu);
        assertEquals(0, plan.hero());
        assertEquals((412 - 58 - 48 - (10 + 3 * 32) - 12) / 28, plan.bodyLines());
        assertEquals("counted with the bigger line", 6, plan.bodyLines());
        assertTrue(used(withMenu, plan) <= 412);
    }

    @Test public void aStoryWithNothingUnderItsHeadlineLetsThePictureGrowTaller() {
        CardFit.Plan plan = CardFit.plan(page(744, 2, 0));
        assertEquals(297, plan.hero());
        assertEquals(0, plan.bodyLines());
        assertEquals("and with no room for a picture it has none", 0, CardFit.plan(page(250, 2, 0)).hero());
    }

    @Test public void aPageWithNoPictureSpendsEverythingOnText() {
        CardFit.Input none = new CardFit.Input(500, 40, 40, 58, 10, 32, 2, 4, 12, 28, 9, 0, 117, 0);
        CardFit.Plan plan = CardFit.plan(none);
        assertEquals(0, plan.hero());
        assertEquals(2, plan.titleLines());
        assertEquals("the whole summary", 9, plan.bodyLines());
        assertEquals((330 - 58 - 40 - (10 + 2 * 32) - 12) / 28,
                CardFit.plan(new CardFit.Input(330, 40, 40, 58, 10, 32, 2, 4, 12, 28, 9, 0, 117, 0)).bodyLines());
        assertEquals(0, CardFit.plan(new CardFit.Input(200, 40, 40, 58, 10, 32, 2, 4, 0, 28, 0, 0, 117, 0)).hero());
    }

    @Test public void aHeadlineTooTallForThePageLosesLinesEvenWithNoSummaryToProtect() {
        CardFit.Input input = page(200, 3, 0);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals(2, plan.titleLines());
        assertTrue(used(input, plan) <= 200);
        assertEquals("a page that holds only one line of it gets one", 1, CardFit.plan(page(40 + 58 + 10 + 32 + 5, 3, 0)).titleLines());
    }

    @Test public void aStoryWithNoHeadlineIsJustTheSummary() {
        CardFit.Plan plan = CardFit.plan(page(744, 0, 8));
        assertEquals(0, plan.titleLines());
        assertEquals(297, plan.hero());
        assertEquals(8, plan.bodyLines());
    }

    @Test public void whateverThePageHoldsNothingIsPlannedBeyondItAndTheSummaryIsWholeWheneverItCanBe() {
        int checked = 0;
        for (int height = 220; height <= 1400; height += 23) {
            for (int title = 0; title <= 7; title++) {
                for (int body = 0; body <= 30; body += 3) {
                    for (int maximum : new int[]{0, 180, 262}) {
                        for (int bare : new int[]{40, 52}) {
                            CardFit.Input input = new CardFit.Input(height, 40, bare, 58, 10, 32, title, title > 4 ? 5 : 4, 12, 28, body,
                                    maximum, 117, maximum * 12 / 10);
                            CardFit.Plan plan = CardFit.plan(input);
                            String where = "height " + height + " title " + title + " body " + body + " maximum " + maximum
                                    + " bare " + bare + ": " + plan + " uses " + used(input, plan);
                            // A page too small for the source line, one line of headline and the action row holds nothing anyway.
                            int leastHeadline = title == 0 ? 0 : 10 + 32;
                            if (height >= bare + 58 + leastHeadline) assertTrue(where, used(input, plan) <= height);
                            assertTrue("a picture is either absent or worth showing: " + where, plan.hero() == 0 || plan.hero() >= 117);
                            assertTrue(where, plan.hero() <= Math.max(maximum, input.heroTall()));
                            assertTrue(where, plan.titleLines() <= Math.min(title, input.titleMax()));
                            assertTrue(where, plan.bodyLines() <= body);
                            if (maximum == 0) assertEquals("no picture in this layout", 0, plan.hero());
                            if (body == 0) assertEquals(0, plan.bodyLines());
                            // The headline keeps two lines whenever the page can hold them, and one line whatever the page.
                            int kept = Math.min(title, CardFit.MIN_TITLE_LINES);
                            if (title > 0) assertTrue(where, plan.titleLines() >= (height >= bare + 58 + 10 + kept * 32 ? kept : 1));
                            // With a picture on the page, the summary has at least its three lines, and is whole or the picture is at
                            // its least (the lines left over go to the picture, so it is less than a line more than its least).
                            if (plan.hero() > 0 && body > 0) {
                                assertTrue(where, plan.bodyLines() >= Math.min(body, CardFit.MIN_BODY_LINES));
                                if (plan.bodyLines() < body) assertTrue(where, plan.hero() < input.heroMinimum() + input.bodyLine());
                            }
                            // And a summary that fits beside the least picture (or, with no picture to be had, on the page) is never cut.
                            if (body > 0 && title > 0 && plan.titleLines() == Math.min(title, input.titleMax())) {
                                int needs = 58 + (maximum > 0 ? 40 + input.heroMinimum() : bare) + 10 + plan.titleLines() * 32 + 12 + body * 28;
                                if (needs <= height) assertEquals(where, body, plan.bodyLines());
                            }
                            checked++;
                        }
                    }
                }
            }
        }
        assertTrue(checked > 10_000);
    }
}
