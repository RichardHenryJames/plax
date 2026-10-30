package com.plaxlabs.news;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import okhttp3.HttpUrl;
import org.junit.Assume;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * The app's address is built into every copy that is installed, so it cannot be repaired from the server: when the domain
 * the first versions used expired, every installed app lost its stories and its sign-in at once. These tests keep the
 * address in one place, equal to the one the website publishes, and free of the expired domain.
 */
public class SiteAddressTest {
    private static Path project() { return Path.of(System.getProperty("user.dir")); }

    private static String read(Path file) throws IOException { return new String(Files.readAllBytes(file), StandardCharsets.UTF_8); }

    @Test public void theAppTalksToTheAddressTheWebsitePublishes() throws IOException {
        Path lib = project().resolve("..").resolve("..").resolve("src").resolve("lib").normalize();
        Path site = lib.resolve("site.ts"), base = lib.resolve("base-path.ts");
        Assume.assumeTrue("the website files are not next to this project", Files.exists(site) && Files.exists(base));
        Matcher host = Pattern.compile("SITE_HOST\\s*=\\s*'([^']+)'").matcher(read(site));
        assertTrue("site.ts has no SITE_HOST", host.find());
        Matcher path = Pattern.compile("BASE_PATH\\s*=\\s*'([^']+)'").matcher(read(base));
        assertTrue("base-path.ts has no BASE_PATH", path.find());
        assertEquals("the app would talk to a different address from the one the website publishes",
                host.group(1) + path.group(1), FeedApi.SITE);
    }

    @Test public void theAddressIsOneHttpsOriginUnderTheNewsPath() {
        HttpUrl url = HttpUrl.get(FeedApi.SITE);
        assertTrue(url.isHttps());
        assertEquals(443, url.port());
        assertEquals("/news", url.encodedPath());
        assertEquals("", url.username());
        assertNull(url.query());
        assertNull(url.fragment());
        assertFalse("no trailing slash: every address is built as SITE + a path", FeedApi.SITE.endsWith("/"));
    }

    @Test public void everyAddressTheAppBuildsComesFromIt() {
        assertEquals(FeedApi.SITE + "/privacy", FeedApi.PRIVACY_URL);
        assertEquals(FeedApi.SITE, AppUpdates.ORIGIN);
        assertEquals(FeedApi.SITE + "/updates.json", AppUpdates.FEED);
        assertEquals(FeedApi.SITE + "/auth/app", AccountManager.REDIRECT);
        assertEquals(FeedApi.SITE + "/contact", Contact.PAGE_URL);
        assertEquals(FeedApi.SITE + "/api/feed", FeedApi.url("news", "en", List.of(), false).newBuilder().query(null).build().toString());
    }

    @Test public void noFileOfTheAppNamesTheExpiredDomain() throws IOException {
        Path main = project().resolve("src").resolve("main");
        Assume.assumeTrue("the sources are not where the project expects them", Files.isDirectory(main));
        // Built from two parts so that this test does not contain the expired domain itself.
        Pattern expired = Pattern.compile("plaxlabs" + "\\.com", Pattern.CASE_INSENSITIVE);
        List<String> found = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(main)) {
            for (Path file : walk.filter(Files::isRegularFile).filter(p -> p.toString().matches(".*\\.(java|xml|json|txt|properties)"))
                    .collect(Collectors.toList())) {
                String[] lines = read(file).split("\\R");
                for (int i = 0; i < lines.length; i++) {
                    if (expired.matcher(lines[i]).find()) found.add(main.relativize(file) + ":" + (i + 1));
                }
            }
        }
        assertEquals("the expired domain is still named in " + found, List.of(), found);
    }
}
