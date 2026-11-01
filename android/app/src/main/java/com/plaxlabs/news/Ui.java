package com.plaxlabs.news;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.*;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;

/** Programmatic view helpers. Every colour comes from resources so day and night themes both work. */
final class Ui {
    final int bg, surface, surfaceAlt, border, text, text2, accent, onAccent, accentText, accentSoft, skeleton, danger;
    private final Context context;
    private final float density;
    private final boolean fontPadding;

    Ui(Context context) {
        this.context = context;
        density = context.getResources().getDisplayMetrics().density;
        // Devanagari marks sit above and below the line; trimming the font padding can clip them.
        fontPadding = Language.HINDI.equals(Language.of(context.getResources().getConfiguration().getLocales().get(0)));
        bg = color(R.color.plax_bg); surface = color(R.color.plax_surface); surfaceAlt = color(R.color.plax_surface_alt);
        border = color(R.color.plax_border); text = color(R.color.plax_text); text2 = color(R.color.plax_text_2);
        accent = color(R.color.plax_accent); onAccent = color(R.color.plax_on_accent);
        accentText = color(R.color.plax_accent_text); accentSoft = color(R.color.plax_accent_soft);
        skeleton = color(R.color.plax_skeleton); danger = color(R.color.plax_danger);
    }

    private int color(int id) { return ContextCompat.getColor(context, id); }
    int dp(float size) { return Math.round(size * density); }
    float fontScale() { return context.getResources().getConfiguration().fontScale; }

    LinearLayout column() {
        LinearLayout view = new LinearLayout(context);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }

    LinearLayout row() {
        LinearLayout view = new LinearLayout(context);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    TextView text(CharSequence value, float size, int color, String family) {
        TextView view = new TextView(context);
        view.setText(value); view.setTextSize(size); view.setTextColor(color);
        view.setTypeface(Typeface.create(family, Typeface.NORMAL));
        view.setIncludeFontPadding(fontPadding);
        return view;
    }

    TextView text(CharSequence value, float size, int color, boolean bold) {
        return text(value, size, color, bold ? "sans-serif-medium" : "sans-serif");
    }

    GradientDrawable round(int color, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color); drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    GradientDrawable outline(int fill, int stroke, float radiusDp) {
        GradientDrawable drawable = round(fill, radiusDp);
        drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    /** A touch ripple clipped to the same rounded shape as the background. */
    Drawable touch(Drawable background, float radiusDp) {
        return new RippleDrawable(ColorStateList.valueOf((text & 0x00ffffff) | 0x22000000), background,
                round(Color.WHITE, radiusDp));
    }

    ImageView icon(int drawable, int tint, int sizeDp) {
        ImageView view = new ImageView(context);
        view.setImageResource(drawable); view.setColorFilter(tint);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        view.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return view;
    }

    /** A 48 dp touch target with a 24 dp glyph. */
    ImageButton iconButton(int drawable, int description, int fill, int tint, Runnable click) {
        ImageButton view = new ImageButton(context);
        view.setImageResource(drawable); view.setColorFilter(tint);
        view.setBackground(touch(round(fill, 24), 24));
        view.setContentDescription(context.getString(description));
        ViewCompat.setTooltipText(view, context.getString(description));
        view.setPadding(dp(12), dp(12), dp(12), dp(12));
        view.setOnClickListener(button -> click.run());
        view.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(48)));
        return view;
    }

    /** The width and height of the touch target of {@link #lineButton}, and the circle drawn in it. */
    static final int LINE_BUTTON_WIDTH_DP = 44, LINE_BUTTON_HEIGHT_DP = 48, LINE_BUTTON_CIRCLE_DP = 36;

    /**
     * A button for the end of a story's source line: a 36 dp circle with a 20 dp glyph, in a 44 by 48 dp touch target so three of
     * them fit beside the tag and the source on a narrow phone. The caller sets what a press does.
     */
    ImageButton lineButton(int drawable, int description, int fill, int tint) {
        ImageButton view = new ImageButton(context);
        view.setImageResource(drawable); view.setColorFilter(tint);
        int across = (LINE_BUTTON_WIDTH_DP - LINE_BUTTON_CIRCLE_DP) / 2, down = (LINE_BUTTON_HEIGHT_DP - LINE_BUTTON_CIRCLE_DP) / 2;
        view.setBackground(new RippleDrawable(ColorStateList.valueOf((text & 0x00ffffff) | 0x22000000),
                new InsetDrawable(round(fill, LINE_BUTTON_CIRCLE_DP / 2f), dp(across), dp(down), dp(across), dp(down)),
                new InsetDrawable(round(Color.WHITE, LINE_BUTTON_CIRCLE_DP / 2f), dp(across), dp(down), dp(across), dp(down))));
        view.setContentDescription(context.getString(description));
        ViewCompat.setTooltipText(view, context.getString(description));
        view.setPadding(dp(12), dp(14), dp(12), dp(14));
        view.setLayoutParams(new LinearLayout.LayoutParams(dp(LINE_BUTTON_WIDTH_DP), dp(LINE_BUTTON_HEIGHT_DP)));
        return view;
    }

    /** A touch ripple with nothing behind it, for text that can be pressed (a headline that opens the story). */
    Drawable pressable(float radiusDp) {
        return new RippleDrawable(ColorStateList.valueOf((text & 0x00ffffff) | 0x22000000), null, round(Color.WHITE, radiusDp));
    }

    /**
     * The menu button that floats over a story, where the header and the bottom bar used to be: a small circle of dark glass with a
     * white glyph, readable over any picture and on either theme. A 48 dp touch target with a 40 dp circle drawn in it.
     */
    ImageButton menuButton(Runnable click) {
        ImageButton view = new ImageButton(context);
        view.setImageResource(R.drawable.ic_menu); view.setColorFilter(Color.WHITE);
        GradientDrawable glass = new GradientDrawable();
        glass.setShape(GradientDrawable.OVAL); glass.setColor(0x8C0C0C10); glass.setStroke(dp(1), 0x29FFFFFF);
        GradientDrawable mask = new GradientDrawable();
        mask.setShape(GradientDrawable.OVAL); mask.setColor(Color.WHITE);
        int gap = dp(4);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), new InsetDrawable(glass, gap), new InsetDrawable(mask, gap)));
        view.setContentDescription(context.getString(R.string.menu));
        ViewCompat.setTooltipText(view, context.getString(R.string.menu));
        view.setPadding(dp(13), dp(13), dp(13), dp(13));
        view.setOnClickListener(button -> click.run());
        return view;
    }

    /** A selectable rounded label, 48 dp tall to touch but drawn 36 dp. */
    TextView chip(CharSequence label, Runnable click) {
        TextView view = text(label, 13, text2, true);
        view.setGravity(Gravity.CENTER);
        view.setMinHeight(dp(48));
        StateListDrawable background = new StateListDrawable();
        background.addState(new int[]{android.R.attr.state_selected}, new InsetDrawable(round(accent, 18), 0, dp(6), 0, dp(6)));
        background.addState(new int[]{}, new InsetDrawable(round(surfaceAlt, 18), 0, dp(6), 0, dp(6)));
        view.setBackground(new RippleDrawable(ColorStateList.valueOf((text & 0x00ffffff) | 0x22000000), background, null));
        // Set after the background: an inset drawable would otherwise replace the padding.
        view.setPadding(dp(16), 0, dp(16), 0);
        view.setTextColor(new ColorStateList(new int[][]{{android.R.attr.state_selected}, {}}, new int[]{onAccent, text2}));
        view.setOnClickListener(item -> click.run());
        return view;
    }

    TextView primaryButton(int label, Runnable click) {
        TextView view = text(context.getString(label), 15, onAccent, true);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(28), 0, dp(28), 0);
        view.setMinHeight(dp(52));
        view.setBackground(touch(round(accent, 16), 16));
        view.setOnClickListener(item -> click.run());
        return view;
    }

    /** A quieter button for a second choice beside {@link #primaryButton}. */
    TextView secondaryButton(CharSequence label, Runnable click) {
        TextView view = text(label, 15, accentText, true);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(28), 0, dp(28), 0);
        view.setMinHeight(dp(52));
        view.setBackground(touch(round(accentSoft, 16), 16));
        view.setOnClickListener(item -> click.run());
        return view;
    }

    /** For something that cannot be undone: an outline in the warning colour, never the accent. */
    TextView dangerButton(CharSequence label, Runnable click) {
        TextView view = text(label, 15, danger, true);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(28), 0, dp(28), 0);
        view.setMinHeight(dp(52));
        view.setBackground(touch(outline(Color.TRANSPARENT, danger, 16), 16));
        view.setOnClickListener(item -> click.run());
        return view;
    }

    /** Placeholder blocks shaped like a story card, shown while the first page is on its way. */
    View skeletonCard(boolean compact) {
        LinearLayout card = column();
        card.setPadding(dp(16), dp(8), dp(16), dp(8));
        // Explicit heights: a plain View with wrap_content would stretch to fill the whole screen.
        card.addView(block(compact ? 150 : 210, 24), new LinearLayout.LayoutParams(-1, dp(compact ? 150 : 210)));
        card.addView(block(14, 7), params(150, 14, 16));
        for (float width : new float[]{-1, -1, 240}) card.addView(block(22, 8), params(width, 22, 12));
        for (float width : new float[]{-1, -1, -1, -1, 180}) card.addView(block(14, 7), params(width, 14, 10));
        return card;
    }

    private View block(int heightDp, float radiusDp) {
        View view = new View(context);
        view.setBackground(round(skeleton, radiusDp));
        view.setMinimumHeight(dp(heightDp));
        return view;
    }

    private LinearLayout.LayoutParams params(float widthDp, int heightDp, int topDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(widthDp < 0 ? -1 : dp(widthDp), dp(heightDp));
        params.topMargin = dp(topDp);
        return params;
    }

    /** Pulses a view unless the user has turned animations off. Returns null when it did not start. */
    static ObjectAnimator pulse(View view) {
        if (!ValueAnimator.areAnimatorsEnabled()) return null;
        ObjectAnimator animator = ObjectAnimator.ofFloat(view, View.ALPHA, 1f, .45f);
        animator.setDuration(850); animator.setRepeatCount(ValueAnimator.INFINITE);
        animator.setRepeatMode(ValueAnimator.REVERSE);
        animator.start();
        return animator;
    }
}
