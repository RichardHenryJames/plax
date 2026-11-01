package com.plaxlabs.news;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * The menu: everything the header and the bottom bar used to hold, in one panel that slides in from the left when the menu
 * button is pressed. The feed language, the four places (Feed, For you, Topics, Saved), the news sections, the account, theme,
 * About, Contact us, the privacy policy, the update check and clearing saved stories. Nothing in it repeats what is a tap away
 * elsewhere: looking for new stories happens by itself and on the caught-up card, choosing topics is the card on the Topics
 * screen and a row in the account sheet, and the website is in the account sheet. With it out of the way a story has the whole
 * screen, as in Inshorts. A swipe to the left, the close button, the back button or a tap outside closes it.
 */
final class MenuSheet {
    interface Actions {
        void screen(FeedViewModel.Screen screen);
        void language(String language);
        void section(String id);
        void account();
        void theme();
        void about();
        void contact();
        void privacy();
        void update();
        void clearSaved();
    }

    /** The news sections, as the story tags and the old header had them: id ("" is all) and its label. */
    private static final String[] SECTION_IDS = {"", "india", "world", "tech", "business", "science"};
    private static final int[] SECTION_LABELS = {R.string.all, R.string.section_india, R.string.section_world, R.string.section_tech,
            R.string.section_business, R.string.section_science};
    private static final int WIDTH_DP = 320;

    final Dialog dialog;
    private final Ui ui;
    private final AppCompatActivity activity;
    private final Actions actions;

    private MenuSheet(AppCompatActivity activity, Ui ui, FeedViewModel.State state, boolean storeBuild, Actions actions) {
        this.activity = activity; this.ui = ui; this.actions = actions;
        dialog = new Dialog(activity, R.style.Theme_Plax_Menu);
        int width = Math.min(ui.dp(WIDTH_DP), Math.round(activity.getResources().getDisplayMetrics().widthPixels * .86f));

        LinearLayout panel = ui.column();
        panel.setBackgroundColor(ui.surface);
        ViewCompat.setAccessibilityPaneTitle(panel, activity.getString(R.string.menu));

        LinearLayout header = ui.row();
        header.setPadding(ui.dp(20), 0, ui.dp(4), 0);
        header.setMinimumHeight(ui.dp(56));
        header.addView(ui.icon(R.drawable.ic_plax, ui.text, 28));
        TextView name = ui.text(activity.getString(R.string.app_name), 22, ui.text, "serif");
        name.setTypeface(Typeface.create("serif", Typeface.BOLD));
        name.setPadding(ui.dp(8), 0, 0, 0);
        header.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(ui.iconButton(R.drawable.ic_close, R.string.close_menu, Color.TRANSPARENT, ui.text, this::dismiss));
        panel.addView(header);

        LinearLayout list = ui.column();
        list.setPadding(ui.dp(8), 0, ui.dp(8), ui.dp(16));

        // The feed language: the two words, as the old header's toggle read.
        list.addView(heading(R.string.feed_language));
        list.addView(languages(state.lang()));

        // The four places, as the bottom bar had them.
        FeedViewModel.Screen[] screens = FeedViewModel.Screen.values();
        int[] icons = {R.drawable.ic_feed, R.drawable.ic_star, R.drawable.ic_grid, R.drawable.ic_bookmark};
        int[] labels = {R.string.feed, R.string.for_you, R.string.topics, R.string.saved};
        LinearLayout places = ui.column();
        LinearLayout.LayoutParams placesSize = new LinearLayout.LayoutParams(-1, -2);
        placesSize.topMargin = ui.dp(12);
        for (int index = 0; index < screens.length; index++) {
            FeedViewModel.Screen screen = screens[index];
            places.addView(row(icons[index], activity.getString(labels[index]), screen == state.screen(), () -> actions.screen(screen)));
        }
        list.addView(places, placesSize);

        // Hindi cards carry no section tag, so the sections only apply to English headlines.
        if (state.screen() == FeedViewModel.Screen.FEED && state.topic() == Topic.NEWS && Language.ENGLISH.equals(state.lang())) {
            list.addView(heading(R.string.sections));
            Flow flow = new Flow(activity);
            flow.setPadding(ui.dp(8), 0, ui.dp(8), 0);
            for (int index = 0; index < SECTION_IDS.length; index++) {
                String id = SECTION_IDS[index];
                TextView chip = ui.chip(activity.getString(SECTION_LABELS[index]), () -> { dismiss(); actions.section(id); });
                chip.setSelected(id.equals(state.section()));
                LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(-2, -2);
                gap.setMarginEnd(ui.dp(2));
                flow.addView(chip, gap);
            }
            list.addView(flow);
        }

        list.addView(divider());
        list.addView(row(R.drawable.ic_person, activity.getString(R.string.account), false, actions::account));
        list.addView(row(R.drawable.ic_theme, activity.getString(R.string.theme), false, actions::theme));
        list.addView(divider());
        list.addView(row(R.drawable.ic_info, activity.getString(R.string.about), false, actions::about));
        list.addView(row(R.drawable.ic_mail, activity.getString(R.string.contact_us), false, actions::contact));
        list.addView(row(R.drawable.ic_shield, activity.getString(R.string.privacy_policy), false, actions::privacy));
        list.addView(row(R.drawable.ic_download, activity.getString(storeBuild ? R.string.update_play : R.string.update_check), false, actions::update));
        list.addView(row(R.drawable.ic_trash, activity.getString(R.string.clear_saved), false, actions::clearSaved));

        ScrollView scroll = new ScrollView(activity);
        scroll.setVerticalScrollBarEnabled(false);
        // The list scrolls under the navigation bar rather than stopping above it; its last row comes clear of it.
        scroll.setClipToPadding(false);
        scroll.addView(list);
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        View edge = new View(activity);
        edge.setBackgroundColor(ui.border);
        FrameLayout side = new FrameLayout(activity);
        side.addView(panel, new FrameLayout.LayoutParams(-1, -1));
        side.addView(edge, new FrameLayout.LayoutParams(ui.dp(1), -1, Gravity.END));

        // The window is the whole screen; what is beside the panel closes it when touched, and a swipe to the left anywhere does.
        View outside = new View(activity);
        outside.setOnClickListener(view -> dismiss());
        outside.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        SwipeAway frame = new SwipeAway(activity, ui.dp(60), this::dismiss);
        frame.addView(outside, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(side, new FrameLayout.LayoutParams(width, -1, Gravity.START));
        ViewCompat.setOnApplyWindowInsetsListener(frame, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            panel.setPadding(0, bars.top, 0, 0);
            scroll.setPadding(0, 0, 0, bars.bottom);
            return insets;
        });

        dialog.setContentView(frame, new ViewGroup.LayoutParams(-1, -1));
        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(-1, -1);
            WindowCompat.setDecorFitsSystemWindows(window, false);
            // The bars keep the look they have over the story, so their icons stay readable on the panel.
            Window screen = activity.getWindow();
            WindowInsetsControllerCompat under = WindowCompat.getInsetsController(screen, screen.getDecorView());
            WindowInsetsControllerCompat over = WindowCompat.getInsetsController(window, window.getDecorView());
            over.setAppearanceLightStatusBars(under.isAppearanceLightStatusBars());
            over.setAppearanceLightNavigationBars(under.isAppearanceLightNavigationBars());
        }
    }

    static MenuSheet show(AppCompatActivity activity, Ui ui, FeedViewModel.State state, boolean storeBuild, Actions actions) {
        MenuSheet sheet = new MenuSheet(activity, ui, state, storeBuild, actions);
        sheet.dialog.show();
        return sheet;
    }

    boolean isShowing() { return dialog.isShowing(); }
    void dismiss() { dialog.dismiss(); }

    private TextView heading(int label) {
        TextView view = ui.text(activity.getString(label).toUpperCase(activity.getResources().getConfiguration().getLocales().get(0)), 11, ui.text2, true);
        view.setLetterSpacing(.06f);
        view.setPadding(ui.dp(12), ui.dp(18), ui.dp(12), ui.dp(8));
        ViewCompat.setAccessibilityHeading(view, true);
        return view;
    }

    private View divider() {
        View line = new View(activity);
        line.setBackgroundColor(ui.border);
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, ui.dp(1));
        size.setMargins(ui.dp(4), ui.dp(12), ui.dp(4), ui.dp(8));
        line.setLayoutParams(size);
        return line;
    }

    private View languages(String current) {
        LinearLayout switcher = ui.row();
        switcher.setBackground(ui.outline(ui.surfaceAlt, ui.border, 24));
        switcher.setPadding(ui.dp(3), ui.dp(3), ui.dp(3), ui.dp(3));
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2);
        size.setMargins(ui.dp(4), 0, ui.dp(4), 0);
        switcher.setLayoutParams(size);
        switcher.addView(segment(activity.getString(R.string.language_english), activity.getString(R.string.read_in_english), Language.ENGLISH, current));
        switcher.addView(segment(activity.getString(R.string.language_hindi), activity.getString(R.string.read_in_hindi), Language.HINDI, current));
        return switcher;
    }

    private TextView segment(String label, String description, String language, String current) {
        TextView view = ui.text(label, 14, ui.text2, true);
        view.setGravity(Gravity.CENTER);
        view.setMinHeight(ui.dp(44));
        StateListDrawable background = new StateListDrawable();
        background.addState(new int[]{android.R.attr.state_selected}, ui.round(ui.accent, 20));
        background.addState(new int[]{}, new ColorDrawable(Color.TRANSPARENT));
        view.setBackground(background);
        view.setTextColor(new android.content.res.ColorStateList(
                new int[][]{{android.R.attr.state_selected}, {}}, new int[]{ui.onAccent, ui.text2}));
        view.setContentDescription(description);
        view.setSelected(language.equals(current));
        view.setOnClickListener(item -> {
            dismiss();
            if (!Language.current().equals(language)) actions.language(language);
        });
        view.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1));
        return view;
    }

    /** One line of the menu: a glyph and a label, 48 dp tall to touch; the place the reader is in is marked. */
    private View row(int icon, CharSequence label, boolean selected, Runnable action) {
        LinearLayout row = ui.row();
        row.setMinimumHeight(ui.dp(48));
        row.setPadding(ui.dp(12), 0, ui.dp(12), 0);
        row.setClickable(true); row.setFocusable(true);
        row.setBackground(ui.touch(selected ? ui.round(ui.accentSoft, 14) : new ColorDrawable(Color.TRANSPARENT), 14));
        row.setSelected(selected);
        row.addView(ui.icon(icon, selected ? ui.accentText : ui.text2, 22));
        TextView text = ui.text(label, 15, ui.text, selected);
        text.setPadding(ui.dp(14), ui.dp(6), 0, ui.dp(6));
        row.addView(text, new LinearLayout.LayoutParams(0, -2, 1));
        row.setOnClickListener(view -> { dismiss(); action.run(); });
        return row;
    }

    /** A panel that closes itself when the reader swipes it back to the left, whatever it is they touch. */
    private static final class SwipeAway extends FrameLayout {
        private final int distance;
        private final Runnable away;
        private float downX, downY;

        SwipeAway(Context context, int distance, Runnable away) {
            super(context);
            this.distance = distance; this.away = away;
        }

        @Override public boolean dispatchTouchEvent(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) { downX = event.getX(); downY = event.getY(); }
            if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                float dx = event.getX() - downX, dy = event.getY() - downY;
                if (dx < -distance && Math.abs(dx) > Math.abs(dy) * 1.4f) { away.run(); return true; }
            }
            return super.dispatchTouchEvent(event);
        }
    }

    /** Children in rows that wrap, as chips do. */
    private static final class Flow extends ViewGroup {
        Flow(Context context) { super(context); }

        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int available = MeasureSpec.getSize(widthSpec) - getPaddingLeft() - getPaddingRight();
            int x = 0, y = 0, rowHeight = 0, widest = 0;
            for (int index = 0; index < getChildCount(); index++) {
                View child = getChildAt(index);
                if (child.getVisibility() == GONE) continue;
                measureChildWithMargins(child, MeasureSpec.makeMeasureSpec(available, MeasureSpec.AT_MOST), 0,
                        MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED), 0);
                int width = child.getMeasuredWidth() + margins(child), height = child.getMeasuredHeight();
                if (x > 0 && x + width > available) { y += rowHeight; x = 0; rowHeight = 0; }
                x += width; rowHeight = Math.max(rowHeight, height); widest = Math.max(widest, x);
            }
            setMeasuredDimension(resolveSize(widest + getPaddingLeft() + getPaddingRight(), widthSpec),
                    y + rowHeight + getPaddingTop() + getPaddingBottom());
        }

        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            int available = r - l - getPaddingLeft() - getPaddingRight();
            int x = 0, y = 0, rowHeight = 0;
            for (int index = 0; index < getChildCount(); index++) {
                View child = getChildAt(index);
                if (child.getVisibility() == GONE) continue;
                int width = child.getMeasuredWidth() + margins(child), height = child.getMeasuredHeight();
                if (x > 0 && x + width > available) { y += rowHeight; x = 0; rowHeight = 0; }
                int left = getPaddingLeft() + x, top = getPaddingTop() + y;
                child.layout(left, top, left + child.getMeasuredWidth(), top + height);
                x += width; rowHeight = Math.max(rowHeight, height);
            }
        }

        private static int margins(View child) {
            return child.getLayoutParams() instanceof MarginLayoutParams margin ? margin.leftMargin + margin.rightMargin : 0;
        }

        @Override protected LayoutParams generateDefaultLayoutParams() { return new MarginLayoutParams(-2, -2); }
        @Override protected LayoutParams generateLayoutParams(LayoutParams p) { return new MarginLayoutParams(p); }
        @Override public LayoutParams generateLayoutParams(android.util.AttributeSet attrs) { return new MarginLayoutParams(getContext(), attrs); }
        @Override protected boolean checkLayoutParams(LayoutParams p) { return p instanceof MarginLayoutParams; }
    }
}
