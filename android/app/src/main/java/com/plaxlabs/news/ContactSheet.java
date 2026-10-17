package com.plaxlabs.news;

import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.widget.NestedScrollView;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/**
 * Contact us: the address to write to, who makes Plax, and the contact page on the website. It is one tap from the menu and
 * needs no account. Google Play's news policy asks for exactly this inside the app, with the address in plain sight.
 */
final class ContactSheet {
    interface Actions {
        /** Opens a new message to the address in the reader's mail app. */
        void email();
        void copy();
        /** Opens the contact page on the website. */
        void page();
    }

    final BottomSheetDialog dialog;
    private final Ui ui;

    private ContactSheet(AppCompatActivity activity, Ui ui, Actions actions) {
        this.ui = ui;
        dialog = new BottomSheetDialog(activity);
        LinearLayout root = ui.column();
        root.setPadding(ui.dp(20), ui.dp(12), ui.dp(20), ui.dp(24));

        LinearLayout header = ui.row();
        header.addView(ui.icon(R.drawable.ic_mail, ui.accentText, 20));
        TextView title = ui.text(activity.getString(R.string.contact_us), 18, ui.text, true);
        title.setPadding(ui.dp(8), 0, 0, 0);
        ViewCompat.setAccessibilityHeading(title, true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(ui.iconButton(R.drawable.ic_close, R.string.close, ui.surfaceAlt, ui.text, dialog::dismiss));
        root.addView(header);

        NestedScrollView scroll = new NestedScrollView(activity);
        LinearLayout content = ui.column();
        content.setPadding(0, ui.dp(8), 0, 0);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -2));

        content.addView(paragraph(activity.getString(R.string.contact_intro), 15, ui.text));

        // The address is shown, not only offered as a button: it can be read, selected and copied from here.
        LinearLayout card = ui.column();
        card.setPadding(ui.dp(16), ui.dp(14), ui.dp(16), ui.dp(14));
        card.setBackground(ui.round(ui.surfaceAlt, 14));
        card.addView(ui.text(activity.getString(R.string.contact_email_label), 12, ui.text2, true));
        TextView address = ui.text(Contact.EMAIL, 18, ui.accentText, true);
        address.setTextIsSelectable(true);
        address.setPadding(0, ui.dp(4), 0, ui.dp(2));
        card.addView(address);
        card.addView(ui.text(Contact.OPERATOR, 13, ui.text2, false));
        content.addView(card, below(16));

        content.addView(ui.primaryButton(R.string.contact_send, actions::email), below(16));
        content.addView(ui.secondaryButton(activity.getString(R.string.contact_copy), actions::copy), below(10));
        content.addView(ui.secondaryButton(activity.getString(R.string.contact_page), actions::page), below(10));

        // The website page in words as well as a button, so the address Google Play was given can be found and read here.
        TextView page = paragraph(activity.getString(R.string.contact_page_line, Contact.PAGE_URL), 13, ui.text2);
        page.setTextIsSelectable(true);
        page.setPadding(0, ui.dp(14), 0, 0);
        content.addView(page);

        TextView about = paragraph(activity.getString(R.string.contact_about, Contact.OPERATOR), 13, ui.text2);
        about.setPadding(0, ui.dp(10), 0, 0);
        content.addView(about);

        dialog.setContentView(root);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
    }

    static ContactSheet show(AppCompatActivity activity, Ui ui, Actions actions) {
        ContactSheet sheet = new ContactSheet(activity, ui, actions);
        sheet.dialog.show();
        return sheet;
    }

    boolean isShowing() { return dialog.isShowing(); }
    void dismiss() { dialog.dismiss(); }

    private LinearLayout.LayoutParams below(float gapDp) {
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2);
        size.topMargin = ui.dp(gapDp);
        return size;
    }

    private TextView paragraph(String text, float size, int color) {
        TextView view = ui.text(text, size, color, false);
        view.setLineSpacing(0, 1.3f);
        return view;
    }
}
