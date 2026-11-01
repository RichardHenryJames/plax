package com.plaxlabs.news;

/**
 * How one story page spends its height. The page does not scroll, so that a single swipe always moves to the next story,
 * which means everything on it has to fit, and the page is always full: the source line and the Read full story row are always
 * there, then the headline; the picture keeps at least its minimum (a story with a picture is not left without one, nor with a
 * stamp of one), and the summary takes the rest, cut to a whole line with an ellipsis, never through the middle of one, where
 * its room ends, as in Inshorts. A short summary leaves room, and the picture takes it, up to the tallest it may be. Only a
 * page too short for the minimum picture and a few lines of summary has no picture, and before the summary is cut below three
 * lines the headline gives up lines, but never below two.
 *
 * <p>Pure arithmetic in pixels, so that it can be tested without a screen. {@link StoryPage} measures the text and applies it.
 * The website does the same, in src/lib/card-fit.ts, with the same test cases.
 */
final class CardFit {
    /** The least of the summary worth showing before the headline gives up a line to make room for it. */
    static final int MIN_BODY_LINES = 3;
    /** The headline is cut down to this many lines before the summary is dropped. */
    static final int MIN_TITLE_LINES = 2;

    /**
     * What the page knows about itself. A heading or summary that is absent has zero natural lines.
     *
     * @param height       the room for everything, without the page's padding
     * @param meta         the tag and source line with the picture above it, with the space above it
     * @param metaBare     the same line when it is the first thing on the page (no picture above it); the menu button sits at its start
     * @param actions      the Read full story row, with the space above it
     * @param titleTop     the space above the headline
     * @param titleLine    the height of one headline line
     * @param titleNatural the lines the headline needs at its width, uncut
     * @param titleMax     the most lines the headline may take
     * @param bodyTop      the space above the summary
     * @param bodyLine     the height of one summary line
     * @param bodyNatural  the lines the summary needs at its width, uncut
     * @param heroMaximum  the tallest picture worth showing in the usual case; zero when the page has no picture in this column
     * @param heroMinimum  the least a picture is given: below this the summary is cut instead, and a page that cannot hold it has no picture
     * @param heroTall     the tallest the picture may grow when the page has little to read (and when there is nothing to read under the headline)
     * @param heroKept     whether the picture is a photograph, kept at its least while the summary is cut; a poster only stands in for a
     *                     picture, and is dropped before any of the summary is cut
     */
    record Input(int height, int meta, int metaBare, int actions, int titleTop, int titleLine, int titleNatural, int titleMax,
                 int bodyTop, int bodyLine, int bodyNatural, int heroMaximum, int heroMinimum, int heroTall, boolean heroKept) {
        /** A page whose picture is a photograph. */
        Input(int height, int meta, int metaBare, int actions, int titleTop, int titleLine, int titleNatural, int titleMax,
              int bodyTop, int bodyLine, int bodyNatural, int heroMaximum, int heroMinimum, int heroTall) {
            this(height, meta, metaBare, actions, titleTop, titleLine, titleNatural, titleMax, bodyTop, bodyLine, bodyNatural,
                    heroMaximum, heroMinimum, heroTall, true);
        }
    }

    /** What to draw: the picture's height (zero for none), and how many lines of the headline and the summary. */
    record Plan(int hero, int titleLines, int bodyLines) { }

    private CardFit() { }

    static Plan plan(Input in) {
        int titleLines = Math.min(in.titleNatural(), in.titleMax());
        while (true) {
            Spent spent = spend(in, titleLines);
            // A headline is worth more than a long summary, but not worth losing the summary altogether; and a headline
            // that does not fit on the page at all has to give up lines, summary or not.
            boolean readable = in.bodyNatural() == 0 || spent.plan().bodyLines() >= Math.min(in.bodyNatural(), MIN_BODY_LINES);
            if (titleLines > 1 && (spent.room() < 0 || (!readable && titleLines > MIN_TITLE_LINES))) { titleLines--; continue; }
            return spent.plan();
        }
    }

    /** The plan for a headline of this many lines, and the room it leaves (negative when the headline itself does not fit). */
    private record Spent(Plan plan, int room) { }

    private static Spent spend(Input in, int titleLines) {
        int title = titleLines == 0 ? 0 : in.titleTop() + titleLines * in.titleLine();
        int roomWith = in.height() - in.actions() - in.meta() - title;
        int roomBare = in.height() - in.actions() - in.metaBare() - title;
        boolean picture = in.heroMaximum() > 0;

        if (in.bodyNatural() == 0) {
            int hero = Math.min(roomWith, Math.max(in.heroMaximum(), in.heroTall()));
            boolean shown = picture && hero >= in.heroMinimum();
            return new Spent(new Plan(shown ? hero : 0, titleLines, 0), shown ? roomWith : roomBare);
        }

        int line = Math.max(1, in.bodyLine());
        // The picture keeps at least its minimum, and the summary takes the rest: all of it when it fits there, else as many whole
        // lines as do, and the picture takes whatever the lines leave (less than a line more than its minimum, when the summary
        // is cut; up to the tallest it may be, when the summary is short).
        if (picture) {
            int beside = Math.floorDiv(roomWith - in.heroMinimum() - in.bodyTop(), line);
            // A photograph is kept with a few lines of summary beside it; a poster only with all of it.
            int wanted = in.heroKept() ? Math.min(in.bodyNatural(), MIN_BODY_LINES) : in.bodyNatural();
            if (beside >= wanted) {
                int lines = Math.min(in.bodyNatural(), beside);
                int hero = Math.min(roomWith - in.bodyTop() - lines * line, Math.max(in.heroMaximum(), in.heroTall()));
                return new Spent(new Plan(hero, titleLines, lines), roomWith);
            }
        }
        // No picture: the room is too short for the minimum picture and a few lines, so the summary gets what the page has.
        int fits = (roomBare - in.bodyTop()) / line;
        return new Spent(new Plan(0, titleLines, Math.min(in.bodyNatural(), Math.max(0, fits))), roomBare);
    }
}
