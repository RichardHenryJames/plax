package com.plaxlabs.news;

import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Keeps the seen-story history across launches. It is a convenience: a damaged file just means starting over. */
final class SeenFile {
    private final AtomicFile file;

    SeenFile(File directory) { file = new AtomicFile(new File(directory, "seen-stories.json")); }

    /** An empty history when nothing was saved yet; throws when the file is damaged. */
    SeenStore read(long now) throws IOException {
        byte[] data;
        try (InputStream stream = file.openRead()) { data = FeedApi.boundedRead(stream, FeedParser.MAX_BYTES); }
        catch (FileNotFoundException missing) { return new SeenStore(); }
        return SeenStore.fromJson(new String(data, StandardCharsets.UTF_8), now);
    }

    void write(SeenStore seen) throws IOException {
        byte[] bytes = seen.toJson().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > FeedParser.MAX_BYTES) throw new IOException("Seen history exceeds storage limit");
        FileOutputStream output = file.startWrite();
        try {
            output.write(bytes);
            file.finishWrite(output);
        } catch (IOException failure) {
            file.failWrite(output);
            throw failure;
        }
    }

    void delete() { file.delete(); }
}
