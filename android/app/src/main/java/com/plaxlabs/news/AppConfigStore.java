package com.plaxlabs.news;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import okhttp3.ConnectionSpec;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Keeps the website's configuration of the app (see {@link AppConfig}): the one in force, the file it was read from (kept on the phone,
 * so that the next start has it at once), and the asking. The app asks when it comes to the front, at most every few hours; a file the
 * app cannot read, or an answer that does not come, changes nothing, so the file taken before stays. Until a file has been taken the
 * built-in values are in force, which is what the app did before it could be configured.
 *
 * <p>Only {@link #active()} may be read from any thread; everything else is called on the main thread, except the request, which runs
 * on a worker and reports back through {@code main}. The request carries nothing about the reader: no cookies, no identifiers.
 */
final class AppConfigStore {
    static final String URL = FeedApi.SITE + "/app-config.json";
    static final long CHECK_INTERVAL = TimeUnit.HOURS.toMillis(3), RETRY_INTERVAL = TimeUnit.MINUTES.toMillis(30);

    /** Told, on the main thread, when a file with something new in it has been taken. */
    interface Listener { void changed(AppConfig config); }

    /** The website's file, at most {@link AppConfig#MAX_BYTES} long. Called on the worker. */
    interface Source { byte[] fetch() throws IOException; }

    /** Where the file taken last is kept. */
    interface Disk {
        /** The file, or null when there is none. */
        byte[] read() throws IOException;
        void write(byte[] bytes) throws IOException;
        void delete();
    }

    /** When the website was last asked, and when it last gave a file the app could read. */
    interface Memory {
        long attempted();
        long succeeded();
        void attempted(long at);
        void succeeded(long at);
    }

    private static volatile AppConfig active = AppConfig.defaults();

    /** What is in force now. Safe to read from any thread. */
    static AppConfig active() { return active; }

    /** Puts a configuration in force, or the built-in one for null, without a store: for tests. */
    static void force(AppConfig config) { active = config == null ? AppConfig.defaults() : config; }

    private final Source source;
    private final Disk disk;
    private final Memory memory;
    private final Executor worker, main;
    private final LongSupplier clock;
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();
    /** The file in force, as it was received; null while the built-in values are. */
    private volatile byte[] taken;
    private boolean fetching;

    AppConfigStore(Source source, Disk disk, Memory memory, Executor worker, Executor main, LongSupplier clock) {
        this.source = source; this.disk = disk; this.memory = memory; this.worker = worker; this.main = main; this.clock = clock;
    }

    private static AppConfigStore instance;

    /** The app-wide store. */
    static synchronized AppConfigStore get(Context context) {
        if (instance == null) {
            Context application = context.getApplicationContext();
            SharedPreferences preferences = application.getSharedPreferences("app-config", Context.MODE_PRIVATE);
            Handler handler = new Handler(Looper.getMainLooper());
            Executor worker = Executors.newSingleThreadExecutor(task -> {
                Thread thread = new Thread(task, "plax-config"); thread.setDaemon(true); return thread;
            });
            instance = new AppConfigStore(web(), file(new File(application.getFilesDir(), "app-config.json")), remembered(preferences),
                    worker, handler::post, System::currentTimeMillis);
        }
        return instance;
    }

    /** Replaces the app-wide store, for tests; null brings the real one back. */
    static synchronized void use(AppConfigStore replacement) {
        instance = replacement;
        force(null);
    }

    /**
     * Takes the file kept from the last time, if there is a good one; one that is not is deleted. Called once, when the process starts,
     * before anything is drawn, so that what the website last said is in force from the first screen.
     */
    void load() {
        try {
            byte[] bytes = disk.read();
            if (bytes == null) return;
            AppConfig config = AppConfig.parse(bytes).config();
            taken = bytes;
            active = config;
        } catch (IOException | RuntimeException unusable) {
            disk.delete();
        }
    }

    void listen(Listener listener) { listeners.add(listener); }

    void unlisten(Listener listener) { listeners.remove(listener); }

    /** True when asking is allowed: a few hours have passed since the website last answered, and half an hour since it was last asked. */
    static boolean due(long now, long attempted, long succeeded) {
        boolean stale = succeeded <= 0 || now < succeeded || now - succeeded >= CHECK_INTERVAL;
        boolean rested = attempted <= 0 || now < attempted || now - attempted >= RETRY_INTERVAL;
        return stale && rested;
    }

    /** Asks the website for its file if it is time, or at once when {@code force} says so. */
    void refresh(boolean force) {
        if (fetching) return;
        long now = clock.getAsLong();
        if (!force && !due(now, memory.attempted(), memory.succeeded())) return;
        fetching = true;
        memory.attempted(now);
        worker.execute(() -> {
            byte[] bytes = null;
            AppConfig.Parsed parsed = null;
            try {
                bytes = source.fetch();
                parsed = AppConfig.parse(bytes);
                // Kept before it is announced, so that a start right after finds it; a file that says nothing new is not written again.
                if (!Arrays.equals(bytes, taken)) disk.write(bytes);
            } catch (IOException | RuntimeException unusable) {
                if (parsed == null) bytes = null;
            }
            byte[] received = bytes;
            AppConfig.Parsed read = parsed;
            main.execute(() -> finished(received, read));
        });
    }

    private void finished(byte[] bytes, AppConfig.Parsed parsed) {
        fetching = false;
        if (parsed == null) return;
        memory.succeeded(clock.getAsLong());
        if (Arrays.equals(bytes, taken)) return;
        taken = bytes;
        active = parsed.config();
        for (Listener listener : listeners) listener.changed(parsed.config());
    }

    /** The website's file, fetched the way the update feed is: modern TLS only, no redirects, cookies or cache, short timeouts. */
    static Source web() {
        return () -> {
            OkHttpClient client = Network.api().newBuilder().connectionSpecs(List.of(ConnectionSpec.MODERN_TLS))
                    .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).cache(null)
                    .connectTimeout(4, TimeUnit.SECONDS).readTimeout(4, TimeUnit.SECONDS).callTimeout(8, TimeUnit.SECONDS).build();
            Request request = new Request.Builder().url(URL).header("Accept", "application/json").header("Cache-Control", "no-store").get().build();
            try (Response response = client.newCall(request).execute()) {
                ResponseBody body = response.body();
                if (response.code() != 200 || body == null || body.contentLength() > AppConfig.MAX_BYTES
                        || body.contentType() == null || !body.contentType().type().equals("application")
                        || !body.contentType().subtype().equals("json")) throw new IOException("App configuration unavailable");
                var buffered = body.source();
                buffered.request(AppConfig.MAX_BYTES + 1L);
                if (buffered.getBuffer().size() > AppConfig.MAX_BYTES) throw new IOException("App configuration exceeds its limit");
                return buffered.getBuffer().readByteArray();
            }
        };
    }

    static Disk file(File file) {
        AtomicFile atomic = new AtomicFile(file);
        return new Disk() {
            @Override public byte[] read() throws IOException {
                if (!atomic.getBaseFile().exists()) return null;
                try (InputStream stream = atomic.openRead()) { return FeedApi.boundedRead(stream, AppConfig.MAX_BYTES); }
            }

            @Override public void write(byte[] bytes) throws IOException {
                FileOutputStream output = atomic.startWrite();
                try {
                    output.write(bytes);
                    atomic.finishWrite(output);
                } catch (IOException failure) {
                    atomic.failWrite(output);
                    throw failure;
                }
            }

            @Override public void delete() { atomic.delete(); }
        };
    }

    static Memory remembered(SharedPreferences preferences) {
        return new Memory() {
            @Override public long attempted() { return preferences.getLong("attempted", 0); }
            @Override public long succeeded() { return preferences.getLong("succeeded", 0); }
            @Override public void attempted(long at) { preferences.edit().putLong("attempted", at).apply(); }
            @Override public void succeeded(long at) { preferences.edit().putLong("succeeded", at).apply(); }
        };
    }
}
