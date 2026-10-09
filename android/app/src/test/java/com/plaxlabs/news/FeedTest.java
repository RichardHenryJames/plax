package com.plaxlabs.news;

import org.junit.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;

public class FeedTest {
    static Story story(String id, String title, String section) {
        return new Story(id, title, "A concise story for testing.", "news", section, "Publisher",
                "https://example.com/story", "", "1 min", 1_780_000_000_000L);
    }

    @Test public void parsesRealFeedShapeAndRetainsPublisherAttribution() throws Exception {
        List<Story> stories = FeedParser.feed("""
                {"cards":[{"id":"bbc-abc","title":"A discovery","content":"A short summary.",
                  "category":"news","section":"science","source":"BBC",
                  "sourceUrl":"https://www.bbc.com/news/test","publishedAt":1780000000000,
                  "image":"https://images.example.com/story.jpg","readTime":"30 sec"}],"cached":true,"count":80}
                """);
        assertEquals(1, stories.size()); assertEquals("BBC", stories.get(0).source());
        assertTrue(stories.get(0).hasSource()); assertTrue(stories.get(0).hasImage());
        assertEquals("science", stories.get(0).section());
    }

    @Test public void optionalQuoteFieldsDoNotInventPublishTimeOrPublisher() throws Exception {
        Story story = FeedParser.feed("""
                {"cards":[{"id":"quote","content":"A brief thought","category":"philosophy"}]}
                """).get(0);
        assertEquals("", story.title()); assertEquals("", story.source());
        assertEquals(0, story.publishedAt()); assertFalse(story.hasImage()); assertFalse(story.hasSource());
    }

    @Test public void emptyAndFailedFeedAreDifferent() throws Exception {
        assertTrue(FeedParser.feed("{\"cards\":[]}").isEmpty());
        assertThrows(FeedParser.ServiceException.class,
                () -> FeedParser.feed("{\"cards\":[],\"error\":\"upstream failed\"}"));
    }

    @Test public void htmlEscapedAmpersandsInFeedUrlsAreDecoded() throws Exception {
        Story story = FeedParser.feed("""
                {"cards":[{"id":"a","content":"Summary","category":"news",
                  "image":"https://cdn.example.com/p.jpg?quality=90&#038;strip=all&amp;w=800",
                  "sourceUrl":"https://example.com/a?x=1&#038;y=2"}]}
                """).get(0);
        assertEquals("https://cdn.example.com/p.jpg?quality=90&strip=all&w=800", story.image());
        assertEquals("https://example.com/a?x=1&y=2", story.sourceUrl());
    }

    @Test public void cacheRoundTripsAndRejectsOtherSchemas() throws Exception {
        List<Story> originals = List.of(story("a", "First", "world"), story("b", "Second", ""));
        assertEquals(originals, FeedParser.cached(FeedParser.encodeCache(originals)));
        assertThrows(IOException.class, () -> FeedParser.cached("{\"schema\":2,\"stories\":[]}"));
        assertThrows(IOException.class, () -> FeedParser.cached("{\"cards\":[]}"));
    }

    @Test public void malformedUnexpectedOrOversizedResponsesFailExplicitly() {
        for (String invalid : List.of("null", "[]", "{\"cards\":null}", "{\"cards\":[{}]}", "{\"cards\":[null]}",
                "{\"cards\":[]} trailing", "{\"cards\":[{\"id\":1,\"content\":\"hi\",\"category\":\"news\"}]}",
                "{\"cards\":[{\"id\":\"a\",\"content\":\"hi\",\"category\":\"news\",\"publishedAt\":-1}]}",
                "{\"cards\":[{\"id\":\"a\",\"content\":\"hi\",\"category\":\"news\",\"publishedAt\":1.5}]}")) {
            assertThrows(invalid, IOException.class, () -> FeedParser.feed(invalid));
        }
        assertThrows(IOException.class, () -> FeedParser.feed(" ".repeat(FeedParser.MAX_BYTES + 1)));
    }

    @Test public void duplicateIdentifiersAreRejected() {
        String item = "{\"id\":\"a\",\"content\":\"Summary\",\"category\":\"news\"}";
        assertThrows(IOException.class, () -> FeedParser.feed("{\"cards\":[" + item + "," + item + "]}"));
    }

    @Test public void savedStoriesRoundTripWithoutReflection() throws Exception {
        List<Story> originals = List.of(story("a", "A \"quoted\" headline", "india"), story("b", "", "world"));
        assertEquals(originals, FeedParser.saved(FeedParser.encodeSaved(originals)));
        assertThrows(IOException.class, () -> FeedParser.saved("{\"schema\":2,\"stories\":[]}"));
    }

    @Test public void savedStoryCapacityIsBounded() {
        List<Story> stories = new ArrayList<>();
        for (int index = 0; index <= SavedStories.LIMIT; index++) stories.add(story("s" + index, "Story " + index, "world"));
        assertThrows(IOException.class, () -> FeedParser.saved(FeedParser.encodeSaved(stories)));
    }

    @Test public void sourceLinksRejectExecutableCleartextAndCredentialBearingUris() {
        for (String invalid : List.of("javascript:alert(1)", "file:///test", "intent://test", "http://example.com",
                "https://name:secret@example.com", "https://example.com:8443/path", "//example.com", "not a link"))
            assertFalse(invalid, Story.isWebLink(invalid));
        assertTrue(Story.isWebLink("https://example.com/article?a=b#section"));
    }

    @Test public void nativeFeedRequestsUseTheNewsBasePathLanguageAndEncodedExclusions() {
        var url = FeedApi.url("news", "en", List.of("id with space", "b&c"), false);
        assertEquals("www.plaxlabs.com", url.host());
        assertEquals("/news/api/feed", url.encodedPath()); assertTrue(url.isHttps());
        assertEquals("news", url.queryParameter("categories")); assertEquals("30", url.queryParameter("limit"));
        assertEquals("en", url.queryParameter("lang")); assertNull(url.queryParameter("refresh"));
        assertEquals("id with space,b&c", url.queryParameter("exclude"));
        assertEquals("true", FeedApi.url("science", "en", List.of(), true).queryParameter("refresh"));
        assertEquals("hi", FeedApi.url("news", "hi", List.of(), false).queryParameter("lang"));
        assertEquals("A personalised feed asks for all chosen topics at once",
                "science,space", FeedApi.url("science,space", "en", List.of(), false).queryParameter("categories"));
        assertNull("Plain requests must stay identical so the CDN can serve them",
                FeedApi.url("news", "en", List.of(), false).queryParameter("exclude"));
    }

    @Test public void interestsAreKnownTopicsInAFixedOrder() {
        assertEquals(List.of("history", "science", "space"),
                List.copyOf(Interests.sanitize(Arrays.asList("space", " science ", "history", "nonsense", "", null, "space"))));
        assertEquals("history,science,space", Interests.categories(Interests.sanitize(List.of("space", "history", "science"))));
        assertTrue(Interests.sanitize(List.of("<script>", "news,science")).isEmpty());
        assertThrows(UnsupportedOperationException.class, () -> Interests.sanitize(List.of("space")).add("science"));
    }

    @Test public void cacheKeysAreFileSafeAndStablePerChoiceOfInterests() {
        assertEquals("news-en", FeedCache.key(Topic.NEWS, "en"));
        assertEquals(FeedCache.key("history,science", "hi"), FeedCache.key("history,science", "hi"));
        assertNotEquals(FeedCache.key("history,science", "hi"), FeedCache.key("history,space", "hi"));
        assertNotEquals(FeedCache.key("history,science", "hi"), FeedCache.key("history,science", "en"));
        assertTrue(FeedCache.key("history,science", "hi").matches("[a-z0-9-]{1,60}"));
    }

    @Test public void streamedResponsesAreBoundedBeforeParsingOrImageDecoding() throws Exception {
        byte[] content = "bounded".getBytes(StandardCharsets.UTF_8);
        assertArrayEquals(content, FeedApi.boundedRead(new ByteArrayInputStream(content), content.length));
        assertThrows(IOException.class, () -> FeedApi.boundedRead(new ByteArrayInputStream(content), content.length - 1));
    }
}
