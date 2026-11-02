package com.plaxlabs.news;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.ads.MediaContent;
import com.google.android.gms.ads.MuteThisAdListener;
import com.google.android.gms.ads.MuteThisAdReason;
import com.google.android.gms.ads.OnPaidEventListener;
import com.google.android.gms.ads.ResponseInfo;
import com.google.android.gms.ads.VideoController;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdView;
import com.google.android.gms.internal.ads.zzbnx;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * The full-page native ad as Plax draws it, with a stand-in for the ad Google hands over, so that the card can be looked at whatever
 * Google serves (a new AdMob app serves a test device no native ad until the app is verified). What is tested is ours: that the card
 * is built and bound with every asset registered, that the label, headline, text and button are all on the card and the card is
 * inside its page on every screen and text size an ad page is shown on, and that an ad which cannot be drawn costs a blank page and
 * not the app. The picture or video Google puts in the picture view is Google's, and is not drawn here.
 */
@RunWith(AndroidJUnit4.class)
public class NativeAdPageDeviceTest {
    /** An ad page is shown on a screen at least this tall (see MainActivity). */
    private static final int[][] PAGES = {{360, 600}, {392, 780}, {412, 850}, {600, 1000}, {820, 540}};
    private static final float[] SCALES = {1f, 1.3f, 2f};

    private Context context;

    @Before public void setUp() { context = ApplicationProvider.getApplicationContext(); }

    private Context themed(float fontScale) {
        androidx.appcompat.view.ContextThemeWrapper themed = new androidx.appcompat.view.ContextThemeWrapper(context, R.style.Theme_Plax);
        Configuration configuration = new Configuration(context.getResources().getConfiguration());
        configuration.fontScale = fontScale;
        configuration.setLocale(Locale.US);
        themed.applyOverrideConfiguration(configuration);
        return themed;
    }

    /** What Google hands over, as far as the card reads it. */
    private static final class FakeAd extends NativeAd {
        final String headline, body, action, advertiser;
        final MediaContent media;
        final boolean breaks;

        FakeAd(String headline, String body, String action, String advertiser, MediaContent media, boolean breaks) {
            this.headline = headline; this.body = body; this.action = action; this.advertiser = advertiser;
            this.media = media; this.breaks = breaks;
        }

        @Override public String getHeadline() { if (breaks) throw new IllegalStateException("broken ad"); return headline; }
        @Override public List<Image> getImages() { return List.of(); }
        @Override public String getBody() { return body; }
        @Override public Image getIcon() { return null; }
        @Override public String getCallToAction() { return action; }
        @Override public String getAdvertiser() { return advertiser; }
        @Override public Double getStarRating() { return null; }
        @Override public String getStore() { return null; }
        @Override public String getPrice() { return null; }
        @Override public AdChoicesInfo getAdChoicesInfo() { return null; }
        @Override public boolean isCustomMuteThisAdEnabled() { return false; }
        @Override public List<MuteThisAdReason> getMuteThisAdReasons() { return List.of(); }
        @Override public void muteThisAd(MuteThisAdReason reason) { }
        @Override public void setMuteThisAdListener(MuteThisAdListener listener) { }
        @Override public Bundle getExtras() { return new Bundle(); }
        @Override public void destroy() { }
        @Override public void setUnconfirmedClickListener(UnconfirmedClickListener listener) { }
        @Override public void cancelUnconfirmedClick() { }
        @Override public void enableCustomClickGesture() { }
        @Override public boolean isCustomClickGestureEnabled() { return false; }
        @Override public void recordCustomClickGesture() { }
        @Override public void performClick(Bundle bundle) { }
        @Override public boolean recordImpression(Bundle bundle) { return false; }
        @Override public void reportTouchEvent(Bundle bundle) { }
        @Override public MediaContent getMediaContent() { return media; }
        @Override public ResponseInfo getResponseInfo() { return null; }
        @Override public void setOnPaidEventListener(OnPaidEventListener listener) { }
        @Override protected void recordEvent(Bundle bundle) { }
        @Override public long getPlacementId() { return 0; }
        @Override public void setPlacementId(long id) { }
        @Override protected Object zza() { return null; }
    }

    private static final class FakeMedia implements MediaContent {
        final float aspect;

        FakeMedia(float aspect) { this.aspect = aspect; }

        @Override public float getAspectRatio() { return aspect; }
        @Override public float getDuration() { return 0; }
        @Override public float getCurrentTime() { return 0; }
        @Override public VideoController getVideoController() { return null; }
        @Override public boolean hasVideoContent() { return false; }
        @Override public void setMainImage(Drawable image) { }
        @Override public Drawable getMainImage() { return new ColorDrawable(0xFF4477AA); }
        @Override public boolean zza() { return false; }
        @Override public zzbnx zzb() { return null; }
    }

    private static FakeAd plain(MediaContent media) {
        return new FakeAd("Save big on everything this season with the Plax Pro app and its weekly offers",
                "Hundreds of offers from the shops you already use, on one screen, with a new one every day of the week.",
                "Install now", "Plax Test Advertiser", media, false);
    }

    private static final class FakePage implements AdNetwork.Page {
        final NativeAd ad;
        private View view;

        FakePage(NativeAd ad) { this.ad = ad; }

        @Override public View view(Context context, Ui ui) {
            if (view == null) view = NativeAdPage.build(context, ui, ad, false);
            return view;
        }

        @Override public void destroy() { }
    }

    private static StoryAdapter.Actions actions(AdNetwork.Page page) {
        return new StoryAdapter.Actions() {
            public void save(Story story) { }
            public void share(Story story) { }
            public void source(Story story) { }
            public void brief(Story story) { }
            public void check() { }
            public void earlier() { }
            @Override public AdNetwork.Page ad(int ordinal) { return page; }
        };
    }

    /** How far down the card's own box this view ends. */
    private static int bottomIn(View view, View card) {
        int bottom = view.getBottom();
        for (View parent = (View) view.getParent(); parent != null && parent != card; parent = (View) parent.getParent()) bottom += parent.getTop();
        return bottom;
    }

    private static void collect(View view, List<View> into) {
        into.add(view);
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) collect(group.getChildAt(index), into);
    }

    /** Draws the ad on a page of the given size, as the pager does, and says what is wrong with it. */
    private List<String> problemsOf(NativeAd ad, int widthDp, int heightDp, float scale, boolean withPicture) {
        List<String> found = new ArrayList<>();
        Context themed = themed(scale);
        Ui ui = new Ui(themed);
        ImageLoader images = new ImageLoader(themed, 1080);
        try {
            StoryAdapter adapter = new StoryAdapter(ui, images, actions(new FakePage(ad)), widthDp, heightDp + 60);
            adapter.submit(List.of(Story.ad(1)), Set.of(), false, true, 0);
            var holder = (StoryAdapter.AdHolder) adapter.onCreateViewHolder(new FrameLayout(themed), adapter.getItemViewType(0));
            adapter.onBindViewHolder(holder, 0);
            int width = ui.dp(widthDp), height = ui.dp(heightDp);
            holder.itemView.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
            holder.itemView.layout(0, 0, width, height);
            String name = widthDp + "x" + heightDp + " at " + scale + "x" + (withPicture ? "" : " with no picture");

            if (holder.host.getChildCount() != 1 || !(holder.host.getChildAt(0) instanceof NativeAdView)) {
                String why = "";
                try { NativeAdPage.build(themed, ui, ad, false); } catch (RuntimeException broken) {
                    StackTraceElement[] trace = broken.getStackTrace();
                    why = " (" + broken + " at " + (trace.length > 0 ? trace[0] : "?") + (trace.length > 1 ? ", " + trace[1] : "") + ")";
                }
                found.add(name + ": the page does not hold the ad's card" + why);
                return found;
            }
            NativeAdView card = (NativeAdView) holder.host.getChildAt(0);
            if (card.getHeight() > holder.host.getHeight()) {
                found.add(name + ": the card is " + card.getHeight() + " px tall in a room of " + holder.host.getHeight());
            }
            List<View> all = new ArrayList<>();
            collect(card, all);
            boolean label = false, headline = false, action = false;
            for (View view : all) {
                if (view == card) continue;
                if (view.getVisibility() == View.GONE) continue;
                if (bottomIn(view, card) > card.getHeight()) found.add(name + ": " + view.getClass().getSimpleName() + " runs off the card");
                if (view instanceof TextView text && text.getText().toString().equals(context.getString(R.string.ad_label))) label = true;
                if (view instanceof TextView text && text.getText().toString().equals(ad.getHeadline())) headline = true;
                if (view instanceof Button button && button.getText().toString().equals(ad.getCallToAction())) {
                    action = button.getHeight() > 0 && bottomIn(button, card) <= card.getHeight();
                }
            }
            if (!label) found.add(name + ": there is no Ad label");
            if (!headline) found.add(name + ": there is no headline");
            if (!action) found.add(name + ": the button is not on the card");
            if (card.getHeight() <= 0 || card.getWidth() <= 0) found.add(name + ": the card has no size");
        } finally { images.close(); }
        return found;
    }

    @Test public void theCardFitsAPageOfExactlyTheHeightTheGateAsksFor() {
        // AdSlots.pageNeededDp is what decides whether an ad page is shown at all, so it must be enough: this draws the card on a
        // page of exactly that height, at every text size and on narrow, usual and wide pages.
        List<String> problems = new ArrayList<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (float scale : new float[]{1f, 1.15f, 1.3f, 1.5f, 1.75f, 2f}) {
                for (int widthDp : new int[]{320, 360, 412, 820}) {
                    problems.addAll(problemsOf(plain(new FakeMedia(1.91f)), widthDp, AdSlots.pageNeededDp(scale), scale, true));
                    problems.addAll(problemsOf(plain(new FakeMedia(1f)), widthDp, AdSlots.pageNeededDp(scale), scale, true));
                }
            }
        });
        assertTrue(problems.size() + " problems:\n" + String.join("\n", problems), problems.isEmpty());
    }

    @Test public void anAdWithAPictureIsDrawnWhole() {
        List<String> problems = new ArrayList<>();
        AtomicInteger drawn = new AtomicInteger();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (float scale : SCALES) for (int[] page : PAGES) {
                problems.addAll(problemsOf(plain(new FakeMedia(1.91f)), page[0], page[1], scale, true));
                drawn.incrementAndGet();
            }
        });
        assertEquals(SCALES.length * PAGES.length, drawn.get());
        assertTrue(problems.size() + " problems:\n" + String.join("\n", problems), problems.isEmpty());
    }

    @Test public void anAdWithNoPictureIsDrawnWhole() {
        List<String> problems = new ArrayList<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (float scale : SCALES) for (int[] page : PAGES) problems.addAll(problemsOf(plain(null), page[0], page[1], scale, false));
        });
        assertTrue(problems.size() + " problems:\n" + String.join("\n", problems), problems.isEmpty());
    }

    @Test public void anAdWithOnlyAHeadlineAndAButtonIsDrawn() {
        List<String> problems = new ArrayList<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            NativeAd bare = new FakeAd("Plax", null, "Open", null, new FakeMedia(1f), false);
            for (int[] page : PAGES) problems.addAll(problemsOf(bare, page[0], page[1], 1f, true));
        });
        assertTrue(problems.size() + " problems:\n" + String.join("\n", problems), problems.isEmpty());
    }

    @Test public void anAdThatCannotBeDrawnCostsABlankPageAndNotTheApp() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Context themed = themed(1f);
            Ui ui = new Ui(themed);
            View page = NativeAdPage.safe(themed, ui, new FakeAd("x", "y", "z", "w", null, true));
            assertNotNull(page);
            assertFalse("it is not the card", page instanceof NativeAdView);
        });
    }
}
