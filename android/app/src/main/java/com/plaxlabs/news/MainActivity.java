package com.plaxlabs.news;

import android.animation.ObjectAnimator;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
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
    /** A link is being made for a share; a second tap meanwhile would only open a second chooser. */
    private boolean sharing;
    private Cancelable shareRequest;
    private final Runnable preparingHint = () -> Toast.makeText(this, R.string.share_preparing, Toast.LENGTH_SHORT).show();

    private Ui ui;
    private FeedViewModel model;
    private ImageLoader images;
    private StoryAdapter adapter;
    private ViewPager2 pager;
    private LinearLayout root, sectionRow, empty, navBar, interestsCard;
    private FrameLayout content;
    private HorizontalScrollView sectionScroll;
    private ScrollView topicScroll;
    private TextView bannerMessage, emptyTitle, emptyDetail, freshPill, english, hindi;
    private TextView interestsCardTitle, interestsCardDetail, interestsCardAction, emptyLink;
    private ImageView emptyIcon;
    private ImageButton refresh;
    private ProgressBar spinner;
    private TextView retry;
    private View skeleton;
    private ObjectAnimator skeletonPulse;
    private BriefSheet sheet;
    private InterestsSheet interestsSheet;
    private AccountSheet accountSheet;
    private AccountManager accountManager;
    private AccountManager.Phase lastPhase;
    private final AccountManager.Listener accountListener = status -> runOnUiThread(() -> accountChanged(status));
    private UpdateManager updates;
    /** The simple dialog on screen (theme, about, clear, update), so nothing else is drawn over it. */
    AlertDialog openDialog;
    private FeedViewModel.State shown;
    private final Map<FeedViewModel.Screen, NavItem> tabs = new EnumMap<>(FeedViewModel.Screen.class);
    private final Map<String, TextView> sections = new LinkedHashMap<>();
    private final Map<Topic, TopicTile> tiles = new EnumMap<>(Topic.class);
    private boolean rendering, reportedDrawn;

    private record NavItem(View view, FrameLayout pill, ImageView icon, TextView label) { }
    private record TopicTile(View view, TextView current) { }

    @Override protected void onCreate(Bundle saved) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(saved);
        accountManager = AccountManager.get(this);
        updates = UpdateManager.get(this);
        model = new ViewModelProvider(this).get(FeedViewModel.class);
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
        header(); sections(); body(); navigation();
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, 0);
            navBar.setPadding(ui.dp(8), ui.dp(4), ui.dp(8), ui.dp(4) + bars.bottom);
            return insets;
        });

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

    private void header() {
        LinearLayout header = ui.row();
        header.setPadding(ui.dp(16), 0, ui.dp(4), 0);
        header.setMinimumHeight(ui.dp(56));
        header.addView(ui.icon(R.drawable.ic_plax, ui.text, 28));
        TextView name = ui.text(getString(R.string.app_name), 22, ui.text, "serif");
        name.setTypeface(Typeface.create("serif", Typeface.BOLD));
        name.setPadding(ui.dp(8), 0, 0, 0);
        header.addView(name, new LinearLayout.LayoutParams(0, -2, 1));

        LinearLayout switcher = ui.row();
        switcher.setBackground(new InsetDrawable(ui.outline(ui.surfaceAlt, ui.border, 18), 0, ui.dp(6), 0, ui.dp(6)));
        switcher.setPadding(ui.dp(2), 0, ui.dp(2), 0);
        english = segment(getString(R.string.language_english), getString(R.string.read_in_english), Language.ENGLISH);
        hindi = segment(getString(R.string.language_hindi), getString(R.string.read_in_hindi), Language.HINDI);
        switcher.addView(english); switcher.addView(hindi);
        header.addView(switcher);

        FrameLayout refreshHolder = new FrameLayout(this);
        refresh = ui.iconButton(R.drawable.ic_refresh, R.string.refresh, Color.TRANSPARENT, ui.text, () -> model.refresh());
        refreshHolder.addView(refresh, new FrameLayout.LayoutParams(ui.dp(48), ui.dp(48)));
        spinner = new ProgressBar(this);
        spinner.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(ui.accentText));
        spinner.setContentDescription(getString(R.string.refreshing));
        spinner.setVisibility(View.GONE);
        refreshHolder.addView(spinner, new FrameLayout.LayoutParams(ui.dp(24), ui.dp(24), Gravity.CENTER));
        header.addView(refreshHolder, new LinearLayout.LayoutParams(ui.dp(48), ui.dp(48)));

        ImageButton more = ui.iconButton(R.drawable.ic_more, R.string.more, Color.TRANSPARENT, ui.text, () -> { });
        more.setOnClickListener(view -> menu(view));
        header.addView(more);
        root.addView(header);
    }

    private TextView segment(String label, String description, String language) {
        TextView view = ui.text(label, 12, ui.text2, true);
        view.setGravity(Gravity.CENTER);
        view.setMinWidth(ui.dp(52)); view.setMinHeight(ui.dp(48));
        StateListDrawable background = new StateListDrawable();
        background.addState(new int[]{android.R.attr.state_selected}, new InsetDrawable(ui.round(ui.accent, 16), 0, ui.dp(8), 0, ui.dp(8)));
        background.addState(new int[]{}, new ColorDrawable(Color.TRANSPARENT));
        view.setBackground(background);
        view.setPadding(ui.dp(8), 0, ui.dp(8), 0);
        view.setTextColor(new android.content.res.ColorStateList(
                new int[][]{{android.R.attr.state_selected}, {}}, new int[]{ui.onAccent, ui.text2}));
        view.setContentDescription(description);
        view.setOnClickListener(item -> { if (!Language.current().equals(language)) Language.apply(language); });
        return view;
    }

    private void sections() {
        sectionScroll = new HorizontalScrollView(this);
        sectionScroll.setHorizontalScrollBarEnabled(false);
        sectionRow = ui.row();
        sectionRow.setPadding(ui.dp(12), 0, ui.dp(12), 0);
        String[] ids = {"", "india", "world", "tech", "business", "science"};
        int[] labels = {R.string.all, R.string.section_india, R.string.section_world, R.string.section_tech,
                R.string.section_business, R.string.section_science};
        for (int index = 0; index < ids.length; index++) {
            String id = ids[index];
            TextView chip = ui.chip(getString(labels[index]), () -> model.section(id));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, -2);
            params.setMarginEnd(ui.dp(2)); sectionRow.addView(chip, params); sections.put(id, chip);
        }
        sectionScroll.addView(sectionRow);
        root.addView(sectionScroll);
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
                model.position(position);
                prefetch(position);
                if (shown != null) banner(shown, position);
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
        topicContent.setPadding(ui.dp(20), ui.dp(16), ui.dp(20), ui.dp(24));
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
        pillParams.topMargin = ui.dp(8);
        content.addView(freshPill, pillParams);
        var arrow = androidx.core.content.ContextCompat.getDrawable(this, R.drawable.ic_arrow_up).mutate();
        arrow.setTint(ui.onAccent); arrow.setBounds(0, 0, ui.dp(16), ui.dp(16));
        freshPill.setCompoundDrawablesRelative(arrow, null, null, null);
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

    private void navigation() {
        navBar = ui.row();
        navBar.setBackgroundColor(ui.surface);
        FeedViewModel.Screen[] screens = FeedViewModel.Screen.values();
        int[] icons = {R.drawable.ic_feed, R.drawable.ic_star, R.drawable.ic_grid, R.drawable.ic_bookmark};
        int[] labels = {R.string.feed, R.string.for_you, R.string.topics, R.string.saved};
        for (int index = 0; index < screens.length; index++) {
            FeedViewModel.Screen screen = screens[index];
            LinearLayout item = ui.column();
            item.setGravity(Gravity.CENTER_HORIZONTAL);
            item.setPadding(0, ui.dp(8), 0, ui.dp(2));
            item.setBackground(ui.touch(new ColorDrawable(Color.TRANSPARENT), 12));
            item.setClickable(true); item.setFocusable(true);
            item.setContentDescription(getString(labels[index]));
            FrameLayout pill = new FrameLayout(this);
            StateListDrawable background = new StateListDrawable();
            background.addState(new int[]{android.R.attr.state_selected}, ui.round(ui.accentSoft, 16));
            background.addState(new int[]{}, new ColorDrawable(Color.TRANSPARENT));
            pill.setBackground(background);
            ImageView icon = ui.icon(icons[index], ui.text2, 24);
            pill.addView(icon, new FrameLayout.LayoutParams(ui.dp(24), ui.dp(24), Gravity.CENTER));
            item.addView(pill, new LinearLayout.LayoutParams(ui.dp(64), ui.dp(32)));
            TextView label = ui.text(getString(labels[index]), 11, ui.text2, true);
            label.setPadding(0, ui.dp(4), 0, ui.dp(4));
            item.addView(label, new LinearLayout.LayoutParams(-2, -2));
            item.setOnClickListener(view -> model.screen(screen));
            navBar.addView(item, new LinearLayout.LayoutParams(0, -2, 1));
            tabs.put(screen, new NavItem(item, pill, icon, label));
        }
        root.addView(navBar);
    }

    private void render(FeedViewModel.State state) {
        rendering = true;
        shown = state;
        try {
            boolean topics = state.screen() == FeedViewModel.Screen.TOPICS, saved = state.screen() == FeedViewModel.Screen.SAVED;
            boolean feed = state.screen() == FeedViewModel.Screen.FEED, noStories = state.stories().isEmpty();
            boolean browsing = feed || state.screen() == FeedViewModel.Screen.FOR_YOU;
            english.setSelected(Language.ENGLISH.equals(state.lang())); hindi.setSelected(Language.HINDI.equals(state.lang()));
            // Hindi cards carry no section tag, so the section filters only apply to English headlines.
            sectionScroll.setVisibility(feed && state.topic() == Topic.NEWS && Language.ENGLISH.equals(state.lang())
                    ? View.VISIBLE : View.GONE);
            for (var entry : sections.entrySet()) entry.getValue().setSelected(entry.getKey().equals(state.section()));
            for (var entry : tabs.entrySet()) {
                boolean selected = entry.getKey() == state.screen();
                NavItem item = entry.getValue();
                item.pill().setSelected(selected); item.view().setSelected(selected);
                item.icon().setColorFilter(selected ? ui.accentText : ui.text2);
                item.label().setTextColor(selected ? ui.text : ui.text2);
            }
            for (var entry : tiles.entrySet()) {
                boolean current = entry.getKey() == state.topic();
                entry.getValue().view().setBackground(ui.touch(current ? ui.outline(ui.accentSoft, ui.accent, 20)
                        : ui.outline(ui.surface, ui.border, 20), 20));
                entry.getValue().current().setVisibility(current ? View.VISIBLE : View.GONE);
            }
            interests(state.interests());

            adapter.submit(state.stories(), state.savedIds(), state.saving(), state.storageReady(), state.earlier());
            if (!noStories) {
                int target = Math.min(state.position(), state.stories().size() - 1);
                if (pager.getCurrentItem() != target) pager.setCurrentItem(target, false);
                prefetch(target);
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

            refresh.setAlpha(state.refreshing() ? 0f : 1f); refresh.setEnabled(!state.refreshing());
            spinner.setVisibility(state.refreshing() ? View.VISIBLE : View.GONE);
            freshPill.setVisibility(state.fresh() ? View.VISIBLE : View.GONE);
            banner(state, pager.getCurrentItem());
            if (state.notice() != 0) { Toast.makeText(this, state.notice(), Toast.LENGTH_SHORT).show(); model.acknowledgeNotice(); }
        } finally { rendering = false; }
    }

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

    private void menu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(R.string.account).setOnMenuItemClickListener(item -> { account(); return true; });
        menu.getMenu().add(R.string.interests_title).setOnMenuItemClickListener(item -> { chooseInterests(); return true; });
        menu.getMenu().add(R.string.theme).setOnMenuItemClickListener(item -> { chooseTheme(); return true; });
        menu.getMenu().add(R.string.about).setOnMenuItemClickListener(item -> { about(); return true; });
        menu.getMenu().add(updates.storeBuild() ? R.string.update_play : R.string.update_check)
                .setOnMenuItemClickListener(item -> { updates.check(true); return true; });
        menu.getMenu().add(R.string.open_site).setOnMenuItemClickListener(item -> { open(FeedApi.SITE); return true; });
        menu.getMenu().add(R.string.clear_saved).setOnMenuItemClickListener(item -> {
            openDialog = new MaterialAlertDialogBuilder(this).setTitle(R.string.clear_saved)
                    .setMessage(signedIn() ? R.string.clear_confirm_account : R.string.clear_confirm)
                    .setNegativeButton(R.string.cancel, null)
                    .setPositiveButton(R.string.clear, (dialog, which) -> model.clearSaved()).show();
            return true;
        });
        menu.show();
    }

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
        });
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
            if (status.message() == R.string.account_signed_out) Toast.makeText(this, status.message(), Toast.LENGTH_LONG).show();
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
    }

    @Override protected void onPause() {
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
        String text = getString(R.string.about_text, BuildConfig.VERSION_NAME);
        // Store builds are updated by Google Play and never look for updates, so they do not describe it.
        if (!updates.storeBuild()) text += "\n\n" + getString(R.string.about_updates);
        openDialog = new MaterialAlertDialogBuilder(this).setTitle(R.string.about)
                .setMessage(text)
                .setPositiveButton(R.string.done, null).show();
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
     * and as its publisher's link otherwise or whenever the page cannot be made in time.
     */
    @Override public void share(Story story) {
        if (sharing) return;
        if (!ShareLinks.eligible(story)) { send(story, ""); return; }
        sharing = true;
        main.postDelayed(preparingHint, PREPARING_HINT_MS);
        shareRequest = ShareLinks.source.link(story, link -> runOnUiThread(() -> {
            main.removeCallbacks(preparingHint);
            sharing = false;
            // A chooser opened from the background would be blocked, and one for a closed screen is pointless.
            if (!isFinishing() && !isDestroyed() && getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED))
                send(story, link);
        }));
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
        main.removeCallbacks(preparingHint);
        if (shareRequest != null) shareRequest.cancel();
        if (sheet != null) sheet.dismiss();
        if (interestsSheet != null) interestsSheet.dismiss();
        if (accountSheet != null) accountSheet.dismiss();
        if (openDialog != null) openDialog.dismiss();
        if (skeletonPulse != null) skeletonPulse.cancel();
        if (images != null) images.close();
        super.onDestroy();
    }
}
