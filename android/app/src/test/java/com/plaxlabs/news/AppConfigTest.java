package com.plaxlabs.news;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Assume;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * What the app takes from the website's configuration, and what it refuses. The cases are the website's own (src/lib/app-config-cases.json,
 * which the website's check runs through its own copy of the rules), so a file that passes the website's check is a file the app takes
 * whole, and the two cannot drift apart without one of the two test suites failing.
 */
public class AppConfigTest {
    private static Path project() { return Path.of(System.getProperty("user.dir")); }

    private static Path site(String path) { return project().resolve("..").resolve("..").resolve(path).normalize(); }

    private static String expand(String text) {
        Matcher match = Pattern.compile("@repeat:(.):(\\d+)").matcher(text);
        StringBuilder out = new StringBuilder();
        while (match.find()) match.appendReplacement(out, Matcher.quoteReplacement(match.group(1).repeat(Integer.parseInt(match.group(2)))));
        match.appendTail(out);
        return out.toString();
    }

    private static AppConfig.Parsed parse(String json) throws IOException { return AppConfig.parse(json.getBytes(StandardCharsets.UTF_8)); }

    private static final String NEWS = "{\"id\":\"news\",\"emoji\":\"\\ud83d\\udcf0\",\"en\":\"News\",\"hi\":\"N\"}";

    @Test public void everyCaseOfTheWebsiteIsJudgedTheSameWay() throws IOException {
        Path file = site("src/lib/app-config-cases.json");
        Assume.assumeTrue("the website files are not next to this project", Files.exists(file));
        JsonArray cases = JsonParser.parseString(new String(Files.readAllBytes(file), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("cases");
        assertTrue("the cases are the contract with the website", cases.size() >= 100);
        List<String> wrong = new ArrayList<>();
        for (JsonElement item : cases) {
            JsonObject entry = item.getAsJsonObject();
            String text = expand(entry.has("json") ? entry.get("json").getAsString() : entry.get("config").toString());
            List<String> expected = new ArrayList<>();
            entry.getAsJsonArray("rejected").forEach(name -> expected.add(name.getAsString()));
            List<String> actual;
            try { actual = new ArrayList<>(parse(text).rejected()); }
            // A file refused whole is what the website's check calls a schema it does not take.
            catch (IOException refusedWhole) { actual = new ArrayList<>(List.of("schemaVersion")); }
            Collections.sort(expected);
            Collections.sort(actual);
            if (!expected.equals(actual)) wrong.add(entry.get("name").getAsString() + ": the website says " + expected + ", the app refuses " + actual);
        }
        assertTrue("the app and the website judge these differently:\n" + String.join("\n", wrong), wrong.isEmpty());
    }

    @Test public void thePublishedFileIsTakenWholeAndSaysWhatTheAppNeeds() throws IOException {
        Path file = site("public/app-config.json");
        Assume.assumeTrue("the website files are not next to this project", Files.exists(file));
        byte[] bytes = Files.readAllBytes(file);
        assertTrue("under the size the app takes", bytes.length <= AppConfig.MAX_BYTES);
        AppConfig.Parsed parsed = AppConfig.parse(bytes);
        assertEquals("nothing in it is refused", List.of(), parsed.rejected());
        AppConfig config = parsed.config();
        assertTrue(config.topics().contains(Topic.NEWS));
        assertTrue("Stocks is listed", config.topics().contains(Topic.STOCKS));
        assertTrue(config.hasSection("us"));
        assertTrue(config.hasSection("") && !config.hasSection("nothing"));
        assertTrue(config.pageEvery() >= AppConfig.MIN_PAGE_EVERY && config.pageEvery() <= AppConfig.MAX_PAGE_EVERY);
    }

    @Test public void aBuildThatHasNotReadTheFileDoesWhatItDidBefore() {
        AppConfig defaults = AppConfig.defaults();
        assertEquals(18, defaults.topics().size());
        assertEquals(Topic.NEWS, defaults.topics().get(0));
        assertEquals(Topic.STOCKS, defaults.topics().get(1));
        List<String> sections = new ArrayList<>();
        defaults.sections().forEach(section -> sections.add(section.id()));
        assertEquals(List.of("us", "india", "world", "tech", "business", "science"), sections);
        assertEquals(AppConfig.Features.ALL, defaults.features());
        assertEquals(AdSlots.STORIES_PER_AD, defaults.pageEvery());
        assertEquals(AppConfig.Layout.DEFAULT, defaults.layout());
        assertEquals(1.25f, defaults.layout().heroMaxWidth(), 0f);
        assertEquals(.6f, defaults.layout().heroMaxHeight(), 0f);
        assertNull(defaults.notice());
        assertNull(defaults.update());
        assertTrue(defaults.links().isEmpty());
    }

    @Test public void aFileIsTakenPartByPartAndAGoodPartIsNeverLostToABadOne() throws IOException {
        AppConfig.Parsed parsed = parse("{\"schemaVersion\":1,\"features\":{\"ads\":false,\"deeper\":\"no\"},"
                + "\"notice\":{\"id\":\"x y\"},\"ads\":{\"pageEvery\":8},\"layout\":{\"heroMaxHeight\":0.65,\"photoMinWidth\":5}}");
        assertEquals(List.of("features.deeper", "layout.photoMinWidth", "notice"), parsed.rejected());
        AppConfig config = parsed.config();
        assertFalse("the switch that was right is taken", config.features().ads());
        assertTrue("the one that was wrong keeps its built-in value", config.features().deeper());
        assertEquals(8, config.pageEvery());
        assertEquals(.65f, config.layout().heroMaxHeight(), 1e-6f);
        assertEquals("a bad value keeps the built-in one", AppConfig.Layout.DEFAULT.photoMinWidth(), config.layout().photoMinWidth(), 0f);
        assertNull(config.notice());
    }

    @Test public void topicsAreTheWebsitesListInTheWebsitesOrderAndRenameWhatTheyListed() throws IOException {
        AppConfig config = parse("{\"schemaVersion\":1,\"topics\":[" + NEWS + ",{\"id\":\"stocks\",\"emoji\":\"\\ud83d\\udcca\",\"en\":\"Markets\",\"hi\":\"B\"},"
                + "{\"id\":\"crypto\",\"emoji\":\"\\ud83e\\ude99\",\"en\":\"Crypto\",\"hi\":\"C\"}]}").config();
        assertEquals(3, config.topics().size());
        assertEquals(Topic.NEWS, config.topics().get(0));
        assertEquals("Stocks is the same topic under another name", Topic.STOCKS, config.topics().get(1));
        assertEquals("crypto", config.topics().get(2).id);
        assertNotEquals(Topic.NEWS, config.topics().get(2));
    }

    @Test public void aFileThatIsNotUsableIsRefusedWhole() {
        String[] bad = {"", "   ", "[]", "{}", "{\"schemaVersion\":2}", "{\"schemaVersion\":1,}", "{\"schemaVersion\":1,\"schemaVersion\":1}",
                "{\"schemaVersion\":1} x", "// a\n{\"schemaVersion\":1}", "{\"schemaVersion\":1,\"a\":NaN}", "{'schemaVersion':1}", "{schemaVersion:1}",
                "\ufeff{\"schemaVersion\":1}", "{\"schemaVersion\":01}", "{\"schemaVersion\":1,\"a\":[[[[[[[1]]]]]]]}", "null", "\"text\"", "1"};
        for (String text : bad) {
            try { parse(text); fail("taken: " + text); } catch (IOException refused) { /* as it should be */ }
        }
        // Six levels are fine, seven are not.
        try { parse("{\"schemaVersion\":1,\"a\":[[[[[1]]]]]}"); } catch (IOException refused) { fail("six levels"); }
    }

    @Test public void aFileOfTheWrongSizeOrEncodingIsRefused() {
        for (byte[] bad : new byte[][]{null, new byte[0], new byte[AppConfig.MAX_BYTES + 1], {(byte) 0xc3, 0x28}, {(byte) 0xff, (byte) 0xfe}}) {
            try { AppConfig.parse(bad); fail("taken"); } catch (IOException refused) { /* as it should be */ }
        }
        // Exactly the limit is taken (padding is whitespace after the value).
        byte[] limit = new byte[AppConfig.MAX_BYTES];
        java.util.Arrays.fill(limit, (byte) ' ');
        byte[] json = "{\"schemaVersion\":1}".getBytes(StandardCharsets.UTF_8);
        System.arraycopy(json, 0, limit, 0, json.length);
        try { AppConfig.parse(limit); } catch (IOException refused) { fail("the limit itself"); }
    }

    @Test public void theGooglePlayBuildAlwaysNamesItsPublisherAndTheWebsitesBuildFollowsTheFile() throws IOException {
        // Google Play's News policy asks an aggregator for clear information about the publishing sources of third-party content, and Plax's
        // declaration says each card shows its source: the Google Play build does, whatever the file says.
        AppConfig.Features off = parse("{\"schemaVersion\":1,\"features\":{\"sourceName\":false}}").config().features();
        assertFalse(off.sourceName());
        assertTrue("Google Play: always", off.namesSource(true));
        assertFalse("the website's build: as the file says", off.namesSource(false));
        AppConfig.Features on = AppConfig.defaults().features();
        assertTrue(on.sourceName());
        assertTrue(on.namesSource(true));
        assertTrue(on.namesSource(false));
    }

    @Test public void aNameThatIsOnlyANameIsNotSpecial() throws IOException {
        assertEquals(List.of(), parse("{\"schemaVersion\":1,\"__proto__\":{\"features\":{\"ads\":false}},\"constructor\":1}").rejected());
        assertTrue(parse("{\"schemaVersion\":1,\"__proto__\":{\"features\":{\"ads\":false}}}").config().features().ads());
    }

    @Test public void aNoticeIsForTheBuildsAndVersionsAndTimesItNames() throws IOException {
        AppConfig.Notice notice = parse("{\"schemaVersion\":1,\"notice\":{\"id\":\"n\",\"level\":\"info\",\"title\":{\"en\":\"T\"},\"body\":{\"en\":\"B\"},"
                + "\"build\":\"play\",\"minVersionCode\":10,\"maxVersionCode\":20,\"until\":\"2026-12-01T00:00:00Z\"}}").config().notice();
        assertNotNull(notice);
        long before = java.time.Instant.parse("2026-11-30T23:59:59Z").toEpochMilli(), after = java.time.Instant.parse("2026-12-01T00:00:00Z").toEpochMilli();
        assertTrue(notice.appliesTo(true, 10, before));
        assertTrue(notice.appliesTo(true, 20, before));
        assertFalse("the website's build", notice.appliesTo(false, 15, before));
        assertFalse("too old", notice.appliesTo(true, 9, before));
        assertFalse("too new", notice.appliesTo(true, 21, before));
        assertFalse("past its end", notice.appliesTo(true, 15, after));
        assertEquals("T", notice.title(Language.HINDI));
        assertEquals("no Hindi text: the English is shown", "B", notice.body(Language.HINDI));
    }

    @Test public void aLinkIsForTheBuildItNames() throws IOException {
        AppConfig config = parse("{\"schemaVersion\":1,\"links\":[{\"id\":\"a\",\"en\":\"A\",\"hi\":\"H\",\"url\":\"https://github.com/x\"},"
                + "{\"id\":\"b\",\"en\":\"B\",\"hi\":\"H\",\"url\":\"https://github.com/x\",\"build\":\"play\"},"
                + "{\"id\":\"c\",\"en\":\"C\",\"hi\":\"H\",\"url\":\"https://github.com/x\",\"build\":\"direct\"}]}").config();
        assertEquals(3, config.links().size());
        List<String> play = new ArrayList<>(), direct = new ArrayList<>();
        for (AppConfig.Link link : config.links()) { if (link.appliesTo(true)) play.add(link.id()); if (link.appliesTo(false)) direct.add(link.id()); }
        assertEquals(List.of("a", "b"), play);
        assertEquals(List.of("a", "c"), direct);
        assertEquals("H", config.links().get(0).label(Language.HINDI));
        assertEquals("A", config.links().get(0).label(Language.ENGLISH));
    }

    @Test public void theSitesAndPagesALinkMayOpenAreFew() {
        String site = FeedApi.SITE;
        for (String good : new String[]{site, site + "/contact", site + "/privacy", "https://play.google.com/store/apps/details?id=com.plaxlabs.news",
                "https://github.com/RichardHenryJames/plax", "https://t.me/plax"})
            assertTrue(good, AppConfig.allowedLink(good));
        for (String bad : new String[]{null, "", "http://github.com/x", "https://example.com/", "https://github.com.evil.example/x",
                "https://github.com:444/x", "https://user@github.com/x", "https://github.com/x#y", "https://GITHUB.com/x", "https://github.com/a b",
                "https://github.com/../x", "https://github.com//x", "https://github.com/%2e%2e/x", site + "/../x", "https://plax-rouge.vercel.app/other",
                "https://play.google.com/store/apps/details?id=a", "https://play.google.com/store/apps/details?id=com.a&x=1", "javascript:alert(1)",
                "intent://x#Intent;end", "market://details?id=com.plaxlabs.news", "https://github.com/\n", "https://" + "a".repeat(200)})
            assertFalse(String.valueOf(bad), AppConfig.allowedLink(bad));
    }

    @Test public void textThatIsNotPlainIsNotTaken() {
        assertTrue(AppConfig.plain("Hello world", 20, false));
        assertTrue(AppConfig.plain("\u0928\u092e\u0938\u094d\u0924\u0947", 20, false));
        assertTrue(AppConfig.plain("a\nb", 20, true));
        for (String bad : new String[]{"", " a", "a ", "a\nb", "a\tb", "a\u200bb", "a\u00a0b", "a\u202eb", "a\u2028b", "a\u0000b", "\ue000", "\ud800",
                "\u00ad", "a\u2060b"})
            assertFalse(bad, AppConfig.plain(bad, 20, false));
        assertFalse("too long", AppConfig.plain("a".repeat(21), 20, false));
        assertFalse("seven line breaks", AppConfig.plain("l\nl\nl\nl\nl\nl\nl\nl", 40, true));
        assertTrue("six line breaks", AppConfig.plain("l\nl\nl\nl\nl\nl\nl", 40, true));
    }

    @Test public void anEmojiIsAnEmojiAndNothingElse() {
        assertTrue(AppConfig.emoji("\ud83d\udcf0"));
        assertTrue(AppConfig.emoji("\u2328\ufe0f"));
        assertTrue(AppConfig.emoji("\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67"));
        for (String bad : new String[]{null, "", "A", "1", "\u200d\ud83d\udcf0", "\ud83d\udcf0 ", "x\ud83d\udcf0", "\u0928"}) assertFalse(String.valueOf(bad), AppConfig.emoji(bad));
    }

    @Test public void theWebsitesLayoutNumbersAreTakenOnlyInBoundsAndEachOnItsOwn() throws IOException {
        assertEquals(1.4f, parse("{\"schemaVersion\":1,\"layout\":{\"heroMaxWidth\":1.4}}").config().layout().heroMaxWidth(), 1e-6f);
        // The least of a picture is kept small enough that a long story keeps its photograph on a small page (FitDeviceTest checks both ends
        // of every range on a device), so a bigger one is refused, and what is right beside it is taken.
        AppConfig.Parsed over = parse("{\"schemaVersion\":1,\"layout\":{\"photoMinHeight\":0.5,\"heroMaxWidth\":1.5,\"photoMinWidth\":0.7}}");
        assertEquals(List.of("layout.photoMinHeight"), over.rejected());
        assertEquals(AppConfig.Layout.DEFAULT.photoMinHeight(), over.config().layout().photoMinHeight(), 0f);
        assertEquals(1.5f, over.config().layout().heroMaxWidth(), 1e-6f);
        assertEquals(.7f, over.config().layout().photoMinWidth(), 1e-6f);
        // The least can never be above the most: the largest least is below the smallest most.
        AppConfig.Parsed extremes = parse("{\"schemaVersion\":1,\"layout\":{\"heroMaxWidth\":1,\"heroMaxHeight\":0.4,\"photoMinWidth\":0.7,\"photoMinHeight\":0.35}}");
        assertEquals(List.of(), extremes.rejected());
        assertTrue(extremes.config().layout().photoMinWidth() <= extremes.config().layout().heroMaxWidth());
        assertTrue(extremes.config().layout().photoMinHeight() <= extremes.config().layout().heroMaxHeight());
    }
}
