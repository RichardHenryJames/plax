package com.plaxlabs.news;

/**
 * How one story page spends its height. The page does not scroll, so that a single swipe always moves to the next story,
 * which means everything on it has to fit: the source line, the headline and the Read full story row always, then a few
 * lines of the summary, and the picture takes what is left, up to a comfortable size. When there is too little room the
 * picture goes first, then lines of the headline; the summary is cut to whole lines, never through the middle of one.
 *
 * <p>Pure arithmetic in pixels, so that it can be tested without a screen. {@link StoryPage} measures the text and applies it.
 */
final class CardFit {
    /** The least of the summary worth showing before the picture is given up. */
    static final int MIN_BODY_LINES = 3;
    /** The headline is cut down to this many lines before the summary is dropped. */
    static final int MIN_TITLE_LINES = 2;

    /**
     * What the page knows about itself. A heading or summary that is absent has zero natural lines.
     *
     * @param height        the room for everything, without the page's padding
     * @param meta          the tag and source line, with the space above it
     * @param actions       the Read full story row, with the space above it
     * @param titleTop      the space above the headline
     * @param titleLine     the height of one headline line
     * @param titleNatural  the lines the headline needs at its width, uncut
     * @param titleMax      the most lines the headline may take
     * @param bodyTop       the space above the summary
     * @param bodyLine      the height of one summary line
     * @param bodyNatural   the lines the summary needs at its width, uncut
     * @param heroPreferred the picture's height when there is room; zero when the page has no picture in this column
     * @param heroMinimum   the smallest picture worth showing
     * @param heroTall      the picture's height when there is nothing to read under the headline
     */
    record Input(int height, int meta, int actions, int titleTop, int titleLine, int titleNatural, int titleMax,
                 int bodyTop, int bodyLine, int bodyNatural, int heroPreferred, int heroMinimum, int heroTall) { }

    /** What to draw: the picture's height (zero for none), and how many lines of the headline and the summary. */
    record Plan(int hero, int titleLines, int bodyLines) { }

    private CardFit() { }

    static Plan plan(Input in) {
        int titleLines = Math.min(in.titleNatural(), in.titleMax());
        while (true) {
            int title = titleLines == 0 ? 0 : in.titleTop() + titleLines * in.titleLine();
            int room = in.height() - in.actions() - in.meta() - title;
            Plan plan = spend(in, room, titleLines);
            // A headline is worth more than a long summary, but not worth losing the summary altogether; and a headline
            // that does not fit on the page at all has to give up lines, summary or not.
            boolean readable = in.bodyNatural() == 0 || plan.bodyLines() >= Math.min(in.bodyNatural(), 2);
            if (titleLines > 1 && (room < 0 || (!readable && titleLines > MIN_TITLE_LINES))) { titleLines--; continue; }
            return plan;
        }
    }

    private static Plan spend(Input in, int room, int titleLines) {
        if (in.bodyNatural() == 0) {
            int hero = Math.min(room, in.heroTall());
            return new Plan(in.heroPreferred() == 0 || hero < in.heroMinimum() ? 0 : hero, titleLines, 0);
        }
        int line = Math.max(1, in.bodyLine());
        int wanted = in.bodyTop() + Math.min(in.bodyNatural(), MIN_BODY_LINES) * line;
        int hero = Math.min(in.heroPreferred(), room - wanted);
        if (hero < in.heroMinimum()) hero = 0;
        int bodyRoom = room - hero - in.bodyTop();
        return new Plan(hero, titleLines, Math.max(0, bodyRoom / line));
    }
}
