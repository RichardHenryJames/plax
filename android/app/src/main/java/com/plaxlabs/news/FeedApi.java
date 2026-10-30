package com.plaxlabs.news;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import okhttp3.*;

final class FeedApi implements FeedSource {
    /**
     * The website the app reads stories from, signs in through and checks for updates at. The website's own constant is
     * SITE_URL in src/lib/site.ts, and SiteAddressTest fails if the two differ. It is the Vercel domain because the
     * domain the app was first built around expired, which left installed apps with no stories and no sign-in: the
     * address is fixed in each build, so it can only be repaired by shipping a new app.
     */
    static final String SITE = "https://plax-rouge.vercel.app/news";
    /** The privacy policy, which Google Play also links to; the app opens it from the menu, About and the account sheet. */
    static final String PRIVACY_URL = SITE + "/privacy";
    private static final ExecutorService STARTER = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "plax-feed-start"); thread.setDaemon(true); return thread;
    });

    static HttpUrl url(String categories, String lang, List<String> excluded, boolean refresh) {
        HttpUrl.Builder url = HttpUrl.get(SITE + "/api/feed").newBuilder()
                .addQueryParameter("categories", categories).addQueryParameter("limit", "30")
                .addQueryParameter("lang", lang);
        if (!excluded.isEmpty()) url.addQueryParameter("exclude", String.join(",", excluded));
        if (refresh) url.addQueryParameter("refresh", "true");
        return url.build();
    }

    /** The HTTP client is built on a worker, so the caller can return to drawing immediately. */
    @Override public Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result) {
        Handle handle = new Handle();
        STARTER.execute(() -> {
            Call call = Network.api().newCall(new Request.Builder().url(url(categories, lang, excluded, refresh))
                    .header("Accept", "application/json").build());
            if (!handle.attach(call)) return;
            call.enqueue(new Callback() {
                @Override public void onFailure(Call request, IOException failure) {
                    if (!handle.cancelled()) result.failed(R.string.network_error);
                }
                @Override public void onResponse(Call request, Response response) {
                    try (response) {
                        if (handle.cancelled()) return;
                        if (!response.isSuccessful()) {
                            result.failed(response.code() == 429 ? R.string.rate_error : R.string.service_error);
                            return;
                        }
                        if (response.body() == null) { result.failed(R.string.invalid_feed); return; }
                        byte[] bytes = boundedRead(response.body().byteStream(), FeedParser.MAX_BYTES);
                        result.loaded(FeedParser.feed(new String(bytes, StandardCharsets.UTF_8)));
                    } catch (FeedParser.ServiceException unavailable) {
                        result.failed(R.string.service_error);
                    } catch (IOException invalid) {
                        if (!handle.cancelled()) result.failed(R.string.invalid_feed);
                    }
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

    static byte[] boundedRead(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (output.size() + read > maximum) throw new IOException("Response limit exceeded");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }
}
