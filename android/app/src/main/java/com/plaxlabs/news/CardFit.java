package com.plaxlabs.news;

/**
 * How one story page spends its height. The page does not scroll, so that a single swipe always moves to the next story,
 * which means everything on it has to fit. What a reader came for is the headline and the summary, together and whole, so they
 * come first: the source line and the Read full story row are always there, then the headline, then the whole of the summary,
 * and the picture takes what is left (up to a comfortable size), or is left out when that is too little to be worth showing.
 * Only when the summary does not fit even without a picture is it cut, to whole lines, with an ellipsis, never through the
 * middle of one; before that the headline gives up lines, but never below two while the summary is worth showing.
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
     * @param heroMaximum  the tallest picture worth showing; zero when the page has no picture in this column
     * @param heroMinimum  the smallest picture worth showing
     * @param heroTall     the tallest picture when there is nothing to read under the headline
     */
    record Input(int height, int meta, int metaBare, int actions, int titleTop, int titleLine, int titleNatural, int titleMax,
                 int bodyTop, int bodyLine, int bodyNatural, int heroMaximum, int heroMinimum, int heroTall) { }

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
        // The whole summary first; the picture takes what is left of it.
        int spare = roomWith - (in.bodyTop() + in.bodyNatural() * line);
        if (picture && spare >= in.heroMinimum()) {
            return new Spent(new Plan(Math.min(spare, in.heroMaximum()), titleLines, in.bodyNatural()), roomWith);
        }
        // No picture: the summary gets what the page has, whole lines only.
        int fits = (roomBare - in.bodyTop()) / line;
        return new Spent(new Plan(0, titleLines, Math.min(in.bodyNatural(), Math.max(0, fits))), roomBare);
    }
}
