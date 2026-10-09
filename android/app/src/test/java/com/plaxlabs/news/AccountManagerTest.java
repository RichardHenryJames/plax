package com.plaxlabs.news;

import org.junit.Test;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;

/** The account's sign-in, session and sync rules, run without a phone, a browser or a network. */
public class AccountManagerTest {
    private static final String USER_A = "11111111-1111-4111-8111-111111111111", USER_B = "22222222-2222-4222-8222-222222222222";
    private static final String SCHEME = "com.plaxlabs.news.preview";

    private static final class FakeAuth implements AuthApi {
        AuthConfig config = new AuthConfig("https://abcdefghij.supabase.co", "k".repeat(30));
        IOException configFailure, checkFailure, exchangeFailure, refreshFailure;
        final List<String> calls = new ArrayList<>();
        Tokens next, refreshed;
        String lastCode, lastVerifier;

        @Override public AuthConfig config() throws IOException { calls.add("config"); if (configFailure != null) throw configFailure; return config; }
        @Override public void check(AuthConfig value) throws IOException { calls.add("check"); if (checkFailure != null) throw checkFailure; }
        @Override public Tokens exchange(AuthConfig value, String code, String verifier) throws IOException {
            calls.add("exchange"); lastCode = code; lastVerifier = verifier;
            if (exchangeFailure != null) throw exchangeFailure;
            return next;
        }
        @Override public Tokens refresh(AuthConfig value, String refresh) throws IOException {
            calls.add("refresh:" + refresh);
            if (refreshFailure != null) throw refreshFailure;
            return refreshed;
        }
        @Override public void logout(AuthConfig value, String access) { calls.add("logout:" + access); }
    }

    private static final class FakeCloud implements CloudApi {
        Set<String> topics = Set.of();
        List<Story> bookmarks = List.of();
        IOException failure, addFailure;
        final List<String> calls = new ArrayList<>();
        final List<String> tokensSeen = new ArrayList<>();

        private void begin(String call, AuthApi.Tokens tokens) throws IOException {
            calls.add(call); tokensSeen.add(tokens.access());
            if (failure != null) { IOException thrown = failure; if (thrown instanceof AuthApi.Unauthorized) failure = null; throw thrown; }
        }
        @Override public Set<String> topics(AuthConfig c, AuthApi.Tokens t) throws IOException { begin("topics", t); return topics; }
        @Override public void saveTopics(AuthConfig c, AuthApi.Tokens t, Set<String> chosen) throws IOException {
            begin("save:" + new TreeSet<>(chosen), t);
        }
        @Override public List<Story> bookmarks(AuthConfig c, AuthApi.Tokens t) throws IOException { begin("bookmarks", t); return bookmarks; }
        @Override public void addBookmarks(AuthConfig c, AuthApi.Tokens t, List<Story> stories) throws IOException {
            begin("add:" + ids(stories), t);
            if (addFailure != null) throw addFailure;
        }
        @Override public void removeBookmark(AuthConfig c, AuthApi.Tokens t, String id) throws IOException { begin("remove:" + id, t); }
    }

    private static final class MemoryStore implements TokenStore {
        String text;
        IOException readFailure, writeFailure;
        boolean cleared;
        @Override public String read() throws IOException { if (readFailure != null) throw readFailure; return text; }
        @Override public void write(String value) throws IOException { if (writeFailure != null) throw writeFailure; text = value; }
        @Override public void clear() { text = null; cleared = true; }
    }

    private static final class Landing implements FeedViewModel.Sink {
        final List<Set<String>> topics = new ArrayList<>();
        final List<List<String>> saved = new ArrayList<>();
        @Override public void cloudInterests(Set<String> value) { topics.add(value); }
        @Override public void cloudSaved(List<Story> stories) { saved.add(ids(stories)); }
    }

    private final FakeAuth auth = new FakeAuth();
    private final FakeCloud cloud = new FakeCloud();
    private final MemoryStore store = new MemoryStore();
    private final Landing landing = new Landing();
    private final AtomicLong clock = new AtomicLong(1_800_000_000_000L);
    private Set<String> local = new TreeSet<>();
    private List<Story> localSaved = new ArrayList<>();
    private final List<String> opened = new ArrayList<>();
    private final List<AccountManager.Status> statuses = new ArrayList<>();
    private AccountManager account;

    private static Story story(String id) {
        return new Story(id, "Headline " + id, "Body of " + id + " with enough words.", "news", "", "Publisher", "https://example.com/" + id, "", "", 0);
    }

    private static List<String> ids(List<Story> stories) {
        List<String> ids = new ArrayList<>();
        for (Story story : stories) ids.add(story.id());
        return ids;
    }

    private AuthApi.Tokens tokens(String access, String refresh, String user, long lifetime) {
        return new AuthApi.Tokens(access, refresh, clock.get() + lifetime, user, "reader@example.com", "Asha Rao");
    }

    private AccountManager create() {
        auth.next = tokens("access-1", "refresh-1", USER_A, 3_600_000);
        auth.refreshed = tokens("access-2", "refresh-2", USER_A, 3_600_000);
        AccountManager created = new AccountManager(auth, cloud, store, Runnable::run, clock::get, SCHEME,
                () -> local, () -> localSaved);
        created.addListener(statuses::add);
        created.listen(landing);
        account = created;
        return created;
    }

    /** Signs in through the whole flow: begin, the browser's callback, the exchange and the first sync. */
    private void signIn() {
        create();
        account.begin(opened::add);
        account.complete(SCHEME + "://auth-callback?code=" + "c".repeat(36));
        assertEquals(AccountManager.Phase.SIGNED_IN, account.status().phase());
    }

    private AccountManager.Status last() { return statuses.get(statuses.size() - 1); }

    @Test public void startsSignedOutAndNeedsNothing() {
        create();
        assertEquals(AccountManager.Phase.SIGNED_OUT, account.status().phase());
        assertFalse(account.signedIn());
        assertTrue("Nothing is contacted until the reader chooses to sign in", auth.calls.isEmpty() && cloud.calls.isEmpty());
        account.saved(story("a"), true); account.interests(Set.of("space"));
        assertTrue("Changes made while signed out go nowhere", cloud.calls.isEmpty());
    }

    @Test public void signInChecksTheServiceThenOpensTheBrowserWithAProofKey() throws Exception {
        create();
        account.begin(opened::add);
        assertEquals(List.of("config", "check"), auth.calls);
        assertEquals(1, opened.size());
        okhttp3.HttpUrl url = okhttp3.HttpUrl.get(opened.get(0));
        assertEquals("abcdefghij.supabase.co", url.host()); assertEquals("/auth/v1/authorize", url.encodedPath());
        assertEquals("google", url.queryParameter("provider"));
        assertEquals("https://www.plaxlabs.com/news/auth/app?app=" + SCHEME, url.queryParameter("redirect_to"));
        assertEquals("s256", url.queryParameter("code_challenge_method"));
        String verifier = com.google.gson.JsonParser.parseString(store.text).getAsJsonObject().get("v").getAsString();
        assertEquals("The browser is given only the challenge; the verifier stays sealed in the store",
                Pkce.challenge(verifier), url.queryParameter("code_challenge"));
        assertFalse(opened.get(0).contains(verifier));
        assertEquals(AccountManager.Phase.WAITING, account.status().phase());
    }

    @Test public void anUnreachableServiceMeansNoBrowserAndAClearMessage() {
        create();
        auth.checkFailure = new IOException("down");
        account.begin(opened::add);
        assertTrue(opened.isEmpty());
        assertEquals(AccountManager.Phase.SIGNED_OUT, account.status().phase());
        assertEquals(R.string.account_unavailable, account.status().message());
        auth.checkFailure = null; auth.configFailure = new IOException("no address");
        clock.addAndGet(11 * 60_000);
        account.begin(opened::add);
        assertTrue(opened.isEmpty());
        assertEquals(R.string.account_unavailable, account.status().message());
    }

    @Test public void theBrowsersCodeIsExchangedOnceWithTheSealedVerifier() {
        create();
        account.begin(opened::add);
        String verifier = com.google.gson.JsonParser.parseString(store.text).getAsJsonObject().get("v").getAsString();
        String code = "d".repeat(36);
        account.complete(SCHEME + "://auth-callback?code=" + code + "&extra=ignored");
        assertEquals(code, auth.lastCode); assertEquals(verifier, auth.lastVerifier);
        assertEquals(AccountManager.Phase.SIGNED_IN, account.status().phase());
        assertEquals("Asha Rao", account.status().label());
        assertFalse("The verifier is single use", store.text.contains("\"v\""));
        auth.calls.clear();
        account.complete(SCHEME + "://auth-callback?code=" + code);
        assertTrue("Replaying the callback does nothing", auth.calls.isEmpty());
    }

    @Test public void callbacksNobodyAskedForOrThatAreStaleOrForeignAreIgnored() {
        create();
        account.complete(SCHEME + "://auth-callback?code=" + "e".repeat(36));
        assertTrue("No sign-in was started", auth.calls.isEmpty());
        account.begin(opened::add);
        clock.addAndGet(AccountManager.PENDING_MS + 1);
        account.complete(SCHEME + "://auth-callback?code=" + "e".repeat(36));
        assertFalse("An old sign-in attempt expired", auth.calls.contains("exchange"));
        assertFalse(account.ours("com.plaxlabs.news://auth-callback?code=abc"));
        assertFalse(account.ours(SCHEME + "://elsewhere?code=abc"));
        assertFalse(account.ours("https://example.com/auth-callback?code=abc"));
        assertTrue(account.ours(SCHEME + "://auth-callback?code=abc"));
    }

    @Test public void aDeniedOrFailedSignInLeavesTheReaderSignedOutWithAReason() {
        create();
        account.begin(opened::add);
        account.complete(SCHEME + "://auth-callback?error=access_denied&error_description=nope");
        assertEquals(R.string.account_denied, account.status().message());
        account.begin(opened::add);
        auth.exchangeFailure = new AuthApi.Rejected(400);
        account.complete(SCHEME + "://auth-callback?code=" + "f".repeat(36));
        assertEquals(AccountManager.Phase.SIGNED_OUT, account.status().phase());
        assertEquals(R.string.account_failed, account.status().message());
        assertTrue("Nothing is kept from a failed sign-in", store.text == null || !store.text.contains("access"));
    }

    @Test public void ifTheSessionCannotBeKeptSafelyTheReaderIsNotSignedIn() {
        create();
        account.begin(opened::add);
        store.writeFailure = new IOException("keystore");
        account.complete(SCHEME + "://auth-callback?code=" + "a".repeat(36));
        assertEquals(AccountManager.Phase.SIGNED_OUT, account.status().phase());
        assertEquals(R.string.account_storage, account.status().message());
        assertTrue("The session that was just created is revoked", auth.calls.contains("logout:access-1"));
        MemoryStore failing = new MemoryStore();
        failing.writeFailure = new IOException("keystore");
        AccountManager other = new AccountManager(auth, cloud, failing, Runnable::run, clock::get, SCHEME, () -> local, () -> localSaved);
        other.begin(opened::add);
        assertEquals("Sign-in is refused up front when nothing can be stored", R.string.account_storage, other.status().message());
    }

    @Test public void theFirstSignInTakesTheAccountsTopicsAndUploadsWhatThePhoneHas() {
        local = new TreeSet<>(Set.of("art"));
        localSaved = new ArrayList<>(List.of(story("mine1"), story("mine2")));
        cloud.topics = Set.of("science", "space");
        cloud.bookmarks = List.of(story("theirs"), story("mine2"));
        signIn();
        assertEquals("The account's topics win when it has any", List.of(Set.of("science", "space")), landing.topics);
        assertEquals(List.of(List.of("theirs", "mine2")), landing.saved);
        assertTrue("Only what the account lacks is uploaded, in one request", cloud.calls.contains("add:[mine1]"));
        assertFalse(cloud.calls.stream().anyMatch(call -> call.startsWith("save:")));
        assertEquals(USER_A, com.google.gson.JsonParser.parseString(store.text).getAsJsonObject().get("s").getAsString());
        assertEquals(0, account.status().message());
    }

    @Test public void anAccountWithNoTopicsGetsThePhonesTopics() {
        local = new TreeSet<>(Set.of("art", "books"));
        signIn();
        assertTrue(cloud.calls.contains("save:[art, books]"));
        assertTrue("Nothing is pushed back to the phone", landing.topics.isEmpty());
    }

    @Test public void aDifferentAccountNeverInheritsWhatAnotherLeftOnThePhone() {
        // The phone last synced account A. B signs in on it.
        create();
        account.begin(opened::add);
        account.complete(SCHEME + "://auth-callback?code=" + "a".repeat(36));
        account.signOut();
        local = new TreeSet<>(Set.of("art")); localSaved = new ArrayList<>(List.of(story("private")));
        auth.next = tokens("access-b", "refresh-b", USER_B, 3_600_000);
        cloud.calls.clear();
        account = new AccountManager(auth, cloud, store, Runnable::run, clock::get, SCHEME, () -> local, () -> localSaved);
        account.listen(landing);
        account.begin(opened::add);
        account.complete(SCHEME + "://auth-callback?code=" + "b".repeat(36));
        assertEquals(AccountManager.Phase.SIGNED_IN, account.status().phase());
        assertFalse("A's topics are not uploaded to B", cloud.calls.stream().anyMatch(call -> call.startsWith("save:")));
        assertFalse("A's saved stories are not uploaded to B", cloud.calls.stream().anyMatch(call -> call.startsWith("add:")));
    }

    @Test public void remoteTopicsAreNotEchoedBack() {
        cloud.topics = Set.of("space");
        local = new TreeSet<>(Set.of("space"));
        signIn();
        assertTrue("Identical topics need no transfer either way", landing.topics.isEmpty());
        assertFalse(cloud.calls.stream().anyMatch(call -> call.startsWith("save:")));
    }

    @Test public void changesMadeWhileSignedInAreSentRightAway() {
        signIn();
        cloud.calls.clear();
        account.saved(story("x"), true);
        account.saved(story("y"), false);
        account.interests(Set.of("math", "art"));
        assertEquals(List.of("add:[x]", "remove:y", "save:[art, math]"), cloud.calls);
        assertTrue("Nothing is left waiting", com.google.gson.JsonParser.parseString(store.text).getAsJsonObject()
                .getAsJsonArray("queue").isEmpty());
    }

    @Test public void changesMadeOfflineAreKeptAndSentLaterInOrder() {
        signIn();
        cloud.calls.clear();
        cloud.failure = new IOException("offline");
        account.saved(story("x"), true);
        account.saved(story("x"), false);
        account.saved(story("z"), true);
        assertEquals(R.string.account_sync_failed, account.status().message());
        assertEquals(AccountManager.Phase.SIGNED_IN, account.status().phase());
        String saved = store.text;
        assertTrue(saved.contains("\"z\"")); assertEquals("Add then remove of one story collapses to the removal", 2,
                com.google.gson.JsonParser.parseString(saved).getAsJsonObject().getAsJsonArray("queue").size());
        cloud.failure = null; cloud.calls.clear();
        clock.addAndGet(AccountManager.STALE_MS + 1);
        account.resume();
        assertEquals(List.of("remove:x", "add:[z]", "topics", "bookmarks"), cloud.calls.subList(0, 4));
        assertTrue(com.google.gson.JsonParser.parseString(store.text).getAsJsonObject().getAsJsonArray("queue").isEmpty());
    }

    @Test public void aChangeTheAccountWillNeverAcceptIsDroppedNotRetriedForever() {
        signIn();
        cloud.addFailure = new AuthApi.Rejected(403);
        account.saved(story("blocked"), true);
        assertTrue(com.google.gson.JsonParser.parseString(store.text).getAsJsonObject().getAsJsonArray("queue").isEmpty());
        assertEquals(0, account.status().message());
    }

    @Test public void aTopicsChangeThatCouldNotBeSentIsSentBeforeAnythingOverwritesIt() {
        signIn();
        cloud.failure = new IOException("offline");
        account.interests(Set.of("math"));
        assertTrue(com.google.gson.JsonParser.parseString(store.text).getAsJsonObject().get("d").getAsBoolean());
        cloud.failure = null; cloud.topics = Set.of("history"); cloud.calls.clear(); landing.topics.clear();
        local = new TreeSet<>(Set.of("math"));
        clock.addAndGet(AccountManager.STALE_MS + 1);
        account.resume();
        assertTrue("The phone's newer choice wins over the older one in the account", cloud.calls.contains("save:[math]"));
        assertTrue(landing.topics.isEmpty());
    }

    @Test public void anExpiredAccessTokenIsRefreshedBeforeUse() {
        signIn();
        clock.addAndGet(3_600_000 - 30_000);
        cloud.calls.clear(); cloud.tokensSeen.clear();
        account.saved(story("q"), true);
        assertTrue(auth.calls.contains("refresh:refresh-1"));
        assertEquals(List.of("access-2"), cloud.tokensSeen);
        assertEquals("The rotated refresh token is stored", "refresh-2",
                com.google.gson.JsonParser.parseString(store.text).getAsJsonObject().getAsJsonObject("session").get("r").getAsString());
    }

    @Test public void aTokenTheServerRefusesIsRefreshedOnceAndTheCallRetried() {
        signIn();
        cloud.calls.clear(); cloud.tokensSeen.clear();
        cloud.failure = new AuthApi.Unauthorized();
        account.saved(story("q"), true);
        assertEquals(List.of("add:[q]", "add:[q]"), cloud.calls);
        assertEquals(List.of("access-1", "access-2"), cloud.tokensSeen);
        assertEquals(AccountManager.Phase.SIGNED_IN, account.status().phase());
    }

    @Test public void aRefusedRefreshEndsTheSessionButKeepsWhatWasWaiting() {
        signIn();
        cloud.failure = new IOException("offline");
        account.saved(story("waiting"), true);
        cloud.failure = null;
        auth.refreshFailure = new AuthApi.Rejected(400);
        clock.addAndGet(3_600_000);
        account.saved(story("later"), true);
        assertEquals(AccountManager.Phase.SIGNED_OUT, account.status().phase());
        assertEquals(R.string.account_expired, account.status().message());
        assertTrue("Changes waiting for the same account survive an expiry", store.text.contains("\"waiting\""));
    }

    @Test public void aBusyServiceDoesNotSignTheReaderOut() {
        signIn();
        auth.refreshFailure = new IOException("rate limited");
        clock.addAndGet(3_600_000);
        account.saved(story("q"), true);
        assertEquals(AccountManager.Phase.SIGNED_IN, account.status().phase());
        assertEquals(R.string.account_sync_failed, account.status().message());
    }

    @Test public void signingOutForgetsTheSessionButLeavesTheReadersOwnData() {
        local = new TreeSet<>(Set.of("art")); localSaved = new ArrayList<>(List.of(story("kept")));
        signIn();
        account.signOut();
        assertEquals(AccountManager.Phase.SIGNED_OUT, account.status().phase());
        assertEquals(R.string.account_signed_out, account.status().message());
        assertTrue(auth.calls.contains("logout:access-1"));
        assertFalse(store.text == null ? false : store.text.contains("access-1"));
        assertEquals(Set.of("art"), local); assertEquals(List.of("kept"), ids(localSaved));
        account.saved(story("after"), true);
        assertFalse("Signed out, nothing is sent", cloud.calls.contains("add:[after]"));
    }

    @Test public void theSessionSurvivesARestartWithoutTheNetwork() {
        signIn();
        auth.calls.clear(); cloud.calls.clear();
        AccountManager restarted = new AccountManager(auth, cloud, store, Runnable::run, clock::get, SCHEME, () -> local, () -> localSaved);
        assertEquals(AccountManager.Phase.SIGNED_IN, restarted.status().phase());
        assertEquals("Asha Rao", restarted.status().label());
        assertTrue(auth.calls.isEmpty() && cloud.calls.isEmpty());
    }

    @Test public void aStoreThatCannotBeOpenedIsNotWipedButADamagedOneIs() {
        signIn();
        String saved = store.text;
        MemoryStore locked = new MemoryStore();
        locked.text = saved; locked.readFailure = new IOException("keystore locked");
        AccountManager first = new AccountManager(auth, cloud, locked, Runnable::run, clock::get, SCHEME, () -> local, () -> localSaved);
        assertEquals(AccountManager.Phase.SIGNED_OUT, first.status().phase());
        assertFalse("A temporary failure must not destroy the session", locked.cleared);
        MemoryStore damaged = new MemoryStore();
        damaged.text = "{not json";
        AccountManager second = new AccountManager(auth, cloud, damaged, Runnable::run, clock::get, SCHEME, () -> local, () -> localSaved);
        assertEquals(AccountManager.Phase.SIGNED_OUT, second.status().phase());
        assertTrue(damaged.cleared);
    }

    @Test public void callbackAddressesAreParsedStrictly() {
        AccountManager.Callback ok = AccountManager.parse(SCHEME + "://auth-callback?code=abc12345-6789&error=", SCHEME);
        assertEquals("abc12345-6789", ok.code());
        assertNull(AccountManager.parse(SCHEME + "://auth-callback?code=short", SCHEME).code());
        assertNull(AccountManager.parse(SCHEME + "://auth-callback?code=" + "x".repeat(600), SCHEME).code());
        assertNull("Characters a code never contains make the whole address unusable",
                AccountManager.parse(SCHEME + "://auth-callback?code=<script>alert(1)</script>", SCHEME));
        assertNull("An empty error is not an error", AccountManager.parse(SCHEME + "://auth-callback?code=abc12345&error=", SCHEME).error());
        assertEquals("access_denied", AccountManager.parse(SCHEME + "://auth-callback?error=access_denied", SCHEME).error());
        assertEquals("error", AccountManager.parse(SCHEME + "://auth-callback?error=" + "y".repeat(100), SCHEME).error());
        assertNull(AccountManager.parse("com.other://auth-callback?code=abc12345", SCHEME));
        assertNull(AccountManager.parse(SCHEME + "://auth-callback.evil.example?code=abc12345", SCHEME));
        assertNull(AccountManager.parse("::not a uri::", SCHEME));
    }

    @Test public void theAddressAsTheLiveSiteSendsItIsAccepted() {
        // The website's redirect passes through Vercel, which writes the address with a slash before the query.
        AccountManager.Callback slash = AccountManager.parse(SCHEME + "://auth-callback/?code=abc12345-6789", SCHEME);
        assertEquals("abc12345-6789", slash.code());
        assertEquals("access_denied", AccountManager.parse(SCHEME + "://auth-callback/?error=access_denied&error_description=User+denied", SCHEME).error());
    }
}
