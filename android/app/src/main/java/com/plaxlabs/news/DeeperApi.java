package com.plaxlabs.news;

import com.google.gson.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

/** Calls the Plax "go deeper" endpoint, the same one the website uses. The story's headline and text are the only data sent. */
final class DeeperApi implements DeeperSource {
    /** Recently written insights, so reopening them is instant. */
    static final Map<String, Deeper> CACHE = Collections.synchronizedMap(new LinkedHashMap<>(16, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Deeper> eldest) { return size() > 40; }
    });
    private static final int MAX_BYTES = 64 * 1024;
    /** What the endpoint reads of a story's text (it cuts at the same length). */
    private static final int MAX_SOURCE = 1500;
    /** The endpoint writes three; a few more are shown if it ever sends them, and no more than a sheet can hold. */
    private static final int MAX_INSIGHTS = 5;
    private static final int MAX_INSIGHT_CHARS = 1000;
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final ExecutorService STARTER = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "plax-deeper-start"); thread.setDaemon(true); return thread;
    });

    static String key(Story story, String lang) { return story.id() + "|" + lang; }

    static String requestBody(Story story, String lang) {
        JsonObject body = new JsonObject();
        String source = story.content().strip();
        body.addProperty("title", story.title());
        body.addProperty("content", source.length() > MAX_SOURCE ? source.substring(0, MAX_SOURCE) : source);
        body.addProperty("lang", lang);
        return body.toString();
    }

    /** The insights in an answer: text only, blanks left out, and an answer with none is a failure, not an empty sheet. */
    static Deeper parse(String text) throws IOException {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            JsonElement list = root.get("insights");
            if (list == null || !list.isJsonArray()) throw new IOException("Invalid insights");
            List<String> insights = new ArrayList<>();
            for (JsonElement item : list.getAsJsonArray()) {
                if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString()) throw new IOException("Invalid insight");
                String value = item.getAsString().strip();
                if (value.length() > MAX_INSIGHT_CHARS) throw new IOException("Insight too long");
                if (!value.isEmpty() && insights.size() < MAX_INSIGHTS) insights.add(value);
            }
            if (insights.isEmpty()) throw new IOException("No insights");
            return new Deeper(List.copyOf(insights));
        } catch (JsonParseException | IllegalStateException | ClassCastException invalid) {
            throw new IOException("Invalid response");
        }
    }

    @Override public Cancelable deeper(Story story, String lang, Result result) {
        Cancelable[] handle = new Cancelable[1];
        boolean[] cancelled = new boolean[1];
        STARTER.execute(() -> {
            synchronized (handle) {
                if (cancelled[0]) return;
                // The server can take several seconds for an uncached answer.
                OkHttpClient client = Network.api().newBuilder().readTimeout(40, TimeUnit.SECONDS)
                        .callTimeout(45, TimeUnit.SECONDS).build();
                Call call = client.newCall(new Request.Builder().url(FeedApi.SITE + "/api/deeper")
                        .header("Accept", "application/json")
                        .post(RequestBody.create(requestBody(story, lang), JSON)).build());
                handle[0] = call::cancel;
                call.enqueue(new Callback() {
                    @Override public void onFailure(Call request, IOException failure) {
                        if (!request.isCanceled()) result.failed(R.string.deeper_error);
                    }
                    @Override public void onResponse(Call request, Response response) {
                        try (response) {
                            if (!response.isSuccessful() || response.body() == null) { result.failed(R.string.deeper_error); return; }
                            byte[] bytes = FeedApi.boundedRead(response.body().byteStream(), MAX_BYTES);
                            result.done(parse(new String(bytes, StandardCharsets.UTF_8)));
                        } catch (IOException invalid) {
                            if (!request.isCanceled()) result.failed(R.string.deeper_error);
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
