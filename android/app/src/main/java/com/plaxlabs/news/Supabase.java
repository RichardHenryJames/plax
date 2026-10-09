package com.plaxlabs.news;

import com.google.gson.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;
import okhttp3.*;

/**
 * Talks to the Plax account service (Supabase) over HTTPS. Responses are size-bounded, redirects are
 * never followed, and neither tokens nor response bodies are ever logged or put in an error message.
 */
final class Supabase implements AuthApi, CloudApi {
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern CARD_ID = Pattern.compile("^[\\p{L}\\p{N}_.-]{1,200}$");
    private static final int MAX_BYTES = 512 * 1024, TITLE_LIMIT = 300, CONTENT_LIMIT = 500, CATEGORY_LIMIT = 40;

    private final java.util.function.Supplier<OkHttpClient> clients;
    private final String site;
    private final LongSupplier clock;

    /** The HTTP client is not built until the first request, which runs on the account worker, never at start-up. */
    Supabase() { this(Network::api, FeedApi.SITE, System::currentTimeMillis); }

    /** For tests: any HTTP client and any address for the Plax website. */
    Supabase(OkHttpClient client, String site, LongSupplier clock) { this(() -> client, site, clock); }

    private Supabase(java.util.function.Supplier<OkHttpClient> clients, String site, LongSupplier clock) {
        this.clients = clients; this.site = site; this.clock = clock;
    }

    private String send(Request.Builder builder) throws IOException {
        try (Response response = clients.get().newCall(builder.build()).execute()) {
            int code = response.code();
            if (code == 401) throw new Unauthorized();
            if (code == 408 || code == 429) throw new IOException("Try again later");
            if (code >= 400 && code < 500) throw new Rejected(code);
            if (!response.isSuccessful()) throw new IOException("Service unavailable");
            ResponseBody body = response.body();
            return body == null ? "" : new String(FeedApi.boundedRead(body.byteStream(), MAX_BYTES), StandardCharsets.UTF_8);
        }
    }

    private static Request.Builder json(String url, AuthConfig config, String access, JsonElement body) {
        Request.Builder builder = new Request.Builder().url(url).header("apikey", config.anonKey())
                .header("Accept", "application/json").post(RequestBody.create(body.toString(), JSON));
        if (access != null) builder.header("Authorization", "Bearer " + access);
        return builder;
    }

    // Authentication

    @Override public AuthConfig config() throws IOException {
        return AuthConfig.parse(send(new Request.Builder().url(site + "/api/auth-config").header("Accept", "application/json")));
    }

    @Override public void check(AuthConfig config) throws IOException {
        String text = send(new Request.Builder().url(config.url() + "/auth/v1/settings")
                .header("apikey", config.anonKey()).header("Accept", "application/json"));
        try {
            JsonObject providers = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("external");
            if (!providers.get("google").getAsBoolean()) throw new IOException("Google sign-in is not enabled");
        } catch (JsonParseException | IllegalStateException | NullPointerException | ClassCastException invalid) {
            throw new IOException("Unreadable service settings");
        }
    }

    @Override public Tokens exchange(AuthConfig config, String code, String verifier) throws IOException {
        JsonObject body = new JsonObject();
        body.addProperty("auth_code", code); body.addProperty("code_verifier", verifier);
        return tokens(send(json(config.url() + "/auth/v1/token?grant_type=pkce", config, null, body)));
    }

    @Override public Tokens refresh(AuthConfig config, String refreshToken) throws IOException {
        JsonObject body = new JsonObject();
        body.addProperty("refresh_token", refreshToken);
        return tokens(send(json(config.url() + "/auth/v1/token?grant_type=refresh_token", config, null, body)));
    }

    @Override public void logout(AuthConfig config, String access) {
        try { send(json(config.url() + "/auth/v1/logout?scope=local", config, access, new JsonObject())); }
        catch (IOException ignored) { /* the phone has already forgotten the session */ }
    }

    private Tokens tokens(String text) throws IOException {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            String access = root.get("access_token").getAsString(), refresh = root.get("refresh_token").getAsString();
            long lifetime = root.get("expires_in").getAsLong();
            JsonObject user = root.getAsJsonObject("user");
            String id = user.get("id").getAsString();
            if (!UUID.matcher(id).matches() || access.isEmpty() || access.length() > 4096
                    || refresh.isEmpty() || refresh.length() > 1024 || lifetime <= 0) {
                throw new IOException("Unexpected sign-in response");
            }
            JsonObject meta = user.get("user_metadata") instanceof JsonObject object ? object : new JsonObject();
            String name = text(meta, "full_name", 80);
            if (name.isEmpty()) name = text(meta, "name", 80);
            return new Tokens(access, refresh, clock.getAsLong() + Math.min(lifetime, 86_400) * 1000,
                    id.toLowerCase(Locale.ROOT), text(user, "email", 200), name);
        } catch (JsonParseException | IllegalStateException | NullPointerException | ClassCastException | NumberFormatException invalid) {
            throw new IOException("Unreadable sign-in response");
        }
    }

    private static String text(JsonObject object, String key, int limit) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonPrimitive()) return "";
        String text = value.getAsString().replaceAll("\\p{Cntrl}", "").strip();
        return text.length() > limit ? text.substring(0, limit) : text;
    }

    // The reader's topics and saved stories

    private static HttpUrl.Builder rest(AuthConfig config, String table) {
        return HttpUrl.get(config.url() + "/rest/v1/" + table).newBuilder();
    }

    private static Request.Builder authed(HttpUrl url, AuthConfig config, Tokens tokens) {
        return new Request.Builder().url(url).header("apikey", config.anonKey())
                .header("Authorization", "Bearer " + tokens.access()).header("Accept", "application/json");
    }

    private static String user(Tokens tokens) throws IOException {
        if (!UUID.matcher(tokens.userId()).matches()) throw new IOException("Invalid account");
        return tokens.userId();
    }

    @Override public Set<String> topics(AuthConfig config, Tokens tokens) throws IOException {
        HttpUrl url = rest(config, "user_profiles").addQueryParameter("select", "selected_topics")
                .addQueryParameter("id", "eq." + user(tokens)).addQueryParameter("limit", "1").build();
        try {
            JsonArray rows = JsonParser.parseString(send(authed(url, config, tokens).get())).getAsJsonArray();
            if (rows.isEmpty()) return Set.of();
            JsonElement topics = rows.get(0).getAsJsonObject().get("selected_topics");
            if (topics == null || topics.isJsonNull()) return Set.of();
            List<String> list = new ArrayList<>();
            for (JsonElement topic : topics.getAsJsonArray()) list.add(topic.getAsString());
            return Interests.sanitize(list);
        } catch (JsonParseException | IllegalStateException | ClassCastException | UnsupportedOperationException invalid) {
            throw new IOException("Unreadable profile");
        }
    }

    @Override public void saveTopics(AuthConfig config, Tokens tokens, Set<String> topics) throws IOException {
        JsonObject row = new JsonObject();
        row.addProperty("id", user(tokens));
        JsonArray chosen = new JsonArray();
        for (String topic : Interests.sanitize(topics)) chosen.add(topic);
        row.add("selected_topics", chosen);
        row.addProperty("has_onboarded", true);
        JsonArray rows = new JsonArray();
        rows.add(row);
        HttpUrl url = rest(config, "user_profiles").addQueryParameter("on_conflict", "id").build();
        send(authed(url, config, tokens).header("Prefer", "resolution=merge-duplicates,return=minimal")
                .post(RequestBody.create(rows.toString(), JSON)));
    }

    @Override public List<Story> bookmarks(AuthConfig config, Tokens tokens) throws IOException {
        HttpUrl url = rest(config, "bookmarks").addQueryParameter("select", "card_id,card_title,card_category,card_content")
                .addQueryParameter("order", "created_at.desc").addQueryParameter("limit", String.valueOf(SavedStories.LIMIT)).build();
        try {
            JsonArray rows = JsonParser.parseString(send(authed(url, config, tokens).get())).getAsJsonArray();
            List<Story> stories = new ArrayList<>();
            for (JsonElement element : rows) {
                JsonObject row = element.getAsJsonObject();
                String id = text(row, "card_id", 200), title = text(row, "card_title", TITLE_LIMIT);
                String content = text(row, "card_content", CONTENT_LIMIT), category = text(row, "card_category", CATEGORY_LIMIT);
                if (!CARD_ID.matcher(id).matches() || title.isEmpty() && content.isEmpty()) continue;
                // The account keeps no link or picture, so a restored story reads as text only.
                stories.add(new Story(id, title, content, category.isEmpty() ? "news" : category, "", "", "", "", "", 0));
            }
            return stories;
        } catch (JsonParseException | IllegalStateException | ClassCastException | UnsupportedOperationException invalid) {
            throw new IOException("Unreadable saved stories");
        }
    }

    @Override public void addBookmarks(AuthConfig config, Tokens tokens, List<Story> stories) throws IOException {
        String user = user(tokens);
        JsonArray rows = new JsonArray();
        for (Story story : stories) {
            if (!CARD_ID.matcher(story.id()).matches()) continue;
            JsonObject row = new JsonObject();
            row.addProperty("user_id", user); row.addProperty("card_id", story.id());
            row.addProperty("card_title", cap(story.title(), TITLE_LIMIT));
            row.addProperty("card_category", cap(story.category(), CATEGORY_LIMIT));
            row.addProperty("card_content", cap(story.body().isEmpty() ? story.content() : story.body(), CONTENT_LIMIT));
            rows.add(row);
        }
        if (rows.isEmpty()) return;
        HttpUrl url = rest(config, "bookmarks").addQueryParameter("on_conflict", "user_id,card_id").build();
        // There is no update rule for bookmarks, so a repeat must be ignored rather than merged.
        send(authed(url, config, tokens).header("Prefer", "resolution=ignore-duplicates,return=minimal")
                .post(RequestBody.create(rows.toString(), JSON)));
    }

    @Override public void removeBookmark(AuthConfig config, Tokens tokens, String id) throws IOException {
        if (!CARD_ID.matcher(id).matches()) return;
        HttpUrl url = rest(config, "bookmarks").addQueryParameter("user_id", "eq." + user(tokens))
                .addQueryParameter("card_id", "eq." + id).build();
        send(authed(url, config, tokens).header("Prefer", "return=minimal").delete());
    }

    private static String cap(String text, int limit) {
        String clean = text.replaceAll("\\p{Cntrl}", " ").strip();
        return clean.length() > limit ? clean.substring(0, limit) : clean;
    }
}
