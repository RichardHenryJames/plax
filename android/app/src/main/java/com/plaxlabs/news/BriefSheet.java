package com.plaxlabs.news;

import android.animation.ObjectAnimator;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.widget.NestedScrollView;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/** A bottom sheet with an AI-written brief of one story, readable in English or Hindi. */
final class BriefSheet {
    static BriefSource source = new BriefApi();

    private final Ui ui;
    private final Story story;
    private final Handler main = new Handler(Looper.getMainLooper());
    final BottomSheetDialog dialog;
    private final LinearLayout content;
    private final TextView english, hindi;
    private String lang;
    private Cancelable request;
    private ObjectAnimator pulse;
    private int generation;
    private boolean closed;

    private BriefSheet(AppCompatActivity activity, Ui ui, Story story, String lang) {
        this.ui = ui; this.story = story; this.lang = lang;
        dialog = new BottomSheetDialog(activity);
        LinearLayout root = ui.column();
        root.setPadding(ui.dp(20), ui.dp(12), ui.dp(20), ui.dp(20));

        LinearLayout header = ui.row();
        header.addView(ui.icon(R.drawable.ic_sparkle, ui.accentText, 20));
        TextView title = ui.text(activity.getString(R.string.brief), 18, ui.text, true);
        title.setPadding(ui.dp(8), 0, 0, 0);
        ViewCompat.setAccessibilityHeading(title, true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(ui.iconButton(R.drawable.ic_close, R.string.close, ui.surfaceAlt, ui.text, this::dismiss));
        root.addView(header);

        LinearLayout languages = ui.row();
        english = ui.chip(activity.getString(R.string.language_english), () -> choose(Language.ENGLISH));
        hindi = ui.chip(activity.getString(R.string.language_hindi), () -> choose(Language.HINDI));
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(-2, -2);
        gap.setMarginEnd(ui.dp(8));
        languages.addView(english, gap); languages.addView(hindi);
        root.addView(languages);

        NestedScrollView scroll = new NestedScrollView(activity);
        content = ui.column();
        content.setPadding(0, ui.dp(8), 0, ui.dp(8));
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -2));

        TextView note = ui.text(activity.getString(R.string.brief_note), 11, ui.text2, false);
        note.setLineSpacing(0, 1.25f);
        root.addView(note);

        dialog.setContentView(root);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
        dialog.setOnDismissListener(shown -> release());
    }

    static BriefSheet show(AppCompatActivity activity, Ui ui, Story story, String lang) {
        BriefSheet sheet = new BriefSheet(activity, ui, story, lang);
        sheet.dialog.show();
        sheet.load();
        return sheet;
    }

    void dismiss() { dialog.dismiss(); }
    boolean isShowing() { return dialog.isShowing(); }

    private void choose(String selected) {
        if (selected.equals(lang) || closed) return;
        lang = selected; load();
    }

    private void load() {
        cancel();
        english.setSelected(Language.ENGLISH.equals(lang)); hindi.setSelected(Language.HINDI.equals(lang));
        Brief known = BriefApi.CACHE.get(BriefApi.key(story, lang));
        if (known != null) { show(known); return; }
        loading();
        int expected = ++generation;
        String requested = lang;
        request = source.brief(story, requested, new BriefSource.Result() {
            @Override public void done(Brief brief) {
                main.post(() -> {
                    if (closed || expected != generation) return;
                    BriefApi.CACHE.put(BriefApi.key(story, requested), brief);
                    show(brief);
                });
            }
            @Override public void failed(int message) {
                main.post(() -> { if (!closed && expected == generation) failure(message); });
            }
        });
    }

    private void loading() {
        stopPulse(); content.removeAllViews();
        TextView status = ui.text(content.getContext().getString(R.string.brief_loading), 14, ui.text2, false);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        content.addView(status);
        LinearLayout lines = ui.column();
        for (float width : new float[]{-1, -1, -1, -1, 200}) {
            View line = new View(content.getContext());
            line.setBackground(ui.round(ui.skeleton, 6));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width < 0 ? -1 : ui.dp(width), ui.dp(14));
            params.topMargin = ui.dp(12);
            lines.addView(line, params);
        }
        content.addView(lines);
        pulse = Ui.pulse(lines);
    }

    private void show(Brief brief) {
        stopPulse(); content.removeAllViews();
        if (!brief.title().isEmpty()) {
            TextView title = ui.text(brief.title(), 20, ui.text, "serif");
            title.setTypeface(Typeface.create("serif", Typeface.BOLD));
            title.setLineSpacing(0, 1.15f);
            title.setPadding(0, 0, 0, ui.dp(12));
            content.addView(title);
        }
        for (String paragraph : brief.content().split("\\n{2,}")) {
            if (paragraph.isBlank()) continue;
            TextView body = ui.text(Markdown.render(paragraph.strip()), 16, ui.text, false);
            body.setLineSpacing(0, 1.35f);
            body.setTextIsSelectable(true);
            body.setPadding(0, 0, 0, ui.dp(12));
            content.addView(body);
        }
    }

    private void failure(int message) {
        stopPulse(); content.removeAllViews();
        TextView error = ui.text(content.getContext().getString(message), 14, ui.text2, false);
        error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        error.setLineSpacing(0, 1.25f);
        content.addView(error);
        TextView retry = ui.primaryButton(R.string.retry, this::load);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, -2);
        params.topMargin = ui.dp(16);
        content.addView(retry, params);
    }

    private void stopPulse() {
        if (pulse != null) { pulse.cancel(); pulse = null; }
    }

    private void cancel() {
        generation++;
        if (request != null) { request.cancel(); request = null; }
    }

    private void release() {
        closed = true; cancel(); stopPulse();
        main.removeCallbacksAndMessages(null);
    }
}
