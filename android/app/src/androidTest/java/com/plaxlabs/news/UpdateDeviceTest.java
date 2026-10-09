package com.plaxlabs.news;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PatternMatcher;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import java.io.IOException;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * The update offer on the real screen: what it says, what Later and Download do, when it is held back, and the menu.
 * The website and the clock are replaced, so nothing here depends on what is published.
 */
@RunWith(AndroidJUnit4.class)
public class UpdateDeviceTest {
    private interface Answer { AppUpdates.Release get() throws IOException; }

    private static final class Memory implements UpdateManager.Memory {
        volatile long lastCheck, dismissedVersion, dismissedAt;
        @Override public long lastCheck() { return lastCheck; }
        @Override public long dismissedVersion() { return dismissedVersion; }
        @Override public long dismissedAt() { return dismissedAt; }
        @Override public void checked(long at) { lastCheck = at; }
        @Override public void dismissed(long version, long at) { dismissedVersion = version; dismissedAt = at; }
    }

    private static final AppUpdates.Release RELEASE =
            new AppUpdates.Release(BuildConfig.VERSION_CODE + 1, "9.9.9", AppUpdates.ORIGIN + "/plax-9.9.9.apk");

    private Context context;
    private UiDevice device;
    private final Memory memory = new Memory();
    private final AtomicInteger requests = new AtomicInteger();
    private volatile Answer answer = () -> null;

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        assertTrue(context.getSharedPreferences("updates", Context.MODE_PRIVATE).edit().clear().commit());
    }

    @After public void restoreProductionWiring() {
        UpdateManager.use(null);
        context.getSharedPreferences("updates", Context.MODE_PRIVATE).edit().clear().commit();
    }

    private UpdateManager manager(boolean store) {
        Handler handler = new Handler(Looper.getMainLooper());
        return new UpdateManager(memory, (version, android) -> { requests.incrementAndGet(); return answer.get(); },
                Executors.newSingleThreadExecutor(), handler::post, System::currentTimeMillis, BuildConfig.VERSION_CODE, Build.VERSION.SDK_INT, store);
    }

    private static AlertDialog shownDialog(ActivityScenario<MainActivity> scenario) {
        AtomicReference<AlertDialog> dialog = new AtomicReference<>();
        scenario.onActivity(activity -> dialog.set(activity.openDialog != null && activity.openDialog.isShowing() ? activity.openDialog : null));
        return dialog.get();
    }

    private static AlertDialog awaitDialog(ActivityScenario<MainActivity> scenario) {
        await("a dialog", () -> shownDialog(scenario) != null);
        return shownDialog(scenario);
    }

    private static void onMain(Runnable work) { InstrumentationRegistry.getInstrumentation().runOnMainSync(work); }

    private static void invoke(Object target, String method) {
        try {
            Method found = target.getClass().getDeclaredMethod(method);
            found.setAccessible(true);
            found.invoke(target);
        } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
    }

    /** Leaves the app and comes back, which is when the update manager looks again or repeats an offer. */
    private static void backToFront(ActivityScenario<MainActivity> scenario) {
        scenario.moveToState(Lifecycle.State.STARTED);
        scenario.moveToState(Lifecycle.State.RESUMED);
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    }

    private void openMenu(String item) {
        assertTrue("the screen is up", device.wait(Until.hasObject(By.desc("More options")), 10_000));
        device.findObject(By.desc("More options")).click();
        assertTrue("the menu lists " + item, device.wait(Until.hasObject(By.text(item)), 5_000));
    }

    @Test public void anUpdateIsOfferedWithTheNewVersionAndLaterIsRemembered() {
        answer = () -> RELEASE;
        UpdateManager.use(manager(false));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            View root = dialog.getWindow().getDecorView();
            assertNotNull(find(root, "Update available"));
            assertNotNull(findContaining(root, "Plax 9.9.9 is ready"));
            assertNotNull(find(root, "Later"));
            assertNotNull(find(root, "Download"));
            assertEquals(1, requests.get());
            assertTrue("a check is counted when it starts", memory.lastCheck > 0);

            onMain(() -> dialog.getButton(AlertDialog.BUTTON_NEGATIVE).performClick());
            // A dialog button's callback is delivered through the dialog's handler, so it arrives a moment later.
            await("Later to be remembered", () -> memory.dismissedVersion == RELEASE.versionCode());
            assertTrue(memory.dismissedAt > 0);
            await("the dialog to close", () -> shownDialog(scenario) == null);

            backToFront(scenario);
            SystemClock.sleep(500);
            assertNull("not offered again the moment the app returns", shownDialog(scenario));
            assertEquals("and the website is not asked again within the day", 1, requests.get());
        }
    }

    @Test public void closingTheOfferWithoutAnAnswerCountsAsLater() {
        answer = () -> RELEASE;
        UpdateManager.use(manager(false));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            assertEquals(0, memory.dismissedVersion);
            onMain(dialog::cancel);
            await("the closed offer to be remembered", () -> memory.dismissedVersion == RELEASE.versionCode());
            await("the dialog to close", () -> shownDialog(scenario) == null);
        }
    }

    @Test public void downloadOpensTheExactVersionedFileInTheBrowserAndPutsTheOfferOff() {
        answer = () -> RELEASE;
        UpdateManager.use(manager(false));
        IntentFilter file = new IntentFilter(Intent.ACTION_VIEW);
        file.addCategory(Intent.CATEGORY_BROWSABLE);
        file.addDataScheme("https");
        file.addDataAuthority("www.plaxlabs.com", null);
        file.addDataPath("/news/plax-9.9.9.apk", PatternMatcher.PATTERN_LITERAL);
        // The browser is not really started: the monitor answers for it, so nothing is downloaded by the test.
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(file, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AlertDialog dialog = awaitDialog(scenario);
            onMain(() -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick());
            await("the browser to be started", () -> monitor.getHits() == 1);
            assertEquals("for exactly that file, once", 1, monitor.getHits());
            await("the offer to be put off", () -> memory.dismissedVersion == RELEASE.versionCode());
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void nothingIsOfferedOverAnOpenSheetButItComesBackWhenTheAppIsNextInFront() throws Exception {
        CountDownLatch open = new CountDownLatch(1);
        answer = () -> {
            try { if (!open.await(10, TimeUnit.SECONDS)) throw new IOException("test timed out"); }
            catch (InterruptedException interrupted) { throw new IOException(interrupted); }
            return RELEASE;
        };
        UpdateManager.use(manager(false));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await("the check to start", () -> requests.get() == 1);
            scenario.onActivity(activity -> invoke(activity, "account"));
            open.countDown();
            SystemClock.sleep(800);
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            assertNull("the account sheet is open, so nothing is drawn over it", shownDialog(scenario));
            scenario.onActivity(activity -> {
                try {
                    java.lang.reflect.Field field = MainActivity.class.getDeclaredField("accountSheet");
                    field.setAccessible(true);
                    ((AccountSheet) field.get(activity)).dismiss();
                } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
            });
            backToFront(scenario);
            AlertDialog dialog = awaitDialog(scenario);
            assertNotNull(find(dialog.getWindow().getDecorView(), "Update available"));
            assertEquals("the release was kept, not asked for again", 1, requests.get());
        }
    }

    @Test public void theOfferComesBackWithTheScreenAfterARotation() {
        answer = () -> RELEASE;
        UpdateManager.use(manager(false));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitDialog(scenario);
            scenario.recreate();
            AlertDialog again = awaitDialog(scenario);
            assertNotNull(find(again.getWindow().getDecorView(), "Update available"));
            assertEquals("recreating the screen is not an answer", 0, memory.dismissedVersion);
            assertEquals("and it did not ask the website again", 1, requests.get());
        }
    }

    @Test public void checkForUpdatesInTheMenuAnswersInEveryCase() throws Exception {
        memory.lastCheck = System.currentTimeMillis();   // so nothing is looked for until the reader asks
        UpdateManager.use(manager(false));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openMenu("Check for updates");
            assertNull("the store item is not in a website build", device.findObject(By.text("Open Google Play")));
            assertEquals("up to date is said out loud", "Plax is up to date.", toastAfter(() -> device.findObject(By.text("Check for updates")).click()));
            assertEquals(1, requests.get());
            assertNull(shownDialog(scenario));

            answer = () -> { throw new IOException("down"); };
            openMenu("Check for updates");
            assertEquals("so is a failure", "Cannot check for updates right now. Try again later.",
                    toastAfter(() -> device.findObject(By.text("Check for updates")).click()));
            assertEquals(2, requests.get());

            memory.dismissedVersion = RELEASE.versionCode(); memory.dismissedAt = System.currentTimeMillis();
            answer = () -> RELEASE;
            openMenu("Check for updates");
            device.findObject(By.text("Check for updates")).click();
            AlertDialog dialog = awaitDialog(scenario);
            assertNotNull("asking offers a release that was put off", find(dialog.getWindow().getDecorView(), "Update available"));
            assertEquals(3, requests.get());
        }
    }

    /**
     * The text of the toast that appears while {@code action} runs. A toast is a window owned by the system that
     * the view tree does not list, so it is read from the accessibility event it sends.
     */
    private static String toastAfter(Runnable action) throws Exception {
        android.view.accessibility.AccessibilityEvent event = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeAndWaitForEvent(action::run, candidate ->
                        candidate.getEventType() == android.view.accessibility.AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED
                                && android.widget.Toast.class.getName().contentEquals(candidate.getClassName()), 10_000);
        // The event lists the message, then the name of the app that showed it.
        return event.getText().get(0).toString();
    }

    @Test public void storeBuildsOpenTheListingInsteadAndDescribeNoUpdateCheck() {
        UpdateManager.use(manager(true));
        IntentFilter listing = new IntentFilter(Intent.ACTION_VIEW);
        listing.addCategory(Intent.CATEGORY_DEFAULT);
        listing.addCategory(Intent.CATEGORY_BROWSABLE);
        listing.addDataScheme("https");
        listing.addDataAuthority("play.google.com", null);
        listing.addDataPath("/store/apps/details", PatternMatcher.PATTERN_LITERAL);
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(listing, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openMenu("Open Google Play");
            assertNull(device.findObject(By.text("Check for updates")));
            device.findObject(By.text("Open Google Play")).click();
            await("the listing to be opened", () -> monitor.getHits() == 1);
            assertEquals("a store build never asks the website", 0, requests.get());

            openMenu("About Plax");
            device.findObject(By.text("About Plax")).click();
            AlertDialog about = awaitDialog(scenario);
            assertNotNull(findContaining(about.getWindow().getDecorView(), "Version " + BuildConfig.VERSION_NAME));
            assertNull("it does not describe a check it does not make",
                    findContaining(about.getWindow().getDecorView(), "asks its website whether a newer version exists"));
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void theAboutDialogOfAWebsiteBuildSaysWhatTheUpdateCheckSends() {
        memory.lastCheck = System.currentTimeMillis();
        UpdateManager.use(manager(false));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openMenu("About Plax");
            device.findObject(By.text("About Plax")).click();
            AlertDialog about = awaitDialog(scenario);
            View root = about.getWindow().getDecorView();
            assertNotNull(findContaining(root, "Version " + BuildConfig.VERSION_NAME));
            assertNotNull(findContaining(root, "asks its website whether a newer version exists. Nothing about you is sent."));
            assertNotNull(findContaining(root, "Plax never installs anything on its own."));
        }
    }

    @Test public void whatTheAppWideManagerLearnsIsKeptInPreferences() {
        UpdateManager.use(null);
        UpdateManager real = UpdateManager.get(context);
        assertEquals("the test build is a website build", BuildConfig.PLAY_STORE, real.storeBuild());
        SharedPreferences preferences = context.getSharedPreferences("updates", Context.MODE_PRIVATE);
        assertEquals(0, preferences.getLong("dismissed-version", 0));
        real.dismiss(RELEASE);
        assertEquals(RELEASE.versionCode(), preferences.getLong("dismissed-version", 0));
        assertTrue(preferences.getLong("dismissed-at", 0) > 0);
    }

    private static void await(String what, BooleanSupplier condition) {
        long deadline = SystemClock.uptimeMillis() + 10_000;
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
