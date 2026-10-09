package com.plaxlabs.news;

import android.content.Context;
import com.google.gson.*;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.LongSupplier;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import okhttp3.HttpUrl;

/**
 * The optional Plax account. Everything in the app works without it; signing in with Google only keeps a
 * copy of the reader's topics and saved stories in their account so they follow them to another phone.
 *
 * Sign-in is the OAuth code flow with PKCE in the system browser. The tokens are kept sealed by the
 * Android Keystore ({@link SecureStore}); if that is not possible the reader is simply not signed in.
 * All work runs one task at a time on a worker, so no two syncs ever overlap.
 */
final class AccountManager implements FeedViewModel.Cloud {
    enum Phase { SIGNED_OUT, WAITING, SIGNED_IN }

    /** @param message a string resource explaining the latest problem or event, or 0 */
    record Status(Phase phase, String name, String email, int message, boolean busy) {
        String label() { return name.isEmpty() ? email : name; }
    }

    interface Listener { void changed(Status status); }

    /** Opens the browser. Called on the worker; the caller moves to the main thread. */
    interface Launcher { void open(String url); }

    /** What the browser returned. */
    record Callback(String code, String error) { }

    static final String REDIRECT = FeedApi.SITE + "/auth/app";
    static final String CALLBACK_HOST = "auth-callback";
    static final long PENDING_MS = 10 * 60_000, REFRESH_MARGIN_MS = 60_000, STALE_MS = 10 * 60_000;
    private static final int QUEUE_LIMIT = 400;
    private static final Pattern CODE = Pattern.compile("^[A-Za-z0-9_.~-]{8,512}$");

    private static final class Storage extends IOException { Storage() { super("Secure storage unavailable"); } }
    private static final class Ended extends IOException { Ended() { super("Session ended"); } }

    /** A change made while signed in that the account has not confirmed yet. */
    private record Op(String id, Story story) {
        static Op add(Story story) { return new Op(story.id(), story); }
        static Op remove(String id) { return new Op(id, null); }
    }

    private static final class Data {
        AuthApi.Tokens session;
        String verifier;
        long verifierAt, lastSync;
        /** The account whose data this phone last merged; a different account never inherits the phone's data. */
        String synced;
        boolean dirty;
        final List<Op> queue = new ArrayList<>();

        boolean empty() { return session == null && verifier == null && synced == null && !dirty && queue.isEmpty(); }

        String toJson() {
            JsonObject root = new JsonObject();
            root.addProperty("schema", 1);
            if (session != null) {
                JsonObject value = new JsonObject();
                value.addProperty("a", session.access()); value.addProperty("r", session.refresh());
                value.addProperty("e", session.expiresAt()); value.addProperty("u", session.userId());
                value.addProperty("m", session.email()); value.addProperty("n", session.name());
                root.add("session", value);
            }
            if (verifier != null) { root.addProperty("v", verifier); root.addProperty("va", verifierAt); }
            if (synced != null) root.addProperty("s", synced);
            root.addProperty("ls", lastSync); root.addProperty("d", dirty);
            JsonArray ops = new JsonArray();
            for (Op op : queue) {
                JsonObject value = new JsonObject();
                value.addProperty("id", op.id());
                if (op.story() != null) {
                    value.addProperty("t", op.story().title()); value.addProperty("c", op.story().content());
                    value.addProperty("g", op.story().category());
                }
                ops.add(value);
            }
            root.add("queue", ops);
            return root.toString();
        }

        static Data fromJson(String text) throws IOException {
            try {
                JsonObject root = JsonParser.parseString(text).getAsJsonObject();
                if (root.get("schema").getAsInt() != 1) throw new IOException("Unsupported account data");
                Data data = new Data();
                if (root.get("session") instanceof JsonObject value) {
                    data.session = new AuthApi.Tokens(value.get("a").getAsString(), value.get("r").getAsString(),
                            value.get("e").getAsLong(), value.get("u").getAsString(), value.get("m").getAsString(),
                            value.get("n").getAsString());
                }
                if (root.has("v")) { data.verifier = root.get("v").getAsString(); data.verifierAt = root.get("va").getAsLong(); }
                if (root.has("s")) data.synced = root.get("s").getAsString();
                data.lastSync = root.get("ls").getAsLong(); data.dirty = root.get("d").getAsBoolean();
                for (JsonElement element : root.getAsJsonArray("queue")) {
                    JsonObject value = element.getAsJsonObject();
                    String id = value.get("id").getAsString();
                    data.queue.add(value.has("t")
                            ? Op.add(new Story(id, value.get("t").getAsString(), value.get("c").getAsString(),
                                    value.get("g").getAsString(), "", "", "", "", "", 0))
                            : Op.remove(id));
                }
                return data;
            } catch (JsonParseException | IllegalStateException | NullPointerException | ClassCastException | NumberFormatException invalid) {
                throw new IOException("Unreadable account data");
            }
        }
    }

    private final AuthApi auth;
    private final CloudApi cloud;
    private final TokenStore store;
    private final Executor worker;
    private final LongSupplier clock;
    private final String scheme;
    private final Supplier<Set<String>> localTopics;
    private final Supplier<List<Story>> localSaved;
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();
    private volatile FeedViewModel.Sink sink;
    private volatile Status status = new Status(Phase.SIGNED_OUT, "", "", 0, false);
    // The rest is touched only on the worker.
    private Data data = new Data();
    private AuthConfig config;
    private long configAt;

    AccountManager(AuthApi auth, CloudApi cloud, TokenStore store, Executor worker, LongSupplier clock, String scheme,
                   Supplier<Set<String>> localTopics, Supplier<List<Story>> localSaved) {
        this.auth = auth; this.cloud = cloud; this.store = store; this.worker = worker; this.clock = clock;
        this.scheme = scheme; this.localTopics = localTopics; this.localSaved = localSaved;
        worker.execute(this::load);
    }

    private static AccountManager instance;

    /** The app-wide account. It starts on its own worker, so asking for it never waits on storage. */
    static synchronized AccountManager get(Context context) {
        if (instance == null) {
            Context app = context.getApplicationContext();
            Supabase supabase = new Supabase();
            ExecutorService worker = Executors.newSingleThreadExecutor(task -> {
                Thread thread = new Thread(task, "plax-account"); thread.setDaemon(true); return thread;
            });
            instance = new AccountManager(supabase, supabase, new SecureStore(app.getNoBackupFilesDir()), worker,
                    System::currentTimeMillis, BuildConfig.AUTH_SCHEME, () -> Interests.read(app), () -> {
                        try { return new SavedStories(app.getFilesDir()).read(); }
                        catch (IOException unreadable) { return List.of(); }
                    });
        }
        return instance;
    }

    /** Replaces the app-wide account, for tests. */
    static synchronized void use(AccountManager replacement) { instance = replacement; }

    Status status() { return status; }
    boolean signedIn() { return status.phase() == Phase.SIGNED_IN; }
    void addListener(Listener listener) { listeners.add(listener); }
    void removeListener(Listener listener) { listeners.remove(listener); }

    // Sign-in

    /** Checks the account service, then hands the browser address to {@code launcher}. */
    void begin(Launcher launcher) { worker.execute(() -> start(launcher)); }

    private void start(Launcher launcher) {
        if (data.session != null) return;
        try {
            AuthConfig current = config();
            auth.check(current);
            String verifier = Pkce.verifier();
            data.verifier = verifier; data.verifierAt = clock.getAsLong();
            save();
            publish(Phase.WAITING, 0, false);
            launcher.open(authorize(current, Pkce.challenge(verifier)));
        } catch (Storage unavailable) {
            data.verifier = null;
            publish(Phase.SIGNED_OUT, R.string.account_storage, false);
        } catch (IOException unavailable) {
            data.verifier = null;
            quietly();
            publish(Phase.SIGNED_OUT, R.string.account_unavailable, false);
        }
    }

    String authorize(AuthConfig current, String challenge) {
        return HttpUrl.get(current.url() + "/auth/v1/authorize").newBuilder()
                .addQueryParameter("provider", "google")
                .addQueryParameter("redirect_to", REDIRECT + "?app=" + scheme)
                .addQueryParameter("code_challenge", challenge)
                .addQueryParameter("code_challenge_method", "s256").build().toString();
    }

    /** Reads the address the browser returned to, or null when it is not this app's sign-in callback. */
    static Callback parse(String address, String scheme) {
        try {
            URI uri = new URI(address);
            if (!scheme.equals(uri.getScheme()) || !CALLBACK_HOST.equals(uri.getHost())) return null;
            Map<String, String> values = new HashMap<>();
            String query = uri.getRawQuery();
            if (query != null) {
                for (String pair : query.split("&")) {
                    int equals = pair.indexOf('=');
                    if (equals <= 0) continue;
                    // The charset is given by name: the overload taking a Charset needs a newer Android.
                    values.putIfAbsent(pair.substring(0, equals), URLDecoder.decode(pair.substring(equals + 1), "UTF-8"));
                }
            }
            String code = values.get("code"), error = values.get("error");
            return new Callback(code != null && CODE.matcher(code).matches() ? code : null,
                    error == null || error.isEmpty() ? null : error.length() > 64 ? "error" : error);
        } catch (URISyntaxException | IllegalArgumentException | java.io.UnsupportedEncodingException invalid) {
            return null;
        }
    }

    boolean ours(String address) { return parse(address, scheme) != null; }

    void complete(String address) {
        Callback callback = parse(address, scheme);
        if (callback != null) worker.execute(() -> finish(callback));
    }

    private void finish(Callback callback) {
        String verifier = data.verifier;
        // A callback nobody asked for, or one asked for long ago, is ignored.
        if (verifier == null || clock.getAsLong() - data.verifierAt > PENDING_MS) return;
        data.verifier = null;
        quietly();
        if (callback.error() != null || callback.code() == null) {
            publish(Phase.SIGNED_OUT, "access_denied".equals(callback.error()) ? R.string.account_denied : R.string.account_failed, false);
            return;
        }
        publish(Phase.WAITING, 0, true);
        try {
            AuthConfig current = config();
            AuthApi.Tokens tokens = auth.exchange(current, callback.code(), verifier);
            data.session = tokens;
            try { save(); }
            catch (IOException unsafe) {
                data.session = null;
                auth.logout(current, tokens.access());
                publish(Phase.SIGNED_OUT, R.string.account_storage, false);
                return;
            }
            publish(Phase.SIGNED_IN, 0, true);
            sync();
        } catch (IOException failed) {
            publish(Phase.SIGNED_OUT, R.string.account_failed, false);
        }
    }

    /** Gives up on a sign-in that is waiting for the browser. */
    void cancel() {
        worker.execute(() -> {
            if (data.session != null) return;
            data.verifier = null;
            quietly();
            publish(Phase.SIGNED_OUT, 0, false);
        });
    }

    /** Signs out. The topics and saved stories stay on the phone; nothing else is kept. */
    void signOut() {
        worker.execute(() -> {
            AuthApi.Tokens old = data.session;
            data.session = null; data.verifier = null; data.queue.clear(); data.dirty = false; data.lastSync = 0;
            quietly();
            publish(Phase.SIGNED_OUT, R.string.account_signed_out, false);
            if (old != null) {
                try { auth.logout(config(), old.access()); } catch (IOException ignored) { /* already forgotten here */ }
            }
        });
    }

    // FeedViewModel.Cloud

    @Override public void listen(FeedViewModel.Sink next) {
        sink = next;
        if (next != null) resume();
    }

    /** Called when the app comes to the front: brings the account up to date when it has been a while. */
    void resume() {
        worker.execute(() -> { if (data.session != null && clock.getAsLong() - data.lastSync > STALE_MS) sync(); });
    }

    @Override public void saved(Story story, boolean added) {
        worker.execute(() -> {
            if (data.session == null) return;
            data.queue.removeIf(op -> op.id().equals(story.id()));
            data.queue.add(added ? Op.add(story) : Op.remove(story.id()));
            while (data.queue.size() > QUEUE_LIMIT) data.queue.remove(0);
            quietly();
            attempt(() -> { AuthConfig current = config(); flush(current, fresh(current)); });
        });
    }

    @Override public void interests(Set<String> topics) {
        worker.execute(() -> {
            if (data.session == null) return;
            data.dirty = true;
            quietly();
            attempt(() -> {
                AuthConfig current = config();
                cloud.saveTopics(current, fresh(current), topics);
                data.dirty = false;
                quietly();
            });
        });
    }

    // Synchronisation

    private interface Step { void run() throws IOException; }

    /** Runs one piece of work, retrying once with a fresh token, and reports a failure without losing anything. */
    private void attempt(Step step) {
        try {
            try { step.run(); }
            catch (AuthApi.Unauthorized expired) {
                if (data.session == null) throw new Ended();
                data.session = new AuthApi.Tokens(data.session.access(), data.session.refresh(), 0, data.session.userId(),
                        data.session.email(), data.session.name());
                step.run();
            }
            publish(Phase.SIGNED_IN, 0, false);
        } catch (Ended finished) {
            // The session is gone and the reader has been told.
        } catch (IOException failed) {
            if (data.session != null) publish(Phase.SIGNED_IN, R.string.account_sync_failed, false);
        }
    }

    private void sync() {
        if (data.session == null) return;
        publish(Phase.SIGNED_IN, 0, true);
        attempt(() -> {
            AuthConfig current = config();
            AuthApi.Tokens tokens = fresh(current);
            flush(current, tokens);
            boolean mayUpload = data.synced == null || data.synced.equals(tokens.userId());
            Set<String> local = localTopics.get(), remote = cloud.topics(current, tokens);
            FeedViewModel.Sink target = sink;
            if (data.dirty && mayUpload) {
                cloud.saveTopics(current, tokens, local);
                data.dirty = false;
            } else if (!remote.isEmpty()) {
                if (!remote.equals(local) && target != null) target.cloudInterests(remote);
            } else if (!local.isEmpty() && mayUpload) {
                cloud.saveTopics(current, tokens, local);
            }
            List<Story> held = cloud.bookmarks(current, tokens);
            if (target != null) target.cloudSaved(held);
            if (mayUpload) {
                Set<String> known = new HashSet<>();
                for (Story story : held) known.add(story.id());
                List<Story> missing = new ArrayList<>();
                for (Story story : localSaved.get()) if (known.add(story.id())) missing.add(story);
                if (!missing.isEmpty()) cloud.addBookmarks(current, tokens, missing);
            }
            data.synced = tokens.userId();
            data.lastSync = clock.getAsLong();
            quietly();
        });
    }

    /** Sends the changes made while signed in; one the account will never accept is dropped, not retried forever. */
    private void flush(AuthConfig current, AuthApi.Tokens tokens) throws IOException {
        boolean changed = false;
        try {
            Iterator<Op> pending = data.queue.iterator();
            while (pending.hasNext()) {
                Op op = pending.next();
                try {
                    if (op.story() != null) cloud.addBookmarks(current, tokens, List.of(op.story()));
                    else cloud.removeBookmark(current, tokens, op.id());
                } catch (AuthApi.Unauthorized expired) {
                    throw expired;
                } catch (AuthApi.Rejected permanent) {
                    // Nothing to do: the account refuses this change for good.
                }
                pending.remove();
                changed = true;
            }
        } finally { if (changed) quietly(); }
    }

    private AuthConfig config() throws IOException {
        long now = clock.getAsLong();
        if (config == null || now - configAt > 10 * 60_000) { config = auth.config(); configAt = now; }
        return config;
    }

    /** A token that is good for another minute, refreshed when it is not. A refused refresh ends the session. */
    private AuthApi.Tokens fresh(AuthConfig current) throws IOException {
        AuthApi.Tokens held = data.session;
        if (held == null) throw new Ended();
        if (held.expiresAt() - clock.getAsLong() > REFRESH_MARGIN_MS) return held;
        try {
            AuthApi.Tokens next = auth.refresh(current, held.refresh());
            data.session = next;
            quietly();
            return next;
        } catch (AuthApi.Rejected refused) {
            if (refused.status != 400 && refused.status != 401 && refused.status != 403) throw refused;
            data.session = null;
            quietly();
            publish(Phase.SIGNED_OUT, R.string.account_expired, false);
            throw new Ended();
        }
    }

    // Persistence and status

    private void load() {
        String text = null;
        // A store that cannot be opened right now is left alone: the next launch may read it.
        try { text = store.read(); } catch (IOException unavailable) { /* signed out for this run only */ }
        if (text != null) {
            try { data = Data.fromJson(text); }
            catch (IOException unreadable) { data = new Data(); store.clear(); }
        }
        if (data.session != null) publish(Phase.SIGNED_IN, 0, false);
        else if (data.verifier != null && clock.getAsLong() - data.verifierAt <= PENDING_MS) publish(Phase.WAITING, 0, false);
        else { data.verifier = null; publish(Phase.SIGNED_OUT, 0, false); }
    }

    private void save() throws IOException {
        try {
            if (data.empty()) store.clear(); else store.write(data.toJson());
        } catch (IOException unsafe) {
            throw new Storage();
        }
    }

    /** For changes whose loss is harmless: the next successful sync repeats them. */
    private void quietly() {
        try { save(); } catch (IOException ignored) { /* kept in memory for this run */ }
    }

    private void publish(Phase phase, int message, boolean busy) {
        AuthApi.Tokens session = data.session;
        status = new Status(phase, session == null ? "" : session.name(), session == null ? "" : session.email(), message, busy);
        for (Listener listener : listeners) listener.changed(status);
    }
}
