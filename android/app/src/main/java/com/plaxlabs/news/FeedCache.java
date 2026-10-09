package com.plaxlabs.news;

import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * The last page of stories per topic and language, so the app can draw instantly and refresh in the
 * background. It lives in the system-clearable cache directory and a damaged file is simply dropped.
 */
final class FeedCache {
    record Entry(List<Story> stories, long savedAt) {
        long age(long now) { return Math.max(0, now - savedAt); }
    }

    private final File directory;

    FeedCache(File cacheDirectory) { directory = new File(cacheDirectory, "feed"); }

    /** One file per topic and language; the file name of a topic page is unchanged from earlier versions. */
    static String key(Topic topic, String lang) { return topic.id + "-" + lang; }

    /** One file per language and set of interests. */
    static String key(String categories, String lang) {
        return "foryou-" + lang + "-" + Integer.toHexString(categories.hashCode());
    }

    private AtomicFile file(String key) {
        if (!key.matches("[a-z0-9-]{1,60}")) throw new IllegalArgumentException("Invalid cache key");
        return new AtomicFile(new File(directory, key + ".json"));
    }

    /** Returns null when nothing usable is cached. Never throws: a cache must not break startup. */
    Entry read(String key) {
        AtomicFile file = file(key);
        if (!file.getBaseFile().exists()) return null;
        try {
            byte[] data;
            try (InputStream stream = file.openRead()) { data = FeedApi.boundedRead(stream, FeedParser.MAX_BYTES); }
            List<Story> stories = FeedParser.cached(new String(data, StandardCharsets.UTF_8));
            return stories.isEmpty() ? null : new Entry(stories, file.getBaseFile().lastModified());
        } catch (IOException | RuntimeException unusable) {
            file.delete();
            return null;
        }
    }

    void write(String key, List<Story> stories) throws IOException {
        if (stories.isEmpty()) return;
        List<Story> page = stories.size() > FeedParser.CACHE_LIMIT ? stories.subList(0, FeedParser.CACHE_LIMIT) : stories;
        byte[] bytes = FeedParser.encodeCache(page).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > FeedParser.MAX_BYTES) return;
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory())
            throw new IOException("Cache directory unavailable");
        AtomicFile file = file(key);
        FileOutputStream output = file.startWrite();
        try {
            output.write(bytes);
            file.finishWrite(output);
        } catch (IOException failure) {
            file.failWrite(output);
            throw failure;
        }
    }
}
