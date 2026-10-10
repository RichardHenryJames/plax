package com.plaxlabs.news;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import okhttp3.*;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * The app's real account code against a real GoTrue, PostgREST, Kong and Postgres, loaded with supabase-schema.sql,
 * instead of fakes. It is opt-in: set PLAX_LOCAL_STACK to the .env written by android/dev/auth-stack/up.ps1 and the
 * stack must be running (see android/README.md, "Testing sign-in against a real Supabase stack"). Without it every
 * test here is skipped, so the normal build needs no Docker.
 *
 * The only things replaced are the ones that cannot run on a developer machine: the website's address lookup
 * (answered in place) and Google's consent screen. The one-time code that Google would return is obtained from the
 * stack for the very code challenge the app created, by e-mail, so the app's PKCE exchange, token handling, refresh,
 * sync and sign-out all run against the real services.
 */
public class AccountLocalStackTest {
    private static final String PROJECT_HOST = "plaxlocaltest.supabase.co";
    private static final String GATEWAY = "http://127.0.0.1:54321", MAIL = "http://127.0.0.1:54324";
    private static final String SCHEME = "com.plaxlabs.news.preview";
    private static final Pattern VERIFY_LINK = Pattern.compile("https?://[^\\s\"<>]+/auth/v1/verify[^\\s\"<>]*");

    private String anon, service, jwtSecret;
    private final OkHttpClient raw = new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build();
    private final AtomicLong clock = new AtomicLong(System.currentTimeMillis());
    private Supabase supabase;
    private AuthConfig config;

    private static final class MemoryStore implements TokenStore {
        String text;
        @Override public String read() { return text; }
        @Override public void write(String value) { text = value; }
        @Override public void clear() { text = null; }
    }

    private static final class Landing implements FeedViewModel.Sink {
        final List<Set<String>> topics = new ArrayList<>();
        final List<List<Story>> saved = new ArrayList<>();
        @Override public void cloudInterests(Set<String> value) { topics.add(value); }
        @Override public void cloudSaved(List<Story> stories) { saved.add(stories); }
        Set<String> lastTopics() { return topics.get(topics.size() - 1); }
        Set<String> lastSavedIds() { return ids(saved.get(saved.size() - 1)); }
    }

    /** One phone: its own sealed store, its own local topics and saved stories, and the real account code. */
    private final class Phone {
        final MemoryStore store = new MemoryStore();
        final Landing landing = new Landing();
        final List<String> opened = new ArrayList<>();
        Set<String> topics;
        List<Story> saved;
        final AccountManager account;

        Phone(Set<String> topics, List<Story> saved) {
            this.topics = new TreeSet<>(topics); this.saved = new ArrayList<>(saved);
            account = new AccountManager(supabase, supabase, store, Runnable::run, clock::get, SCHEME, () -> this.topics, () -> this.saved);
            account.listen(landing);
        }

        void signInAs(String email) throws Exception {
            account.begin(opened::add);
            assertEquals("the app opens the browser once (status message " + account.status().message() + ")", 1, opened.size());
            HttpUrl asked = HttpUrl.get(opened.get(0));
            assertEquals(PROJECT_HOST, asked.host());
            // The address the app builds must be one the real service accepts and sends on to Google.
            Request authorize = new Request.Builder().url(asked.newBuilder().scheme("http").host("127.0.0.1").port(54321).build()).build();
            try (Response response = raw.newCall(authorize).execute()) {
                assertEquals(302, response.code());
                assertTrue(String.valueOf(response.header("Location")), response.header("Location").startsWith("https://accounts.google.com/"));
            }
            // Google's consent screen cannot be driven here; the code it would hand back is issued for the same challenge.
            String code = codeFor(email, asked.queryParameter("code_challenge"));
            account.complete(SCHEME + "://auth-callback/?code=" + code);
        }
    }

    @Before public void aStackIsRunning() throws Exception {
        String path = System.getenv("PLAX_LOCAL_STACK");
        Assume.assumeTrue("Set PLAX_LOCAL_STACK to the local stack's .env to run this", path != null && !path.isBlank());
        Map<String, String> values = new HashMap<>();
        for (String line : Files.readAllLines(Path.of(path))) {
            int equals = line.indexOf('=');
            if (equals > 0) values.put(line.substring(0, equals).trim(), line.substring(equals + 1).trim());
        }
        anon = values.get("ANON_KEY"); service = values.get("SERVICE_KEY"); jwtSecret = values.get("JWT_SECRET");
        assertTrue("ANON_KEY, SERVICE_KEY and JWT_SECRET are expected in " + path, anon != null && service != null && jwtSecret != null);
        OkHttpClient app = new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).addInterceptor(chain -> {
            Request request = chain.request();
            HttpUrl url = request.url();
            if (url.toString().startsWith(FeedApi.SITE + "/api/auth-config")) {
                String body = "{\"url\":\"https://" + PROJECT_HOST + "\",\"anonKey\":\"" + anon + "\"}";
                return new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                        .body(ResponseBody.create(body, MediaType.get("application/json"))).build();
            }
            if (!url.host().equals(PROJECT_HOST)) throw new IOException("The account code contacted " + url.host());
            return chain.proceed(request.newBuilder().url(url.newBuilder().scheme("http").host("127.0.0.1").port(54321).build()).build());
        }).build();
        supabase = new Supabase(app, FeedApi.SITE, clock::get);
        try { config = supabase.config(); }
        catch (IOException unreachable) { fail("The local stack is not answering on " + GATEWAY + ": " + unreachable.getMessage()); }
    }

    // The stack's own endpoints, used only for what a browser or the owner would do.

    private static String enc(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }

    private String send(Request request, int... accepted) throws IOException {
        try (Response response = raw.newCall(request).execute()) {
            String body = response.body() == null ? "" : response.body().string();
            boolean ok = false;
            for (int code : accepted) ok |= code == response.code();
            if (!ok) throw new IOException("HTTP " + response.code() + " from " + request.url() + ": " + body);
            return body;
        }
    }

    /** What Google would return after consent: a one-time code bound to {@code challenge}, delivered through the stack. */
    private String codeFor(String email, String challenge) throws Exception {
        send(new Request.Builder().url(MAIL + "/api/v1/messages").delete().build(), 200);
        JsonObject body = new JsonObject();
        body.addProperty("email", email); body.addProperty("create_user", true);
        body.addProperty("code_challenge", challenge); body.addProperty("code_challenge_method", "s256");
        send(new Request.Builder().url(GATEWAY + "/auth/v1/otp?redirect_to=" + enc(AccountManager.REDIRECT + "?app=" + SCHEME))
                .header("apikey", anon).post(RequestBody.create(body.toString(), MediaType.get("application/json"))).build(), 200);
        String link = null;
        for (int attempt = 0; attempt < 80 && link == null; attempt++) {
            JsonArray messages = JsonParser.parseString(send(new Request.Builder().url(MAIL + "/api/v1/search?query=" + enc("to:" + email)).build(), 200))
                    .getAsJsonObject().getAsJsonArray("messages");
            if (messages.isEmpty()) { Thread.sleep(250); continue; }
            String id = messages.get(0).getAsJsonObject().get("ID").getAsString();
            Matcher found = VERIFY_LINK.matcher(JsonParser.parseString(send(new Request.Builder().url(MAIL + "/api/v1/message/" + id).build(), 200))
                    .getAsJsonObject().get("Text").getAsString());
            assertTrue("a verification link is in the e-mail", found.find());
            link = found.group().replace("&amp;", "&").replace("http://localhost:54321", GATEWAY);
        }
        assertNotNull("the stack sent an e-mail to " + email, link);
        try (Response response = raw.newCall(new Request.Builder().url(link).build()).execute()) {
            assertEquals("the link answers with a redirect back to the website", 303, response.code());
            HttpUrl back = HttpUrl.get(response.header("Location"));
            assertEquals("www.plaxlabs.com", back.host());
            assertEquals("/news/auth/app", back.encodedPath());
            assertEquals(SCHEME, back.queryParameter("app"));
            String code = back.queryParameter("code");
            assertNotNull(code);
            return code;
        }
    }

    /** Rows as the owner sees them, past row-level security. */
    private JsonArray rows(String path) throws IOException {
        return JsonParser.parseString(send(new Request.Builder().url(GATEWAY + "/rest/v1/" + path)
                .header("apikey", service).header("Authorization", "Bearer " + service).build(), 200)).getAsJsonArray();
    }

    private String userId(String email) throws IOException {
        JsonArray profile = rows("user_profiles?email=eq." + enc(email) + "&select=id");
        assertEquals("one profile row was created by the database trigger for " + email, 1, profile.size());
        return profile.get(0).getAsJsonObject().get("id").getAsString();
    }

    private Set<String> bookmarkIds(String userId) throws IOException {
        Set<String> found = new TreeSet<>();
        for (JsonElement row : rows("bookmarks?user_id=eq." + userId + "&select=card_id")) found.add(row.getAsJsonObject().get("card_id").getAsString());
        return found;
    }

    private Set<String> storedTopics(String userId) throws IOException {
        Set<String> found = new TreeSet<>();
        for (JsonElement topic : rows("user_profiles?id=eq." + userId + "&select=selected_topics").get(0).getAsJsonObject().getAsJsonArray("selected_topics")) found.add(topic.getAsString());
        return found;
    }

    private static String email() { return "reader-" + UUID.randomUUID() + "@example.test"; }

    private static Story story(String id) {
        return new Story(id, "Headline " + id, "Body of " + id + " with enough words.", "science", "", "Publisher", "https://example.com/" + id, "", "", 0);
    }

    private static Set<String> ids(List<Story> stories) {
        Set<String> ids = new TreeSet<>();
        for (Story story : stories) ids.add(story.id());
        return ids;
    }

    private String expiredAccessToken(String userId) throws Exception {
        java.util.function.Function<String, String> part = text -> Base64.getUrlEncoder().withoutPadding().encodeToString(text.getBytes(StandardCharsets.UTF_8));
        String signed = part.apply("{\"alg\":\"HS256\",\"typ\":\"JWT\"}") + "."
                + part.apply("{\"sub\":\"" + userId + "\",\"role\":\"authenticated\",\"aud\":\"authenticated\",\"exp\":" + (System.currentTimeMillis() / 1000 - 3600) + "}");
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return signed + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(signed.getBytes(StandardCharsets.UTF_8)));
    }

    // The journeys

    @Test public void theServiceOffersGoogleAndTheKeyIsRequired() throws Exception {
        supabase.check(config);
        try { send(new Request.Builder().url(GATEWAY + "/auth/v1/settings").build(), 200); fail("the gateway must refuse a call without the project key"); }
        catch (IOException refused) { assertTrue(refused.getMessage(), refused.getMessage().startsWith("HTTP 401")); }
    }

    @Test public void signingInCreatesTheAccountAndUploadsWhatIsOnThePhone() throws Exception {
        String email = email();
        Phone phone = new Phone(Set.of("science", "space"), List.of(story("story-a"), story("story-b")));
        phone.signInAs(email);
        assertEquals(AccountManager.Phase.SIGNED_IN, phone.account.status().phase());
        assertEquals(email, phone.account.status().email());
        assertEquals("no sign-in problem is reported", 0, phone.account.status().message());
        String user = userId(email);
        assertEquals(Set.of("science", "space"), storedTopics(user));
        assertEquals(Set.of("story-a", "story-b"), bookmarkIds(user));
        assertTrue("the profile row says the reader has chosen topics", rows("user_profiles?id=eq." + user + "&select=has_onboarded").get(0).getAsJsonObject().get("has_onboarded").getAsBoolean());
        assertTrue("the sealed store holds a session and no verifier is left behind", phone.store.text.contains("\"session\"") && !phone.store.text.contains("\"v\":"));
    }

    @Test public void theSameAccountOnAnotherPhoneReceivesTheTopicsAndStories() throws Exception {
        String email = email();
        new Phone(Set.of("science", "space"), List.of(story("story-a"), story("story-b"))).signInAs(email);
        Phone second = new Phone(Set.of(), List.of());
        second.signInAs(email);
        assertEquals(AccountManager.Phase.SIGNED_IN, second.account.status().phase());
        assertEquals(Set.of("science", "space"), second.landing.lastTopics());
        assertEquals(Set.of("story-a", "story-b"), second.landing.lastSavedIds());
        for (Story restored : second.landing.saved.get(second.landing.saved.size() - 1)) {
            assertEquals("Headline " + restored.id(), restored.title());
            assertEquals("a restored story keeps its text and category", "science", restored.category());
            assertTrue("and has no link or picture, as documented", restored.sourceUrl().isEmpty() && restored.image().isEmpty());
        }
    }

    @Test public void changesMadeWhileSignedInReachTheAccount() throws Exception {
        String email = email();
        Phone phone = new Phone(Set.of("science"), List.of(story("story-a")));
        phone.signInAs(email);
        String user = userId(email);
        phone.account.saved(story("story-c"), true);
        assertEquals(Set.of("story-a", "story-c"), bookmarkIds(user));
        phone.account.saved(story("story-a"), false);
        assertEquals(Set.of("story-c"), bookmarkIds(user));
        phone.account.interests(Set.of("technology", "math"));
        assertEquals(Set.of("math", "technology"), storedTopics(user));
        assertEquals("nothing is reported as failed", 0, phone.account.status().message());
    }

    @Test public void savingAStoryTwiceIsHarmless() throws Exception {
        Phone phone = new Phone(Set.of(), List.of());
        String email = email();
        phone.signInAs(email);
        AuthApi.Tokens tokens = tokensOf(phone);
        supabase.addBookmarks(config, tokens, List.of(story("story-a")));
        supabase.addBookmarks(config, tokens, List.of(story("story-a"), story("story-b")));
        assertEquals("the repeat is ignored, not refused and not duplicated", Set.of("story-a", "story-b"), bookmarkIds(userId(email)));
        assertEquals(Set.of("story-a", "story-b"), ids(supabase.bookmarks(config, tokens)));
    }

    @Test public void anotherAccountNeverSeesOrChangesThisOnesData() throws Exception {
        String first = email(), second = email();
        Phone owner = new Phone(Set.of("science"), List.of(story("story-a")));
        owner.signInAs(first);
        Phone other = new Phone(Set.of("art"), List.of(story("story-z")));
        other.signInAs(second);
        String ownerId = userId(first), otherId = userId(second);
        assertNotEquals(ownerId, otherId);
        AuthApi.Tokens otherTokens = tokensOf(other);
        assertEquals("a reader sees only their own saved stories", Set.of("story-z"), ids(supabase.bookmarks(config, otherTokens)));
        assertEquals(Set.of("art"), supabase.topics(config, otherTokens));
        supabase.removeBookmark(config, otherTokens, "story-a");
        assertEquals("removing someone else's story removes nothing", Set.of("story-a"), bookmarkIds(ownerId));
        // The database itself refuses a row that names another reader, whatever the app sends.
        JsonArray forged = new JsonArray();
        JsonObject row = new JsonObject();
        row.addProperty("user_id", ownerId); row.addProperty("card_id", "story-forged"); row.addProperty("card_title", "x");
        forged.add(row);
        try {
            send(new Request.Builder().url(GATEWAY + "/rest/v1/bookmarks").header("apikey", anon).header("Authorization", "Bearer " + otherTokens.access())
                    .header("Prefer", "return=minimal").post(RequestBody.create(forged.toString(), MediaType.get("application/json"))).build(), 201, 204);
            fail("a row for another reader must be refused");
        } catch (IOException refused) { assertTrue(refused.getMessage(), refused.getMessage().startsWith("HTTP 403")); }
        assertEquals(Set.of("story-a"), bookmarkIds(ownerId));
        // And without signing in at all nothing can be read.
        assertEquals("the anonymous key reads no rows", 0, JsonParser.parseString(send(new Request.Builder().url(GATEWAY + "/rest/v1/bookmarks?select=card_id")
                .header("apikey", anon).build(), 200)).getAsJsonArray().size());
    }

    @Test public void aCodeWorksOnlyOnceAndOnlyWithItsVerifier() throws Exception {
        String wrong = Pkce.verifier(), right = Pkce.verifier();
        String code = codeFor(email(), Pkce.challenge(right));
        try { supabase.exchange(config, code, wrong); fail("a code must not be exchanged with another verifier"); }
        catch (AuthApi.Rejected refused) { assertTrue("HTTP " + refused.status, refused.status >= 400 && refused.status < 500); }
        String second = codeFor(email(), Pkce.challenge(right));
        AuthApi.Tokens tokens = supabase.exchange(config, second, right);
        assertTrue(tokens.userId().matches("[0-9a-f-]{36}"));
        assertTrue(tokens.expiresAt() > clock.get() + 30 * 60_000);
        try { supabase.exchange(config, second, right); fail("a code must not be used twice"); }
        catch (AuthApi.Rejected refused) { assertTrue("HTTP " + refused.status, refused.status >= 400 && refused.status < 500); }
    }

    @Test public void anExpiredAccessTokenIsToldApartFromARefusedChange() throws Exception {
        String email = email();
        Phone phone = new Phone(Set.of("science"), List.of(story("story-a")));
        phone.signInAs(email);
        AuthApi.Tokens expired = new AuthApi.Tokens(expiredAccessToken(userId(email)), "unused", clock.get() + 3_600_000, userId(email), email, "");
        try { supabase.topics(config, expired); fail("an expired token must be refused"); }
        catch (AuthApi.Unauthorized unauthorized) { assertEquals(401, unauthorized.status); }
        try { supabase.bookmarks(config, new AuthApi.Tokens("not-a-token", "unused", clock.get() + 3_600_000, userId(email), email, "")); fail("a malformed token must be refused"); }
        catch (AuthApi.Rejected refused) { assertTrue("HTTP " + refused.status, refused.status == 401 || refused.status == 400); }
    }

    @Test public void theManagerRefreshesASessionThatHasRunOut() throws Exception {
        String email = email();
        Phone phone = new Phone(Set.of("science"), List.of());
        phone.signInAs(email);
        String before = phone.store.text;
        clock.addAndGet(2 * 3_600_000L);
        phone.account.saved(story("story-late"), true);
        assertEquals("the change was sent with a freshly issued token", Set.of("story-late"), bookmarkIds(userId(email)));
        assertNotEquals("the sealed session was replaced", before, phone.store.text);
        assertEquals(AccountManager.Phase.SIGNED_IN, phone.account.status().phase());
        assertEquals(0, phone.account.status().message());
    }

    @Test public void aSessionRevokedElsewhereEndsCleanlyAndTheReaderIsToldToSignInAgain() throws Exception {
        String email = email();
        Phone phone = new Phone(Set.of("science"), List.of(story("story-a")));
        phone.signInAs(email);
        // Signing out everywhere (as the website's account page would) makes every refresh token stop working.
        send(new Request.Builder().url(GATEWAY + "/auth/v1/logout?scope=global").header("apikey", anon).header("Authorization", "Bearer " + tokensOf(phone).access())
                .post(RequestBody.create("{}", MediaType.get("application/json"))).build(), 204);
        clock.addAndGet(2 * 3_600_000L);
        phone.account.saved(story("story-b"), true);
        assertEquals(AccountManager.Phase.SIGNED_OUT, phone.account.status().phase());
        assertEquals(R.string.account_expired, phone.account.status().message());
        assertFalse("the dead session is no longer kept", phone.store.text != null && phone.store.text.contains("\"session\""));
        assertEquals("nothing reached the account", Set.of("story-a"), bookmarkIds(userId(email)));
    }

    @Test public void signingOutRevokesThisPhonesSessionAndForgetsIt() throws Exception {
        String email = email();
        Phone phone = new Phone(Set.of("science"), List.of());
        phone.signInAs(email);
        AuthApi.Tokens held = tokensOf(phone);
        phone.account.signOut();
        assertEquals(AccountManager.Phase.SIGNED_OUT, phone.account.status().phase());
        assertTrue("no token is kept on the phone", phone.store.text == null
                || !phone.store.text.contains(held.access()) && !phone.store.text.contains(held.refresh()) && !phone.store.text.contains("\"session\""));
        try { supabase.refresh(config, held.refresh()); fail("the old refresh token must be dead"); }
        catch (AuthApi.Rejected refused) { assertTrue("HTTP " + refused.status, refused.status == 400 || refused.status == 401 || refused.status == 403); }
    }

    @Test public void theStreakFunctionChangesOnlyTheCallersOwnRow() throws Exception {
        String first = email(), second = email();
        Phone reader = new Phone(Set.of(), List.of());
        reader.signInAs(first);
        Phone other = new Phone(Set.of(), List.of());
        other.signInAs(second);
        String readerId = userId(first), otherId = userId(second);
        AuthApi.Tokens readerTokens = tokensOf(reader);
        java.util.function.Function<String, Request.Builder> call = target -> new Request.Builder().url(GATEWAY + "/rest/v1/rpc/update_reading_streak")
                .post(RequestBody.create("{\"p_user_id\":\"" + target + "\"}", MediaType.get("application/json")));
        // A signed-in reader may update their own streak, which is what the website does.
        send(call.apply(readerId).header("apikey", anon).header("Authorization", "Bearer " + readerTokens.access()).build(), 200, 204);
        assertEquals(1, rows("user_profiles?id=eq." + readerId + "&select=reading_streak").get(0).getAsJsonObject().get("reading_streak").getAsInt());
        // Neither a signed-in reader nor an anonymous caller may update someone else's.
        try { send(call.apply(otherId).header("apikey", anon).header("Authorization", "Bearer " + readerTokens.access()).build(), 200, 204); fail("another reader's streak must not change"); }
        catch (IOException refused) { assertTrue(refused.getMessage(), refused.getMessage().startsWith("HTTP 403")); }
        try { send(call.apply(otherId).header("apikey", anon).build(), 200, 204); fail("an anonymous caller must not change a streak"); }
        catch (IOException refused) { assertTrue(refused.getMessage(), refused.getMessage().startsWith("HTTP 401")); }
        assertEquals("the other reader's streak is untouched", 0, rows("user_profiles?id=eq." + otherId + "&select=reading_streak").get(0).getAsJsonObject().get("reading_streak").getAsInt());
    }

    @Test public void aReaderWhoDeniedGoogleOrWhoseCodeFailedStaysSignedOutWithAMessage() throws Exception {
        Phone phone = new Phone(Set.of(), List.of());
        phone.account.begin(phone.opened::add);
        phone.account.complete(SCHEME + "://auth-callback/?error=access_denied");
        assertEquals(AccountManager.Phase.SIGNED_OUT, phone.account.status().phase());
        assertEquals(R.string.account_denied, phone.account.status().message());
        phone.account.begin(phone.opened::add);
        phone.account.complete(SCHEME + "://auth-callback/?code=" + "0".repeat(36));
        assertEquals("a code the service never issued is refused", AccountManager.Phase.SIGNED_OUT, phone.account.status().phase());
        assertEquals(R.string.account_failed, phone.account.status().message());
    }

    /** The session the phone is holding, read from its sealed store the way the app does after a restart. */
    private static AuthApi.Tokens tokensOf(Phone phone) {
        JsonObject session = JsonParser.parseString(phone.store.text).getAsJsonObject().getAsJsonObject("session");
        return new AuthApi.Tokens(session.get("a").getAsString(), session.get("r").getAsString(), session.get("e").getAsLong(),
                session.get("u").getAsString(), session.get("m").getAsString(), session.get("n").getAsString());
    }
}
