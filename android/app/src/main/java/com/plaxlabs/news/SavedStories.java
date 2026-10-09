package com.plaxlabs.news;

import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class SavedStories {
    static final int LIMIT = 200;
    private final AtomicFile file;

    SavedStories(File directory) { file = new AtomicFile(new File(directory, "saved-stories.json")); }

    List<Story> read() throws IOException {
        byte[] data;
        try (InputStream stream = file.openRead()) { data = FeedApi.boundedRead(stream, FeedParser.MAX_BYTES); }
        catch (FileNotFoundException missing) {
            if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return List.of();
            throw missing;
        }
        return FeedParser.saved(new String(data, StandardCharsets.UTF_8));
    }

    void write(List<Story> stories) throws IOException {
        if (stories.size() > LIMIT) throw new IOException("Saved story limit reached");
        byte[] bytes = FeedParser.encodeSaved(stories).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > FeedParser.MAX_BYTES) throw new IOException("Saved stories exceed storage limit");
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
