package com.plaxlabs.news;

import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Where the full-page ads stand, and how a position in the model's list becomes one in the pager and back. The cases mirror
 * ad-slots.test.mjs on the website: a phone and a browser count the same.
 */
public class AdSlotsTest {
    private static List<String> stories(int count) {
        String[] list = new String[count];
        for (int index = 0; index < count; index++) list[index] = "story-" + (index + 1);
        return List.of(list);
    }

    @Test public void theFirstFiveStoriesAreCleanSoNoSlotComesBeforeTheFifthIsPassed() {
        for (int count = 0; count <= 5; count++) assertEquals(count + " stories", 0, AdSlots.after(count).length);
    }

    @Test public void theSlotIsAfterTheFifthStoryOnceASixthFollowsIt() {
        assertArrayEquals(new int[]{5}, AdSlots.after(6));
        assertArrayEquals(new int[]{5}, AdSlots.after(9));
    }

    @Test public void aFeedNeverEndsOnAnAdSoThereIsNoSlotWhereNoStoryFollows() {
        assertArrayEquals(new int[]{5}, AdSlots.after(10));
        assertArrayEquals(new int[]{5, 10}, AdSlots.after(15));
        for (int count = 1; count <= 60; count++) for (int after : AdSlots.after(count)) assertTrue(count + " stories, slot after " + after, after < count);
    }

    @Test public void slotsAreExactlyFiveStoriesApartAndKeepTheirNumberAsMoreStoriesAreLoaded() {
        int[] slots = AdSlots.after(100);
        assertEquals(19, slots.length);
        for (int index = 0; index < slots.length; index++) {
            assertEquals(5 * (index + 1), slots[index]);
            assertEquals("the number of the slot", index + 1, AdSlots.ordinal(slots[index]));
        }
        for (int count = 6; count < 60; count++) {
            int[] before = AdSlots.after(count), more = AdSlots.after(count + 1);
            for (int index = 0; index < before.length; index++) assertEquals(before[index], more[index]);
        }
    }

    @Test public void theRuleCanBeChangedForTestsAndRefusesNonsense() {
        assertArrayEquals(new int[]{3, 6}, AdSlots.after(8, 3));
        assertThrows(IllegalArgumentException.class, () -> AdSlots.after(10, 0));
        assertThrows(IllegalArgumentException.class, () -> AdSlots.after(10, -2));
    }

    @Test public void anAdPageNeedsMoreRoomTheLargerTheText() {
        assertEquals(450, AdSlots.pageNeededDp(1f));
        assertEquals(540, AdSlots.pageNeededDp(2f));
        assertEquals("smaller text does not shrink the picture", AdSlots.pageNeededDp(1f), AdSlots.pageNeededDp(.85f));
        int last = 0;
        for (float scale : new float[]{1f, 1.15f, 1.3f, 1.5f, 1.75f, 2f}) {
            assertTrue(scale + "x", AdSlots.pageNeededDp(scale) > last);
            last = AdSlots.pageNeededDp(scale);
        }
    }

    @Test public void aScreenShowsAdPagesOnlyWhereTheCardFits() {
        // A usual phone has the room at every text size, a phone on its side or a small window has none.
        for (float scale : new float[]{1f, 1.3f, 2f}) assertTrue(scale + "x", AdSlots.pageFits(780, scale));
        assertFalse(AdSlots.pageFits(393, 1f));
        assertFalse(AdSlots.pageFits(500, 1f));
        // The pager is the screen less the strip, and the edge is exact.
        int needed = AdSlots.pageNeededDp(1.3f);
        assertTrue(AdSlots.pageFits(needed + 60, 1.3f));
        assertFalse(AdSlots.pageFits(needed + 59, 1.3f));
        // The same screen has room for the card at normal text and not at the largest.
        assertTrue(AdSlots.pageFits(560, 1f));
        assertFalse(AdSlots.pageFits(560, 2f));
    }

    @Test public void interleavePutsAnAdInFrontOfTheStoryEachShownSlotNames() {
        List<String> list = AdSlots.interleave(stories(12), new int[]{5, 10}, ordinal -> "ad-" + ordinal);
        assertEquals(List.of(
                "story-1", "story-2", "story-3", "story-4", "story-5", "ad-1",
                "story-6", "story-7", "story-8", "story-9", "story-10", "ad-2",
                "story-11", "story-12"), list);
    }

    @Test public void interleaveWithNothingShownReturnsTheListItself() {
        List<String> list = stories(12);
        assertSame(list, AdSlots.interleave(list, new int[0], ordinal -> "ad"));
    }

    @Test public void onlyTheSlotsWhoseAdIsReadyAreShownAndTheOthersAreSimplySkipped() {
        // The first slot has no ad, the second has.
        List<String> list = AdSlots.interleave(stories(12), new int[]{10}, ordinal -> "ad-" + ordinal);
        assertEquals(13, list.size());
        assertEquals("ad-2", list.get(10));
        assertEquals("story-10", list.get(9));
        assertEquals("story-11", list.get(11));
    }

    @Test public void aPositionInTheModelsListBecomesAPositionInThePagerAndBack() {
        int[] shown = {5, 10};
        int[] pager = {0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14};
        for (int item = 0; item < pager.length; item++) {
            assertEquals("pager position of item " + item, pager[item], AdSlots.pagerIndex(item, shown));
            assertEquals("and back", item, AdSlots.item(pager[item], shown));
            assertFalse(AdSlots.isAd(pager[item], shown));
        }
    }

    @Test public void anAdIsAtItsSlotsPlaceAndStandsForTheStoryBeforeIt() {
        int[] shown = {5, 10};
        assertTrue(AdSlots.isAd(5, shown));
        assertTrue(AdSlots.isAd(11, shown));
        assertFalse(AdSlots.isAd(4, shown));
        assertFalse(AdSlots.isAd(6, shown));
        assertEquals("the story the reader has just read, not the one that is not on the screen yet", 4, AdSlots.item(5, shown));
        assertEquals(9, AdSlots.item(11, shown));
        assertEquals(5, AdSlots.slotAt(5, shown));
        assertEquals(10, AdSlots.slotAt(11, shown));
        assertEquals(-1, AdSlots.slotAt(6, shown));
    }

    @Test public void withNoAdsShownThePositionsAreTheSame() {
        for (int position = 0; position < 30; position++) {
            assertEquals(position, AdSlots.pagerIndex(position, new int[0]));
            assertEquals(position, AdSlots.item(position, new int[0]));
            assertFalse(AdSlots.isAd(position, new int[0]));
        }
    }

    @Test public void theMappingAgreesWithTheListThatInterleaveMakes() {
        for (int count = 1; count <= 40; count++) {
            int[] shown = AdSlots.after(count);
            List<String> items = stories(count);
            List<String> pager = AdSlots.interleave(items, shown, ordinal -> "ad-" + ordinal);
            assertEquals(count + shown.length, pager.size());
            for (int item = 0; item < count; item++) assertEquals(items.get(item), pager.get(AdSlots.pagerIndex(item, shown)));
            for (int position = 0; position < pager.size(); position++) {
                boolean ad = pager.get(position).startsWith("ad-");
                assertEquals(count + " stories, position " + position, ad, AdSlots.isAd(position, shown));
                int stands = AdSlots.item(position, shown);
                if (!ad) assertEquals(pager.get(position), items.get(stands));
                else assertEquals("an ad stands for the story before it", items.get(stands), pager.get(position - 1));
            }
        }
    }

    @Test public void theAdMarkerOfTheStoryClassIsToldFromAStoryAndKeepsItsNumber() {
        Story ad = Story.ad(7);
        assertTrue(ad.isAd());
        assertEquals(7, ad.adOrdinal());
        assertFalse(ad.isCaughtUp());
        assertFalse(Story.caughtUp().isAd());
        Story story = new Story("the-hindu-s0dezi", "Title", "Body", "news", "india", "The Hindu", "https://example.com/a", "", "5s", 1L);
        assertFalse(story.isAd());
        assertEquals(0, story.adOrdinal());
        assertEquals(12, Story.ad(12).adOrdinal());
    }
}
