package com.plaxlabs.news;

import android.content.Context;
import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.android.gms.ads.MediaContent;
import com.google.android.gms.ads.nativead.MediaView;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdView;

/**
 * A native ad drawn as a card in Plax's own look, for the page between stories. Google's rules for native ads shape it:
 * <ul>
 * <li>every asset the ad uses (headline, picture or video, text, icon, button) is a child of the {@link NativeAdView} and is
 *     registered with it, and none of them has a click listener of ours: the ads library handles and counts the presses;</li>
 * <li>the card is a visible "Ad" label first, so nobody can take it for a story; the AdChoices icon, which the library puts in the
 *     top right corner of the card, has that corner to itself;</li>
 * <li>the picture or video is shown whole, never cropped, and is at least 120 dp each way;</li>
 * <li>nothing of ours is drawn over the card and nothing of ours that can be pressed is next to it.</li>
 * </ul>
 */
final class NativeAdPage {
    /** The picture is never smaller than this: Google's minimum for the media of a native ad is 120 dp each way. */
    private static final int MIN_MEDIA_DP = 140;
    /** Wide, as most ad pictures are, when the ad does not say its shape. */
    private static final float DEFAULT_ASPECT = 1.91f;

    private NativeAdPage() { }

    static NativeAdView build(Context context, Ui ui, NativeAd ad) {
        NativeAdView card = new NativeAdView(context);
        card.setBackground(ui.outline(ui.surface, ui.border, 20));

        MediaContent content = ad.getMediaContent();
        float aspect = content != null && content.getAspectRatio() > 0 ? content.getAspectRatio() : DEFAULT_ASPECT;
        MediaView media = new MediaView(context);
        media.setImageScaleType(ImageView.ScaleType.FIT_CENTER);
        media.setBackground(ui.round(ui.surfaceAlt, 14));
        media.setClipToOutline(true);
        if (content != null) media.setMediaContent(content);
        else media.setVisibility(View.GONE);

        Column column = new Column(context, media, aspect, ui.dp(MIN_MEDIA_DP));
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(ui.dp(16), ui.dp(16), ui.dp(16), ui.dp(16));
        card.addView(column, new android.widget.FrameLayout.LayoutParams(-1, -2));

        TextView label = ui.text(context.getString(R.string.ad_label), 11, ui.accentText, true);
        label.setLetterSpacing(.06f); label.setSingleLine();
        label.setPadding(ui.dp(10), ui.dp(5), ui.dp(10), ui.dp(5));
        label.setBackground(ui.round(ui.accentSoft, 12));
        label.setContentDescription(context.getString(R.string.ad_description));
        column.addView(label, new LinearLayout.LayoutParams(-2, -2));

        LinearLayout.LayoutParams mediaSize = new LinearLayout.LayoutParams(-1, ui.dp(MIN_MEDIA_DP));
        mediaSize.topMargin = ui.dp(12);
        column.addView(media, mediaSize);

        LinearLayout info = ui.row();
        info.setGravity(Gravity.TOP);
        ImageView icon = null;
        if (ad.getIcon() != null && ad.getIcon().getDrawable() != null) {
            icon = new ImageView(context);
            icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
            icon.setImageDrawable(ad.getIcon().getDrawable());
            icon.setBackground(ui.round(ui.surfaceAlt, 10));
            icon.setClipToOutline(true);
            LinearLayout.LayoutParams iconSize = new LinearLayout.LayoutParams(ui.dp(44), ui.dp(44));
            iconSize.setMarginEnd(ui.dp(12));
            info.addView(icon, iconSize);
        }
        LinearLayout words = ui.column();
        TextView headline = ui.text(ad.getHeadline(), 19, ui.text, "serif");
        headline.setTypeface(Typeface.create("serif", Typeface.BOLD));
        headline.setLineSpacing(0, 1.15f);
        headline.setMaxLines(3); headline.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(headline);
        TextView advertiser = null;
        if (ad.getAdvertiser() != null && !ad.getAdvertiser().isBlank()) {
            advertiser = ui.text(ad.getAdvertiser(), 12, ui.text2, false);
            advertiser.setSingleLine(); advertiser.setEllipsize(TextUtils.TruncateAt.END);
            advertiser.setPadding(0, ui.dp(2), 0, 0);
            words.addView(advertiser);
        }
        info.addView(words, new LinearLayout.LayoutParams(0, -2, 1));
        LinearLayout.LayoutParams infoSize = new LinearLayout.LayoutParams(-1, -2);
        infoSize.topMargin = ui.dp(12);
        column.addView(info, infoSize);

        TextView body = null;
        if (ad.getBody() != null && !ad.getBody().isBlank()) {
            body = ui.text(ad.getBody(), 15, ui.text, false);
            body.setAlpha(.88f); body.setLineSpacing(0, 1.3f);
            body.setMaxLines(3); body.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams bodySize = new LinearLayout.LayoutParams(-1, -2);
            bodySize.topMargin = ui.dp(8);
            column.addView(body, bodySize);
        }

        Button action = null;
        if (ad.getCallToAction() != null && !ad.getCallToAction().isBlank()) {
            action = ui.callToAction();
            action.setText(ad.getCallToAction());
            action.setSingleLine(); action.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams actionSize = new LinearLayout.LayoutParams(-1, -2);
            actionSize.topMargin = ui.dp(16);
            column.addView(action, actionSize);
        }

        card.setMediaView(media);
        card.setHeadlineView(headline);
        if (icon != null) card.setIconView(icon);
        if (advertiser != null) card.setAdvertiserView(advertiser);
        if (body != null) card.setBodyView(body);
        if (action != null) card.setCallToActionView(action);
        // The ad is bound last, once every asset view is registered.
        card.setNativeAd(ad);
        return card;
    }

    /**
     * The card's column. The picture takes the height that the label, the text and the button leave, up to the height its shape
     * asks for, and no less than {@link #MIN_MEDIA_DP}: on a tall phone the picture is as large as its shape allows, and on a short
     * one the text and the button are never pushed off the card.
     */
    private static final class Column extends LinearLayout {
        private final View media;
        private final float aspect;
        private final int minimum;

        Column(Context context, View media, float aspect, int minimum) {
            super(context);
            this.media = media; this.aspect = aspect; this.minimum = minimum;
        }

        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            if (media.getVisibility() == View.GONE) { super.onMeasure(widthSpec, heightSpec); return; }
            int width = MeasureSpec.getSize(widthSpec) - getPaddingLeft() - getPaddingRight();
            int most = MeasureSpec.getMode(heightSpec) == MeasureSpec.UNSPECIFIED ? Integer.MAX_VALUE : MeasureSpec.getSize(heightSpec);
            LayoutParams size = (LayoutParams) media.getLayoutParams();
            // First everything but the picture, to see what is left for it.
            size.height = 0;
            super.onMeasure(widthSpec, MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
            int others = getMeasuredHeight();
            int wanted = Math.round(width / aspect);
            int room = most == Integer.MAX_VALUE ? wanted : most - others;
            size.height = Math.max(minimum, Math.min(wanted, room));
            super.onMeasure(widthSpec, heightSpec);
        }
    }
}
