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

/**
 * Asks the Plax site to make a story's own page and returns its address, so that sharing sends a link which previews
 * well in chat apps and brings readers to Plax. The server accepts only a story exactly as it served it (it signs every
 * story), so the story itself is the only data sent. Any trouble means no link, and the publisher's link is shared.
 */
final class ShareLinks implements ShareSource {
    /** The longest a reader waits for the link after tapping Share. A first request to a cold server takes a couple of seconds. */
    static final int WAIT_SECONDS = 7;
    /** The site's own link-making service and the pages it makes live in the same place as the feed. */
    static final String ENDPOINT = FeedApi.SITE + "/api/share";

    /** Replaced by tests, as BriefSheet.source is. */
    static ShareSource source = new ShareLinks();

    private static final int MAX_BYTES = 8 * 1024;
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final ExecutorService STARTER = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "plax-share-start"); thread.setDaemon(true); return thread;
    });
    /** Links made in this session, so sharing a story again is instant. */
    private static final Map<String, String> MADE = Collections.synchronizedMap(new LinkedHashMap<>(16, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, String> eldest) { return size() > 60; }
    });

    /** Whether a story can have a page of its own: the server signed it, and it points back to its publisher. */
    static boolean eligible(Story story) {
        return Story.isSignature(story.sig()) && !story.sourceUrl().isEmpty();
    }

    /** The story as the feed served it, with its signature. Nothing about the reader is sent. */
    static String requestBody(Story story) {
        JsonObject body = new JsonObject();
        body.addProperty("id", story.id());
        body.addProperty("title", story.title());
        body.addProperty("content", story.content());
        body.addProperty("source", story.source());
        body.addProperty("sourceUrl", story.sourceUrl());
        body.addProperty("image", story.image());
        body.addProperty("publishedAt", story.publishedAt());
        body.addProperty("category", story.category());
        body.addProperty("section", story.section());
        body.addProperty("sig", story.sig());
        return body.toString();
    }

    /**
     * The page address the server named, or an empty string. It is only trusted if it is a story page of this very
     * story on the Plax site itself, so a wrong answer can never make the app share some other address.
     */
    static String address(String text, Story story) {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            String id = root.get("id").getAsString();
            HttpUrl link = HttpUrl.parse(root.get("url").getAsString());
            HttpUrl site = HttpUrl.get(FeedApi.SITE);
            if (!story.sig().startsWith(id) || id.length() != 16 || link == null || !link.isHttps()
                    || !link.host().equals(site.host()) || link.port() != site.port()
                    || link.encodedQuery() != null || link.encodedFragment() != null) return "";
            String path = link.encodedPath();
            return path.startsWith(site.encodedPath() + "/s/") && path.endsWith("-" + id) ? link.toString() : "";
        } catch (RuntimeException invalid) {
            return "";
        }
    }

    /**
     * What the chooser is given: the headline, then one link on its own line. That is the story's page on Plax when it
     * has one, else its publisher's own link, else the site's for a story with no link at all.
     */
    static String message(Story story, String plaxLink, String appName) {
        String headline = story.title().isBlank() ? appName : story.title();
        String link = !plaxLink.isEmpty() ? plaxLink : story.hasSource() ? story.sourceUrl() : FeedApi.SITE;
        return headline + "\n" + link;
    }

    @Override public Cancelable link(Story story, Result result) {
        String known = MADE.get(story.sig());
        if (known != null) {
            result.done(known);
            return () -> { };
        }
        Handle handle = new Handle();
        STARTER.execute(() -> {
            // Built here, so that the caller can return to drawing at once.
            OkHttpClient client = Network.api().newBuilder().connectTimeout(5, TimeUnit.SECONDS)
                    .readTimeout(WAIT_SECONDS, TimeUnit.SECONDS).callTimeout(WAIT_SECONDS, TimeUnit.SECONDS).build();
            Call call = client.newCall(new Request.Builder().url(ENDPOINT).header("Accept", "application/json")
                    .post(RequestBody.create(requestBody(story), JSON)).build());
            if (!handle.attach(call)) return;
            call.enqueue(new Callback() {
                @Override public void onFailure(Call request, IOException failure) {
                    if (!handle.cancelled()) result.done("");
                }
                @Override public void onResponse(Call request, Response response) {
                    String link = "";
                    try (response) {
                        if (response.isSuccessful() && response.body() != null) {
                            byte[] bytes = FeedApi.boundedRead(response.body().byteStream(), MAX_BYTES);
                            link = address(new String(bytes, StandardCharsets.UTF_8), story);
                        }
                    } catch (IOException invalid) {
                        link = "";
                    }
                    if (!link.isEmpty()) MADE.put(story.sig(), link);
                    if (!handle.cancelled()) result.done(link);
                }
            });
        });
        return handle;
    }

    private static final class Handle implements Cancelable {
        private Call call;
        private boolean cancelled;

        synchronized boolean attach(Call started) {
            if (cancelled) return false;
            call = started;
            return true;
        }
        synchronized boolean cancelled() { return cancelled; }
        @Override public synchronized void cancel() {
            cancelled = true;
            if (call != null) call.cancel();
        }
    }
}
