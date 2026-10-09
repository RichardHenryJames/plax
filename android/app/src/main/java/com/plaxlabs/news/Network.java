package com.plaxlabs.news;

import java.io.File;
import java.util.concurrent.TimeUnit;
import okhttp3.Cache;
import okhttp3.OkHttpClient;
import okhttp3.Response;

/**
 * One connection pool for the whole process. Both clients are built lazily, off the main thread,
 * so starting the app never waits for HTTP class loading.
 */
final class Network {
    private static final long IMAGE_CACHE_BYTES = 50L * 1024 * 1024;
    private static final long MIN_FRESH_SECONDS = 3600;
    private static final long IMAGE_TTL_SECONDS = 7L * 24 * 3600;
    private static OkHttpClient api, images;

    private Network() { }

    static synchronized OkHttpClient api() {
        if (api == null) api = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS)
                .callTimeout(25, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build();
        return api;
    }

    /** Shares the API client's connection pool and adds a bounded on-disk cache for publisher images. */
    static synchronized OkHttpClient images(File cacheDirectory) {
        if (images == null) images = api().newBuilder()
                .cache(new Cache(new File(cacheDirectory, "images"), IMAGE_CACHE_BYTES))
                .addNetworkInterceptor(chain -> keepImages(chain.proceed(chain.request())))
                .connectTimeout(8, TimeUnit.SECONDS).readTimeout(12, TimeUnit.SECONDS)
                .callTimeout(15, TimeUnit.SECONDS).followRedirects(true).followSslRedirects(false).build();
        return images;
    }

    /** Many publishers send no or very short cache lifetimes for pictures that never change. */
    static Response keepImages(Response response) {
        String control = response.header("Cache-Control");
        if (!response.isSuccessful() || control != null && control.toLowerCase(java.util.Locale.ROOT).contains("no-store"))
            return response;
        if (control != null && maxAge(control) >= MIN_FRESH_SECONDS) return response;
        return response.newBuilder().header("Cache-Control", "public, max-age=" + IMAGE_TTL_SECONDS)
                .removeHeader("Pragma").removeHeader("Expires").build();
    }

    static long maxAge(String control) {
        for (String part : control.split(",")) {
            String directive = part.strip().toLowerCase(java.util.Locale.ROOT);
            if (directive.startsWith("max-age=")) {
                try { return Long.parseLong(directive.substring(8)); } catch (NumberFormatException invalid) { return 0; }
            }
        }
        return 0;
    }
}
