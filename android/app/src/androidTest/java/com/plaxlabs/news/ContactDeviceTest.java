package com.plaxlabs.news;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.PatternMatcher;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObjectNotFoundException;
import androidx.test.uiautomator.UiScrollable;
import androidx.test.uiautomator.UiSelector;
import androidx.test.uiautomator.Until;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * Contact us on a real screen, the page Google Play's news policy asks for inside the app: that it is one tap from the menu
 * and from About, that it shows the address and the website page in plain sight, and what its buttons do.
 */
@RunWith(AndroidJUnit4.class)
public class ContactDeviceTest {
    private Context context;
    private UiDevice device;

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        QuietUpdates.install();
    }

    @After public void restore() { QuietUpdates.remove(); }

    private void openMenu(String item) {
        assertTrue("the screen is up", device.wait(Until.hasObject(By.desc("Menu")), 15_000));
        // This test runs on the live feed, which rebuilds the page as it arrives: a button found a moment ago can be stale when pressed.
        for (int attempt = 0; ; attempt++) {
            try {
                device.wait(Until.findObject(By.desc("Menu")), 5_000).click();
                break;
            } catch (androidx.test.uiautomator.StaleObjectException | NullPointerException gone) {
                if (attempt == 4) throw gone;
            }
        }
        // The close button is at the top of the panel, so it is on screen however long the list below it is (a row further down,
        // such as Privacy policy, is below the fold on a screen of this height).
        assertTrue("the menu is open", device.wait(Until.hasObject(By.desc("Close menu")), 5_000));
        // The menu is a list that scrolls: the entry is brought into view.
        try { new UiScrollable(new UiSelector().className("android.widget.ScrollView").scrollable(true)).scrollIntoView(new UiSelector().text(item)); }
        catch (UiObjectNotFoundException none) { /* the check below says so */ }
        assertTrue("the menu lists " + item, device.wait(Until.hasObject(By.text(item)), 5_000));
    }

    private void openContact() {
        openMenu("Contact us");
        device.findObject(By.text("Contact us")).click();
        assertTrue("the sheet shows the address", device.wait(Until.hasObject(By.text(Contact.EMAIL)), 5_000));
    }

    @Test public void contactUsIsOneTapFromTheMenuAndShowsTheAddressAndTheWebsitePage() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openContact();
            assertTrue("a heading says what this is", device.hasObject(By.text("Contact us")));
            assertTrue("it says who to write to", device.hasObject(By.textContains(Contact.OPERATOR)));
            assertTrue(device.hasObject(By.text("Email us")));
            assertTrue(device.hasObject(By.text("Copy address")));
            assertTrue(device.hasObject(By.text("Open the contact page")));
            assertTrue("the website page is named in words, not only behind a button",
                    device.hasObject(By.textContains(Contact.PAGE_URL)));
            assertTrue("the publishers are credited", device.hasObject(By.textContains("names its publisher")));
        }
    }

    @Test public void aboutShowsTheContactAddressAndKeepsItsTwoButtons() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openMenu("About Plax");
            device.findObject(By.text("About Plax")).click();
            await("the About dialog", () -> shownDialog(scenario) != null);
            AlertDialog about = shownDialog(scenario);
            View root = about.getWindow().getDecorView();
            TextView message = (TextView) findContaining(root, Contact.EMAIL);
            assertNotNull("About carries the address", message);
            assertTrue("the address has a line to itself, so it is never split across two",
                    message.getText().toString().contains("\n" + Contact.EMAIL + "\n"));
            // Three buttons would stack and push the first one off a short screen: About keeps Privacy policy and Done.
            assertEquals("Privacy policy", about.getButton(AlertDialog.BUTTON_NEUTRAL).getText().toString());
            assertEquals("Done", about.getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());
            assertEquals(View.GONE, about.getButton(AlertDialog.BUTTON_NEGATIVE).getVisibility());
        }
    }

    @Test public void emailUsOpensANewMessageToTheAddressInTheMailApp() {
        IntentFilter message = new IntentFilter(Intent.ACTION_SENDTO);
        message.addCategory(Intent.CATEGORY_DEFAULT);
        message.addDataScheme("mailto");
        message.addDataSchemeSpecificPart(Contact.EMAIL, PatternMatcher.PATTERN_LITERAL);
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(message, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openContact();
            device.findObject(By.text("Email us")).click();
            await("a new message to the address to be opened", () -> monitor.getHits() == 1);
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void theContactPageButtonOpensThePageOnTheWebsite() {
        IntentFilter page = new IntentFilter(Intent.ACTION_VIEW);
        page.addCategory(Intent.CATEGORY_DEFAULT);
        page.addCategory(Intent.CATEGORY_BROWSABLE);
        page.addDataScheme("https");
        page.addDataAuthority("plax-rouge.vercel.app", null);
        page.addDataPath("/news/contact", PatternMatcher.PATTERN_LITERAL);
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(page, new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent()), true);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openContact();
            device.findObject(By.text("Open the contact page")).click();
            await("the contact page to be opened", () -> monitor.getHits() == 1);
        } finally { instrumentation.removeMonitor(monitor); }
    }

    @Test public void copyAddressPutsTheAddressOnTheClipboard() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            openContact();
            onMain(() -> context.getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("before", "nothing yet")));
            device.findObject(By.text("Copy address")).click();
            await("the address to be copied", () -> Contact.EMAIL.equals(clipboardText()));
        }
    }

    /**
     * The phone may have no mail app (or the reader may have removed theirs): Email us must still lead somewhere. The mail apps
     * on this emulator are switched off for the test and back on afterwards, so the result never depends on what is installed.
     */
    @Test public void withoutAMailAppTheAddressIsCopiedInstead() throws Exception {
        List<String> switchedOff = new ArrayList<>();
        try {
            for (String app : mailApps()) {
                device.executeShellCommand("pm disable-user --user 0 " + app);
                switchedOff.add(app);
            }
            assertEquals("a mail app is still there", List.of(), mailApps());
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                openContact();
                onMain(() -> context.getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("before", "nothing yet")));
                device.findObject(By.text("Email us")).click();
                await("the address to be copied", () -> Contact.EMAIL.equals(clipboardText()));
                assertTrue("the sheet is still there", device.hasObject(By.text("Email us")));
            }
        } finally {
            for (String app : switchedOff) device.executeShellCommand("pm enable " + app);
        }
    }

    /** The packages that would open a new message, as the system lists them. */
    private List<String> mailApps() throws IOException {
        String listing = device.executeShellCommand("cmd package query-activities --brief -a android.intent.action.SENDTO -d mailto:a@example.com");
        List<String> packages = new ArrayList<>();
        for (String line : listing.split("\\R")) {
            String entry = line.trim();
            int slash = entry.indexOf('/');
            if (slash > 0 && entry.indexOf(' ') < 0) packages.add(entry.substring(0, slash));
        }
        return packages;
    }

    private String clipboardText() {
        AtomicReference<String> text = new AtomicReference<>("");
        onMain(() -> {
            ClipData clip = context.getSystemService(ClipboardManager.class).getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0 && clip.getItemAt(0).getText() != null) text.set(clip.getItemAt(0).getText().toString());
        });
        return text.get();
    }

    private static AlertDialog shownDialog(ActivityScenario<MainActivity> scenario) {
        AtomicReference<AlertDialog> dialog = new AtomicReference<>();
        scenario.onActivity(activity -> dialog.set(activity.openDialog != null && activity.openDialog.isShowing() ? activity.openDialog : null));
        return dialog.get();
    }

    private static void onMain(Runnable work) { InstrumentationRegistry.getInstrumentation().runOnMainSync(work); }

    private static void await(String what, BooleanSupplier condition) {
        long deadline = SystemClock.uptimeMillis() + 10_000;
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            if (condition.getAsBoolean()) return;
            SystemClock.sleep(20);
        }
        fail("Timed out waiting for: " + what);
    }

    private static View findContaining(View view, String text) {
        if (view instanceof TextView label && label.getText().toString().contains(text) && view.isShown()) return view;
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) {
            View found = findContaining(group.getChildAt(index), text); if (found != null) return found;
        }
        return null;
    }
}
