package com.plaxlabs.news;

import okhttp3.*;
import okio.Buffer;
import org.junit.Test;
import java.io.IOException;
import java.util.*;
import static org.junit.Assert.*;

/** Exactly what is sent to, and accepted from, the account service, checked with canned HTTP answers. */
public class SupabaseTest {
    private static final String USER = "33333333-3333-4333-8333-333333333333";
    private static final String PROJECT = "https://abcdefghij.supabase.co";

    private record Sent(String method, HttpUrl url, Headers headers, String body) { }

    private final List<Sent> sent = new ArrayList<>();
    private final ArrayDeque<Object[]> script = new ArrayDeque<>();
    private final Supabase supabase = new Supabase(new OkHttpClient.Builder().followRedirects(false).addInterceptor(chain -> {
        Request request = chain.request();
        Buffer body = new Buffer();
        if (request.body() != null) request.body().writeTo(body);
        sent.add(new Sent(request.method(), request.url(), request.headers(), body.readUtf8()));
        Object[] next = script.pollFirst();
        return new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code((int) next[0]).message("canned")
                .body(ResponseBody.create((String) next[1], MediaType.get("application/json"))).build();
    }).build(), "https://www.plaxlabs.com/news", () -> 1_000_000L);

    private final AuthConfig config = new AuthConfig(PROJECT, "anon-key-0123456789abcdef");
    private final AuthApi.Tokens tokens = new AuthApi.Tokens("access-secret", "refresh-secret", 0, USER, "a@example.com", "A");

    private void reply(int code, String body) { script.add(new Object[]{code, body}); }

    private static String session(String access, String refresh) {
        return "{\"access_token\":\"" + access + "\",\"refresh_token\":\"" + refresh + "\",\"expires_in\":3600,\"token_type\":\"bearer\","
                + "\"user\":{\"id\":\"" + USER.toUpperCase(Locale.ROOT) + "\",\"email\":\"reader@example.com\","
                + "\"user_metadata\":{\"full_name\":\"Asha Rao\",\"avatar_url\":\"https://example.com/a.png\"}}}";
    }

    private static Story story(String id, String body) {
        return new Story(id, "Headline " + id, body, "science", "", "Publisher", "https://example.com/" + id, "", "", 0);
    }

    @Test public void theProjectAddressIsReadFromThePlaxWebsite() throws Exception {
        reply(200, "{\"url\":\"" + PROJECT + "\",\"anonKey\":\"anon-key-0123456789abcdef\"}");
        AuthConfig found = supabase.config();
        assertEquals("https://www.plaxlabs.com/news/api/auth-config", sent.get(0).url().toString());
        assertEquals(PROJECT, found.url());
    }

    @Test public void onlyASupabaseProjectOverHttpsIsEverAccepted() {
        String key = "anon-key-0123456789abcdef";
        for (String url : List.of("http://abcdefghij.supabase.co", "https://abcdefghij.supabase.co:8443", "https://evil.example.com",
                "https://abcdefghij.supabase.co.evil.com", "https://user:pw@abcdefghij.supabase.co", "https://abcdefghij.supabase.co/path",
                "https://abcdefghij.supabase.co?x=1", "https://supabase.co", "javascript:alert(1)", "", "not a url")) {
            String json = "{\"url\":\"" + url + "\",\"anonKey\":\"" + key + "\"}";
            assertThrows(url, IOException.class, () -> AuthConfig.parse(json));
        }
        assertThrows(IOException.class, () -> AuthConfig.parse("{\"url\":\"" + PROJECT + "\",\"anonKey\":\"bad key!\"}"));
        assertThrows(IOException.class, () -> AuthConfig.parse("{\"url\":\"" + PROJECT + "\"}"));
        assertThrows(IOException.class, () -> AuthConfig.parse("[]"));
        try { assertEquals(PROJECT, AuthConfig.parse("{\"url\":\"" + PROJECT + "/\",\"anonKey\":\"" + key + "\"}").url()); }
        catch (IOException unexpected) { fail("A trailing slash is harmless"); }
    }

    @Test public void signInIsOfferedOnlyWhenGoogleIsEnabled() throws Exception {
        reply(200, "{\"external\":{\"google\":true,\"email\":true}}");
        supabase.check(config);
        assertEquals(PROJECT + "/auth/v1/settings", sent.get(0).url().toString());
        assertEquals("anon-key-0123456789abcdef", sent.get(0).headers().get("apikey"));
        reply(200, "{\"external\":{\"google\":false}}");
        assertThrows(IOException.class, () -> supabase.check(config));
        reply(200, "{\"external\":{}}");
        assertThrows(IOException.class, () -> supabase.check(config));
        reply(200, "<html>captive portal</html>");
        assertThrows(IOException.class, () -> supabase.check(config));
    }

    @Test public void theCodeIsExchangedWithItsVerifierAndNoToken() throws Exception {
        reply(200, session("access-secret", "refresh-secret"));
        AuthApi.Tokens signedIn = supabase.exchange(config, "the-code", "the-verifier");
        Sent request = sent.get(0);
        assertEquals("POST", request.method());
        assertEquals(PROJECT + "/auth/v1/token?grant_type=pkce", request.url().toString());
        assertEquals("{\"auth_code\":\"the-code\",\"code_verifier\":\"the-verifier\"}", request.body());
        assertNull("Nothing is authenticated yet", request.headers().get("Authorization"));
        assertEquals("access-secret", signedIn.access()); assertEquals("refresh-secret", signedIn.refresh());
        assertEquals("Ids are normalised", USER, signedIn.userId());
        assertEquals("reader@example.com", signedIn.email()); assertEquals("Asha Rao", signedIn.name());
        assertEquals("The expiry is the lifetime from now", 1_000_000L + 3_600_000L, signedIn.expiresAt());
    }

    @Test public void aRefreshSendsTheRefreshTokenOnly() throws Exception {
        reply(200, session("access-2", "refresh-2"));
        assertEquals("refresh-2", supabase.refresh(config, "refresh-1").refresh());
        assertEquals(PROJECT + "/auth/v1/token?grant_type=refresh_token", sent.get(0).url().toString());
        assertEquals("{\"refresh_token\":\"refresh-1\"}", sent.get(0).body());
    }

    @Test public void malformedSignInResponsesAreRejected() {
        for (String body : List.of("{}", "[]", "not json", session("", "r"), session("a", ""),
                "{\"access_token\":\"a\",\"refresh_token\":\"r\",\"expires_in\":3600,\"user\":{\"id\":\"not-a-uuid\"}}",
                "{\"access_token\":\"a\",\"refresh_token\":\"r\",\"expires_in\":0,\"user\":{\"id\":\"" + USER + "\"}}",
                "{\"access_token\":\"a\",\"refresh_token\":\"r\",\"user\":{\"id\":\"" + USER + "\"}}")) {
            reply(200, body);
            assertThrows(body, IOException.class, () -> supabase.exchange(config, "c", "v"));
        }
    }

    @Test public void signOutRevokesOnlyThisPhonesSessionAndNeverFails() {
        reply(204, "");
        supabase.logout(config, "access-secret");
        assertEquals(PROJECT + "/auth/v1/logout?scope=local", sent.get(0).url().toString());
        assertEquals("Bearer access-secret", sent.get(0).headers().get("Authorization"));
        reply(500, "boom");
        supabase.logout(config, "access-secret");
        assertEquals(2, sent.size());
    }

    @Test public void eachKindOfFailureIsToldApart() {
        reply(401, "{}");
        assertThrows(AuthApi.Unauthorized.class, () -> supabase.topics(config, tokens));
        for (int code : new int[]{400, 403, 404, 409, 422}) {
            reply(code, "{\"message\":\"secret-detail\"}");
            AuthApi.Rejected rejected = assertThrows(AuthApi.Rejected.class, () -> supabase.topics(config, tokens));
            assertEquals(code, rejected.status);
            assertFalse("Response bodies never reach error messages", rejected.getMessage().contains("secret-detail"));
        }
        for (int code : new int[]{408, 429, 500, 503, 302}) {
            reply(code, "{}");
            IOException failure = assertThrows(IOException.class, () -> supabase.topics(config, tokens));
            assertFalse("A busy or broken service is not a refusal: " + code, failure instanceof AuthApi.Rejected);
        }
    }

    @Test public void anOversizedResponseIsNotReadToTheEnd() {
        reply(200, "[" + "1,".repeat(400_000) + "1]");
        assertThrows(IOException.class, () -> supabase.bookmarks(config, tokens));
    }

    @Test public void topicsAreReadForTheSignedInUserOnly() throws Exception {
        reply(200, "[{\"selected_topics\":[\"space\",\"science\",\"bogus\",\"<b>\"]}]");
        assertEquals(Set.of("science", "space"), supabase.topics(config, tokens));
        Sent request = sent.get(0);
        assertEquals("GET", request.method());
        assertEquals("/rest/v1/user_profiles", request.url().encodedPath());
        assertEquals("eq." + USER, request.url().queryParameter("id"));
        assertEquals("selected_topics", request.url().queryParameter("select"));
        assertEquals("Bearer access-secret", request.headers().get("Authorization"));
        assertEquals("anon-key-0123456789abcdef", request.headers().get("apikey"));
        reply(200, "[]");
        assertTrue("No profile row yet", supabase.topics(config, tokens).isEmpty());
        reply(200, "[{\"selected_topics\":null}]");
        assertTrue(supabase.topics(config, tokens).isEmpty());
        reply(200, "{\"not\":\"an array\"}");
        assertThrows(IOException.class, () -> supabase.topics(config, tokens));
    }

    @Test public void topicsAreUpsertedIntoTheProfileRow() throws Exception {
        reply(201, "");
        supabase.saveTopics(config, tokens, new TreeSet<>(List.of("space", "art", "nonsense")));
        Sent request = sent.get(0);
        assertEquals("POST", request.method());
        assertEquals("id", request.url().queryParameter("on_conflict"));
        assertEquals("resolution=merge-duplicates,return=minimal", request.headers().get("Prefer"));
        assertEquals("[{\"id\":\"" + USER + "\",\"selected_topics\":[\"art\",\"space\"],\"has_onboarded\":true}]", request.body());
    }

    @Test public void savedStoriesAreReadWithoutTrustingTheirContents() throws Exception {
        reply(200, "[{\"card_id\":\"a-1\",\"card_title\":\"Title\",\"card_category\":\"science\",\"card_content\":\"Body text\"},"
                + "{\"card_id\":\"b-2\",\"card_title\":null,\"card_category\":null,\"card_content\":\"Only a body\"},"
                + "{\"card_id\":\"../evil\",\"card_title\":\"x\",\"card_category\":\"news\",\"card_content\":\"x\"},"
                + "{\"card_id\":\"c-3\",\"card_title\":null,\"card_category\":null,\"card_content\":null},"
                + "{\"card_title\":\"no id\"}]");
        List<Story> stories = supabase.bookmarks(config, tokens);
        assertEquals(List.of("a-1", "b-2"), stories.stream().map(Story::id).toList());
        assertEquals("science", stories.get(0).category()); assertEquals("news", stories.get(1).category());
        assertFalse("The account keeps no link, so none is invented", stories.get(0).hasSource());
        assertEquals("created_at.desc", sent.get(0).url().queryParameter("order"));
        assertEquals("200", sent.get(0).url().queryParameter("limit"));
    }

    @Test public void savingStoriesIsOneRequestThatIgnoresRepeatsAndTrimsLongText() throws Exception {
        reply(201, "");
        supabase.addBookmarks(config, tokens, List.of(story("a-1", "x".repeat(900)), story("../bad", "y"), story("b-2", "short")));
        Sent request = sent.get(0);
        assertEquals("POST", request.method());
        assertEquals("user_id,card_id", request.url().queryParameter("on_conflict"));
        assertEquals("There is no update rule, so duplicates must be ignored, not merged",
                "resolution=ignore-duplicates,return=minimal", request.headers().get("Prefer"));
        com.google.gson.JsonArray rows = com.google.gson.JsonParser.parseString(request.body()).getAsJsonArray();
        assertEquals("A card id that is not a plain identifier is never sent", 2, rows.size());
        assertEquals(500, rows.get(0).getAsJsonObject().get("card_content").getAsString().length());
        assertEquals(USER, rows.get(0).getAsJsonObject().get("user_id").getAsString());
        supabase.addBookmarks(config, tokens, List.of(story("../bad", "y")));
        assertEquals("Nothing valid, nothing sent", 1, sent.size());
    }

    @Test public void removingAStoryDeletesOnlyThatRowOfThisUser() throws Exception {
        reply(204, "");
        supabase.removeBookmark(config, tokens, "a-1");
        Sent request = sent.get(0);
        assertEquals("DELETE", request.method());
        assertEquals("eq." + USER, request.url().queryParameter("user_id"));
        assertEquals("eq.a-1", request.url().queryParameter("card_id"));
        supabase.removeBookmark(config, tokens, "a-1&user_id=neq.0");
        assertEquals("An id that could alter the filter is never sent", 1, sent.size());
    }

    @Test public void aMalformedUserIdIsNeverPutInAnAddress() {
        AuthApi.Tokens bad = new AuthApi.Tokens("a", "r", 0, "1&or=(id.neq.0)", "", "");
        assertThrows(IOException.class, () -> supabase.topics(config, bad));
        assertThrows(IOException.class, () -> supabase.removeBookmark(config, bad, "a-1"));
        assertTrue(sent.isEmpty());
    }

    @Test public void theProofKeyFollowsTheStandard() {
        // The worked example in RFC 7636, appendix B.
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
        String first = Pkce.verifier(), second = Pkce.verifier();
        assertNotEquals(first, second);
        assertTrue(first.matches("[A-Za-z0-9_-]{43,128}"));
    }
}
