package com.plaxlabs.news;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.junit.*;
import org.junit.runner.RunWith;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Opt-in checks against the deployed public API: pass -e liveFeed true. */
@RunWith(AndroidJUnit4.class)
public class LiveFeedTest {
    private static List<Story> load(String lang, int[] errorOut) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<List<Story>> stories = new AtomicReference<>();
        AtomicReference<Integer> error = new AtomicReference<>();
        long started = System.nanoTime();
        new FeedApi().load("news", lang, List.of(), false, new FeedSource.Result() {
            public void loaded(List<Story> result) { stories.set(result); done.countDown(); }
            public void failed(int message) { error.set(message); done.countDown(); }
        });
        assertTrue("The public API request must finish", done.await(35, TimeUnit.SECONDS));
        android.util.Log.i("PlaxLive", lang + " feed took " + (System.nanoTime() - started) / 1_000_000 + " ms");
        assertNull("The public API must respond without a transport/parser error", error.get());
        assertNotNull(stories.get());
        return stories.get();
    }

    private static void optIn() {
        Assume.assumeTrue("Opt in to the public HTTPS API check", "true".equals(
                InstrumentationRegistry.getArguments().getString("liveFeed")));
    }

    @Test public void publishedEnglishNewsApiReturnsNativeReadableAttributedStories() throws Exception {
        optIn();
        List<Story> stories = load("en", null);
        assertFalse(stories.isEmpty()); assertTrue(stories.size() <= 30);
        for (Story story : stories) {
            assertEquals("news", story.category()); assertFalse(story.content().isBlank());
            assertFalse(story.source().isBlank()); assertTrue(story.hasSource());
            assertFalse("Image URLs must not carry HTML entities: " + story.image(), story.image().contains("&#"));
        }
    }

    @Test public void publishedHindiNewsApiReturnsDevanagariStories() throws Exception {
        optIn();
        List<Story> stories = load("hi", null);
        assertFalse(stories.isEmpty());
        for (Story story : stories) {
            assertTrue("Hindi headline expected: " + story.title(), story.title().codePoints().anyMatch(c -> c >= 0x0900 && c <= 0x097F));
            assertTrue(story.hasSource());
        }
    }

    @Test public void theLiveSiteTurnsAStoryTheAppSharesIntoAPageThatServesIt() throws Exception {
        optIn();
        Story story = null;
        for (Story candidate : load("en", null)) if (ShareLinks.eligible(candidate)) { story = candidate; break; }
        assertNotNull("the live feed must serve signed stories with a publisher link", story);

        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> link = new AtomicReference<>();
        new ShareLinks().link(story, answer -> { link.set(answer); done.countDown(); });
        assertTrue("the site must answer", done.await(15, TimeUnit.SECONDS));
        assertFalse("the live site must accept the story exactly as the app sends it back", link.get().isEmpty());
        assertTrue(link.get(), link.get().startsWith(FeedApi.SITE + "/s/"));

        OkHttpClient client = new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build();
        try (Response page = client.newCall(new Request.Builder().url(link.get()).build()).execute()) {
            assertEquals("HTTP " + page.code(), 200, page.code());
            String html = page.body().string();
            assertTrue("the page names itself as the canonical address", html.contains("rel=\"canonical\" href=\"" + link.get() + "\""));
            assertTrue("and previews as an article", html.contains("property=\"og:type\" content=\"article\""));
            assertTrue("with a picture", html.contains("property=\"og:image\""));
        }
        android.util.Log.i("PlaxLive", "story page made for " + story.id() + ": " + link.get());
    }

    @Test public void thePublishedUpdateFeedIsAcceptedByTheAppAndItsDownloadIsAnApk() throws Exception {
        optIn();
        AppUpdates.Release release;
        // As the build before this one, so that whatever the website advertises as current counts as newer.
        try (AppUpdates updates = new AppUpdates()) { release = updates.check(BuildConfig.VERSION_CODE - 1, android.os.Build.VERSION.SDK_INT); }
        assertNotNull("the website must advertise a build at least as new as this one", release);
        assertTrue(release.versionCode() >= BuildConfig.VERSION_CODE);
        // A plain GET, never a Range request: the shared cache in front of the site once stored the answer to
        // "Range: bytes=0-1" as the whole file. Reading two bytes and closing the response stops the download.
        Request request = new Request.Builder().url(release.apkUrl()).build();
        OkHttpClient client = new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).build();
        try (Response response = client.newCall(request).execute()) {
            assertEquals("HTTP " + response.code(), 200, response.code());
            assertEquals("application/vnd.android.package-archive", response.header("Content-Type"));
            long length = Long.parseLong(String.valueOf(response.header("Content-Length")));
            assertTrue("the whole file is served, not a part (" + length + " bytes)", length > 100_000);
            assertEquals("an APK is a ZIP archive", "PK", response.body().source().readUtf8(2));
        }
    }
}
