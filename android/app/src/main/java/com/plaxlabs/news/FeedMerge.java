package com.plaxlabs.news;

import java.util.*;

/** Turns a fresh page from the server into what the reader should see, without repeats. */
final class FeedMerge {
    /**
     * @param visible stories to show, new ones first
     * @param earlier stories already seen, withheld until the reader asks for them
     * @param fresh stories that were not on screen before this merge, to offer as "new stories"
     */
    record Result(List<Story> visible, List<Story> earlier, List<Story> fresh) { }

    static final int EARLIER_LIMIT = 200;

    private FeedMerge() { }

    /** Collapses stories about one event within a batch, keeping the first (or a pictured one if equally old). */
    static List<Story> cluster(List<Story> stories) {
        List<Story> kept = new ArrayList<>();
        List<Similarity.Print> prints = new ArrayList<>();
        outer:
        for (Story story : stories) {
            Similarity.Print print = Similarity.print(story);
            for (int index = 0; index < kept.size(); index++) {
                if (!Similarity.same(print, prints.get(index))) continue;
                Story current = kept.get(index);
                if (!current.hasImage() && story.hasImage() && sameMoment(print, prints.get(index))) {
                    kept.set(index, story); prints.set(index, print);
                }
                continue outer;
            }
            kept.add(story); prints.add(print);
        }
        return kept;
    }

    private static boolean sameMoment(Similarity.Print a, Similarity.Print b) {
        return a.published <= 0 || b.published <= 0 || Math.abs(a.published - b.published) <= Similarity.CLOSE_MS;
    }

    /** True when the list already holds this story or another outlet's version of the same event. */
    static boolean covers(List<Story> list, Story story) {
        Similarity.Print print = Similarity.print(story);
        for (Story other : list) {
            if (other.id().equals(story.id()) || Similarity.same(print, Similarity.print(other))) return true;
        }
        return false;
    }

    /**
     * A new first page: unseen stories lead, followed by anything the reader still has on screen
     * but has not viewed. Viewed stories move to {@code earlier}.
     */
    static Result replace(List<Story> visible, List<Story> earlier, List<Story> page, SeenStore seen, long now) {
        List<Story> unseen = new ArrayList<>(), seenPage = new ArrayList<>();
        for (Story story : cluster(page)) (seen.contains(story, now) ? seenPage : unseen).add(story);
        List<Story> leftover = new ArrayList<>(), viewed = new ArrayList<>();
        for (Story story : visible) (seen.contains(story, now) ? viewed : leftover).add(story);

        List<Story> next = new ArrayList<>(unseen);
        for (Story story : leftover) if (!covers(unseen, story)) next.add(story);
        List<Story> fresh = new ArrayList<>();
        for (Story story : unseen) if (!covers(visible, story)) fresh.add(story);

        List<Story> withheld = new ArrayList<>(seenPage);
        withheld.addAll(viewed);
        withheld.addAll(earlier);
        return new Result(List.copyOf(next), cap(distinct(withheld)), List.copyOf(fresh));
    }

    /** An older page: its unseen stories follow the current ones. */
    static Result append(List<Story> visible, List<Story> earlier, List<Story> page, SeenStore seen, long now) {
        List<Story> fresh = new ArrayList<>(), seenPage = new ArrayList<>();
        for (Story story : cluster(page)) {
            if (seen.contains(story, now) || covers(earlier, story)) seenPage.add(story);
            else if (!covers(visible, story)) fresh.add(story);
        }
        List<Story> next = new ArrayList<>(visible);
        next.addAll(fresh);
        List<Story> withheld = new ArrayList<>(earlier);
        withheld.addAll(seenPage);
        return new Result(List.copyOf(next), cap(distinct(withheld)), List.copyOf(fresh));
    }

    private static List<Story> distinct(List<Story> stories) {
        Set<String> ids = new HashSet<>();
        List<Story> unique = new ArrayList<>();
        for (Story story : stories) if (ids.add(story.id())) unique.add(story);
        return unique;
    }

    private static List<Story> cap(List<Story> stories) {
        return List.copyOf(stories.size() > EARLIER_LIMIT ? stories.subList(0, EARLIER_LIMIT) : stories);
    }
}
