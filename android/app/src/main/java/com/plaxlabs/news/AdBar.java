package com.plaxlabs.news;

import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import androidx.appcompat.app.AppCompatActivity;
import java.util.function.BooleanSupplier;

/**
 * The ad strip at the foot of the screen, under the story. It is shown only where a story is, and only on a screen tall enough to spare
 * the room.
 *
 * <p><b>Room.</b> The strip takes room for an ad that has arrived, and keeps its room from the start only where an ad was served in it
 * within the last week ({@link AdRoom}), so that the story does not jump as that ad arrives. Anywhere else (a first run, or an AdMob app
 * that has not been approved yet, which is never served an ad) the ad is asked for with no room taken and nothing on the screen: no empty
 * bar, and no story that shrinks for a second and grows back. If no ad comes the strip asks again a little later (a few times, then it
 * leaves the reader alone), and a retry takes no room either. The strip is never made to appear while the pager is moving: the screen is
 * not made smaller under a swipe.
 */
final class AdBar {
    /** A screen shorter than this (a phone on its side, a window split in two) gets no strip: the story needs the height. */
    static final int MIN_SCREEN_HEIGHT_DP = 500;
    /** The strip is no wider than the reading column. */
    static final int MAX_WIDTH_DP = 640;
    static final long RETRY_MS = 60_000L;
    static final int MAX_RETRIES = 3;
    /** How long to wait for the pager to stop before looking again. */
    private static final long SETTLE_MS = 250L;

    private final AppCompatActivity activity;
    private final Ui ui;
    private final AdNetwork network;
    private final BooleanSupplier still;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final FrameLayout strip;
    private final View divider;
    private final int widthDp;
    private final boolean enabled;
    /** An ad was served in the strip lately: its room is kept from the start. */
    private final boolean keepsRoom;
    private AdNetwork.Banner banner;
    private boolean ready, wanted, resumed, filled, destroyed;
    private int retries;
    private final Runnable retry = this::reload;
    private final Runnable settle = this::update;

    /** {@code still} says whether the pager is at rest, so that the screen is not made smaller under a swipe. */
    AdBar(AppCompatActivity activity, Ui ui, AdNetwork network, BooleanSupplier still) {
        this.activity = activity; this.ui = ui; this.network = network; this.still = still;
        var config = activity.getResources().getConfiguration();
        widthDp = Math.min(config.screenWidthDp, MAX_WIDTH_DP);
        enabled = network.banner() && config.screenHeightDp >= MIN_SCREEN_HEIGHT_DP;
        keepsRoom = enabled && AdRoom.keepsRoom(Prefs.bannerServedAt(activity), System.currentTimeMillis());
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
        main.removeCallbacks(settle);
        if (banner != null) banner.destroy();
        banner = null;
    }

    /** The strip may be on the screen: ads may be asked for and a story is shown. */
    private boolean live() { return ready && wanted && !destroyed; }

    private void update() {
        main.removeCallbacks(settle);
        if (!live()) {
            strip.setVisibility(View.GONE);
            if (banner != null) banner.pause();
            return;
        }
        if (banner == null && retries <= MAX_RETRIES) load();
        // Room for an ad that has come, or from the start where one was served here lately, and not on a retry: an ad that did not come
        // this time is no reason to show an empty bar again. Otherwise the ad is asked for with nothing shown and no room taken.
        boolean room = banner != null && (filled || (keepsRoom && retries == 0));
        if (room && strip.getVisibility() != View.VISIBLE && !still.getAsBoolean()) {
            main.postDelayed(settle, SETTLE_MS);
            return;
        }
        strip.setVisibility(room ? View.VISIBLE : View.GONE);
        if (banner != null && resumed) banner.resume();
    }

    private void load() {
        banner = network.loadBanner(activity, widthDp, new AdNetwork.Banner.Listener() {
            // A banner that has shown an ad keeps it when a refresh finds none; only one that never had an ad gives its room back.
            @Override public void loaded() {
                if (destroyed) return;
                // Remembered once for the session: the next start keeps the room from the start (see AdRoom).
                if (!filled) Prefs.bannerServedAt(activity, System.currentTimeMillis());
                filled = true; retries = 0;
                if (banner != null) update();
            }

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
