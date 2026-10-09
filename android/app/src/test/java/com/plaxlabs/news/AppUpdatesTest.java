package com.plaxlabs.news;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import okhttp3.*;
import okio.Buffer;
import org.junit.Assume;
import org.junit.Test;
import static org.junit.Assert.*;

/** What the app accepts from the update feed, and everything it refuses, checked with canned answers. */
public class AppUpdatesTest {
    private static final String APK = AppUpdates.ORIGIN + "/plax-1.4.0.apk";

    private static JsonObject manifest() {
        JsonObject json = new JsonObject();
        json.addProperty("schemaVersion", 1);
        json.addProperty("versionCode", 10);
        json.addProperty("versionName", "1.4.0");
        json.addProperty("minSdk", 26);
        json.addProperty("apkUrl", APK);
        json.addProperty("sha256", "a".repeat(64));
        json.addProperty("size", 1_850_000);
        return json;
    }

    private static byte[] bytes(JsonObject json) { return json.toString().getBytes(StandardCharsets.UTF_8); }

    private static OkHttpClient answering(int code, String type, String body) {
        return new OkHttpClient.Builder().addInterceptor(chain -> new Response.Builder()
                .request(chain.request()).protocol(Protocol.HTTP_1_1).code(code).message("canned")
                .body(ResponseBody.create(body, type == null ? null : MediaType.get(type))).build()).build();
    }

    @Test public void onlyNewerCompatibleReleasesAreOffered() throws Exception {
        AppUpdates.Release release = AppUpdates.parse(bytes(manifest()), 9, 26);
        assertNotNull(release);
        assertEquals(10, release.versionCode());
        assertEquals("1.4.0", release.versionName());
        assertEquals(APK, release.apkUrl());
        assertNull("the same version is not an update", AppUpdates.parse(bytes(manifest()), 10, 36));
        assertNull("an older one is not either", AppUpdates.parse(bytes(manifest()), 11, 36));
        assertNull("a phone older than the build's minimum is not offered it", AppUpdates.parse(bytes(manifest()), 9, 25));
        JsonObject newer = manifest(); newer.addProperty("minSdk", 33);
        assertNull(AppUpdates.parse(bytes(newer), 9, 32));
        assertNotNull(AppUpdates.parse(bytes(newer), 9, 33));
    }

    @Test public void onlyTheExactVersionedHttpsDownloadFromThisSiteIsAccepted() {
        for (String url : List.of("http://www.plaxlabs.com/news/plax-1.4.0.apk", "https://example.org/news/plax-1.4.0.apk",
                "https://www.plaxlabs.com.example.org/news/plax-1.4.0.apk", AppUpdates.ORIGIN + "/plax-1.3.9.apk",
                AppUpdates.ORIGIN + "/plax-1.4.0.apk?token=anything", AppUpdates.ORIGIN + "/plax-1.4.0.apk#fragment",
                "https://user@www.plaxlabs.com/news/plax-1.4.0.apk", "https://www.plaxlabs.com:444/news/plax-1.4.0.apk",
                AppUpdates.ORIGIN + "/other/../plax-1.4.0.apk", "https://www.plaxlabs.com/plax-1.4.0.apk",
                "https://plaxlabs.com/news/plax-1.4.0.apk", AppUpdates.ORIGIN + "/plax-1.4.0.APK", AppUpdates.ORIGIN + "/vanishr-1.4.0.apk",
                AppUpdates.ORIGIN + "/plax-1.4.0.apk ", " " + APK, "", "javascript:alert(1)", "file:///data/local/tmp/app.apk")) {
            JsonObject json = manifest(); json.addProperty("apkUrl", url);
            assertThrows(url, IOException.class, () -> AppUpdates.parse(bytes(json), 9, 36));
        }
    }

    @Test public void malformedDuplicateUnknownAndOversizedMetadataIsRejected() {
        String valid = manifest().toString();
        for (String json : List.of("null", "[]", "{}", "", " ", valid + "{}", valid + "x", valid.substring(0, valid.length() - 1),
                valid.replace("\"versionCode\":10", "\"versionCode\":10,\"versionCode\":11"),
                valid.replace("\"versionCode\":10", "\"versionCode\":\"10\""), valid.replace("\"versionCode\":10", "\"versionCode\":10.1"),
                valid.replace("\"versionCode\":10", "\"versionCode\":1e1"), valid.replace("\"versionCode\":10", "\"versionCode\":010"),
                valid.replace("\"versionCode\":10", "\"versionCode\":2147483648"), valid.replace("\"versionCode\":10", "\"versionCode\":-1"),
                valid.replace("\"versionCode\":10", "\"versionCode\":0"),
                valid.replace("\"schemaVersion\":1", "\"schemaVersion\":2"), valid.replace("\"schemaVersion\":1", "\"schemaVersion\":\"1\""),
                valid.replace("\"size\":1850000", "\"size\":0"), valid.replace("\"size\":1850000", "\"size\":100000000"),
                valid.replace("\"minSdk\":26", "\"minSdk\":0"), valid.replace("\"minSdk\":26", "\"minSdk\":25"),
                valid.replace("\"minSdk\":26", "\"minSdk\":1001"),
                valid.replace("\"sha256\":\"" + "a".repeat(64) + "\"", "\"sha256\":null"),
                valid.replace("a".repeat(64), "A".repeat(64)), valid.replace("a".repeat(64), "a".repeat(63)),
                valid.replace("a".repeat(64), "g".repeat(64)),
                valid.replace("1.4.0", "../apk"), valid.replace("\"versionName\":\"1.4.0\"", "\"versionName\":\"1.4.0-preview\""),
                valid.replace("\"versionName\":\"1.4.0\"", "\"versionName\":\"01.4.0\""),
                valid.replace("\"versionName\":\"1.4.0\"", "\"versionName\":\"1.4\""),
                valid.replace("\"versionCode\":10", "\"script\":\"code\",\"versionCode\":10"),
                valid.replace(",\"size\":1850000", ""), "// comment\n" + valid, "{'schemaVersion':1}",
                " ".repeat(AppUpdates.MAX_MANIFEST) + valid)) {
            assertThrows(json, IOException.class, () -> AppUpdates.parse(json.getBytes(StandardCharsets.UTF_8), 9, 36));
        }
    }

    @Test public void checksAndDismissalsHaveABoundedCooldown() {
        long now = 1_800_000_000_000L;
        assertTrue(AppUpdates.due(now, 0));
        assertFalse(AppUpdates.due(now, now - 1000));
        assertFalse(AppUpdates.due(now, now - AppUpdates.CHECK_INTERVAL + 1));
        assertTrue(AppUpdates.due(now, now - AppUpdates.CHECK_INTERVAL));
        assertTrue("a clock that went backwards must not stop checks for days", AppUpdates.due(now, now + 1000));
        AppUpdates.Release release = new AppUpdates.Release(10, "1.4.0", APK);
        assertFalse(AppUpdates.shouldPrompt(release, 10, now - 1000, now));
        assertTrue(AppUpdates.shouldPrompt(release, 9, now - 1000, now));
        assertTrue("a different release is offered at once", AppUpdates.shouldPrompt(release, 11, now - 1000, now));
        assertTrue(AppUpdates.shouldPrompt(release, 10, now - AppUpdates.CHECK_INTERVAL, now));
        assertTrue("nothing was ever put off", AppUpdates.shouldPrompt(release, 0, 0, now));
    }

    @Test public void theRequestCarriesNothingAboutTheReaderAndARedirectAnswerIsOnlyUnavailable() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        OkHttpClient transport = new OkHttpClient.Builder().addInterceptor(chain -> {
            requests.incrementAndGet();
            assertEquals("https://www.plaxlabs.com/news/updates.json", chain.request().url().toString());
            assertEquals("GET", chain.request().method());
            assertNull(chain.request().header("Authorization"));
            assertNull(chain.request().header("Cookie"));
            assertNull(chain.request().url().query());
            assertNull(chain.request().body());
            assertEquals("no-store", chain.request().header("Cache-Control"));
            assertEquals("application/json", chain.request().header("Accept"));
            return new Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(302).message("Found")
                    .header("Location", "https://example.org/updates.json").body(ResponseBody.create("", MediaType.get("application/json"))).build();
        }).build();
        try (AppUpdates updates = new AppUpdates(transport)) {
            assertThrows(IOException.class, () -> updates.check(9, 36));
            assertEquals(1, requests.get());
        }
    }

    @Test public void theClientIsHardenedWhateverItWasBuiltFrom() {
        // Built from a client that follows redirects, keeps cookies and caches, with long timeouts and retries.
        OkHttpClient loose = new OkHttpClient.Builder().followRedirects(true).followSslRedirects(true).retryOnConnectionFailure(true)
                .cookieJar(new CookieJar() {
                    @Override public void saveFromResponse(HttpUrl url, List<Cookie> cookies) { }
                    @Override public List<Cookie> loadForRequest(HttpUrl url) { return List.of(); }
                }).cache(new Cache(new java.io.File(System.getProperty("java.io.tmpdir"), "plax-updates-test-cache"), 1024))
                .connectTimeout(60, java.util.concurrent.TimeUnit.SECONDS).readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                .callTimeout(0, java.util.concurrent.TimeUnit.SECONDS).build();
        try (AppUpdates updates = new AppUpdates(loose)) {
            OkHttpClient client = updates.client();
            assertFalse("a redirect is never followed to another address", client.followRedirects());
            assertFalse(client.followSslRedirects());
            assertFalse(client.retryOnConnectionFailure());
            assertSame("no cookie is kept or sent", CookieJar.NO_COOKIES, client.cookieJar());
            assertNull("the answer is never cached", client.cache());
            assertEquals("modern TLS only, never cleartext", List.of(ConnectionSpec.MODERN_TLS), client.connectionSpecs());
            assertEquals(3_000, client.connectTimeoutMillis());
            assertEquals(3_000, client.readTimeoutMillis());
            assertEquals(6_000, client.callTimeoutMillis());
        }
    }

    @Test public void aGoodAnswerIsAnUpdateAndAnythingElseIsOnlyUnavailable() throws Exception {
        try (AppUpdates updates = new AppUpdates(answering(200, "application/json", manifest().toString()))) {
            assertEquals(new AppUpdates.Release(10, "1.4.0", APK), updates.check(9, 36));
        }
        try (AppUpdates updates = new AppUpdates(answering(200, "application/json; charset=utf-8", manifest().toString()))) {
            assertNotNull("the usual charset parameter is fine", updates.check(9, 36));
        }
        try (AppUpdates updates = new AppUpdates(answering(200, "application/json", manifest().toString()))) {
            assertNull("an up to date app is told nothing", updates.check(10, 36));
        }
        for (int code : List.of(204, 301, 304, 401, 404, 429, 500, 503)) {
            try (AppUpdates updates = new AppUpdates(answering(code, "application/json", manifest().toString()))) {
                assertThrows("HTTP " + code, IOException.class, () -> updates.check(9, 36));
            }
        }
        for (String type : new String[]{"text/html", "text/plain", "application/octet-stream", "application/xml", "image/png", null}) {
            try (AppUpdates updates = new AppUpdates(answering(200, type, manifest().toString()))) {
                assertThrows(String.valueOf(type), IOException.class, () -> updates.check(9, 36));
            }
        }
    }

    @Test public void answersAreBoundedAndBeingOfflineIsNotAnUpdate() throws Exception {
        try (AppUpdates updates = new AppUpdates(answering(200, "application/json", " ".repeat(AppUpdates.MAX_MANIFEST + 1)))) {
            assertThrows(IOException.class, () -> updates.check(9, 36));
        }
        // A body that does not say how long it is must still be cut off at the limit.
        OkHttpClient unknownLength = new OkHttpClient.Builder().addInterceptor(chain -> new Response.Builder()
                .request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(new ResponseBody() {
                    @Override public MediaType contentType() { return MediaType.get("application/json"); }
                    @Override public long contentLength() { return -1; }
                    @Override public okio.BufferedSource source() { return new Buffer().writeUtf8(" ".repeat(100_000)); }
                }).build()).build();
        try (AppUpdates updates = new AppUpdates(unknownLength)) {
            assertThrows(IOException.class, () -> updates.check(9, 36));
        }
        OkHttpClient offline = new OkHttpClient.Builder().addInterceptor(chain -> { throw new IOException("Offline"); }).build();
        try (AppUpdates updates = new AppUpdates(offline)) { assertThrows(IOException.class, () -> updates.check(9, 36)); }
    }

    @Test public void theFeedPublishedWithTheWebsiteIsOneThisAppAcceptsAndItsDownloadMatches() throws Exception {
        Path website = Path.of(System.getProperty("user.dir")).resolve("..").resolve("..").resolve("public").normalize();
        Path feed = website.resolve("updates.json");
        Assume.assumeTrue("the website files are not next to this project", Files.exists(feed));
        byte[] json = Files.readAllBytes(feed);
        assertFalse("the app tolerates a byte order mark, but other JSON readers do not: write the feed without one",
                json.length >= 3 && (json[0] & 0xff) == 0xEF && (json[1] & 0xff) == 0xBB && (json[2] & 0xff) == 0xBF);
        AppUpdates.Release release = AppUpdates.parse(json, 0, 36);
        assertNotNull("the published feed is not accepted by this parser", release);
        assertTrue("the website cannot advertise a build newer than this source", release.versionCode() <= BuildConfig.VERSION_CODE);
        JsonObject fields = JsonParser.parseString(new String(json, StandardCharsets.UTF_8)).getAsJsonObject();
        Path apk = website.resolve("plax-" + release.versionName() + ".apk");
        assertTrue("the feed names a file that is not published next to it: " + apk, Files.exists(apk));
        assertEquals(fields.get("size").getAsLong(), Files.size(apk));
        assertEquals(fields.get("sha256").getAsString(), HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(apk))));
        try (var listing = Files.list(website)) {
            assertEquals("only the advertised build is kept on the site", List.of(apk.getFileName().toString()),
                    listing.map(path -> path.getFileName().toString()).filter(name -> name.endsWith(".apk")).toList());
        }
    }
}
