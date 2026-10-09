package com.plaxlabs.news;

import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.widget.NestedScrollView;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import java.util.*;

/** A bottom sheet for choosing the topics that fill For you. Nothing is kept until the reader saves. */
final class InterestsSheet {
    interface Done { void chosen(Set<String> topics); }

    final BottomSheetDialog dialog;
    private final Ui ui;
    private final AppCompatActivity activity;
    private final Set<String> selected = new TreeSet<>();
    private final Map<Topic, LinearLayout> tiles = new EnumMap<>(Topic.class);
    private final Map<Topic, ImageView> ticks = new EnumMap<>(Topic.class);
    private final TextView count, save;

    private InterestsSheet(AppCompatActivity activity, Ui ui, Set<String> current, Done done) {
        this.activity = activity; this.ui = ui;
        selected.addAll(current);
        dialog = new BottomSheetDialog(activity);
        DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
        LinearLayout root = ui.column();
        root.setPadding(ui.dp(20), ui.dp(12), ui.dp(20), ui.dp(16));
        // The tiles scroll inside a sheet of fixed height, so the save button is always in reach.
        root.setLayoutParams(new ViewGroup.LayoutParams(-1, Math.round(metrics.heightPixels * .86f)));

        LinearLayout header = ui.row();
        header.addView(ui.icon(R.drawable.ic_star, ui.accentText, 20));
        TextView title = ui.text(activity.getString(R.string.interests_title), 18, ui.text, true);
        title.setPadding(ui.dp(8), 0, 0, 0);
        ViewCompat.setAccessibilityHeading(title, true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(ui.iconButton(R.drawable.ic_close, R.string.close, ui.surfaceAlt, ui.text, dialog::dismiss));
        root.addView(header);

        TextView detail = ui.text(activity.getString(R.string.interests_detail), 14, ui.text2, false);
        detail.setPadding(0, ui.dp(4), 0, ui.dp(12));
        root.addView(detail);

        NestedScrollView scroll = new NestedScrollView(activity);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout grid = ui.column();
        Topic[] topics = Topic.values();
        for (int index = 0; index < topics.length; index += 2) {
            LinearLayout line = new LinearLayout(activity);
            for (int column = 0; column < 2; column++) {
                LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(0, ui.dp(56), 1);
                size.bottomMargin = ui.dp(10);
                if (column == 0) size.setMarginEnd(ui.dp(10));
                if (index + column >= topics.length) { line.addView(new View(activity), size); break; }
                line.addView(tile(topics[index + column]), size);
            }
            grid.addView(line);
        }
        scroll.addView(grid);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout footer = ui.row();
        footer.setPadding(0, ui.dp(12), 0, 0);
        count = ui.text("", 14, ui.text2, true);
        count.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        footer.addView(count, new LinearLayout.LayoutParams(0, -2, 1));
        save = ui.primaryButton(R.string.interests_save, () -> {
            if (selected.isEmpty()) return;
            done.chosen(Interests.sanitize(selected));
            dialog.dismiss();
        });
        footer.addView(save, new LinearLayout.LayoutParams(-2, -2));
        root.addView(footer);

        dialog.setContentView(root);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
        refresh();
    }

    static InterestsSheet show(AppCompatActivity activity, Ui ui, Set<String> current, Done done) {
        InterestsSheet sheet = new InterestsSheet(activity, ui, current, done);
        sheet.dialog.show();
        return sheet;
    }

    boolean isShowing() { return dialog.isShowing(); }
    void dismiss() { dialog.dismiss(); }

    private View tile(Topic topic) {
        LinearLayout tile = ui.row();
        tile.setPadding(ui.dp(14), 0, ui.dp(12), 0);
        tile.setClickable(true); tile.setFocusable(true);
        tile.setContentDescription(activity.getString(topic.label));
        TextView emoji = ui.text(topic.emoji, 20, ui.text, false);
        emoji.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        tile.addView(emoji);
        TextView label = ui.text(activity.getString(topic.label), 14, ui.text, true);
        label.setSingleLine(); label.setEllipsize(android.text.TextUtils.TruncateAt.END);
        label.setPadding(ui.dp(10), 0, ui.dp(6), 0);
        tile.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
        ImageView tick = ui.icon(R.drawable.ic_check_circle, ui.accentText, 20);
        tile.addView(tick);
        tile.setOnClickListener(view -> {
            if (!selected.remove(topic.id)) selected.add(topic.id);
            refresh();
        });
        tiles.put(topic, tile); ticks.put(topic, tick);
        return tile;
    }

    private void refresh() {
        for (var entry : tiles.entrySet()) {
            boolean on = selected.contains(entry.getKey().id);
            LinearLayout tile = entry.getValue();
            tile.setBackground(ui.touch(on ? ui.outline(ui.accentSoft, ui.accent, 16) : ui.outline(ui.surface, ui.border, 16), 16));
            tile.setSelected(on);
            ViewCompat.setStateDescription(tile, on ? activity.getString(R.string.topic_selected) : null);
            ticks.get(entry.getKey()).setVisibility(on ? View.VISIBLE : View.INVISIBLE);
        }
        count.setText(selected.isEmpty() ? activity.getString(R.string.interests_none)
                : activity.getString(R.string.interests_selected, selected.size()));
        save.setEnabled(!selected.isEmpty());
        save.setAlpha(selected.isEmpty() ? .5f : 1f);
    }
}
