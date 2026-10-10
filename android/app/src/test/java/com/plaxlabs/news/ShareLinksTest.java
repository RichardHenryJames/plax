package com.plaxlabs.news;

import com.google.gson.*;
import org.junit.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static org.junit.Assert.*;

public class ShareLinksTest {
    private static final String SIG = "45cf1f8654294cfdfa03b1376166de5b";
    private static final String ID = SIG.substring(0, 16);

    private static Story signed(String sig, String sourceUrl) {
        return new Story("the-hindu-1", "Regional parties join protests", "A march in Srinagar on Friday.", "news", "india",
                "The Hindu", sourceUrl, "https://th-i.thgim.com/a.jpg", "20s", 1_791_621_638_608L, sig);
    }

    private static JsonObject vector() throws IOException {
        try (InputStream input = ShareLinksTest.class.getResourceAsStream("/share-vector.json")) {
            assertNotNull("the vector shared with the website's tests", input);
            return JsonParser.parseString(new String(input.readAllBytes(), StandardCharsets.UTF_8)).getAsJsonObject();
        }
    }

    @Test public void aStoryTheServerSignedAndThatPointsToItsPublisherCanHaveAPage() {
        assertTrue(ShareLinks.eligible(signed(SIG, "https://www.thehindu.com/a")));
        assertTrue("a plain-http publisher link is still a link to point back to", ShareLinks.eligible(signed(SIG, "http://www.example.com/a")));
        assertFalse("an older cached story has no signature", ShareLinks.eligible(signed("", "https://www.thehindu.com/a")));
        assertFalse("a damaged signature is not one", ShareLinks.eligible(signed(SIG.substring(1), "https://www.thehindu.com/a")));
        assertFalse(ShareLinks.eligible(signed(SIG.toUpperCase(), "https://www.thehindu.com/a")));
        assertFalse("a quote has no publisher to point back to", ShareLinks.eligible(signed(SIG, "")));
    }

    @Test public void signaturesAreRecognisedByShape() {
        assertTrue(Story.isSignature(SIG));
        for (String invalid : new String[] {null, "", "abc", SIG + "0", SIG.replace('4', 'g'), SIG.toUpperCase(), " " + SIG.substring(1)})
            assertFalse(String.valueOf(invalid), Story.isSignature(invalid));
    }

    @Test public void theAppSendsBackExactlyWhatTheServerSigned() throws Exception {
        JsonObject vector = vector();
        JsonObject feed = new JsonObject();
        JsonArray cards = new JsonArray();
        cards.add(vector.getAsJsonObject("served"));
        feed.add("cards", cards);

        Story story = FeedParser.feed(feed.toString()).get(0);
        assertEquals(vector.get("sig").getAsString(), story.sig());
        assertTrue(ShareLinks.eligible(story));
        assertEquals("The words the app sends are the trimmed, decoded ones the website verifies",
                vector.getAsJsonObject("body"), JsonParser.parseString(ShareLinks.requestBody(story)).getAsJsonObject());
    }

    @Test public void theRequestCarriesOnlyTheStoryAndNothingAboutTheReader() {
        JsonObject body = JsonParser.parseString(ShareLinks.requestBody(signed(SIG, "https://www.thehindu.com/a"))).getAsJsonObject();
        assertEquals(java.util.Set.of("id", "title", "content", "source", "sourceUrl", "image", "publishedAt", "category", "section", "sig"),
                body.keySet());
        assertEquals(1_791_621_638_608L, body.get("publishedAt").getAsLong());
    }

    @Test public void onlyThisStorysOwnPageOnThePlaxSiteIsTrusted() {
        Story story = signed(SIG, "https://www.thehindu.com/a");
        String page = FeedApi.SITE + "/s/regional-parties-join-protests-" + ID;
        assertEquals(page, ShareLinks.address("{\"url\":\"" + page + "\",\"id\":\"" + ID + "\"}", story));

        for (String wrong : List.of(
                "{\"url\":\"" + page + "\",\"id\":\"ffffffffffffffff\"}",
                "{\"url\":\"" + FeedApi.SITE + "/s/x-ffffffffffffffff\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"https://evil.example.com/news/s/x-" + ID + "\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"https://www.plaxlabs.com.evil.example/news/s/x-" + ID + "\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"http://www.plaxlabs.com/news/s/x-" + ID + "\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"https://www.plaxlabs.com/other/s/x-" + ID + "\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"https://www.plaxlabs.com/news/headlines/x-" + ID + "\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"" + page + "?next=https://evil.example\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"" + page + "#fragment\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"https://www.plaxlabs.com:8443/news/s/x-" + ID + "\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"javascript:alert(1)\",\"id\":\"" + ID + "\"}",
                "{\"url\":\"" + page + "\"}", "{\"id\":\"" + ID + "\"}", "{\"url\":42,\"id\":\"" + ID + "\"}",
                "{\"url\":\"" + page + "\",\"id\":\"" + ID.substring(0, 8) + "\"}",
                "[]", "null", "not json", "")) {
            assertEquals(wrong, "", ShareLinks.address(wrong, story));
        }
    }

    @Test public void theChooserGetsTheHeadlineAndThenOneLinkOnItsOwnLine() {
        Story story = signed(SIG, "https://www.thehindu.com/a");
        String page = FeedApi.SITE + "/s/regional-parties-join-protests-" + ID;
        assertEquals("the page on Plax when there is one", "Regional parties join protests\n" + page, ShareLinks.message(story, page, "Plax"));
        assertEquals("otherwise the publisher's own link, as before", "Regional parties join protests\nhttps://www.thehindu.com/a",
                ShareLinks.message(story, "", "Plax"));
        Story untitled = new Story("q", "  ", "A quote with no headline.", "philosophy", "", "", "", "", "", 0);
        assertEquals("a story with no link points at the site, under the app's name", "Plax\n" + FeedApi.SITE, ShareLinks.message(untitled, "", "Plax"));
        Story plainHttp = signed("", "http://www.example.com/a");
        assertEquals("the app only opens https sources, so a plain-http one falls back to the site",
                "Regional parties join protests\n" + FeedApi.SITE, ShareLinks.message(plainHttp, "", "Plax"));
    }

    @Test public void theSignatureSurvivesTheDeviceCacheAndOlderFilesStillLoad() throws Exception {
        Story with = signed(SIG, "https://www.thehindu.com/a");
        Story without = signed("", "https://www.thehindu.com/b");
        List<Story> round = FeedParser.cached(FeedParser.encodeCache(List.of(with, new Story("b", "B", "Text", "news", "", "", "", "", "", 0))));
        assertEquals(SIG, round.get(0).sig());
        assertEquals("", round.get(1).sig());
        assertEquals(List.of(with), FeedParser.saved(FeedParser.encodeSaved(List.of(with))));

        // What an older version wrote has no signature field at all, and an unsigned story writes none.
        assertFalse(FeedParser.encodeSaved(List.of(without)).contains("sig"));
        assertEquals("", FeedParser.saved(FeedParser.encodeSaved(List.of(without))).get(0).sig());
        assertEquals("", FeedParser.saved("{\"schema\":1,\"stories\":[{\"id\":\"a\",\"content\":\"Text\",\"category\":\"news\"}]}").get(0).sig());
    }

    @Test public void aDamagedSignatureNeverBreaksTheFeed() throws Exception {
        for (String sig : List.of("\"sig\":\"abc\"", "\"sig\":42", "\"sig\":null", "\"sig\":{}", "\"sig\":[]", "\"sig\":\"" + SIG.toUpperCase() + "\"")) {
            List<Story> stories = FeedParser.feed("{\"cards\":[{\"id\":\"a\",\"content\":\"Text\",\"category\":\"news\"," + sig + "}]}");
            assertEquals(sig, 1, stories.size());
            assertEquals(sig, "", stories.get(0).sig());
        }
        assertEquals(SIG, FeedParser.feed("{\"cards\":[{\"id\":\"a\",\"content\":\"Text\",\"category\":\"news\",\"sig\":\" " + SIG + " \"}]}").get(0).sig());
    }

    @Test public void storiesBuiltWithoutASignatureHaveNone() {
        Story story = new Story("a", "T", "C", "news", "", "", "", "", "", 0);
        assertEquals("", story.sig());
        assertEquals("", new Story("a", "T", "C", "news", "", "", "", "", "", 0, null).sig());
        assertEquals("the end-of-list marker is never shareable", "", Story.caughtUp().sig());
    }
}
