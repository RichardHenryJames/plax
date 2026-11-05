package com.plaxlabs.news;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import static org.junit.Assert.*;

/** Which of the website's messages is put in front of the reader, and when. The rules only: no screen, no clock, no preferences. */
public class ConfigPromptsTest {
    private static final long NOW = 1_800_000_000_000L, DAY = 24L * 3_600_000;

    private static final class Memory implements ConfigPrompts.Memory {
        String notice = "";
        long version, at;
        @Override public String noticeSeen() { return notice; }
        @Override public void noticeSeen(String id) { notice = id; }
        @Override public long updateVersion() { return version; }
        @Override public long updateAt() { return at; }
        @Override public void updateDismissed(long newVersion, long when) { version = newVersion; at = when; }
    }

    private final Memory memory = new Memory();

    private static AppConfig config(String body) {
        try { return AppConfig.parse(("{\"schemaVersion\":1," + body + "}").getBytes(StandardCharsets.UTF_8)).config(); }
        catch (IOException refused) { throw new AssertionError(refused); }
    }

    private static String notice(String id, String level, String extra) {
        return "\"notice\":{\"id\":\"" + id + "\",\"level\":\"" + level + "\",\"title\":{\"en\":\"T\"},\"body\":{\"en\":\"B\"}" + extra + "}";
    }

    private static String update(int latest, int least) {
        return "\"update\":{\"latestVersionCode\":" + latest + ",\"latestVersionName\":\"1.7.0\",\"minSupportedVersionCode\":" + least + "}";
    }

    @Test public void thereIsNothingToShowUnlessTheWebsiteSaysSo() {
        ConfigPrompts prompts = new ConfigPrompts(memory, true, 16);
        assertNull(prompts.next(AppConfig.defaults(), NOW));
        assertNull(prompts.next(config("\"notice\":null,\"update\":null"), NOW));
    }

    @Test public void aNoticeIsShownOnceForEachIdWhateverTheReaderDidWithIt() {
        ConfigPrompts prompts = new ConfigPrompts(memory, true, 16);
        AppConfig config = config(notice("n1", "info", ""));
        ConfigPrompts.Prompt prompt = prompts.next(config, NOW);
        assertNotNull(prompt);
        assertEquals("n1", prompt.notice().id());
        prompts.shown(prompt);
        assertNull("not put up again while the app is open", prompts.next(config, NOW));
        prompts.closed(prompt, false, NOW);
        assertEquals("an ordinary notice is counted as read however it was closed", "n1", memory.notice);
        assertNull("nor at the next start", new ConfigPrompts(memory, true, 16).next(config, NOW));
        assertNotNull("a new id is shown again", new ConfigPrompts(memory, true, 16).next(config(notice("n2", "info", "")), NOW));
    }

    @Test public void anImportantNoticeComesBackAtTheNextStartUntilTheReaderHasSaidDone() {
        AppConfig config = config(notice("n1", "important", ""));
        ConfigPrompts first = new ConfigPrompts(memory, true, 16);
        ConfigPrompts.Prompt prompt = first.next(config, NOW);
        first.shown(prompt);
        first.closed(prompt, false, NOW);
        assertEquals("closed any other way than Done: not counted as read", "", memory.notice);
        assertNull("but not again in the same run, which would be a loop", first.next(config, NOW));
        ConfigPrompts second = new ConfigPrompts(memory, true, 16);
        prompt = second.next(config, NOW);
        assertNotNull("the next start", prompt);
        second.shown(prompt);
        second.closed(prompt, true, NOW);
        assertEquals("n1", memory.notice);
        assertNull(new ConfigPrompts(memory, true, 16).next(config, NOW));
    }

    @Test public void aNoticeIsOnlyForTheBuildsAndVersionsAndTimesItNames() {
        AppConfig forPlay = config(notice("n", "info", ",\"build\":\"play\",\"minVersionCode\":10,\"maxVersionCode\":16,\"until\":\"2027-02-01T00:00:00Z\""));
        assertNotNull(new ConfigPrompts(memory, true, 16).next(forPlay, NOW));
        assertNull("the website's build", new ConfigPrompts(memory, false, 16).next(forPlay, NOW));
        assertNull("a newer version", new ConfigPrompts(memory, true, 17).next(forPlay, NOW));
        assertNull("an older one", new ConfigPrompts(memory, true, 9).next(forPlay, NOW));
        assertNull("after its end", new ConfigPrompts(memory, true, 16).next(forPlay, java.time.Instant.parse("2027-02-01T00:00:00Z").toEpochMilli()));
    }

    @Test public void aNoticeComesBeforeAnUpdateAndNeverTogetherWithIt() {
        ConfigPrompts prompts = new ConfigPrompts(memory, true, 16);
        AppConfig config = config(notice("n1", "info", "") + "," + update(17, 0));
        ConfigPrompts.Prompt first = prompts.next(config, NOW);
        assertNotNull(first.notice());
        assertNull(first.update());
        prompts.shown(first);
        prompts.closed(first, true, NOW);
        ConfigPrompts.Prompt second = prompts.next(config, NOW);
        assertNull(second.notice());
        assertEquals(17, second.update().latestVersionCode());
        assertFalse(second.required());
    }

    @Test public void anUpdateIsOfferedToAGooglePlayBuildBelowTheNewestOneAndNotAgainForADayOnceLater() {
        AppConfig config = config(update(17, 0));
        ConfigPrompts prompts = new ConfigPrompts(memory, true, 16);
        ConfigPrompts.Prompt prompt = prompts.next(config, NOW);
        assertNotNull(prompt);
        prompts.shown(prompt);
        prompts.closed(prompt, false, NOW);
        assertNull("not at once", prompts.next(config, NOW + 1));
        assertNull("not the next hour", new ConfigPrompts(memory, true, 16).next(config, NOW + 3_600_000));
        assertNotNull("after a day", new ConfigPrompts(memory, true, 16).next(config, NOW + DAY));
        assertNotNull("a newer version at once", new ConfigPrompts(memory, true, 16).next(config(update(18, 0)), NOW + 1));
    }

    @Test public void anUpdateIsNeverOfferedToTheWebsitesBuildOrToTheNewestOne() {
        AppConfig config = config(update(17, 16));
        assertNull("the website's build has its own update feed", new ConfigPrompts(memory, false, 12).next(config, NOW));
        assertNull("already the newest", new ConfigPrompts(memory, true, 17).next(config, NOW));
        assertNull("newer than the website knows of", new ConfigPrompts(memory, true, 18).next(config, NOW));
    }

    @Test public void aBuildBelowTheLeastSupportedOneIsAskedAtEveryStartAndNeverTwiceInOne() {
        AppConfig config = config(update(17, 16));
        ConfigPrompts first = new ConfigPrompts(memory, true, 15);
        ConfigPrompts.Prompt prompt = first.next(config, NOW);
        assertTrue(prompt.required());
        first.shown(prompt);
        first.closed(prompt, false, NOW);
        assertNull("not twice in one run of the app", first.next(config, NOW + 1));
        assertTrue("at the next start, though the reader said Later a moment ago", new ConfigPrompts(memory, true, 15).next(config, NOW + 2).required());
    }
}
