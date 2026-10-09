package com.plaxlabs.news;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import org.junit.Test;
import java.io.IOException;
import static org.junit.Assert.*;

public class AiAndCacheTest {
    private static Response image(int code, String cacheControl) {
        Response.Builder builder = new Response.Builder().request(new Request.Builder().url("https://img.example.com/a.jpg").build())
                .protocol(Protocol.HTTP_2).code(code).message("x");
        if (cacheControl != null) builder.header("Cache-Control", cacheControl);
        return builder.build();
    }

    @Test public void imagesWithoutUsefulCacheHeadersAreCachedForAWeek() {
        assertTrue(Network.keepImages(image(200, null)).header("Cache-Control").contains("max-age=604800"));
        assertTrue(Network.keepImages(image(200, "max-age=0, must-revalidate")).header("Cache-Control").contains("max-age=604800"));
        assertTrue(Network.keepImages(image(200, "no-cache")).header("Cache-Control").contains("max-age=604800"));
    }

    @Test public void goodLifetimesNoStoreAndErrorsAreRespected() {
        assertEquals("private, max-age=2585266", Network.keepImages(image(200, "private, max-age=2585266")).header("Cache-Control"));
        assertEquals("no-store", Network.keepImages(image(200, "no-store")).header("Cache-Control"));
        assertNull(Network.keepImages(image(404, null)).header("Cache-Control"));
    }

    @Test public void briefRequestsSendOnlyTheStoryTextLanguageAndCategory() {
        Story story = new Story("secret-id", "A headline", "x".repeat(5000), "science", "", "BBC",
                "https://example.com/story", "https://example.com/i.jpg", "1 min", 1L);
        JsonObject body = JsonParser.parseString(BriefApi.requestBody(story, "hi")).getAsJsonObject();
        assertEquals(java.util.Set.of("content", "title", "type", "lang", "category"), body.keySet());
        assertEquals(2200, body.get("content").getAsString().length());
        assertEquals("hi", body.get("lang").getAsString()); assertEquals("science", body.get("category").getAsString());
        assertFalse(body.toString().contains("secret-id")); assertFalse(body.toString().contains("example.com"));
    }

    @Test public void briefResponsesAreValidatedStrictly() throws Exception {
        Brief brief = BriefApi.parse("{\"title\":\" T \",\"content\":\" Body **bold**. \",\"type\":\"microessay\",\"translated\":true}");
        assertEquals(new Brief("T", "Body **bold**."), brief);
        assertEquals("", BriefApi.parse("{\"content\":\"Only body\"}").title());
        for (String invalid : java.util.List.of("{\"content\":\"\"}", "{\"title\":\"x\"}", "{\"content\":5}", "[]", "not json",
                "{\"content\":\"" + "y".repeat(8001) + "\"}"))
            assertThrows(invalid, IOException.class, () -> BriefApi.parse(invalid));
    }

    @Test public void cacheKeysSeparateStoriesAndLanguages() {
        Story story = new Story("a", "t", "c", "news", "", "", "", "", "", 0);
        assertNotEquals(BriefApi.key(story, "en"), BriefApi.key(story, "hi"));
    }

    @Test public void languageFollowsTheChosenLocale() {
        assertEquals("hi", Language.of(new java.util.Locale("hi", "IN")));
        assertEquals("en", Language.of(java.util.Locale.FRANCE));
        assertEquals("en", Language.of(null));
    }
}
