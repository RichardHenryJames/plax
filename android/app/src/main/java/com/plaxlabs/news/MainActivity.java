package com.plaxlabs.news;

import android.animation.ObjectAnimator;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.*;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.ViewModelProvider;
import androidx.recyclerview.widget.RecyclerView;
import androidx.viewpager2.widget.ViewPager2;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import java.util.*;

public final class MainActivity extends AppCompatActivity implements StoryAdapter.Actions {
    private static final long SPLASH_LIMIT_MS = 700;
    /** A share that takes longer than this to get its link says so, instead of leaving the tap unanswered. */
    private static final long PREPARING_HINT_MS = 700;
    private static final String HANDLED = "plax.callback.handled";

    private final Handler main = new Handler(Looper.getMainLooper());
    /** No ad pages in the pager. */
    private static final int[] NO_SLOTS = {};
    /** The story a link is being made for, if any; a second tap meanwhile must not open a second chooser. */
    private Story sharingStory;
    /** Which request is current, so that one given up on is never obeyed if it answers later. */
    private int shareGeneration;
    private Cancelable shareRequest;
    private final Runnable preparingHint = () -> Toast.makeText(this, R.string.share_preparing, Toast.LENGTH_SHORT).show();

    private Ui ui;
    private FeedViewModel model;
    private AdNetwork network;
    private AdController ads;
    private AdBar adBar;
    /** The slots that hold an ad page in the pager as it is now: what positions of the pager mean is read with this. */
    private int[] pagerSlots = NO_SLOTS;
    /** The set of ad pages changed while the pager was moving; the pager is made again when it has stopped. */
    private boolean adsDirty;
    /** Whether the screen is tall enough for an ad between stories (a phone on its side is not). */
    private boolean roomForAds;
    private ImageLoader images;
    private StoryAdapter adapter;
    private ViewPager2 pager;
    private LinearLayout root, empty, interestsCard;
    private FrameLayout content;
    private ScrollView topicScroll;
    private TextView bannerMessage, emptyTitle, emptyDetail, freshPill;
    private TextView interestsCardTitle, interestsCardDetail, interestsCardAction, emptyLink;
    private ImageView emptyIcon;
    /** The menu button for the screens that are not a story (a story has its own): in the top-left corner of the content. */
    private ImageButton cornerMenu;
    private FrameLayout spinner;
    private TextView retry;
    private View skeleton;
    private ObjectAnimator skeletonPulse;
    private BriefSheet sheet;
    private InterestsSheet interestsSheet;
    private AccountSheet accountSheet;
    private ContactSheet contactSheet;
    private MenuSheet menuSheet;
    private AccountManager accountManager;
    private AccountManager.Phase lastPhase;
    private final AccountManager.Listener accountListener = status -> runOnUiThread(() -> accountChanged(status));
    private UpdateManager updates;
    /** The simple dialog on screen (theme, about, clear, update), so nothing else is drawn over it. */
    AlertDialog openDialog;
    private FeedViewModel.State shown;
    private final Map<Topic, TopicTile> tiles = new EnumMap<>(Topic.class);
    private boolean rendering, reportedDrawn;

    private record TopicTile(View view, TextView current) { }

    @Override protected void onCreate(Bundle saved) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(saved);
        accountManager = AccountManager.get(this);
        updates = UpdateManager.get(this);
        model = new ViewModelProvider(this).get(FeedViewModel.class);
        network = Ads.network();
        ads = new ViewModelProvider(this).get(AdsViewModel.class).controller;
        roomForAds = getResources().getConfiguration().screenHeightDp >= AdBar.MIN_SCREEN_HEIGHT_DP;
        long deadline = SystemClock.uptimeMillis() + SPLASH_LIMIT_MS;
        splash.setKeepOnScreenCondition(() -> !model.ready() && SystemClock.uptimeMillis() < deadline);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!night); controller.setAppearanceLightNavigationBars(!night);

        ui = new Ui(this);
        var metrics = getResources().getDisplayMetrics();
        images = new ImageLoader(this, Math.min(metrics.widthPixels, 1080));
        root = ui.column(); root.setBackgroundColor(ui.bg);
        setContentView(root);
        // No header and no bottom bar: a story has the whole screen, between the system bars; the menu button holds the rest.
        body();
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        // Ads wait for the reader's consent where the law asks for it; with no ad unit in the build nothing here runs at all.
        ads.listen(this::adsChanged);
        if (network.banner() || network.page()) network.start(this, this::adsReady);

        String language = Language.current();
        if (!language.equals(model.current().lang())) model.language(language);
        model.state().observe(this, this::render);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (model.current().screen() != FeedViewModel.Screen.FEED) model.screen(FeedViewModel.Screen.FEED);
                else finish();
            }
        });
        if (saved == null) deepLink(getIntent());
    }

    private void body() {
        bannerMessage = ui.text("", 12, ui.accentText, true);
        bannerMessage.setPadding(ui.dp(16), ui.dp(6), ui.dp(16), ui.dp(6));
        bannerMessage.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        bannerMessage.setVisibility(View.GONE);
        root.addView(bannerMessage);

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        var config = getResources().getConfiguration();
        pager = new ViewPager2(this);
        pager.setId(View.generateViewId());
        pager.setOrientation(ViewPager2.ORIENTATION_VERTICAL);
        pager.setOffscreenPageLimit(1);
        adapter = new StoryAdapter(ui, images, this, config.screenWidthDp, config.screenHeightDp);
        pager.setAdapter(adapter);
        pager.setPageTransformer((page, position) -> {
            float scale = 1f - .04f * Math.min(1f, Math.abs(position));
            page.setScaleX(scale); page.setScaleY(scale);
        });
        pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {
            @Override public void onPageSelected(int position) {
                if (rendering) return;
                pager.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
                // An ad page stands for the story before it, so the model keeps the place of the story the reader has just read.
                int item = AdSlots.item(position, pagerSlots);
                model.position(item);
                prefetch(item);
                if (shown != null) {
                    banner(shown, item);
                    if (adPagesOn(shown)) ads.reader(item, shown.stories().size(), AdSlots.slotAt(position, pagerSlots));
                }
            }

            // Pages are put in, and taken out, only while the pager is still, so that nothing moves under a swipe.
            @Override public void onPageScrollStateChanged(int state) {
                if (state != ViewPager2.SCROLL_STATE_IDLE || !adsDirty || rendering) return;
                adsDirty = false;
                if (shown != null) render(shown);
            }
        });
        View inner = pager.getChildAt(0);
        if (inner instanceof RecyclerView recycler) recycler.setOverScrollMode(View.OVER_SCROLL_NEVER);
        content.addView(pager, new FrameLayout.LayoutParams(-1, -1));

        skeleton = ui.skeletonCard(config.screenHeightDp < 700);
        skeleton.setVisibility(View.GONE);
        skeleton.setContentDescription(getString(R.string.loading));
        content.addView(skeleton, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        empty = ui.column();
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(ui.dp(32), ui.dp(20), ui.dp(32), ui.dp(20));
        emptyIcon = ui.icon(R.drawable.ic_empty, ui.text2, 56);
        emptyIcon.setAlpha(.7f);
        empty.addView(emptyIcon, new LinearLayout.LayoutParams(ui.dp(56), ui.dp(56)));
        emptyTitle = ui.text("", 22, ui.text, "serif");
        emptyTitle.setTypeface(Typeface.create("serif", Typeface.BOLD));
        emptyTitle.setGravity(Gravity.CENTER); emptyTitle.setPadding(0, ui.dp(20), 0, ui.dp(8));
        ViewCompat.setAccessibilityHeading(emptyTitle, true);
        empty.addView(emptyTitle);
        emptyDetail = ui.text("", 14, ui.text2, false);
        emptyDetail.setGravity(Gravity.CENTER); emptyDetail.setLineSpacing(0, 1.3f);
        empty.addView(emptyDetail);
        retry = ui.primaryButton(R.string.retry, () -> {
            FeedViewModel.State state = model.current();
            if (state.screen() == FeedViewModel.Screen.FOR_YOU && state.interests().isEmpty()) chooseInterests();
            else if (state.feedError() != 0) model.retry();
            else if (state.section().isEmpty()) model.refresh();
            else model.more();
        });
        LinearLayout.LayoutParams retrySize = new LinearLayout.LayoutParams(-2, -2);
        retrySize.topMargin = ui.dp(24);
        empty.addView(retry, retrySize);
        emptyLink = ui.secondaryButton(getString(R.string.account_link), this::account);
        LinearLayout.LayoutParams linkSize = new LinearLayout.LayoutParams(-2, -2);
        linkSize.topMargin = ui.dp(12);
        empty.addView(emptyLink, linkSize);
        content.addView(empty, new FrameLayout.LayoutParams(-1, -1));

        topicScroll = new ScrollView(this);
        topicScroll.setVerticalScrollBarEnabled(false);
        LinearLayout topicContent = ui.column();
        // The top clears the menu button in the corner.
        topicContent.setPadding(ui.dp(20), ui.dp(64), ui.dp(20), ui.dp(24));
        TextView heading = ui.text(getString(R.string.choose_topic), 28, ui.text, "serif");
        heading.setTypeface(Typeface.create("serif", Typeface.BOLD));
        heading.setLineSpacing(0, 1.1f);
        ViewCompat.setAccessibilityHeading(heading, true);
        topicContent.addView(heading);
        TextView detail = ui.text(getString(R.string.choose_topic_detail), 14, ui.text2, false);
        detail.setPadding(0, ui.dp(8), 0, ui.dp(16));
        topicContent.addView(detail);
        interestsCard = ui.row();
        interestsCard.setPadding(ui.dp(16), ui.dp(14), ui.dp(16), ui.dp(14));
        interestsCard.setClickable(true); interestsCard.setFocusable(true);
        interestsCard.setBackground(ui.touch(ui.outline(ui.accentSoft, ui.border, 20), 20));
        LinearLayout cardText = ui.column();
        interestsCardTitle = ui.text("", 15, ui.text, true);
        interestsCardDetail = ui.text("", 13, ui.text2, false);
        interestsCardDetail.setPadding(0, ui.dp(2), 0, 0);
        cardText.addView(interestsCardTitle); cardText.addView(interestsCardDetail);
        interestsCard.addView(cardText, new LinearLayout.LayoutParams(0, -2, 1));
        interestsCardAction = ui.text("", 13, ui.accentText, true);
        interestsCardAction.setPadding(ui.dp(12), ui.dp(8), 0, ui.dp(8));
        interestsCard.addView(interestsCardAction);
        interestsCard.setOnClickListener(view -> chooseInterests());
        LinearLayout.LayoutParams cardSize = new LinearLayout.LayoutParams(-1, -2);
        cardSize.bottomMargin = ui.dp(16);
        topicContent.addView(interestsCard, cardSize);
        Topic[] topics = Topic.values();
        for (int index = 0; index < topics.length; index += 2) {
            // A plain row: a centred row would shift each tile up by its bottom margin and clip its top edge.
            LinearLayout line = new LinearLayout(this);
            for (int column = 0; column < 2; column++) {
                LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(0, ui.dp(96), 1);
                size.bottomMargin = ui.dp(10);
                if (column == 0) size.setMarginEnd(ui.dp(10));
                if (index + column >= topics.length) { line.addView(new View(this), size); break; }
                line.addView(tile(topics[index + column]), size);
            }
            topicContent.addView(line);
        }
        topicScroll.addView(topicContent);
        content.addView(topicScroll, new FrameLayout.LayoutParams(-1, -1));

        freshPill = ui.text(getString(R.string.new_stories), 13, ui.onAccent, true);
        freshPill.setCompoundDrawablePadding(ui.dp(6));
        freshPill.setGravity(Gravity.CENTER_VERTICAL);
        freshPill.setPadding(ui.dp(14), ui.dp(10), ui.dp(18), ui.dp(10));
        freshPill.setBackground(ui.touch(ui.round(ui.accent, 24), 24));
        freshPill.setElevation(ui.dp(6));
        freshPill.setContentDescription(getString(R.string.new_stories_description));
        freshPill.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        freshPill.setVisibility(View.GONE);
        freshPill.setOnClickListener(view -> { model.applyFresh(); pager.setCurrentItem(0, false); });
        FrameLayout.LayoutParams pillParams = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        pillParams.topMargin = ui.dp(12);
        content.addView(freshPill, pillParams);
        var arrow = androidx.core.content.ContextCompat.getDrawable(this, R.drawable.ic_arrow_up).mutate();
        arrow.setTint(ui.onAccent); arrow.setBounds(0, 0, ui.dp(16), ui.dp(16));
        freshPill.setCompoundDrawablesRelative(arrow, null, null, null);

        // The menu button of the screens that are not a story (a story has its own, over its picture): in the corner.
        cornerMenu = ui.menuButton(this::openMenu);
        FrameLayout.LayoutParams cornerParams = new FrameLayout.LayoutParams(ui.dp(StoryPage.MENU_TOUCH_DP), ui.dp(StoryPage.MENU_TOUCH_DP),
                Gravity.TOP | Gravity.START);
        cornerParams.setMargins(ui.dp(12), ui.dp(4), 0, 0);
        content.addView(cornerMenu, cornerParams);

        // The sign that stories are being looked for, where the refresh button of the old header was: top right, small, dark glass.
        spinner = new FrameLayout(this);
        GradientDrawable glass = new GradientDrawable();
        glass.setShape(GradientDrawable.OVAL); glass.setColor(0x8C0C0C10);
        spinner.setBackground(glass);
        spinner.setContentDescription(getString(R.string.refreshing));
        spinner.setVisibility(View.GONE);
        ProgressBar wheel = new ProgressBar(this);
        wheel.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(Color.WHITE));
        spinner.addView(wheel, new FrameLayout.LayoutParams(ui.dp(22), ui.dp(22), Gravity.CENTER));
        FrameLayout.LayoutParams spinnerParams = new FrameLayout.LayoutParams(ui.dp(40), ui.dp(40), Gravity.TOP | Gravity.END);
        spinnerParams.setMargins(0, ui.dp(12), ui.dp(16), 0);
        content.addView(spinner, spinnerParams);

        // The ad strip stands last, under the story; it is there only where a story is and the build has an ad for it.
        adBar = new AdBar(this, ui, network);
        root.addView(adBar.view(), new LinearLayout.LayoutParams(-1, -2));
    }

    private View tile(Topic topic) {
        LinearLayout tile = ui.column();
        tile.setPadding(ui.dp(14), ui.dp(12), ui.dp(14), ui.dp(10));
        tile.setClickable(true); tile.setFocusable(true);
        tile.setContentDescription(getString(topic.label));
        tile.setOnClickListener(view -> model.topic(topic));
        TextView emoji = ui.text(topic.emoji, 26, ui.text, false);
        emoji.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        tile.addView(emoji);
        View filler = new View(this);
        tile.addView(filler, new LinearLayout.LayoutParams(1, 0, 1));
        TextView label = ui.text(getString(topic.label), 15, ui.text, true);
        label.setSingleLine(); label.setEllipsize(android.text.TextUtils.TruncateAt.END);
        tile.addView(label);
        TextView current = ui.text(getString(R.string.topic_current), 11, ui.accentText, true);
        current.setPadding(0, ui.dp(2), 0, 0);
        current.setVisibility(View.GONE);
        tile.addView(current);
        tiles.put(topic, new TopicTile(tile, current));
        return tile;
    }

    private void render(FeedViewModel.State state) {
        rendering = true;
        shown = state;
        try {
            boolean topics = state.screen() == FeedViewModel.Screen.TOPICS, saved = state.screen() == FeedViewModel.Screen.SAVED;
            boolean feed = state.screen() == FeedViewModel.Screen.FEED, noStories = state.stories().isEmpty();
            boolean browsing = feed || state.screen() == FeedViewModel.Screen.FOR_YOU;
            for (var entry : tiles.entrySet()) {
                boolean current = entry.getKey() == state.topic();
                entry.getValue().view().setBackground(ui.touch(current ? ui.outline(ui.accentSoft, ui.accent, 20)
                        : ui.outline(ui.surface, ui.border, 20), 20));
                entry.getValue().current().setVisibility(current ? View.VISIBLE : View.GONE);
            }
            interests(state.interests());

            // Where the reader is, and which ad pages stand in the pager. Ad pages are asked for ahead of the reader, so the reader's
            // place is told to the ads first; what they hold then is what the pager is made of.
            int item = noStories ? 0 : Math.min(state.position(), state.stories().size() - 1);
            boolean adPages = adPagesOn(state);
            int onAd = adPages ? AdSlots.slotAt(pager.getCurrentItem(), pagerSlots) : -1;
            if (adPages) ads.reader(item, state.stories().size(), onAd);
            int[] slots = adPages ? ads.shown() : NO_SLOTS;
            adapter.submit(AdSlots.interleave(state.stories(), slots, Story::ad), state.savedIds(), state.saving(), state.storageReady(), state.earlier());
            pagerSlots = slots;
            if (!noStories) {
                int target = pagerIndex(item, onAd, slots);
                if (pager.getCurrentItem() != target) pager.setCurrentItem(target, false);
                prefetch(item);
                if (!reportedDrawn && browsing) { reportedDrawn = true; pager.post(this::reportFullyDrawn); }
            }
            boolean showSkeleton = browsing && noStories && state.loading() && state.feedError() == 0;
            topicScroll.setVisibility(topics ? View.VISIBLE : View.GONE);
            pager.setVisibility(!topics && !noStories ? View.VISIBLE : View.GONE);
            skeleton.setVisibility(showSkeleton ? View.VISIBLE : View.GONE);
            if (showSkeleton && skeletonPulse == null) skeletonPulse = Ui.pulse(skeleton);
            else if (!showSkeleton && skeletonPulse != null) { skeletonPulse.cancel(); skeletonPulse = null; skeleton.setAlpha(1f); }
            boolean showEmpty = !topics && noStories && !showSkeleton;
            empty.setVisibility(showEmpty ? View.VISIBLE : View.GONE);
            if (showEmpty) emptyState(state, saved);
            // A story has its own menu button; the screens without a story have this one, in the corner.
            cornerMenu.setVisibility(topics || showEmpty || showSkeleton ? View.VISIBLE : View.GONE);

            spinner.setVisibility(state.refreshing() ? View.VISIBLE : View.GONE);
            freshPill.setVisibility(state.fresh() ? View.VISIBLE : View.GONE);
            banner(state, item);
            adBar.show(adBar.enabled() && browsing && !noStories);
            if (state.notice() != 0) { Toast.makeText(this, state.notice(), Toast.LENGTH_SHORT).show(); model.acknowledgeNotice(); }
        } finally { rendering = false; }
    }

    /** Whether ad pages belong between the stories now: a feed with stories on a screen tall enough, in a build that has them. */
    private boolean adPagesOn(FeedViewModel.State state) {
        boolean browsing = state.screen() == FeedViewModel.Screen.FEED || state.screen() == FeedViewModel.Screen.FOR_YOU;
        return browsing && !state.stories().isEmpty() && ads.enabled() && roomForAds;
    }

    /**
     * The page of the pager that shows this item of the model's list, with the ad pages of {@code slots} in it. A reader who is on an
     * ad page stays on it: the model puts an ad page at the story before it.
     */
    private static int pagerIndex(int item, int onAd, int[] slots) {
        if (onAd >= 0 && item == onAd - 1)
            for (int index = 0; index < slots.length; index++) if (slots[index] == onAd) return onAd + index;
        return AdSlots.pagerIndex(item, slots);
    }

    /** The ad pages may have changed: made again at once, or, while the pager is moving, when it has stopped. */
    private void adsChanged() {
        if (rendering || shown == null) return;
        if (pager.getScrollState() == ViewPager2.SCROLL_STATE_IDLE) render(shown);
        else adsDirty = true;
    }

    /** Consent is settled and the ads library is started. */
    private void adsReady() {
        if (isFinishing() || isDestroyed()) return;
        ads.ready();
        adBar.ready();
        // The reader may already be on a story: ask for the ad ahead of them now, not at their next swipe.
        if (shown != null) render(shown);
    }

    @Override public AdNetwork.Page ad(int ordinal) { return ads.page(ordinal); }

    /** The card on the Topics screen that opens the choice of topics for For you. */
    private void interests(Set<String> chosen) {
        if (chosen.isEmpty()) {
            interestsCardTitle.setText(R.string.interests_card_empty);
            interestsCardDetail.setText(R.string.interests_card_detail);
            interestsCardAction.setText(R.string.interests_choose);
        } else {
            List<String> names = new ArrayList<>();
            for (String id : chosen) names.add(getString(Topic.byId(id).label));
            interestsCardTitle.setText(R.string.interests_title);
            interestsCardDetail.setText(names.size() <= 2 ? String.join(", ", names)
                    : getString(R.string.interests_summary, String.join(", ", names.subList(0, 2)), names.size() - 2));
            interestsCardAction.setText(R.string.interests_edit);
        }
        interestsCard.setContentDescription(interestsCardTitle.getText() + ", " + interestsCardDetail.getText());
    }

    private void emptyState(FeedViewModel.State state, boolean saved) {
        boolean failed = state.feedError() != 0;
        boolean forYouEmpty = state.screen() == FeedViewModel.Screen.FOR_YOU && state.interests().isEmpty();
        emptyIcon.setImageResource(saved ? R.drawable.ic_bookmark : forYouEmpty ? R.drawable.ic_star
                : failed ? R.drawable.ic_cloud_off : R.drawable.ic_empty);
        emptyTitle.setText(saved ? R.string.empty_saved : forYouEmpty ? R.string.for_you_title
                : state.section().isEmpty() ? R.string.empty_feed : R.string.empty_section);
        emptyDetail.setText(saved ? R.string.empty_saved_detail : forYouEmpty ? R.string.for_you_detail
                : failed ? state.feedError() : R.string.empty_feed_detail);
        retry.setVisibility(saved ? View.GONE : View.VISIBLE);
        retry.setText(forYouEmpty ? R.string.choose_interests
                : !state.section().isEmpty() && !failed ? R.string.load_more : R.string.retry);
        retry.setEnabled(forYouEmpty || !state.exhausted() || state.section().isEmpty() || failed);
        retry.setAlpha(retry.isEnabled() ? 1f : .5f);
        emptyLink.setVisibility(forYouEmpty && !signedIn() ? View.VISIBLE : View.GONE);
    }

    private void banner(FeedViewModel.State state, int position) {
        boolean browsing = (state.screen() == FeedViewModel.Screen.FEED || state.screen() == FeedViewModel.Screen.FOR_YOU)
                && !state.stories().isEmpty();
        boolean atEnd = position >= state.stories().size() - 1;
        boolean caughtUpCard = false;
        for (Story story : state.stories()) caughtUpCard |= story.isCaughtUp();
        // With stories on screen a network failure means the reader is looking at the last saved page.
        int failure = state.feedError() == R.string.network_error ? R.string.offline_cached : state.feedError();
        int message = state.storageError() != 0 ? state.storageError()
                : browsing ? failure != 0 ? failure
                : state.loading() && !state.refreshing() ? R.string.loading_more
                : state.exhausted() && atEnd && !caughtUpCard ? R.string.end_feed : 0 : 0;
        bannerMessage.setVisibility(message == 0 ? View.GONE : View.VISIBLE);
        if (message != 0) bannerMessage.setText(message);
        boolean retryable = browsing && state.storageError() == 0 && failure != 0 && message == failure;
        bannerMessage.setOnClickListener(retryable ? view -> model.retry() : null);
        bannerMessage.setContentDescription(retryable ? getString(message) + " " + getString(R.string.retry_more) : null);
    }

    private void prefetch(int position) {
        List<Story> stories = shown == null ? List.of() : shown.stories();
        for (int next = position + 1; next <= position + 2 && next < stories.size(); next++)
            images.prefetch(stories.get(next).image());
    }

    /** The menu button: opens everything the header and the bottom bar used to hold. */
    private void openMenu() {
        if (menuSheet != null && menuSheet.isShowing()) return;
        menuSheet = MenuSheet.show(this, ui, model.current(), updates.storeBuild(), network.privacyOptions(this), new MenuSheet.Actions() {
            @Override public void screen(FeedViewModel.Screen screen) { model.screen(screen); }
            @Override public void language(String language) { Language.apply(language); }
            @Override public void section(String id) { model.section(id); }
            @Override public void account() { MainActivity.this.account(); }
            @Override public void theme() { chooseTheme(); }
            @Override public void about() { MainActivity.this.about(); }
            @Override public void contact() { MainActivity.this.contact(); }
            @Override public void privacy() { open(FeedApi.PRIVACY_URL); }
            @Override public void adChoices() { network.showPrivacyOptions(MainActivity.this, () -> { }); }
            @Override public void update() { updates.check(true); }
            @Override public void clearSaved() { confirmClearSaved(); }
        });
    }

    private void confirmClearSaved() {
        openDialog = new MaterialAlertDialogBuilder(this).setTitle(R.string.clear_saved)
                .setMessage(signedIn() ? R.string.clear_confirm_account : R.string.clear_confirm)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.clear, (dialog, which) -> model.clearSaved()).show();
    }

    @Override public void menu() { openMenu(); }

    /** Opens the choice of topics. The first choice also opens For you, so the effect is seen at once. */
    private void chooseInterests() {
        if (interestsSheet != null && interestsSheet.isShowing()) return;
        Set<String> before = model.current().interests();
        interestsSheet = InterestsSheet.show(this, ui, before, topics -> {
            model.interests(topics);
            if (before.isEmpty() && model.current().screen() != FeedViewModel.Screen.FOR_YOU) model.screen(FeedViewModel.Screen.FOR_YOU);
            Toast.makeText(this, R.string.interests_saved, Toast.LENGTH_SHORT).show();
        });
    }

    private boolean signedIn() { return accountManager != null && accountManager.signedIn(); }

    private void account() {
        if (accountSheet != null && accountSheet.isShowing()) return;
        accountSheet = AccountSheet.show(this, ui, accountManager, new AccountSheet.Actions() {
            @Override public void signIn() { startSignIn(); }
            @Override public void interests() { accountSheet.dismiss(); chooseInterests(); }
            @Override public void website() { open(FeedApi.SITE); }
            @Override public void deleteAccount() { confirmDeleteAccount(); }
            @Override public void privacy() { open(FeedApi.PRIVACY_URL); }
        });
    }

    /** Asks first: a deleted account cannot be brought back. The sheet shows the progress and the result. */
    private void confirmDeleteAccount() {
        if (openDialog != null && openDialog.isShowing()) return;
        openDialog = new MaterialAlertDialogBuilder(this).setTitle(R.string.account_delete_title)
                .setMessage(R.string.account_delete_message)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.account_delete_confirm, (dialog, which) -> accountManager.deleteAccount()).show();
    }

    /** Checks the account service first, so the reader is never sent to a browser page that cannot work. */
    private void startSignIn() {
        accountManager.begin(url -> runOnUiThread(() -> {
            if (!Story.isWebLink(url)) { accountManager.cancel(); return; }
            try {
                new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, Uri.parse(url));
            } catch (ActivityNotFoundException noBrowser) {
                accountManager.cancel();
                Toast.makeText(this, R.string.browser_unavailable, Toast.LENGTH_LONG).show();
            }
        }));
    }

    /** The browser returns here after Google sign-in. Only this app's own callback address is accepted. */
    private void deepLink(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getBooleanExtra(HANDLED, false)
                || !accountManager.ours(data.toString())) return;
        // A code is good once; marking the intent keeps it from being used again if it is delivered twice.
        intent.putExtra(HANDLED, true);
        accountManager.complete(data.toString());
        account();
    }

    private void accountChanged(AccountManager.Status status) {
        if (lastPhase != status.phase()) {
            if (lastPhase == AccountManager.Phase.WAITING && status.phase() == AccountManager.Phase.SIGNED_IN)
                Toast.makeText(this, R.string.account_signed_in, Toast.LENGTH_SHORT).show();
            if (status.message() == R.string.account_signed_out || status.message() == R.string.account_deleted)
                Toast.makeText(this, status.message(), Toast.LENGTH_LONG).show();
            lastPhase = status.phase();
            if (shown != null) render(shown);
        }
    }

    @Override public void check() { model.refresh(); }

    @Override public void earlier() { model.revealEarlier(); }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        deepLink(intent);
    }

    @Override protected void onStart() {
        super.onStart();
        accountManager.addListener(accountListener);
        accountManager.resume();
        model.foreground();
    }

    @Override protected void onResume() {
        super.onResume();
        updates.attach(updateHost);
        adBar.resume();
    }

    @Override protected void onPause() {
        adBar.pause();
        updates.detach(updateHost);
        super.onPause();
    }

    @Override protected void onStop() {
        accountManager.removeListener(accountListener);
        model.background();
        super.onStop();
    }

    private void chooseTheme() {
        String[] names = {getString(R.string.theme_system), getString(R.string.theme_light), getString(R.string.theme_dark)};
        openDialog = new MaterialAlertDialogBuilder(this).setTitle(R.string.theme)
                .setSingleChoiceItems(names, Prefs.theme(this), (dialog, which) -> { dialog.dismiss(); Prefs.theme(this, which); })
                .setNegativeButton(R.string.cancel, null).show();
    }

    private void about() {
        boolean withAds = network.banner() || network.page();
        String text = getString(withAds ? R.string.about_text_ads : R.string.about_text, BuildConfig.VERSION_NAME, Contact.EMAIL);
        // Store builds are updated by Google Play and never look for updates, so they do not describe it.
        if (!updates.storeBuild()) text += "\n\n" + getString(R.string.about_updates);
        openDialog = new MaterialAlertDialogBuilder(this).setTitle(R.string.about)
                .setMessage(text)
                .setNeutralButton(R.string.privacy_policy, (dialog, which) -> open(FeedApi.PRIVACY_URL))
                .setPositiveButton(R.string.done, null).show();
    }

    /** Contact us: the address to write to, who makes Plax and its contact page, one tap from the menu. */
    private void contact() {
        if (contactSheet != null && contactSheet.isShowing()) return;
        contactSheet = ContactSheet.show(this, ui, new ContactSheet.Actions() {
            @Override public void email() { writeToUs(); }
            @Override public void copy() { copyAddress(false); }
            @Override public void page() { open(Contact.PAGE_URL); }
        });
    }

    /** Opens a new message to us in the reader's mail app. With no mail app the address is copied, so it is never a dead end. */
    private void writeToUs() {
        Intent message = new Intent(Intent.ACTION_SENDTO, Uri.parse(Contact.mailto()))
                .putExtra(Intent.EXTRA_SUBJECT, Contact.subject(getString(R.string.app_name), BuildConfig.VERSION_NAME));
        try { startActivity(message); }
        catch (ActivityNotFoundException noMailApp) { copyAddress(true); }
    }

    private void copyAddress(boolean noMailApp) {
        ClipboardManager clipboard = getSystemService(ClipboardManager.class);
        clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.contact_email_label), Contact.EMAIL));
        if (noMailApp) Toast.makeText(this, R.string.contact_no_mail, Toast.LENGTH_LONG).show();
        // From Android 13 the system confirms a copy itself.
        else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) Toast.makeText(this, R.string.contact_copied, Toast.LENGTH_SHORT).show();
    }

    /** The screen the update manager offers an update on. */
    private final UpdateManager.Host updateHost = new UpdateManager.Host() {
        @Override public boolean idle() { return nothingOpen(); }
        @Override public void offer(AppUpdates.Release release) { offerUpdate(release); }
        @Override public void say(int message) { Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show(); }
        @Override public void store() { open(AppUpdates.PLAY_URL); }
    };

    /** True when an offer would not cover anything: no sheet or dialog is open and sign-in is not in progress. */
    private boolean nothingOpen() {
        AccountManager.Status account = accountManager.status();
        return !isFinishing() && !isDestroyed()
                && !(sheet != null && sheet.isShowing()) && !(interestsSheet != null && interestsSheet.isShowing())
                && !(accountSheet != null && accountSheet.isShowing()) && !(openDialog != null && openDialog.isShowing())
                && !(contactSheet != null && contactSheet.isShowing()) && !(menuSheet != null && menuSheet.isShowing())
                && account.phase() != AccountManager.Phase.WAITING && !account.busy();
    }

    private void offerUpdate(AppUpdates.Release release) {
        openDialog = new MaterialAlertDialogBuilder(this).setTitle(R.string.update_title)
                .setMessage(getString(R.string.update_message, release.versionName()))
                .setNegativeButton(R.string.update_later, (dialog, which) -> updates.dismiss(release))
                .setPositiveButton(R.string.update_download, (dialog, which) -> download(release))
                .setOnCancelListener(dialog -> updates.dismiss(release)).show();
    }

    /** The browser downloads the file; Android then asks the reader to approve installing it over this version. */
    private void download(AppUpdates.Release release) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(release.apkUrl())).addCategory(Intent.CATEGORY_BROWSABLE));
            updates.dismiss(release);
        } catch (ActivityNotFoundException noBrowser) {
            Toast.makeText(this, R.string.update_no_browser, Toast.LENGTH_LONG).show();
        }
    }

    @Override public void save(Story story) { model.toggle(story); }

    /**
     * Shares the story as a page on Plax when it can have one (a link that previews well and brings readers here),
     * and as its publisher's link otherwise or whenever the page cannot be made in time. Tapping Share again on the
     * same story while the link is being made means "do not wait": its publisher's link goes out at once.
     */
    @Override public void share(Story story) {
        if (sharingStory != null) {
            boolean sameStory = sharingStory.id().equals(story.id());
            giveUpWaiting();
            if (sameStory) { send(story, ""); return; }
        }
        if (!ShareLinks.eligible(story)) { send(story, ""); return; }
        sharingStory = story;
        int generation = ++shareGeneration;
        main.postDelayed(preparingHint, PREPARING_HINT_MS);
        shareRequest = ShareLinks.source.link(story, link -> runOnUiThread(() -> {
            if (generation != shareGeneration) return;
            main.removeCallbacks(preparingHint);
            sharingStory = null;
            // A chooser opened from the background would be blocked, and one for a closed screen is pointless.
            if (!isFinishing() && !isDestroyed() && getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED))
                send(story, link);
        }));
    }

    /** Stops waiting for the link being made, whatever it says later. */
    private void giveUpWaiting() {
        shareGeneration++;
        main.removeCallbacks(preparingHint);
        if (shareRequest != null) shareRequest.cancel();
        sharingStory = null;
    }

    private void send(Story story, String plaxLink) {
        Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, ShareLinks.message(story, plaxLink, getString(R.string.app_name)));
        try { startActivity(Intent.createChooser(intent, getString(R.string.share_chooser))); }
        catch (ActivityNotFoundException failure) { Toast.makeText(this, R.string.share_unavailable, Toast.LENGTH_LONG).show(); }
    }

    @Override public void source(Story story) { open(story.sourceUrl()); }

    @Override public void brief(Story story) {
        if (sheet != null && sheet.isShowing()) return;
        sheet = BriefSheet.show(this, ui, story, model.current().lang());
    }

    private void open(String link) {
        if (!Story.isWebLink(link)) { Toast.makeText(this, R.string.source_unavailable, Toast.LENGTH_LONG).show(); return; }
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, Uri.parse(link));
        } catch (ActivityNotFoundException failure) {
            Toast.makeText(this, R.string.browser_unavailable, Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onDestroy() {
        giveUpWaiting();
        // The ads of the pages live on in their view model while the screen is made again; this screen lets go of its own strip.
        ads.listen(null);
        adBar.destroy();
        if (sheet != null) sheet.dismiss();
        if (interestsSheet != null) interestsSheet.dismiss();
        if (accountSheet != null) accountSheet.dismiss();
        if (contactSheet != null) contactSheet.dismiss();
        if (menuSheet != null) menuSheet.dismiss();
        if (openDialog != null) openDialog.dismiss();
        if (skeletonPulse != null) skeletonPulse.cancel();
        if (images != null) images.close();
        super.onDestroy();
    }
}
