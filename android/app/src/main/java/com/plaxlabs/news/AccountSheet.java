package com.plaxlabs.news;

import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.widget.NestedScrollView;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/** The optional account: what signing in does, how to do it, and how to leave again. Plax works fully without it. */
final class AccountSheet {
    interface Actions {
        void signIn();
        void interests();
        void website();
    }

    final BottomSheetDialog dialog;
    private final Ui ui;
    private final AppCompatActivity activity;
    private final AccountManager account;
    private final Actions actions;
    private final LinearLayout content;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AccountManager.Listener listener;

    private AccountSheet(AppCompatActivity activity, Ui ui, AccountManager account, Actions actions) {
        this.activity = activity; this.ui = ui; this.account = account; this.actions = actions;
        dialog = new BottomSheetDialog(activity);
        listener = status -> main.post(() -> { if (dialog.isShowing()) render(status); });
        LinearLayout root = ui.column();
        root.setPadding(ui.dp(20), ui.dp(12), ui.dp(20), ui.dp(24));

        LinearLayout header = ui.row();
        header.addView(ui.icon(R.drawable.ic_person, ui.accentText, 20));
        TextView title = ui.text(activity.getString(R.string.account_title), 18, ui.text, true);
        title.setPadding(ui.dp(8), 0, 0, 0);
        ViewCompat.setAccessibilityHeading(title, true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(ui.iconButton(R.drawable.ic_close, R.string.close, ui.surfaceAlt, ui.text, dialog::dismiss));
        root.addView(header);

        NestedScrollView scroll = new NestedScrollView(activity);
        content = ui.column();
        content.setPadding(0, ui.dp(8), 0, 0);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -2));

        dialog.setContentView(root);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
        dialog.setOnDismissListener(shown -> { account.removeListener(listener); main.removeCallbacksAndMessages(null); });
    }

    static AccountSheet show(AppCompatActivity activity, Ui ui, AccountManager account, Actions actions) {
        AccountSheet sheet = new AccountSheet(activity, ui, account, actions);
        account.addListener(sheet.listener);
        sheet.render(account.status());
        sheet.dialog.show();
        return sheet;
    }

    boolean isShowing() { return dialog.isShowing(); }
    void dismiss() { dialog.dismiss(); }

    private void render(AccountManager.Status status) {
        content.removeAllViews();
        switch (status.phase()) {
            case SIGNED_IN -> signedIn(status);
            case WAITING -> waiting(status);
            default -> signedOut(status);
        }
        if (status.message() != 0 && status.message() != R.string.account_signed_out) note(status.message());
    }

    private void signedOut(AccountManager.Status status) {
        content.addView(paragraph(R.string.account_intro, 15, ui.text));
        TextView upload = paragraph(R.string.account_upload_note, 13, ui.text2);
        upload.setPadding(0, ui.dp(12), 0, 0);
        content.addView(upload);
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2);
        size.topMargin = ui.dp(20);
        content.addView(ui.primaryButton(R.string.sign_in_google, actions::signIn), size);
    }

    private void waiting(AccountManager.Status status) {
        LinearLayout row = ui.row();
        ProgressBar progress = new ProgressBar(activity);
        progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(ui.accentText));
        progress.setContentDescription(activity.getString(R.string.signing_in));
        row.addView(progress, new LinearLayout.LayoutParams(ui.dp(24), ui.dp(24)));
        TextView text = ui.text(activity.getString(R.string.signing_in), 15, ui.text, true);
        text.setPadding(ui.dp(12), 0, 0, 0);
        text.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        row.addView(text, new LinearLayout.LayoutParams(0, -2, 1));
        content.addView(row);
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2);
        size.topMargin = ui.dp(20);
        if (!status.busy()) content.addView(ui.secondaryButton(activity.getString(R.string.sign_in_cancel), account::cancel), size);
    }

    private void signedIn(AccountManager.Status status) {
        TextView who = ui.text(activity.getString(R.string.signed_in_as, status.label()), 16, ui.text, true);
        who.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        content.addView(who);
        TextView detail = paragraph(status.busy() ? R.string.syncing : R.string.signed_in_detail, 14, ui.text2);
        detail.setPadding(0, ui.dp(6), 0, 0);
        content.addView(detail);
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(-1, -2);
        gap.topMargin = ui.dp(20);
        content.addView(ui.secondaryButton(activity.getString(R.string.interests_title), actions::interests), gap);
        LinearLayout.LayoutParams next = new LinearLayout.LayoutParams(-1, -2);
        next.topMargin = ui.dp(10);
        content.addView(ui.secondaryButton(activity.getString(R.string.account_manage), actions::website), next);
        LinearLayout.LayoutParams out = new LinearLayout.LayoutParams(-1, -2);
        out.topMargin = ui.dp(10);
        content.addView(ui.secondaryButton(activity.getString(R.string.sign_out), account::signOut), out);
    }

    private void note(int message) {
        TextView note = ui.text(activity.getString(message), 13, ui.text, false);
        note.setLineSpacing(0, 1.25f);
        note.setPadding(ui.dp(14), ui.dp(12), ui.dp(14), ui.dp(12));
        note.setBackground(ui.round(ui.surfaceAlt, 14));
        note.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2);
        size.topMargin = ui.dp(16);
        content.addView(note, size);
    }

    private TextView paragraph(int text, float size, int color) {
        TextView view = ui.text(activity.getString(text), size, color, false);
        view.setLineSpacing(0, 1.3f);
        return view;
    }
}
