package com.plaxlabs.news;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * How a story page shares out its height. The numbers are pixels of a phone page: 1639 high, a 165 action row, a 116 source
 * line, headline lines of 91 under 33 of space, summary lines of 71 under 39 of space, a picture of up to 495.
 */
public class CardFitTest {
    private static CardFit.Input page(int height, int titleNatural, int bodyNatural) {
        return new CardFit.Input(height, 116, 165, 33, 91, titleNatural, 4, 39, 71, bodyNatural, 495, 264, 743);
    }

    private static int used(CardFit.Input in, CardFit.Plan plan) {
        return in.meta() + in.actions() + plan.hero()
                + (plan.titleLines() == 0 ? 0 : in.titleTop() + plan.titleLines() * in.titleLine())
                + (plan.bodyLines() == 0 ? 0 : in.bodyTop() + plan.bodyLines() * in.bodyLine());
    }

    @Test public void aRoomyPageGivesThePictureItsFullSizeAndTheSummaryTheRest() {
        CardFit.Plan plan = CardFit.plan(page(1639, 3, 12));
        assertEquals("the picture is as big as it is meant to be", 495, plan.hero());
        assertEquals(3, plan.titleLines());
        assertEquals("what is left is whole lines of the summary", 7, plan.bodyLines());
        assertTrue(used(page(1639, 3, 12), plan) <= 1639);
    }

    @Test public void aLongHeadlineKeepsAllItsLinesAndTheSummaryGivesWay() {
        CardFit.Input input = new CardFit.Input(1639, 116, 165, 33, 91, 6, 5, 39, 71, 12, 495, 264, 743);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals("the headline is cut at the most it may take, not shorter", 5, plan.titleLines());
        assertEquals(495, plan.hero());
        assertEquals(4, plan.bodyLines());
        assertTrue(used(input, plan) <= 1639);
    }

    @Test public void aShorterPageShrinksThePictureToKeepThreeLinesOfSummary() {
        CardFit.Plan plan = CardFit.plan(page(1200, 3, 12));
        assertEquals(361, plan.hero());
        assertEquals(3, plan.bodyLines());
        assertTrue(used(page(1200, 3, 12), plan) <= 1200);
    }

    @Test public void aPictureTooSmallToBeWorthShowingIsDroppedBeforeAnyText() {
        CardFit.Plan plan = CardFit.plan(page(1100, 3, 12));
        assertEquals(0, plan.hero());
        assertEquals("the headline keeps its lines", 3, plan.titleLines());
        assertEquals("and the summary takes the picture's room", 6, plan.bodyLines());
    }

    @Test public void aVeryShortPageCutsTheHeadlineBeforeItLosesTheSummary() {
        CardFit.Input input = page(720, 4, 12);
        CardFit.Plan plan = CardFit.plan(input);
        assertEquals(CardFit.MIN_TITLE_LINES, plan.titleLines());
        assertEquals(0, plan.hero());
        assertEquals(2, plan.bodyLines());
        assertTrue(used(input, plan) <= 720);
    }

    @Test public void aStoryWithNothingUnderItsHeadlineLetsThePictureGrowTaller() {
        CardFit.Plan plan = CardFit.plan(page(1639, 2, 0));
        assertEquals(743, plan.hero());
        assertEquals(0, plan.bodyLines());
        assertEquals("and with no room for a picture it has none", 0, CardFit.plan(page(560, 2, 0)).hero());
    }

    @Test public void aPageWithNoPictureInItsColumnSpendsEverythingOnText() {
        CardFit.Input beside = new CardFit.Input(700, 116, 165, 33, 91, 2, 3, 39, 71, 9, 0, 264, 0);
        CardFit.Plan plan = CardFit.plan(beside);
        assertEquals(0, plan.hero());
        assertEquals(2, plan.titleLines());
        assertEquals((700 - 116 - 165 - (33 + 182) - 39) / 71, plan.bodyLines());
        assertEquals(2, plan.bodyLines());
        assertEquals(0, CardFit.plan(new CardFit.Input(500, 116, 165, 33, 91, 2, 3, 0, 71, 0, 0, 264, 0)).hero());
    }

    @Test public void aHeadlineTooTallForThePageLosesLinesEvenWithNoSummaryToProtect() {
        CardFit.Plan plan = CardFit.plan(page(531, 3, 0));
        assertEquals(2, plan.titleLines());
        assertTrue(used(page(531, 3, 0), plan) <= 531);
        assertEquals("a page that holds only one line of it gets one", 1, CardFit.plan(page(116 + 165 + 33 + 91 + 5, 3, 0)).titleLines());
    }

    @Test public void aStoryWithNoHeadlineIsJustTheSummary() {
        CardFit.Plan plan = CardFit.plan(page(1639, 0, 8));
        assertEquals(0, plan.titleLines());
        assertEquals(495, plan.hero());
        assertTrue(plan.bodyLines() >= 8);
    }

    @Test public void whateverThePageHoldsNothingIsPlannedBeyondIt() {
        int checked = 0;
        for (int height = 420; height <= 3200; height += 37) {
            for (int title = 0; title <= 7; title++) {
                for (int body = 0; body <= 16; body += 2) {
                    for (int preferred : new int[]{0, 300, 495}) {
                        CardFit.Input input = new CardFit.Input(height, 116, 165, 33, 91, title, title > 4 ? 5 : 4, 39, 71, body,
                                preferred, 264, preferred * 3 / 2);
                        CardFit.Plan plan = CardFit.plan(input);
                        // A page too small for the source line, one line of headline and the action row holds nothing anyway.
                        int leastHeadline = title == 0 ? 0 : 33 + 91;
                        boolean holdsTheLeastItNeeds = height >= input.meta() + input.actions() + leastHeadline;
                        if (holdsTheLeastItNeeds) assertTrue("height " + height + " title " + title + " body " + body + ": "
                                + plan + " uses " + used(input, plan), used(input, plan) <= height);
                        assertTrue("a picture is either absent or worth showing", plan.hero() == 0 || plan.hero() >= 264);
                        assertTrue(plan.hero() <= Math.max(preferred, preferred * 3 / 2));
                        assertTrue(plan.titleLines() <= Math.min(title, input.titleMax()));
                        // The headline keeps two lines whenever the page can hold them, and one line whatever the page.
                        int keptWhenThereIsRoom = Math.min(title, CardFit.MIN_TITLE_LINES);
                        boolean roomForThose = height >= input.meta() + input.actions() + 33 + keptWhenThereIsRoom * 91;
                        if (title > 0) assertTrue("height " + height + " title " + title + " body " + body + ": " + plan,
                                plan.titleLines() >= (roomForThose ? keptWhenThereIsRoom : 1));
                        if (body == 0) assertEquals(0, plan.bodyLines());
                        if (preferred == 0) assertEquals("no picture in this column", 0, plan.hero());
                        checked++;
                    }
                }
            }
        }
        assertTrue(checked > 10_000);
    }
}
