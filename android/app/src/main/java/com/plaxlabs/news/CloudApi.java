package com.plaxlabs.news;

import java.io.IOException;
import java.util.List;
import java.util.Set;

/** What the signed-in reader keeps in their Plax account: their topics and their saved stories. */
interface CloudApi {
    Set<String> topics(AuthConfig config, AuthApi.Tokens tokens) throws IOException;

    void saveTopics(AuthConfig config, AuthApi.Tokens tokens, Set<String> topics) throws IOException;

    List<Story> bookmarks(AuthConfig config, AuthApi.Tokens tokens) throws IOException;

    /** Saves stories to the account in one request; stories it already holds are left as they are. */
    void addBookmarks(AuthConfig config, AuthApi.Tokens tokens, List<Story> stories) throws IOException;

    void removeBookmark(AuthConfig config, AuthApi.Tokens tokens, String id) throws IOException;
}
