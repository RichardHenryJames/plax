package com.plaxlabs.news;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntFunction;

/**
 * Where the full-page ads stand in the pager: one after every fifth story, never before the fifth, so the first five stories are
 * clean, and never after the last story, so a feed does not end on an ad. The website has the same rule (src/lib/ad-slots.ts), so a
 * phone and a browser count alike.
 *
 * <p>The feed model knows nothing of ads: its list holds stories (and the caught-up card), and its positions index that list. The
 * pager's list is made from it by putting an ad page in each of the slots that are <em>shown</em> (the slots whose ad has loaded),
 * and these functions turn a position in one list into a position in the other. A slot is described by its {@code after}: the
 * number of items that come before it, which is also the index of the item it stands in front of.
 */
final class AdSlots {
    /** One ad after this many stories. */
    static final int STORIES_PER_AD = 5;

    private AdSlots() { }

    /** The {@code after} of each slot a list of this many stories has: 5, 10, 15, and so on, but only where another story follows. */
    static int[] after(int storyCount, int every) {
        if (every < 1) throw new IllegalArgumentException("an ad slot needs at least one story before it");
        int count = 0;
        for (int after = every; after < storyCount; after += every) count++;
        int[] slots = new int[count];
        for (int index = 0; index < count; index++) slots[index] = every * (index + 1);
        return slots;
    }

    static int[] after(int storyCount) { return after(storyCount, STORIES_PER_AD); }

    /** The number of the slot that stands after this many stories (from 1): the same slot, however many stories are loaded. */
    static int ordinal(int after, int every) { return after / every; }

    static int ordinal(int after) { return ordinal(after, STORIES_PER_AD); }

    /** The position in the pager of an item of the model's list, when the slots in {@code shown} (ascending) hold ads. */
    static int pagerIndex(int item, int[] shown) {
        int index = item;
        for (int after : shown) if (after <= item) index++;
        return index;
    }

    /** Whether this pager position is an ad. The ad of {@code shown[k]} stands at {@code shown[k] + k}. */
    static boolean isAd(int pager, int[] shown) {
        for (int slot = 0; slot < shown.length; slot++) if (shown[slot] + slot == pager) return true;
        return false;
    }

    /**
     * The item of the model's list that a pager position stands for. An ad stands for the story before it, so that the model keeps
     * the position of the story the reader has just read, and does not count the next one as seen before it is on the screen.
     */
    static int item(int pager, int[] shown) {
        int ads = 0;
        for (int slot = 0; slot < shown.length; slot++) {
            int at = shown[slot] + slot;
            if (at == pager) return shown[slot] - 1;
            if (at < pager) ads++;
        }
        return pager - ads;
    }

    /** The slot of the ad at this pager position, as its {@code after}, or -1 where there is no ad. */
    static int slotAt(int pager, int[] shown) {
        for (int slot = 0; slot < shown.length; slot++) if (shown[slot] + slot == pager) return shown[slot];
        return -1;
    }

    /** The model's list with an ad item put in front of the item each shown slot names. */
    static <T> List<T> interleave(List<T> items, int[] shown, IntFunction<T> ad) {
        if (shown.length == 0) return items;
        List<T> out = new ArrayList<>(items.size() + shown.length);
        int next = 0;
        for (int index = 0; index < items.size(); index++) {
            if (next < shown.length && shown[next] == index) { out.add(ad.apply(ordinal(shown[next]))); next++; }
            out.add(items.get(index));
        }
        return out;
    }
}
