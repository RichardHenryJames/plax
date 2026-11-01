package com.plaxlabs.news;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Rect;
import android.os.Build;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * One story, laid out so that all of it is in view at once. The page has nothing that scrolls, so a single swipe always
 * moves to the next story; to make that possible the picture, the tag and source line (with the brief, save and share buttons at
 * its right end), the headline and the summary are measured together and share the page's height ({@link CardFit}). The headline
 * and the summary come first and whole: the summary is set a little smaller before any of it is cut, the picture takes what they
 * leave (or goes, when that is too little), a long headline is set a little smaller, and only as a last resort is the summary cut to
 * whole lines with an ellipsis. The headline is the link to the full story.
 *
 * <p>There is no header, no bottom bar and no row of buttons under the text: the page has the whole screen. The menu button that
 * holds what they held floats over the picture's top-left corner; with no picture it stands at the start of the source line, which
 * makes room for it. On a page that is much wider than it is tall (a phone on its side) the picture stands beside the text instead
 * of above it. Built in code by {@link StoryAdapter}, never inflated, so it has no constructor for tools.
 */
@SuppressLint("ViewConstructor")
final class StoryPage extends ViewGroup {
    /** A headline needing more lines than this at its usual size is set smaller; at the smallest size it may take one more. */
    private static final int HEADLINE_LINES = 4, LONG_HEADLINE_LINES = 5;
    private static final float[] HEADLINE_SCALES = {1f, .9f, .8f};
    /** A summary that would otherwise be cut is first set a little smaller. */
    private static final float[] BODY_SCALES = {1f, .94f, .88f};
    private static final int TOP_DP = 8, BOTTOM_DP = 8, SIDE_DP = 16, GUTTER_DP = 16, TEXT_WIDTH_DP = 640, WIDE_WIDTH_DP = 840;
    private static final int HERO_FLOOR_DP = 96, WIDE_AT_DP = 480;
    /** The picture takes what the text leaves: at most square and 55% of the page, at least 30% of the width and a quarter of the page. */
    private static final float HERO_MAX_WIDTH = 1f, HERO_MAX_HEIGHT = .55f, HERO_MIN_WIDTH = .3f, HERO_MIN_HEIGHT = .25f;
    /** With nothing to read under the headline it may grow taller. */
    private static final float HERO_TALL_WIDTH = 1.2f, HERO_TALL_HEIGHT = .62f;
    /** The space above the source line when a picture is above it. */
    private static final int META_TOP_DP = 16;
    /** The menu button: the circle drawn, the gap after it, and how far inside the picture's corner it stands. */
    static final int MENU_DP = 40, MENU_GAP_DP = 8, MENU_INSET_DP = 8;
    /** The button is a bigger touch target than the circle drawn on it. */
    static final int MENU_TOUCH_DP = 48;

    private final Ui ui;
    final FrameLayout hero;
    final TextView poster, title, body;
    final View meta, menu;
    private final float titleSp, bodySp, posterSp;
    private final Rect heroBox = new Rect(), metaBox = new Rect(), titleBox = new Rect(), bodyBox = new Rect(), menuBox = new Rect();
    private boolean wide, pictureAbove;

    StoryPage(Context context, Ui ui, FrameLayout hero, TextView poster, View meta, TextView title, TextView body, View menu,
              float titleSp, float bodySp, float posterSp) {
        super(context);
        this.ui = ui; this.hero = hero; this.poster = poster; this.meta = meta; this.title = title; this.body = body;
        this.menu = menu; this.titleSp = titleSp; this.bodySp = bodySp; this.posterSp = posterSp;
        setBackgroundColor(ui.bg);
        title.setEllipsize(TextUtils.TruncateAt.END);
        body.setEllipsize(TextUtils.TruncateAt.END);
        // The button is first, for the screen reader (it is the first thing on every page), and above the rest, for the eye and
        // the finger: a view with a height of its own is drawn, and touched, over its siblings.
        menu.setTranslationZ(1f);
        menu.setOutlineProvider(null);
        for (View child : new View[]{menu, hero, meta, title, body}) addView(child);
    }

    /** Whether the picture is beside the text rather than above it. */
    boolean sideBySide() { return wide; }

    /** Whether a picture is drawn above the source line (not the one beside the text of a page on its side). */
    boolean pictureAbove() { return pictureAbove; }

    /** Whether the story has a summary to show. */
    boolean hasBody() { return body.getVisibility() != GONE && body.length() > 0; }

    // A measure happens when a page is made or resized, not every frame, and the plan is a few numbers.
    @SuppressLint("DrawAllocation")
    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = MeasureSpec.getSize(widthSpec);
        int height = MeasureSpec.getMode(heightSpec) == MeasureSpec.UNSPECIFIED ? ui.dp(560) : MeasureSpec.getSize(heightSpec);
        setMeasuredDimension(width, height);

        int top = ui.dp(TOP_DP), boxHeight = Math.max(0, height - top - ui.dp(BOTTOM_DP));
        int available = Math.max(0, width - 2 * ui.dp(SIDE_DP));
        wide = available >= ui.dp(WIDE_AT_DP) && Math.min(available, ui.dp(WIDE_WIDTH_DP)) >= boxHeight * 1.6f;
        int boxWidth = Math.min(available, ui.dp(wide ? WIDE_WIDTH_DP : TEXT_WIDTH_DP));
        int left = (width - boxWidth) / 2;
        int sideWidth = wide ? Math.min((int) (boxWidth * .42f), (int) (boxHeight * 1.5f)) : 0;
        int columnLeft = wide ? left + sideWidth + ui.dp(GUTTER_DP) : left;
        int columnWidth = wide ? boxWidth - sideWidth - ui.dp(GUTTER_DP) : boxWidth;

        int circle = ui.dp(MENU_DP), indent = circle + ui.dp(MENU_GAP_DP), metaTop = wide ? 0 : ui.dp(META_TOP_DP);
        // The line holds the buttons, so it is always there; it is 48 dp tall because of them.
        int metaNatural = natural(meta, columnWidth);
        int metaWith = metaTop + metaNatural;
        // With no picture above it the line is the first thing on the page, and starts after the menu button.
        int metaBare = wide ? metaNatural : Math.max(circle, natural(meta, columnWidth - indent));
        boolean hasTitle = title.getVisibility() != GONE && title.length() > 0;
        boolean hasBody = body.getVisibility() != GONE && body.length() > 0;

        // The headline is the most important text on the page, so it is set smaller before it is ever cut. The size is found by
        // counting lines on a copy of its paint, so that trying sizes does not disturb the view; the view then gives the real lines.
        int titleNatural = 0, titleMax = 0, titleLine = 0;
        if (hasTitle) {
            float titlePx = sp(titleSp);
            for (float scale : HEADLINE_SCALES) {
                titlePx = sp(titleSp) * scale;
                if (lines(title, titlePx, columnWidth) <= HEADLINE_LINES) break;
            }
            setTextPx(title, titlePx);
            setLines(title, Integer.MAX_VALUE);
            int uncutHeight = natural(title, columnWidth);
            titleNatural = title.getLayout() == null ? 1 : Math.max(1, title.getLayout().getLineCount());
            titleMax = titleNatural <= HEADLINE_LINES ? titleNatural : LONG_HEADLINE_LINES;
            titleLine = Math.max(1, ceilDiv(uncutHeight - title.getPaddingTop() - title.getPaddingBottom(), titleNatural));
        }

        int heroMaximum = wide ? 0 : Math.min((int) (columnWidth * HERO_MAX_WIDTH), (int) (boxHeight * HERO_MAX_HEIGHT));
        int heroTall = wide ? 0 : Math.max(heroMaximum, Math.min((int) (columnWidth * HERO_TALL_WIDTH), (int) (boxHeight * HERO_TALL_HEIGHT)));
        int heroMinimum = Math.max(ui.dp(HERO_FLOOR_DP), Math.min((int) (columnWidth * HERO_MIN_WIDTH), (int) (boxHeight * HERO_MIN_HEIGHT)));

        // The whole summary comes first. Only a summary that would still be cut is set a little smaller, and then smaller again;
        // its lines are counted on a copy of its paint at each size (Devanagari lines are taller than Latin ones).
        float bodyPx = sp(bodySp);
        int bodyNatural = 0, bodyLine = 0;
        CardFit.Plan plan = null;
        for (float scale : BODY_SCALES) {
            bodyPx = sp(bodySp) * scale;
            if (hasBody) {
                Layout at = layout(body, bodyPx, columnWidth);
                bodyNatural = at == null ? 0 : at.getLineCount();
                // The average of all its lines, so that the whole summary is counted at its real height even where its lines
                // differ (a Devanagari line with a vowel sign above or below is taller than one without).
                if (bodyNatural > 0) bodyLine = Math.max(1, ceilDiv(at.getLineBottom(bodyNatural - 1), bodyNatural));
            }
            plan = CardFit.plan(new CardFit.Input(boxHeight, metaWith, metaBare, 0,
                    hasTitle ? title.getPaddingTop() : 0, titleLine, titleNatural, titleMax,
                    hasBody ? body.getPaddingTop() : 0, bodyLine, bodyNatural, heroMaximum, heroMinimum, heroTall));
            if (!hasBody || plan.bodyLines() >= bodyNatural) break;
        }
        // The summary at its chosen size, measured uncut, once, so that its real lines decide what is cut.
        Layout uncut = null;
        if (hasBody) {
            setTextPx(body, bodyPx);
            setLines(body, Integer.MAX_VALUE);
            natural(body, columnWidth);
            uncut = body.getLayout();
            bodyNatural = uncut == null ? 0 : uncut.getLineCount();
        }

        // What the headline really takes decides what is left for the summary.
        int heroHeight = wide ? boxHeight : plan.hero();
        pictureAbove = !wide && heroHeight > 0;
        int fixed = (pictureAbove ? metaWith : metaBare) + (wide ? 0 : heroHeight);
        int titleHeight = 0;
        if (hasTitle) {
            int titleLines = plan.titleLines();
            // A headline given all its lines is left uncut: a layout limited to a number of lines may break them differently,
            // and so end in an ellipsis though the text would have fitted.
            setLines(title, titleLines >= titleNatural ? Integer.MAX_VALUE : titleLines);
            titleHeight = natural(title, columnWidth);
            // Only if the estimate was out and the headline still does not fit.
            while (fixed + titleHeight > boxHeight && titleLines > 1) {
                setLines(title, --titleLines);
                titleHeight = natural(title, columnWidth);
            }
        }
        int bodyHeight = 0;
        if (hasBody) {
            // Whole lines only: the most that fit under what is already placed, counted on the real layout.
            int room = boxHeight - fixed - titleHeight - body.getPaddingTop() - body.getPaddingBottom();
            int lines = 0;
            while (lines < bodyNatural && uncut.getLineBottom(lines) <= room) lines++;
            while (lines > 0) {
                // The whole summary is left uncut, for the same reason as the headline.
                setLines(body, lines >= bodyNatural ? Integer.MAX_VALUE : lines);
                bodyHeight = natural(body, columnWidth);
                if (bodyHeight <= boxHeight - fixed - titleHeight) break;
                lines--;
            }
            if (lines == 0) bodyHeight = 0;
        }

        int heroWidth = wide ? sideWidth : columnWidth;
        setTextPx(poster, Math.max(sp(8), Math.min(sp(posterSp), (wide ? Math.min(heroWidth, heroHeight) : heroHeight) * .5f)));
        hero.measure(exactly(heroWidth), exactly(heroHeight));
        int y = top;
        if (wide) {
            heroBox.set(left, top, left + heroWidth, top + heroHeight);
            metaBox.set(columnLeft, y, columnLeft + columnWidth, y + metaBare);
            y += metaBare;
        } else {
            heroBox.set(left, y, left + heroWidth, y + heroHeight);
            y += heroHeight;
            if (pictureAbove) {
                metaBox.set(columnLeft, y + metaTop, columnLeft + columnWidth, y + metaWith);
                y += metaWith;
            } else {
                metaBox.set(columnLeft + indent, y, columnLeft + columnWidth, y + metaBare);
                y += metaBare;
            }
        }
        meta.measure(exactly(metaBox.width()), exactly(metaBox.height()));
        titleBox.set(columnLeft, y, columnLeft + columnWidth, y + titleHeight); y += titleHeight;
        bodyBox.set(columnLeft, y, columnLeft + columnWidth, y + bodyHeight);

        // The button stands inside the picture's corner, or, with no picture, where the page begins.
        int touch = ui.dp(MENU_TOUCH_DP), pad = (touch - circle) / 2, inset = ui.dp(MENU_INSET_DP);
        int menuLeft = pictureAbove || wide ? heroBox.left + inset - pad : columnLeft - pad;
        int menuTop = pictureAbove || wide ? heroBox.top + inset - pad : top - pad;
        menuBox.set(menuLeft, menuTop, menuLeft + touch, menuTop + touch);
        menu.measure(exactly(touch), exactly(touch));
    }

    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
        place(hero, heroBox); place(meta, metaBox); place(title, titleBox); place(body, bodyBox);
        place(menu, menuBox);
    }

    private static void place(View view, Rect box) {
        if (view.getVisibility() != GONE) view.layout(box.left, box.top, box.right, box.bottom);
    }

    private static int ceilDiv(int amount, int by) { return (amount + by - 1) / by; }

    private float sp(float value) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value, getResources().getDisplayMetrics());
    }

    private static int exactly(int size) { return MeasureSpec.makeMeasureSpec(Math.max(0, size), MeasureSpec.EXACTLY); }

    /** The height a view wants at this width. A view that is gone takes none. */
    private static int natural(View view, int width) {
        if (view.getVisibility() == GONE) return 0;
        view.measure(exactly(width), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
        return view.getMeasuredHeight();
    }

    /** The layout this text would have at this size and width, uncut, built as the view builds its own. The view is not touched. */
    private static Layout layout(TextView view, float textPx, int width) {
        CharSequence text = view.getText();
        int inner = width - view.getCompoundPaddingLeft() - view.getCompoundPaddingRight();
        if (text.length() == 0 || inner <= 0) return null;
        TextPaint paint = new TextPaint(view.getPaint());
        paint.setTextSize(textPx);
        StaticLayout.Builder builder = StaticLayout.Builder.obtain(text, 0, text.length(), paint, inner)
                .setLineSpacing(view.getLineSpacingExtra(), view.getLineSpacingMultiplier())
                .setIncludePad(view.getIncludeFontPadding())
                .setBreakStrategy(view.getBreakStrategy())
                .setHyphenationFrequency(view.getHyphenationFrequency());
        // A text view takes the height of a line from the fallback fonts too, and Devanagari is set in one: without this the lines
        // here come out shorter than the real ones and the summary is thought to fit when it does not.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) builder.setUseLineSpacingFromFallbacks(true);
        return builder.build();
    }

    /** How many lines this text takes at this size and width, uncut. */
    private static int lines(TextView view, float textPx, int width) {
        Layout at = layout(view, textPx, width);
        return at == null ? 0 : at.getLineCount();
    }

    /** Sets only what differs: each of these asks for a new layout, which must not happen over and over while measuring. */
    private static void setLines(TextView view, int lines) {
        if (view.getMaxLines() != lines) view.setMaxLines(lines);
        if (view.getEllipsize() != TextUtils.TruncateAt.END) view.setEllipsize(TextUtils.TruncateAt.END);
    }

    private static void setTextPx(TextView view, float px) {
        if (view.getTextSize() != px) view.setTextSize(TypedValue.COMPLEX_UNIT_PX, px);
    }
}
