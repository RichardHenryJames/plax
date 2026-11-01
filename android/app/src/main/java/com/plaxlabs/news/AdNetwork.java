package com.plaxlabs.news;

import android.content.Context;
import android.view.View;
import androidx.appcompat.app.AppCompatActivity;

/**
 * What the app needs from an ad network: the consent that must come first, a banner for the foot of the screen, and a full-page ad that
 * stands between stories. Google's is {@link GoogleAds}; {@link NoAds} shows nothing; tests put a fake in {@link Ads#network}, so that
 * no test ever asks Google for anything.
 */
interface AdNetwork {
    /** Whether this network shows a banner at the foot of the screen (the build has a unit for it). */
    boolean banner();

    /** Whether this network shows a full-page ad after every fifth story (the build has a unit for it). */
    boolean page();

    /**
     * Gets the reader's consent where it is needed (a message from Google's consent tool in the EEA, the UK and Switzerland) and starts
     * the ads library. Calls {@code ready} on the main thread, once, when ads may be asked for; never, if the reader does not allow them.
     */
    void start(AppCompatActivity activity, Runnable ready);

    /** Whether the reader has a consent choice to change: the menu then offers it. Known once consent has been asked for. */
    boolean privacyOptions(Context context);

    /** Shows that choice; {@code done} is called when the reader has finished with it. */
    void showPrivacyOptions(AppCompatActivity activity, Runnable done);

    /**
     * A banner as wide as {@code widthDp}. Its height is known at once, so that the room for it can be kept from the start; the
     * listener says when an ad has arrived and when none will.
     */
    Banner loadBanner(Context context, int widthDp, Banner.Listener listener);

    /**
     * Asks for a full-page ad. The listener is called once, on the main thread, with an ad or with none; after cancelling it is not
     * called, and an ad that was already on its way is let go.
     */
    Cancelable loadPage(Context context, Page.Listener listener);

    /** A banner on its way to the foot of the screen. */
    interface Banner {
        interface Listener {
            void loaded();
            void failed();
        }

        View view();

        int heightPx();

        void pause();

        void resume();

        void destroy();
    }

    /** A full-page ad that has loaded, ready to be put in a page of the pager. */
    interface Page {
        interface Listener {
            void loaded(Page page);
            void failed();
        }

        /**
         * The view that shows it, built once and then the same view each time: a whole ad, never cropped or covered by anything of
         * ours. It stands in the middle of its page; the page puts the menu button, the hint and the background around it.
         */
        View view(Context context, Ui ui);

        /** Lets the ad go. It leaves the view it is in first, so it may be called while the page is still on the screen. */
        void destroy();
    }
}
