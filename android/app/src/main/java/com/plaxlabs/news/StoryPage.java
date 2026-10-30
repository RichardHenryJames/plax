package com.plaxlabs.news;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Rect;
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
 * moves to the next story; to make that possible the picture, the tag and source line, the headline, the summary and the
 * Read full story row are measured together and share the page's height ({@link CardFit}): the summary is cut to whole lines
 * with an ellipsis, a long headline is set a little smaller, and a short page gives up the picture before the text and, as a
 * last resort, the source line (the publisher is still named on the Read full story row).
 * On a page that is much wider than it is tall (a phone on its side) the picture stands beside the text instead of above it.
 * Built in code by {@link StoryAdapter}, never inflated, so it has no constructor for tools.
 */
@SuppressLint("ViewConstructor")
final class StoryPage extends ViewGroup {
    /** A headline needing more lines than this at its usual size is set smaller; at the smallest size it may take one more. */
    private static final int HEADLINE_LINES = 4, LONG_HEADLINE_LINES = 5;
    private static final float[] HEADLINE_SCALES = {1f, .9f, .8f};
    private static final int TOP_DP = 4, BOTTOM_DP = 8, SIDE_DP = 16, GUTTER_DP = 16, TEXT_WIDTH_DP = 640, WIDE_WIDTH_DP = 840;
    private static final int HERO_MINIMUM_DP = 96, WIDE_AT_DP = 480;

    private final Ui ui;
    final FrameLayout hero;
    final TextView poster, title, body;
    final View meta, actions;
    private final float titleSp, posterSp;
    private final Rect heroBox = new Rect(), metaBox = new Rect(), titleBox = new Rect(), bodyBox = new Rect(), actionsBox = new Rect();
    private boolean wide;

    StoryPage(Context context, Ui ui, FrameLayout hero, TextView poster, View meta, TextView title, TextView body, View actions,
              float titleSp, float posterSp) {
        super(context);
        this.ui = ui; this.hero = hero; this.poster = poster; this.meta = meta; this.title = title; this.body = body;
        this.actions = actions; this.titleSp = titleSp; this.posterSp = posterSp;
        setBackgroundColor(ui.bg);
        title.setEllipsize(TextUtils.TruncateAt.END);
        body.setEllipsize(TextUtils.TruncateAt.END);
        for (View child : new View[]{hero, meta, title, body, actions}) addView(child);
    }

    /** Whether the picture is beside the text rather than above it. */
    boolean sideBySide() { return wide; }

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

        int actionsHeight = natural(actions, columnWidth), metaHeight = natural(meta, columnWidth);
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
        // The summary is measured uncut, once, so that its real lines (Devanagari lines are taller than Latin ones) decide.
        Layout uncut = null;
        int bodyNatural = 0, bodyLine = 0;
        if (hasBody) {
            setLines(body, Integer.MAX_VALUE);
            natural(body, columnWidth);
            uncut = body.getLayout();
            bodyNatural = uncut == null ? 0 : uncut.getLineCount();
            if (bodyNatural > 0) {
                int sample = Math.min(bodyNatural, CardFit.MIN_BODY_LINES);
                bodyLine = Math.max(1, ceilDiv(uncut.getLineBottom(sample - 1), sample));
            }
        }

        // A page too short for the source line, one line of the headline and the action row gives up the source line rather
        // than let the text run into the buttons; the publisher is still named on the Read full story row.
        if (hasTitle && metaHeight + actionsHeight + title.getPaddingTop() + titleLine > boxHeight) metaHeight = 0;

        int heroPreferred = wide ? 0 : Math.min((int) (columnWidth * 9 / 16f), (int) (boxHeight * .30f));
        int heroTall = wide ? 0 : Math.max(heroPreferred, Math.min((int) (heroPreferred * 1.5f), (int) (boxHeight * .42f)));
        CardFit.Plan plan = CardFit.plan(new CardFit.Input(boxHeight, metaHeight, actionsHeight,
                hasTitle ? title.getPaddingTop() : 0, titleLine, titleNatural, titleMax,
                hasBody ? body.getPaddingTop() : 0, bodyLine, bodyNatural, heroPreferred, ui.dp(HERO_MINIMUM_DP), heroTall));

        // What the headline really takes decides what is left for the summary.
        int heroHeight = wide ? boxHeight : plan.hero();
        int fixed = metaHeight + actionsHeight + (wide ? 0 : heroHeight);
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
        if (wide) heroBox.set(left, top, left + heroWidth, top + heroHeight);
        else { heroBox.set(left, y, left + heroWidth, y + heroHeight); y += heroHeight; }
        metaBox.set(columnLeft, y, columnLeft + columnWidth, y + metaHeight); y += metaHeight;
        titleBox.set(columnLeft, y, columnLeft + columnWidth, y + titleHeight); y += titleHeight;
        bodyBox.set(columnLeft, y, columnLeft + columnWidth, y + bodyHeight);
        actionsBox.set(columnLeft, top + boxHeight - actionsHeight, columnLeft + columnWidth, top + boxHeight);
    }

    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
        place(hero, heroBox); place(meta, metaBox); place(title, titleBox); place(body, bodyBox); place(actions, actionsBox);
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

    /** How many lines this text takes at this size and width, uncut. The view itself is not touched. */
    private static int lines(TextView view, float textPx, int width) {
        CharSequence text = view.getText();
        int inner = width - view.getCompoundPaddingLeft() - view.getCompoundPaddingRight();
        if (text.length() == 0 || inner <= 0) return 0;
        TextPaint paint = new TextPaint(view.getPaint());
        paint.setTextSize(textPx);
        return StaticLayout.Builder.obtain(text, 0, text.length(), paint, inner)
                .setLineSpacing(view.getLineSpacingExtra(), view.getLineSpacingMultiplier())
                .setIncludePad(view.getIncludeFontPadding())
                .setBreakStrategy(view.getBreakStrategy())
                .setHyphenationFrequency(view.getHyphenationFrequency())
                .build().getLineCount();
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
