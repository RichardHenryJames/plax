package com.plaxlabs.news;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import androidx.appcompat.app.AppCompatActivity;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.VideoOptions;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdOptions;
import com.google.android.ump.ConsentDebugSettings;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.util.ArrayList;
import java.util.List;

/**
 * Google AdMob. Consent comes first, through Google's consent tool: it shows its message to readers in the EEA, the UK and
 * Switzerland (and wherever the account's message is set to appear) and stores the answer; no ad is asked for, and the ads library is
 * not started, until the tool says ads may be requested. The ad units are those of the build (see android/app/build.gradle).
 *
 * <p>One instance serves the whole process, because consent is the process's, however many times the screen is made again.
 */
final class GoogleAds implements AdNetwork {
    private static GoogleAds instance;

    static synchronized GoogleAds of(String bannerUnit, String pageUnit) {
        if (instance == null) instance = new GoogleAds(bannerUnit, pageUnit);
        return instance;
    }

    private final String bannerUnit, pageUnit;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Screens waiting for the library to start; each is told once, and each ignores it if it has gone. */
    private final List<Runnable> waiting = new ArrayList<>();
    private boolean started, starting, asking;

    private GoogleAds(String bannerUnit, String pageUnit) {
        this.bannerUnit = bannerUnit; this.pageUnit = pageUnit;
    }

    @Override public boolean banner() { return !bannerUnit.isEmpty(); }

    @Override public boolean page() { return !pageUnit.isEmpty(); }

    @Override public void start(AppCompatActivity activity, Runnable ready) {
        if (started) { ready.run(); return; }
        waiting.add(ready);
        Context app = activity.getApplicationContext();
        ConsentInformation consent = UserMessagingPlatform.getConsentInformation(app);
        if (!asking) {
            asking = true;
            ConsentRequestParameters.Builder parameters = new ConsentRequestParameters.Builder();
            if (!BuildConfig.ADS_CONSENT_TEST.isEmpty()) parameters.setConsentDebugSettings(testRegion(app));
            // Every launch asks again whether consent is needed; the form shows only when it is.
            consent.requestConsentInfoUpdate(activity, parameters.build(),
                    () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> settled(app, consent)),
                    requestError -> settled(app, consent));
        }
        // Consent given in an earlier session may be enough already: then the first ad does not wait for the answer.
        if (consent.canRequestAds()) begin(app);
    }

    /** The tool has answered, or could not: ads may go ahead if the reader's choices (earlier ones, after an error) allow them. */
    private void settled(Context app, ConsentInformation consent) {
        asking = false;
        if (consent.canRequestAds()) begin(app);
    }

    private void begin(Context app) {
        if (started || starting) return;
        starting = true;
        // Google asks for the library to be started off the main thread.
        new Thread(() -> MobileAds.initialize(app, status -> main.post(() -> {
            started = true; starting = false;
            List<Runnable> screens = new ArrayList<>(waiting);
            waiting.clear();
            for (Runnable screen : screens) screen.run();
        })), "plax-ads").start();
    }

    /** A test build can pretend the reader is in the EEA, to see the consent message. */
    private static ConsentDebugSettings testRegion(Context context) {
        int region = "eea".equals(BuildConfig.ADS_CONSENT_TEST) ? ConsentDebugSettings.DebugGeography.DEBUG_GEOGRAPHY_EEA
                : ConsentDebugSettings.DebugGeography.DEBUG_GEOGRAPHY_NOT_EEA;
        return new ConsentDebugSettings.Builder(context).setDebugGeography(region).build();
    }

    @Override public boolean privacyOptions(Context context) {
        return UserMessagingPlatform.getConsentInformation(context).getPrivacyOptionsRequirementStatus()
                == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    @Override public void showPrivacyOptions(AppCompatActivity activity, Runnable done) {
        UserMessagingPlatform.showPrivacyOptionsForm(activity, formError -> done.run());
    }

    @Override public Banner loadBanner(Context context, int widthDp, Banner.Listener listener) {
        AdView view = new AdView(context);
        AdSize size = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(context, widthDp);
        view.setAdUnitId(bannerUnit);
        view.setAdSize(size);
        view.setAdListener(new AdListener() {
            @Override public void onAdLoaded() { listener.loaded(); }
            @Override public void onAdFailedToLoad(LoadAdError error) { listener.failed(); }
        });
        view.loadAd(new AdRequest.Builder().build());
        return new GoogleBanner(view, size.getHeightInPixels(context));
    }

    private record GoogleBanner(AdView view, int heightPx) implements Banner {
        @Override public void pause() { view.pause(); }
        @Override public void resume() { view.resume(); }
        @Override public void destroy() {
            if (view.getParent() instanceof ViewGroup parent) parent.removeView(view);
            view.destroy();
        }
    }

    @Override public Cancelable loadPage(Context context, Page.Listener listener) {
        boolean[] cancelled = {false};
        AdLoader loader = new AdLoader.Builder(context.getApplicationContext(), pageUnit)
                .forNativeAd(ad -> {
                    if (cancelled[0]) ad.destroy();
                    else listener.loaded(new NativePage(ad));
                })
                .withAdListener(new AdListener() {
                    @Override public void onAdFailedToLoad(LoadAdError error) { if (!cancelled[0]) listener.failed(); }
                })
                .withNativeAdOptions(new NativeAdOptions.Builder()
                        // The corner is ours to choose; the card keeps it free.
                        .setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT)
                        .setVideoOptions(new VideoOptions.Builder().setStartMuted(true).build())
                        .build())
                .build();
        loader.loadAd(new AdRequest.Builder().build());
        return () -> cancelled[0] = true;
    }

    private static final class NativePage implements Page {
        private final NativeAd ad;
        private View view;

        NativePage(NativeAd ad) { this.ad = ad; }

        @Override public View view(Context context, Ui ui) {
            if (view == null) view = NativeAdPage.build(context, ui, ad);
            return view;
        }

        @Override public void destroy() {
            if (view != null && view.getParent() instanceof ViewGroup parent) parent.removeView(view);
            view = null;
            ad.destroy();
        }
    }
}
