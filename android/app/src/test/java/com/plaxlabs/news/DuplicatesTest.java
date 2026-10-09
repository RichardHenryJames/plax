package com.plaxlabs.news;

import org.junit.Test;
import java.io.IOException;
import java.util.*;
import static org.junit.Assert.*;

public class DuplicatesTest {
    private static final long HOUR = 3_600_000, NOW = 1_800_000_000_000L;

    private static Story story(String id, String title, long publishedHoursAgo) {
        return new Story(id, title, "A short summary of " + id, "news", "", "Outlet " + id, "https://example.com/" + id,
                "", "", publishedHoursAgo < 0 ? 0 : NOW - publishedHoursAgo * HOUR);
    }

    private static Story withImage(Story story) {
        return new Story(story.id(), story.title(), story.content(), story.category(), story.section(), story.source(),
                story.sourceUrl(), "https://img.example.com/" + story.id() + ".jpg", story.readTime(), story.publishedAt());
    }

    private static boolean same(Story a, Story b) { return Similarity.same(Similarity.print(a), Similarity.print(b)); }

    @Test public void oneEventWordedDifferentlyByEachOutletIsRecognised() {
        Story a = story("a", "Lena Okafor wins Nobel Peace Prize", 5);
        Story b = story("b", "South African human rights lawyer Lena Okafor wins the Nobel Peace Prize", 4);
        Story c = story("c", "Indian-Origin Lena Okafor Awarded Nobel Peace Prize 2026", 5);
        Story d = story("d", "Nobel chair admits they haven't reached Peace Prize winner Okafor", 4);
        for (Story x : List.of(a, b, c, d)) for (Story y : List.of(a, b, c, d)) assertTrue(x.id() + y.id(), same(x, y));
    }

    @Test public void similarTemplatesAboutDifferentEventsAreNotMerged() {
        assertFalse(same(story("a", "7 workers killed, 20 injured as pickup collides with truck in Oakvale", 2),
                story("b", "Driver Killed, 12 Injured After Bus Collides With Truck In Marrow Bay", 2)));
        assertFalse("A prize and a year are not an event",
                same(story("a", "Nobel Prize 2026: Three Science Discoveries That Sound Like Fiction", 1),
                        story("b", "Lena Okafor wins Nobel Peace Prize", 1)));
        assertFalse("Two different Nobel winners",
                same(story("a", "Anne Carson wins Nobel Literature Prize", 1), story("b", "Lena Okafor wins Nobel Peace Prize", 1)));
        assertFalse(same(story("a", "Stocks making the biggest moves premarket: Alder, Birch, Cedar, Dune", 4),
                story("b", "Stocks making the biggest moves midday: Goldwyn, Hartley, Ivy, Jorvik", 1)));
    }

    @Test public void liveBlogUpdatesAreOneEventButTheNextDaysBlogIsNot() {
        Story morning = story("a", "Sensex today | Stock Market Live: Sensex gains over 879 points, Nifty tops 22,520", 3);
        Story noon = story("b", "Stock Market LIVE Updates, Sensex Today: Sensex gains nearly 1,000 points, Nifty tops 22,540", 1);
        Story nextDay = story("c", "Sensex today | Stock Market Live: Sensex gains over 450 points, Nifty tops 22,880", -1);
        assertTrue(same(morning, noon));
        Story yesterday = story("d", "Sensex today | Stock Market Live: Sensex gains over 879 points, Nifty tops 22,520", 27);
        Story today = story("e", "Sensex today | Stock Market Live: Sensex gains over 450 points, Nifty tops 22,880", 3);
        assertFalse("A recurring headline a day later is new", same(yesterday, today));
        assertTrue("Unknown publish times fall back to wording alone", same(morning, nextDay));
    }

    @Test public void identicalHeadlinesMatchOnlyWhenTheyAreTimelyOrExactlyEqual() {
        Story fact = new Story("f1", "Octopuses have three hearts and blue blood", "Body one", "nature", "", "Wikipedia", "", "", "", 0);
        Story same = new Story("f2", "Octopuses have three hearts and blue blood!", "Body two", "nature", "", "Wikipedia", "", "", "", 0);
        Story related = new Story("f3", "Why octopuses have three hearts and bright blue blood explained", "Body three", "nature", "", "Wikipedia", "", "", "", 0);
        assertTrue(same(fact, same));
        assertFalse("Evergreen facts are never merged by overlap", same(fact, related));
    }

    @Test public void hindiHeadlinesAreComparedLikeEnglishOnes() {
        Story a = story("a", "दिल्ली मेट्रो बंद करने पर सुप्रीम कोर्ट की सख़्त टिप्पणी, प्रदर्शन के लिए मार्ग खुले रखें", 2);
        Story b = story("b", "सुप्रीम कोर्ट ने दिल्ली मेट्रो पूरी तरह बंद करने पर जताई आपत्ति, प्रदर्शन के मार्ग", 2);
        Story c = story("c", "भारतीय टीम ने श्रीलंका को तीसरे वनडे में हराकर सीरीज़ जीती", 2);
        assertTrue(same(a, b));
        assertFalse(same(a, c));
    }

    @Test public void seenStoryIsRecognisedAgainAndSoIsAnotherOutletsVersion() {
        SeenStore seen = new SeenStore();
        Story first = story("a", "Lena Okafor wins Nobel Peace Prize", 5);
        assertFalse(seen.contains(first, NOW));
        assertTrue(seen.mark(first, NOW));
        assertFalse("Marking twice changes nothing", seen.mark(first, NOW));
        assertTrue(seen.contains(first, NOW));
        assertTrue(seen.contains(story("a", "Edited headline that shares nothing at all", 5), NOW));
        assertTrue(seen.contains(story("b", "South African lawyer Lena Okafor wins the Nobel Peace Prize", 4), NOW));
        assertFalse(seen.contains(story("c", "Anne Carson wins Nobel Literature Prize", 4), NOW));
        assertEquals(1, seen.size());
    }

    @Test public void seenHistoryRoundTripsAndForgetsOldEntries() throws Exception {
        SeenStore seen = new SeenStore();
        seen.mark(story("old", "Harbour bridge reopens after three year repair programme", 1), NOW - 31 * 24 * HOUR);
        seen.mark(story("new", "Lena Okafor wins Nobel Peace Prize", 2), NOW);
        SeenStore reloaded = SeenStore.fromJson(seen.toJson(), NOW);
        assertEquals("Entries older than 30 days are dropped", 1, reloaded.size());
        assertTrue(reloaded.contains(story("new", "Lena Okafor wins Nobel Peace Prize", 2), NOW));
        assertTrue("The wording fingerprint survives a restart",
                reloaded.contains(story("other", "South African lawyer Lena Okafor wins the Nobel Peace Prize", 1), NOW));
        assertEquals(List.of("new"), reloaded.recentIds(5));
    }

    @Test public void seenHistoryIsBoundedAndNewestIdsComeFirst() {
        SeenStore seen = new SeenStore();
        for (int index = 0; index < SeenStore.LIMIT + 50; index++)
            seen.mark(story("s" + index, headline(index), -1), NOW + index);
        assertEquals(SeenStore.LIMIT, seen.size());
        assertEquals(List.of("s1549", "s1548", "s1547"), seen.recentIds(3));
    }

    @Test public void aStoryWhoseIdCouldNotBeReadBackIsNeverRecorded() throws Exception {
        SeenStore seen = new SeenStore();
        assertFalse(seen.mark(story("", "Lena Okafor wins Nobel Peace Prize", 1), NOW));
        assertFalse(seen.mark(story("x".repeat(201), "Lena Okafor wins Nobel Peace Prize", 1), NOW));
        assertEquals(0, seen.size());
        assertTrue(seen.mark(story("x".repeat(200), "Lena Okafor wins Nobel Peace Prize", 1), NOW));
        assertEquals("What was recorded can always be read back", 1, SeenStore.fromJson(seen.toJson(), NOW).size());
    }

    @Test public void damagedSeenHistoryIsRejectedNotTrusted() {
        for (String invalid : List.of("", "[]", "{\"schema\":2,\"seen\":[]}", "{\"schema\":1}", "{\"schema\":1,\"seen\":[{}]}",
                "{\"schema\":1,\"seen\":[{\"id\":\"\",\"k\":\"x\",\"p\":0,\"t\":1,\"n\":true}]}",
                "{\"schema\":1,\"seen\":[{\"id\":\"a\",\"k\":\"x\",\"p\":-5,\"t\":1,\"n\":true}]}"))
            assertThrows(invalid, IOException.class, () -> SeenStore.fromJson(invalid, NOW));
    }

    @Test public void aPageShowsOnlyUnseenStoriesAndWithholdsTheRest() {
        SeenStore seen = new SeenStore();
        Story read1 = story("r1", "Harbour bridge reopens after three year repair programme", 6);
        Story read2 = story("r2", "Council approves riverside housing development despite objections", 5);
        seen.mark(read1, NOW); seen.mark(read2, NOW);
        Story fresh1 = story("n1", "Glacier survey finds Himalayan ice melting faster than models predicted", 2);
        Story fresh2 = story("n2", "Central bank holds interest rates steady citing inflation worries", 1);
        FeedMerge.Result result = FeedMerge.replace(List.of(), List.of(), List.of(fresh2, read1, fresh1, read2), seen, NOW);
        assertEquals(List.of("n2", "n1"), ids(result.visible()));
        assertEquals(List.of("r1", "r2"), ids(result.earlier()));
        assertEquals(List.of("n2", "n1"), ids(result.fresh()));
    }

    @Test public void reopeningTheSamePageShowsNothingNew() {
        SeenStore seen = new SeenStore();
        List<Story> page = new ArrayList<>();
        for (int index = 0; index < 6; index++) page.add(story("p" + index, headline(index), index));
        for (Story story : page) seen.mark(story, NOW);
        FeedMerge.Result result = FeedMerge.replace(List.of(), List.of(), page, seen, NOW + HOUR);
        assertTrue(result.visible().isEmpty());
        assertEquals(6, result.earlier().size());
        assertTrue(result.fresh().isEmpty());
    }

    @Test public void storiesStillOnScreenButNotViewedStayAndViewedOnesMoveAway() {
        SeenStore seen = new SeenStore();
        Story viewed = story("a", "Harbour bridge reopens after three year repair programme", 6);
        Story waiting = story("b", "Council approves riverside housing development despite objections", 5);
        seen.mark(viewed, NOW);
        Story arrival = story("c", "Glacier survey finds Himalayan ice melting faster than models predicted", 1);
        FeedMerge.Result result = FeedMerge.replace(List.of(viewed, waiting), List.of(), List.of(arrival, waiting), seen, NOW);
        assertEquals(List.of("c", "b"), ids(result.visible()));
        assertEquals(List.of("a"), ids(result.earlier()));
        assertEquals("Only the arrival is new to the reader", List.of("c"), ids(result.fresh()));
    }

    @Test public void anOlderPageAppendsOnlyWhatIsNewAndKeepsWhatWasSeenAside() {
        SeenStore seen = new SeenStore();
        Story current = story("a", "Harbour bridge reopens after three year repair programme", 3);
        Story repeat = story("b", "Council approves riverside housing development despite objections", 20);
        seen.mark(repeat, NOW);
        Story older = story("c", "Glacier survey finds Himalayan ice melting faster than models predicted", 22);
        Story sameEvent = story("d", "Harbour bridge finally reopens following three year programme of repairs", 2);
        FeedMerge.Result result = FeedMerge.append(List.of(current), List.of(), List.of(repeat, older, sameEvent), seen, NOW);
        assertEquals(List.of("a", "c"), ids(result.visible()));
        assertEquals(List.of("b"), ids(result.earlier()));
        assertEquals(List.of("c"), ids(result.fresh()));
    }

    @Test public void clusteringKeepsOneStoryPerEventAndPrefersAPicturedVersion() {
        Story plain = story("a", "Lena Okafor wins Nobel Peace Prize", 5);
        Story pictured = withImage(story("b", "South African human rights lawyer Lena Okafor wins the Nobel Peace Prize", 5));
        Story other = story("c", "Anne Carson wins Nobel Literature Prize", 5);
        assertEquals(List.of("b", "c"), ids(FeedMerge.cluster(List.of(plain, pictured, other))));
        Story hoursLater = withImage(story("d", "South African lawyer Lena Okafor wins Nobel Peace Prize", 0));
        assertEquals("A later story is not swapped in", List.of("a", "c"), ids(FeedMerge.cluster(List.of(plain, other, hoursLater))));
    }

    @Test public void similarityIsFastEnoughForALargeHistory() {
        SeenStore seen = new SeenStore();
        for (int index = 0; index < SeenStore.LIMIT; index++)
            seen.mark(story("s" + index, headline(index), index % 400), NOW);
        List<Story> page = new ArrayList<>();
        for (int index = 0; index < 100; index++) page.add(story("n" + index, headline(5000 + index), index));
        assertEquals(SeenStore.LIMIT, seen.size());
        long started = System.nanoTime();
        FeedMerge.Result result = FeedMerge.replace(List.of(), List.of(), page, seen, NOW);
        assertTrue("Merging a page must not stall a worker", (System.nanoTime() - started) / 1_000_000 < 1500);
        assertEquals(100, result.visible().size());
    }

    /** Five words that no other index shares, so unrelated test stories never count as one event. */
    private static String headline(int index) {
        StringBuilder text = new StringBuilder();
        for (int part = 1; part <= 5; part++) text.append(Integer.toString(index * 7919 + part * 104729, 36)).append("q ");
        return text.toString().strip();
    }

    private static List<String> ids(List<Story> stories) {
        List<String> ids = new ArrayList<>();
        for (Story story : stories) ids.add(story.id());
        return ids;
    }
}
