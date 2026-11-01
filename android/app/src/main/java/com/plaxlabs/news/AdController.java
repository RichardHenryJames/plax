package com.plaxlabs.news;

import android.content.Context;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import java.util.function.LongSupplier;

/**
 * Decides when a full-page ad is asked for, when it joins the pager and when it is let go. It knows nothing of views: it is told where
 * the reader is, it asks the {@link AdNetwork} for ads, and it says (through {@link Listener#changed}) when the set of ad pages
 * changes. {@link AdSlots} says where the slots are; this says which of them hold an ad.
 *
 * <p>The rules, each of which exists so that the pager never moves under the reader and a reader never sees an ad twice in a row:
 * <ul>
 * <li>A slot is asked for when the reader is {@link #LOOKAHEAD} stories or fewer before it, so the ad has had the time of a few swipes
 *     to arrive. A slot nearer than that, or already passed, is not asked for.</li>
 * <li>An ad that arrives joins the pager only if its slot is still ahead of the reader, so a page is never inserted at or before the
 *     one on the screen. An ad that arrives after its slot has been passed is let go.</li>
 * <li>An ad the reader has been shown stays while the reader is within a story of it (so a swipe back and forth shows the same page)
 *     and is let go when the reader is further away, so the same ad is never kept for a second visit and memory stays small. A new
 *     visit to the slot asks for a new ad.</li>
 * <li>An ad that has been held for longer than {@link #STALE_MS} without being shown is let go: Google's native ads expire after an
 *     hour, and an expired ad earns nothing.</li>
 * <li>Two requests in a row that bring no ad stop the asking for {@link #PAUSE_MS}: on a bad connection, or while an account is new
 *     and has nothing to serve, the app does not ask at every swipe.</li>
 * </ul>
 * All of it runs on the main thread.
 */
final class AdController {
    interface Listener {
        /** The slots that hold an ad page have changed: the pager's list is to be made again. */
        void changed();
    }

    /** A slot is asked for when the reader is this many stories, or fewer, before it. */
    static final int LOOKAHEAD = 3;
    static final int MAX_FAILURES = 2;
    static final long PAUSE_MS = 5 * 60_000L;
    static final long STALE_MS = 50 * 60_000L;

    /** A slot with no entry is idle. */
    private enum State { LOADING, READY, SEEN, FAILED }

    private static final class Slot {
        final int after;
        State state = State.LOADING;
        AdNetwork.Page page;
        Cancelable request;
        long loadedAt;

        Slot(int after) { this.after = after; }

        boolean holdsAd() { return state == State.READY || state == State.SEEN; }
    }

    private final AdNetwork network;
    private final Context context;
    private final LongSupplier clock;
    private final int every;
    private final TreeMap<Integer, Slot> slots = new TreeMap<>();
    private Listener listener;
    /** The reader's consent is settled and the ads library is started. */
    private boolean ready, destroyed;
    /** Where the reader is: the item of the model's list, and how long that list is. -1 until the reader has been seen. */
    private int item = -1, count;
    private int failures;
    private long pausedUntil;

    AdController(AdNetwork network, Context context, LongSupplier clock, int every) {
        this.network = network; this.context = context; this.clock = clock; this.every = every;
    }

    AdController(AdNetwork network, Context context) {
        this(network, context, System::currentTimeMillis, AdSlots.STORIES_PER_AD);
    }

    /** Whether full-page ads are shown at all in this build. */
    boolean enabled() { return network.page(); }

    void listen(Listener changed) { listener = changed; }

    /** Consent is settled and the library is started: ads may be asked for. */
    void ready() {
        if (destroyed || ready) return;
        ready = true;
        if (item >= 0) request();
    }

    boolean isReady() { return ready; }

    /**
     * The reader is on this item of the model's list, which is {@code count} long. {@code onSlot} is the slot of the ad page the reader
     * is on, or -1 on a story. Call it whenever the reader moves, and whenever the list changes.
     */
    void reader(int item, int count, int onSlot) {
        if (destroyed || !network.page()) return;
        this.item = item; this.count = count;
        if (onSlot >= 0) {
            Slot slot = slots.get(onSlot);
            if (slot != null && slot.state == State.READY) slot.state = State.SEEN;
        }
        boolean changed = sweep();
        if (ready) request();
        if (changed) notifyChanged();
    }

    /** The slots, ascending, that hold an ad now and have a story after them: the ones the pager shows a page for. */
    int[] shown() {
        List<Integer> held = new ArrayList<>();
        for (Slot slot : slots.values()) if (slot.holdsAd() && slot.after < count) held.add(slot.after);
        int[] result = new int[held.size()];
        for (int index = 0; index < result.length; index++) result[index] = held.get(index);
        return result;
    }

    /** The ad of the slot with this number (see {@link AdSlots#ordinal}), or null when it has none or has been let go. */
    AdNetwork.Page page(int ordinal) {
        Slot slot = slots.get(ordinal * every);
        return slot != null && slot.holdsAd() ? slot.page : null;
    }

    /** Lets everything go: the screen is closing for good. */
    void destroy() {
        if (destroyed) return;
        destroyed = true;
        listener = null;
        for (Slot slot : slots.values()) release(slot);
        slots.clear();
    }

    /** Lets go of what is behind the reader or has gone stale. True when a page that was shown is gone. */
    private boolean sweep() {
        boolean changed = false;
        long now = clock.getAsLong();
        for (Slot slot : new ArrayList<>(slots.values())) {
            int distance = slot.after - item;
            boolean let = false;
            switch (slot.state) {
                case SEEN: let = distance >= 2 || distance <= -1; break;
                case READY: let = distance <= 0 || now - slot.loadedAt > STALE_MS; break;
                case LOADING: let = distance <= 0 || distance > LOOKAHEAD + 2; break;
                case FAILED: let = distance <= 0 || distance > LOOKAHEAD; break;
            }
            if (!let) continue;
            slots.remove(slot.after);
            changed |= slot.holdsAd() && slot.after < count;
            release(slot);
        }
        return changed;
    }

    private void request() {
        if (destroyed || item < 0 || clock.getAsLong() < pausedUntil) return;
        for (int after : AdSlots.after(count, every)) {
            int distance = after - item;
            if (distance < 1 || distance > LOOKAHEAD || slots.containsKey(after)) continue;
            load(after);
        }
    }

    private void load(int after) {
        Slot slot = new Slot(after);
        slots.put(after, slot);
        Cancelable request = network.loadPage(context, new AdNetwork.Page.Listener() {
            @Override public void loaded(AdNetwork.Page page) { arrived(slot, page); }
            @Override public void failed() { missed(slot); }
        });
        // A network that answers at once has settled the slot already; there is nothing left to cancel then.
        if (slots.get(after) == slot && slot.state == State.LOADING) slot.request = request;
    }

    private void arrived(Slot slot, AdNetwork.Page page) {
        if (destroyed || slots.get(slot.after) != slot || slot.state != State.LOADING) { page.destroy(); return; }
        failures = 0;
        if (slot.after - item < 1) {
            // The reader went past while it loaded.
            slots.remove(slot.after);
            page.destroy();
            return;
        }
        slot.page = page; slot.state = State.READY; slot.request = null; slot.loadedAt = clock.getAsLong();
        notifyChanged();
    }

    private void missed(Slot slot) {
        if (destroyed || slots.get(slot.after) != slot || slot.state != State.LOADING) return;
        slot.state = State.FAILED; slot.request = null;
        if (++failures >= MAX_FAILURES) { failures = 0; pausedUntil = clock.getAsLong() + PAUSE_MS; }
    }

    private void release(Slot slot) {
        if (slot.request != null) slot.request.cancel();
        slot.request = null;
        if (slot.page != null) slot.page.destroy();
        slot.page = null;
    }

    private void notifyChanged() {
        if (listener != null) listener.changed();
    }
}
