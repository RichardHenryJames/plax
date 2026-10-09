package com.plaxlabs.news;

import com.google.gson.*;
import java.io.IOException;
import java.util.*;

/**
 * Everything the reader has already looked at, so a story never comes back: not the same
 * story on the next launch, and not the same event worded by another outlet.
 *
 * Only a small fingerprint per story is kept (id, normalised headline, times), never the
 * story text, and it stays on the phone. The newest {@link #LIMIT} entries are retained: news
 * for {@link #MAX_AGE_MS}, evergreen facts for {@link #EVERGREEN_AGE_MS} so a small topic recycles.
 */
final class SeenStore {
    static final int LIMIT = 1500;
    static final long MAX_AGE_MS = 30L * 24 * 3_600_000;
    static final long EVERGREEN_AGE_MS = 7L * 24 * 3_600_000;

    private record Entry(String id, Similarity.Print print, long seenAt) {
        /** When the event happened, as best as is known. */
        long when() { return print.published > 0 ? print.published : seenAt; }
    }

    private volatile List<Entry> entries = List.of();

    int size() { return entries.size(); }

    /** True when this exact story, or another outlet's version of the same event, was already seen. */
    boolean contains(Story story, long now) {
        return contains(story, Similarity.print(story), now);
    }

    boolean contains(Story story, Similarity.Print print, long now) {
        long when = print.published > 0 ? print.published : now;
        for (Entry entry : entries) {
            if (entry.id.equals(story.id())) return true;
            if (Similarity.same(print, when, entry.print, entry.when())) return true;
        }
        return false;
    }

    /** Records a story as seen. Returns false when it already was, or when its id could not be stored and read back. */
    synchronized boolean mark(Story story, long now) {
        if (story.id().isEmpty() || story.id().length() > 200) return false;
        Similarity.Print print = Similarity.print(story);
        if (contains(story, print, now)) return false;
        List<Entry> next = new ArrayList<>(entries.size() + 1);
        next.addAll(entries);
        next.add(new Entry(story.id(), print, now));
        entries = prune(next, now);
        return true;
    }

    private static List<Entry> prune(List<Entry> list, long now) {
        List<Entry> kept = new ArrayList<>(list.size());
        for (Entry entry : list) if (now - entry.seenAt <= (entry.print.timely ? MAX_AGE_MS : EVERGREEN_AGE_MS)) kept.add(entry);
        if (kept.size() > LIMIT) kept = new ArrayList<>(kept.subList(kept.size() - LIMIT, kept.size()));
        return List.copyOf(kept);
    }

    /** Ids of the most recently seen stories, newest first, to tell the server what not to send. */
    List<String> recentIds(int maximum) {
        List<Entry> snapshot = entries;
        List<String> ids = new ArrayList<>(Math.min(maximum, snapshot.size()));
        for (int index = snapshot.size() - 1; index >= 0 && ids.size() < maximum; index--) ids.add(snapshot.get(index).id);
        return ids;
    }

    String toJson() {
        JsonObject root = new JsonObject();
        root.addProperty("schema", 1);
        JsonArray array = new JsonArray();
        for (Entry entry : entries) {
            JsonObject value = new JsonObject();
            value.addProperty("id", entry.id); value.addProperty("k", entry.print.key);
            value.addProperty("p", entry.print.published); value.addProperty("t", entry.seenAt);
            value.addProperty("n", entry.print.timely);
            array.add(value);
        }
        root.add("seen", array);
        return root.toString();
    }

    static SeenStore fromJson(String text, long now) throws IOException {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            if (root.get("schema").getAsInt() != 1) throw new IOException("Unsupported seen format");
            List<Entry> list = new ArrayList<>();
            for (JsonElement element : root.getAsJsonArray("seen")) {
                JsonObject value = element.getAsJsonObject();
                String id = value.get("id").getAsString();
                String key = value.get("k").getAsString();
                if (id.isEmpty() || id.length() > 200 || key.length() > 600) throw new IOException("Invalid seen entry");
                long published = value.get("p").getAsLong(), seenAt = value.get("t").getAsLong();
                if (published < 0 || seenAt < 0) throw new IOException("Invalid seen entry");
                list.add(new Entry(id, Similarity.print(key, published, value.get("n").getAsBoolean()), seenAt));
            }
            SeenStore store = new SeenStore();
            store.entries = prune(list, now);
            return store;
        } catch (JsonParseException | IllegalStateException | NullPointerException | ClassCastException | NumberFormatException invalid) {
            throw new IOException("Invalid seen history");
        }
    }
}
