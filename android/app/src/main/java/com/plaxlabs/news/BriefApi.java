package com.plaxlabs.news;

import com.google.gson.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** Calls the existing Plax summarize endpoint. The story text is the only data sent. */
final class BriefApi implements BriefSource {
    /** Recently written briefs, so reopening one is instant. */
    static final Map<String, Brief> CACHE = Collections.synchronizedMap(new LinkedHashMap<>(16, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Brief> eldest) { return size() > 40; }
    });
    private static final int MAX_BYTES = 128 * 1024;
    private static final int MAX_SOURCE = 2200;
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final ExecutorService STARTER = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "plax-brief-start"); thread.setDaemon(true); return thread;
    });

    static String key(Story story, String lang) { return story.id() + "|" + lang; }

    static String requestBody(Story story, String lang) {
        JsonObject body = new JsonObject();
        String source = story.content().strip();
        body.addProperty("content", source.length() > MAX_SOURCE ? source.substring(0, MAX_SOURCE) : source);
        body.addProperty("title", story.title());
        body.addProperty("type", "microessay");
        body.addProperty("lang", lang);
        body.addProperty("category", story.category());
        return body.toString();
    }

    static Brief parse(String text) throws IOException {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            String content = string(root, "content", 8000);
            if (content.isBlank()) throw new IOException("Empty brief");
            return new Brief(string(root, "title", 400), content.strip());
        } catch (JsonParseException | IllegalStateException | ClassCastException invalid) {
            throw new IOException("Invalid brief response");
        }
    }

    private static String string(JsonObject root, String key, int maximum) throws IOException {
        JsonElement item = root.get(key);
        if (item == null || item.isJsonNull()) return "";
        if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString()) throw new IOException("Invalid field");
        String value = item.getAsString().strip();
        if (value.length() > maximum) throw new IOException("Field too long");
        return value;
    }

    @Override public Cancelable brief(Story story, String lang, Result result) {
        Cancelable[] handle = new Cancelable[1];
        boolean[] cancelled = new boolean[1];
        STARTER.execute(() -> {
            synchronized (handle) {
                if (cancelled[0]) return;
                // The server can take several seconds for an uncached translation.
                OkHttpClient client = Network.api().newBuilder().readTimeout(40, TimeUnit.SECONDS)
                        .callTimeout(45, TimeUnit.SECONDS).build();
                Call call = client.newCall(new Request.Builder().url(FeedApi.SITE + "/api/summarize")
                        .header("Accept", "application/json")
                        .post(RequestBody.create(requestBody(story, lang), JSON)).build());
                handle[0] = call::cancel;
                call.enqueue(new Callback() {
                    @Override public void onFailure(Call request, IOException failure) {
                        if (!request.isCanceled()) result.failed(R.string.brief_error);
                    }
                    @Override public void onResponse(Call request, Response response) {
                        try (response) {
                            if (!response.isSuccessful() || response.body() == null) { result.failed(R.string.brief_error); return; }
                            byte[] bytes = FeedApi.boundedRead(response.body().byteStream(), MAX_BYTES);
                            result.done(parse(new String(bytes, StandardCharsets.UTF_8)));
                        } catch (IOException invalid) {
                            if (!request.isCanceled()) result.failed(R.string.brief_error);
                        }
                    }
                });
            }
        });
        return () -> {
            synchronized (handle) {
                cancelled[0] = true;
                if (handle[0] != null) handle[0].cancel();
            }
        };
    }
}
