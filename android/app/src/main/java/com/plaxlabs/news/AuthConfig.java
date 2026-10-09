package com.plaxlabs.news;

import com.google.gson.*;
import java.io.IOException;
import java.util.regex.Pattern;
import okhttp3.HttpUrl;

/**
 * Which Supabase project holds the accounts. The app asks the Plax website instead of carrying the
 * address, so the project can move without an app update, and it accepts only a Supabase address over
 * HTTPS so a tampered answer cannot send sign-in anywhere else.
 */
record AuthConfig(String url, String anonKey) {
    private static final Pattern HOST = Pattern.compile("^[a-z0-9]{8,40}\\.supabase\\.co$");
    private static final Pattern KEY = Pattern.compile("^[A-Za-z0-9._-]{20,2000}$");

    static AuthConfig parse(String json) throws IOException {
        try {
            JsonObject root = JsonParser.parseString(json).getAsJsonObject();
            String address = root.get("url").getAsString(), key = root.get("anonKey").getAsString();
            HttpUrl url = HttpUrl.parse(address);
            if (url == null || !url.isHttps() || url.port() != 443 || !HOST.matcher(url.host()).matches()
                    || !url.username().isEmpty() || !url.password().isEmpty()
                    || url.querySize() != 0 || url.fragment() != null
                    || !(url.encodedPath().equals("/") || url.pathSize() == 1 && url.pathSegments().get(0).isEmpty())) {
                throw new IOException("Not a Supabase project address");
            }
            if (!KEY.matcher(key).matches()) throw new IOException("Unexpected client key");
            return new AuthConfig("https://" + url.host(), key);
        } catch (JsonParseException | IllegalStateException | NullPointerException | ClassCastException invalid) {
            throw new IOException("Unreadable sign-in configuration");
        }
    }
}
