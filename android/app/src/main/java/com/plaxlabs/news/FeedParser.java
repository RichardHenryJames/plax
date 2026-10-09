package com.plaxlabs.news;

import com.google.gson.*;
import java.io.IOException;
import java.util.*;

final class FeedParser {
    /** The server answered, but reported that it could not build the feed. */
    static final class ServiceException extends IOException {
        ServiceException(String message) { super(message); }
    }

    private static final Gson JSON = new GsonBuilder().setStrictness(Strictness.STRICT).create();
    static final int MAX_BYTES = 1024 * 1024;
    static final int CACHE_LIMIT = 100;

    static List<Story> feed(String text) throws IOException {
        JsonObject root = object(text);
        if (root.has("error") && !root.get("error").isJsonNull())
            throw new ServiceException("Feed reported an error");
        return stories(root.get("cards"), 60);
    }

    static List<Story> saved(String text) throws IOException {
        JsonObject root = object(text);
        if (number(root, "schema") != 1) throw new IOException("Unsupported saved-story format");
        return stories(root.get("stories"), SavedStories.LIMIT);
    }

    /** The on-device feed cache shares the saved-story format; only the size bound differs. */
    static List<Story> cached(String text) throws IOException {
        JsonObject root = object(text);
        if (number(root, "schema") != 1) throw new IOException("Unsupported cache format");
        return stories(root.get("stories"), CACHE_LIMIT);
    }

    static String encodeCache(List<Story> stories) { return encodeSaved(stories); }

    /** Feeds sometimes carry HTML-escaped ampersands inside URLs. */
    static String url(String value) {
        return value.replace("&#038;", "&").replace("&#38;", "&").replace("&amp;", "&");
    }

    static String encodeSaved(List<Story> stories) {
        JsonObject root = new JsonObject();
        root.addProperty("schema", 1);
        JsonArray values = new JsonArray();
        for (Story story : stories) {
            JsonObject value = new JsonObject();
            value.addProperty("id", story.id()); value.addProperty("title", story.title());
            value.addProperty("content", story.content()); value.addProperty("category", story.category());
            value.addProperty("section", story.section()); value.addProperty("source", story.source());
            value.addProperty("sourceUrl", story.sourceUrl()); value.addProperty("image", story.image());
            value.addProperty("readTime", story.readTime()); value.addProperty("publishedAt", story.publishedAt());
            values.add(value);
        }
        root.add("stories", values);
        return JSON.toJson(root);
    }

    private static JsonObject object(String text) throws IOException {
        if (text.length() > MAX_BYTES) throw new IOException("Response is too large");
        try {
            JsonObject root = JSON.fromJson(text, JsonObject.class);
            if (root == null) throw new IOException("Missing response");
            return root;
        } catch (JsonParseException | IllegalStateException invalid) {
            throw new IOException("Invalid JSON response");
        }
    }

    private static List<Story> stories(JsonElement input, int limit) throws IOException {
        if (input == null || !input.isJsonArray() || input.getAsJsonArray().size() > limit)
            throw new IOException("Invalid story list");
        List<Story> result = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (JsonElement element : input.getAsJsonArray()) {
            if (!element.isJsonObject()) throw new IOException("Invalid story");
            JsonObject value = element.getAsJsonObject();
            Story story = new Story(
                    text(value, "id", 180, true), text(value, "title", 2000, false),
                    text(value, "content", 8000, true), text(value, "category", 80, true),
                    text(value, "section", 40, false), text(value, "source", 200, false),
                    url(text(value, "sourceUrl", 4096, false)), url(text(value, "image", 4096, false)),
                    text(value, "readTime", 60, false), number(value, "publishedAt"));
            if (!ids.add(story.id())) throw new IOException("Duplicate story identifier");
            result.add(story);
        }
        return List.copyOf(result);
    }

    private static String text(JsonObject value, String key, int maximum, boolean required) throws IOException {
        JsonElement item = value.get(key);
        if (item == null || item.isJsonNull()) {
            if (required) throw new IOException("Missing story field");
            return "";
        }
        if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString())
            throw new IOException("Invalid story field");
        String result = item.getAsString().strip();
        if (result.length() > maximum || required && result.isEmpty())
            throw new IOException("Invalid story field length");
        return result;
    }

    private static long number(JsonObject value, String key) throws IOException {
        JsonElement item = value.get(key);
        if (item == null || item.isJsonNull()) return 0;
        if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isNumber())
            throw new IOException("Invalid timestamp");
        try {
            long number = item.getAsBigDecimal().longValueExact();
            if (number < 0) throw new IOException("Invalid timestamp");
            return number;
        } catch (ArithmeticException | NumberFormatException invalid) {
            throw new IOException("Invalid timestamp");
        }
    }
}
