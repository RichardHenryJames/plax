package com.plaxlabs.news;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** The optional account on a real phone: the Keystore, the sign-in sheet and the browser's return. */
@RunWith(AndroidJUnit4.class)
public class AccountDeviceTest {
    private static final String USER = "44444444-4444-4444-8444-444444444444";
    private static final String CODE = "c".repeat(36);

    private static final class FakeAuth implements AuthApi {
        IOException checkFailure;
        final List<String> calls = Collections.synchronizedList(new ArrayList<>());
        volatile String lastCode;

        @Override public AuthConfig config() { return new AuthConfig("https://abcdefghij.supabase.co", "k".repeat(30)); }
        @Override public void check(AuthConfig config) throws IOException { calls.add("check"); if (checkFailure != null) throw checkFailure; }
        @Override public Tokens exchange(AuthConfig config, String code, String verifier) {
            calls.add("exchange"); lastCode = code;
            return new Tokens("access-1", "refresh-1", System.currentTimeMillis() + 3_600_000, USER, "asha@example.com", "Asha Rao");
        }
        @Override public Tokens refresh(AuthConfig config, String refreshToken) throws IOException { throw new IOException("unused"); }
        @Override public void logout(AuthConfig config, String access) { calls.add("logout"); }
    }

    private static final class FakeCloud implements CloudApi {
        volatile Set<String> topics = Set.of();
        volatile List<Story> bookmarks = List.of();
        final List<String> calls = Collections.synchronizedList(new ArrayList<>());

        @Override public Set<String> topics(AuthConfig config, AuthApi.Tokens tokens) { return topics; }
        @Override public void saveTopics(AuthConfig config, AuthApi.Tokens tokens, Set<String> chosen) { calls.add("save:" + new TreeSet<>(chosen)); }
        @Override public List<Story> bookmarks(AuthConfig config, AuthApi.Tokens tokens) { return bookmarks; }
        @Override public void addBookmarks(AuthConfig config, AuthApi.Tokens tokens, List<Story> stories) {
            List<String> ids = new ArrayList<>();
            for (Story story : stories) ids.add(story.id());
            calls.add("add:" + ids);
        }
        @Override public void removeBookmark(AuthConfig config, AuthApi.Tokens tokens, String id) { calls.add("remove:" + id); }
    }

    private static final class MemoryStore implements TokenStore {
        volatile String text;
        @Override public String read() { return text; }
        @Override public void write(String value) { text = value; }
        @Override public void clear() { text = null; }
    }

    private Context context;
    private File directory, savedFile;
    private byte[] savedBackup;
    private Set<String> interestsBackup;
    private final String alias = "plax-test-" + UUID.randomUUID();

    @Before public void isolate() throws IOException {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        directory = new File(context.getCacheDir(), "account-" + UUID.randomUUID());
        assertTrue(directory.mkdirs());
        savedFile = new File(context.getFilesDir(), "saved-stories.json");
        savedBackup = savedFile.exists() ? java.nio.file.Files.readAllBytes(savedFile.toPath()) : null;
        interestsBackup = Interests.read(context);
        QuietUpdates.install();
    }

    @After public void restore() throws IOException {
        QuietUpdates.remove();
        AccountManager.use(null);
        new SecureStore(directory, alias).clear();
        delete(directory);
        if (savedBackup == null) savedFile.delete();
        else try (FileOutputStream output = new FileOutputStream(savedFile)) { output.write(savedBackup); }
        Interests.write(context, interestsBackup);
        Prefs.forYou(context, false);
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }

    private AccountManager manager(FakeAuth auth, FakeCloud cloud, TokenStore store) {
        return new AccountManager(auth, cloud, store, Executors.newSingleThreadExecutor(), System::currentTimeMillis,
                BuildConfig.AUTH_SCHEME, () -> Interests.read(context), () -> List.of());
    }

    @Test public void accountSecretsAreSealedByTheKeystoreAndTamperingIsDetected() throws Exception {
        SecureStore store = new SecureStore(directory, alias);
        assertNull("Nothing is stored before the first sign-in", store.read());
        String secret = "{\"access\":\"super-secret-token-value\"}";
        store.write(secret);
        assertEquals(secret, new SecureStore(directory, alias).read());

        File file = new File(directory, "account.bin");
        byte[] sealed = java.nio.file.Files.readAllBytes(file.toPath());
        assertFalse("The file holds ciphertext, not the secret", new String(sealed, StandardCharsets.UTF_8).contains("super-secret"));
        store.write(secret);
        byte[] second = java.nio.file.Files.readAllBytes(file.toPath());
        assertFalse("Every write uses a fresh nonce", Arrays.equals(sealed, second));

        second[second.length - 1] ^= 1;
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(second); }
        assertNull("A changed file is rejected, not trusted", new SecureStore(directory, alias).read());
        assertFalse("and removed", file.exists());

        store.write("after");
        assertEquals("after", store.read());
        store.clear();
        assertNull(store.read());
        assertFalse(file.exists());
    }

    @Test public void theAccountSheetExplainsTheOptionAndReportsAnUnavailableService() {
        FakeAuth auth = new FakeAuth();
        auth.checkFailure = new IOException("down");
        AccountManager manager = manager(auth, new FakeCloud(), new MemoryStore());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AccountSheet[] sheet = new AccountSheet[1];
            scenario.onActivity(activity -> sheet[0] = AccountSheet.show(activity, new Ui(activity), manager, new AccountSheet.Actions() {
                @Override public void signIn() { manager.begin(url -> { throw new AssertionError("No browser for a service that is down"); }); }
                @Override public void interests() { }
                @Override public void website() { }
            }));
            View root = sheet[0].dialog.getWindow().getDecorView();
            assertNotNull(find(root, "Your Plax account"));
            assertNotNull(findContaining(root, "Plax works without an account"));
            assertNotNull(findContaining(root, "uploads your chosen topics and saved stories"));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> find(root, "Continue with Google").performClick());
            await("the unavailable notice", () -> find(root, "Sign-in is temporarily unavailable. Plax keeps working without it; try again later.") != null);
            assertNotNull("The reader can try again", find(root, "Continue with Google"));
            assertEquals(List.of("check"), auth.calls);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(sheet[0]::dismiss);
        }
    }

    @Test public void theBrowsersReturnSignsTheReaderInBringsTheirDataAndSignOutLeavesItOnThePhone() throws Exception {
        FakeAuth auth = new FakeAuth();
        FakeCloud cloud = new FakeCloud();
        cloud.topics = Set.of("history", "space");
        cloud.bookmarks = List.of(new Story("remote-1", "A story saved elsewhere", "Saved on another phone.", "science", "", "", "", "", "", 0));
        AccountManager manager = manager(auth, cloud, new MemoryStore());
        AccountManager.use(manager);
        List<String> opened = Collections.synchronizedList(new ArrayList<>());
        manager.begin(opened::add);
        await("the browser address", () -> !opened.isEmpty());
        assertTrue(opened.get(0).startsWith("https://abcdefghij.supabase.co/auth/v1/authorize?"));

        Intent callback = new Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.AUTH_SCHEME + "://auth-callback?code=" + CODE))
                .setClass(context, MainActivity.class);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(callback)) {
            await("the sign-in", manager::signedIn);
            assertEquals(CODE, auth.lastCode);
            await("the account's topics on the phone", () -> Interests.read(context).equals(Set.of("history", "space")));
            await("the account's saved story on the phone", () -> {
                try { return new SavedStories(context.getFilesDir()).read().stream().anyMatch(story -> story.id().equals("remote-1")); }
                catch (IOException unreadable) { return false; }
            });
            AccountSheet[] sheet = new AccountSheet[1];
            await("the account sheet", () -> {
                scenario.onActivity(activity -> sheet[0] = shownAccountSheet(activity));
                return sheet[0] != null && sheet[0].isShowing();
            });
            View root = sheet[0].dialog.getWindow().getDecorView();
            await("the signed-in view", () -> find(root, "Signed in as Asha Rao") != null);
            assertNotNull(find(root, "Sign out"));

            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> find(root, "Sign out").performClick());
            await("the sign-out", () -> !manager.signedIn());
            await("the sign-out to be sent to the account service", () -> auth.calls.contains("logout"));
            await("the signed-out view", () -> find(root, "Continue with Google") != null);
            assertEquals("Topics stay on the phone after signing out", Set.of("history", "space"), Interests.read(context));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(sheet[0]::dismiss);
        }
    }

    @Test public void topicsChosenWhileSignedInAreSentToTheAccount() throws Exception {
        FakeAuth auth = new FakeAuth();
        FakeCloud cloud = new FakeCloud();
        AccountManager manager = manager(auth, cloud, new MemoryStore());
        AccountManager.use(manager);
        manager.begin(url -> { });
        await("the pending sign-in", () -> manager.status().phase() == AccountManager.Phase.WAITING);
        manager.complete(BuildConfig.AUTH_SCHEME + "://auth-callback?code=" + CODE);
        await("the sign-in", manager::signedIn);
        Interests.write(context, Set.of());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            InterestsSheet[] sheet = new InterestsSheet[1];
            scenario.onActivity(activity -> {
                try {
                    var choose = MainActivity.class.getDeclaredMethod("chooseInterests");
                    choose.setAccessible(true);
                    choose.invoke(activity);
                    Field field = MainActivity.class.getDeclaredField("interestsSheet");
                    field.setAccessible(true);
                    sheet[0] = (InterestsSheet) field.get(activity);
                } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
            });
            View root = sheet[0].dialog.getWindow().getDecorView();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                clickAround(find(root, "Science")); clickAround(find(root, "Space"));
                find(root, "Save topics").performClick();
            });
            await("the topics to reach the account", () -> cloud.calls.contains("save:[science, space]"));
            assertEquals(Set.of("science", "space"), Interests.read(context));
        }
    }

    @Test public void aSignInCallbackNobodyStartedChangesNothing() {
        FakeAuth auth = new FakeAuth();
        AccountManager manager = manager(auth, new FakeCloud(), new MemoryStore());
        AccountManager.use(manager);
        Intent callback = new Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.AUTH_SCHEME + "://auth-callback?code=" + CODE))
                .setClass(context, MainActivity.class);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(callback)) {
            SystemClock.sleep(500);
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            assertFalse(manager.signedIn());
            assertTrue("The code was never exchanged", auth.calls.isEmpty());
        }
    }

    private static AccountSheet shownAccountSheet(MainActivity activity) {
        try {
            Field field = MainActivity.class.getDeclaredField("accountSheet");
            field.setAccessible(true);
            return (AccountSheet) field.get(activity);
        } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
    }

    private static void clickAround(View view) {
        assertNotNull(view);
        View target = view;
        while (target != null && !target.isClickable()) target = target.getParent() instanceof View parent ? parent : null;
        assertNotNull(target);
        target.performClick();
    }

    private static void await(String what, BooleanSupplier condition) {
        long deadline = SystemClock.uptimeMillis() + 8000;
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            if (condition.getAsBoolean()) return;
            SystemClock.sleep(20);
        }
        fail("Timed out waiting for: " + what);
    }

    private static View find(View view, String text) {
        if (view instanceof TextView label && text.contentEquals(label.getText()) && view.isShown()) return view;
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) {
            View found = find(group.getChildAt(index), text); if (found != null) return found;
        }
        return null;
    }

    private static View findContaining(View view, String text) {
        if (view instanceof TextView label && label.getText().toString().contains(text) && view.isShown()) return view;
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) {
            View found = findContaining(group.getChildAt(index), text); if (found != null) return found;
        }
        return null;
    }
}
