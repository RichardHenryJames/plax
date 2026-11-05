package com.plaxlabs.news;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Keeping the website's configuration: what is in force, what is kept on the phone, and when the website is asked. Everything the store
 * touches is replaced, so nothing here depends on the network, the disk or the clock.
 */
public class AppConfigStoreTest {
    private static final String ADS_OFF = "{\"schemaVersion\":1,\"features\":{\"ads\":false}}";
    private static final String DEEPER_OFF = "{\"schemaVersion\":1,\"features\":{\"deeper\":false}}";

    private static byte[] bytes(String text) { return text.getBytes(StandardCharsets.UTF_8); }

    private static final class Disk implements AppConfigStore.Disk {
        byte[] kept;
        int writes, deletes;
        boolean failToWrite;
        @Override public byte[] read() { return kept; }
        @Override public void write(byte[] data) throws IOException {
            if (failToWrite) throw new IOException("disk full");
            kept = data; writes++;
        }
        @Override public void delete() { kept = null; deletes++; }
    }

    private static final class Memory implements AppConfigStore.Memory {
        long attempted, succeeded;
        @Override public long attempted() { return attempted; }
        @Override public long succeeded() { return succeeded; }
        @Override public void attempted(long at) { attempted = at; }
        @Override public void succeeded(long at) { succeeded = at; }
    }

    private final Disk disk = new Disk();
    private final Memory memory = new Memory();
    private final AtomicInteger asked = new AtomicInteger();
    private final List<AppConfig> told = new ArrayList<>();
    private final Deque<Runnable> workerQueue = new ArrayDeque<>();
    private volatile Object answer = bytes(ADS_OFF);
    private long now = 1_000_000_000_000L;

    @After public void putTheBuiltInValuesBack() { AppConfigStore.force(null); }

    private AppConfigStore store() {
        AppConfigStore.Source source = () -> {
            asked.incrementAndGet();
            if (answer instanceof IOException failure) throw failure;
            return (byte[]) answer;
        };
        Executor worker = workerQueue::add;
        AppConfigStore store = new AppConfigStore(source, disk, memory, worker, Runnable::run, () -> now);
        store.listen(told::add);
        return store;
    }

    private void runWorker() { while (!workerQueue.isEmpty()) workerQueue.poll().run(); }

    @Test public void withNothingKeptTheBuiltInValuesAreInForce() {
        store().load();
        assertSame(AppConfig.defaults(), AppConfigStore.active());
        assertEquals(0, disk.deletes);
    }

    @Test public void theFileKeptFromLastTimeIsInForceFromTheStart() {
        disk.kept = bytes(ADS_OFF);
        store().load();
        assertFalse(AppConfigStore.active().features().ads());
        assertTrue(AppConfigStore.active().features().deeper());
    }

    @Test public void aFileKeptThatIsNoLongerGoodIsDeletedAndTheBuiltInValuesStay() {
        disk.kept = bytes("{\"schemaVersion\":9}");
        store().load();
        assertSame(AppConfig.defaults(), AppConfigStore.active());
        assertNull(disk.kept);
        assertEquals(1, disk.deletes);
    }

    @Test public void aFileTheWebsiteSendsIsKeptAndPutInForceAndAnnounced() {
        AppConfigStore store = store();
        store.load();
        store.refresh(false);
        assertEquals("the request is not made on the main thread", 0, asked.get());
        runWorker();
        assertEquals(1, asked.get());
        assertFalse(AppConfigStore.active().features().ads());
        assertEquals(1, told.size());
        assertArrayEquals("kept for the next start", bytes(ADS_OFF), disk.kept);
        assertEquals(now, memory.attempted);
        assertEquals(now, memory.succeeded);
    }

    @Test public void aFileThatSaysNothingNewIsNeitherWrittenAgainNorAnnounced() {
        disk.kept = bytes(ADS_OFF);
        AppConfigStore store = store();
        store.load();
        store.refresh(true);
        runWorker();
        assertEquals(1, asked.get());
        assertEquals("not written again", 0, disk.writes);
        assertTrue("nothing to announce", told.isEmpty());
        assertEquals("but the website did answer", now, memory.succeeded);
    }

    @Test public void aChangedFileIsAnnouncedOnce() {
        AppConfigStore store = store();
        store.refresh(true); runWorker();
        answer = bytes(DEEPER_OFF);
        store.refresh(true); runWorker();
        assertEquals(2, told.size());
        assertTrue(AppConfigStore.active().features().ads());
        assertFalse("what the website says now replaces what it said", AppConfigStore.active().features().deeper());
        assertEquals(2, disk.writes);
    }

    @Test public void anAnswerThatFailsOrIsNotUsableChangesNothing() {
        disk.kept = bytes(ADS_OFF);
        AppConfigStore store = store();
        store.load();
        for (Object bad : new Object[]{new IOException("offline"), bytes("{\"schemaVersion\":2}"), bytes("not json"), new byte[0],
                bytes("{\"schemaVersion\":1,\"features\":{\"ads\":false}} trailing")}) {
            answer = bad;
            now += AppConfigStore.CHECK_INTERVAL;
            store.refresh(false); runWorker();
            assertFalse("the file taken before stays", AppConfigStore.active().features().ads());
            assertArrayEquals(bytes(ADS_OFF), disk.kept);
        }
        assertTrue(told.isEmpty());
        assertEquals("never counted as an answer", 0, memory.succeeded);
    }

    @Test public void aFileThatCouldNotBeWrittenIsStillInForceForNow() {
        disk.failToWrite = true;
        AppConfigStore store = store();
        store.refresh(true); runWorker();
        assertFalse(AppConfigStore.active().features().ads());
        assertEquals(1, told.size());
    }

    @Test public void theWebsiteIsAskedAtMostEveryFewHoursAndAFailedAskIsNotRepeatedForHalfAnHour() {
        AppConfigStore store = store();
        store.refresh(false); runWorker();
        assertEquals(1, asked.get());
        now += AppConfigStore.CHECK_INTERVAL - 1;
        store.refresh(false); runWorker();
        assertEquals("not yet", 1, asked.get());
        now += 1;
        answer = new IOException("offline");
        store.refresh(false); runWorker();
        assertEquals("a few hours have passed", 2, asked.get());
        now += AppConfigStore.RETRY_INTERVAL - 1;
        store.refresh(false); runWorker();
        assertEquals("a failed ask is not repeated at once", 2, asked.get());
        now += 1;
        store.refresh(false); runWorker();
        assertEquals("but half an hour later it is", 3, asked.get());
    }

    @Test public void theReaderOrTheOwnerCanAskAtOnce() {
        AppConfigStore store = store();
        store.refresh(false); runWorker();
        store.refresh(true); runWorker();
        assertEquals(2, asked.get());
    }

    @Test public void twoAsksAreNotMadeAtTheSameTime() {
        AppConfigStore store = store();
        store.refresh(true);
        store.refresh(true);
        store.refresh(true);
        assertEquals("one is waiting for the worker", 1, workerQueue.size());
        runWorker();
        assertEquals(1, asked.get());
        store.refresh(true); runWorker();
        assertEquals("and when it has answered another may start", 2, asked.get());
    }

    @Test public void aClockThatWentBackwardsDoesNotKeepTheWebsiteFromBeingAsked() {
        assertTrue(AppConfigStore.due(1_000, 5_000, 5_000));
        assertTrue(AppConfigStore.due(1_000, 0, 0));
        assertFalse("asked and answered a minute ago", AppConfigStore.due(60_000, 0, 1));
        assertFalse(AppConfigStore.due(AppConfigStore.CHECK_INTERVAL - 1, 0, 1));
    }

    @Test public void aListenerThatLeftIsNotToldAgain() {
        AppConfigStore store = store();
        List<AppConfig> other = new ArrayList<>();
        AppConfigStore.Listener listener = other::add;
        store.listen(listener);
        store.unlisten(listener);
        store.refresh(true); runWorker();
        assertTrue(other.isEmpty());
        assertEquals(1, told.size());
    }

    @Test public void theBuiltInValuesCanBeBroughtBackForATest() {
        AppConfigStore.force(AppConfig.defaults());
        assertSame(AppConfig.defaults(), AppConfigStore.active());
    }
}
