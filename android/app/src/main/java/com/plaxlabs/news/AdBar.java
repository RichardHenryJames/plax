package com.plaxlabs.news;

import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import androidx.appcompat.app.AppCompatActivity;

/**
 * The ad strip at the foot of the screen, under the story. Its room is kept from the moment ads may be shown, so that the story does
 * not jump when the ad arrives; if no ad comes the strip gives its room back, and asks again a little later (a few times, then it
 * leaves the reader alone). It is shown only where a story is, and only on a screen tall enough to spare the room.
 */
final class AdBar {
    /** A screen shorter than this (a phone on its side, a window split in two) gets no strip: the story needs the height. */
    static final int MIN_SCREEN_HEIGHT_DP = 500;
    /** The strip is no wider than the reading column. */
    static final int MAX_WIDTH_DP = 640;
    static final long RETRY_MS = 60_000L;
    static final int MAX_RETRIES = 3;

    private final AppCompatActivity activity;
    private final Ui ui;
    private final AdNetwork network;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final FrameLayout strip;
    private final View divider;
    private final int widthDp;
    private final boolean enabled;
    private AdNetwork.Banner banner;
    private boolean ready, wanted, resumed, filled, destroyed;
    private int retries;
    private final Runnable retry = this::reload;

    AdBar(AppCompatActivity activity, Ui ui, AdNetwork network) {
        this.activity = activity; this.ui = ui; this.network = network;
        var config = activity.getResources().getConfiguration();
        widthDp = Math.min(config.screenWidthDp, MAX_WIDTH_DP);
        enabled = network.banner() && config.screenHeightDp >= MIN_SCREEN_HEIGHT_DP;
        strip = new FrameLayout(activity);
        strip.setBackgroundColor(ui.bg);
        divider = new View(activity);
        divider.setBackgroundColor(ui.border);
        strip.addView(divider, new FrameLayout.LayoutParams(-1, Math.max(1, ui.dp(1)), Gravity.TOP));
        strip.setVisibility(View.GONE);
    }
    /** The strip, to be put last in the screen's column. */
    View view() { return strip; }

    /** Whether this build and this screen have a strip at all. */
    boolean enabled() { return enabled; }

    /** Consent is settled and the ads library is started. */
    void ready() {
        if (destroyed || ready || !enabled) return;
        ready = true;
        update();
    }

    /** Whether a story is on the screen, so the strip belongs there. */
    void show(boolean wanted) {
        if (this.wanted == wanted) return;
        this.wanted = wanted;
        update();
    }

    void resume() { resumed = true; if (banner != null && live()) banner.resume(); }

    void pause() { resumed = false; if (banner != null) banner.pause(); }

    void destroy() {
        destroyed = true;
        main.removeCallbacks(retry);
        if (banner != null) banner.destroy();
        banner = null;
    }

    /** The strip is on screen: it has asked for an ad (or has one) and a story is shown. */
    private boolean live() { return ready && wanted && !destroyed; }

    private void update() {
        if (!live()) {
            strip.setVisibility(View.GONE);
            if (banner != null) banner.pause();
            return;
        }
        if (banner == null && retries <= MAX_RETRIES) load();
        boolean room = banner != null;
        strip.setVisibility(room ? View.VISIBLE : View.GONE);
        if (room && resumed) banner.resume();
    }

    private void load() {
        banner = network.loadBanner(activity, widthDp, new AdNetwork.Banner.Listener() {
            // A banner that has shown an ad keeps it when a refresh finds none; only one that never had an ad gives its room back.
            @Override public void loaded() { filled = true; retries = 0; }

            @Override public void failed() {
                if (filled || destroyed) return;
                if (banner != null) banner.destroy();
                banner = null;
                strip.setVisibility(View.GONE);
                if (++retries <= MAX_RETRIES) main.postDelayed(retry, RETRY_MS);
            }
        });
        if (banner == null) return;
        int height = banner.heightPx();
        FrameLayout.LayoutParams size = new FrameLayout.LayoutParams(-2, height, Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM);
        strip.addView(banner.view(), size);
        // The divider's line and the ad.
        strip.setLayoutParams(new LinearLayout.LayoutParams(-1, height + Math.max(1, ui.dp(1))));
    }

    private void reload() {
        if (destroyed || banner != null) return;
        update();
    }
}
