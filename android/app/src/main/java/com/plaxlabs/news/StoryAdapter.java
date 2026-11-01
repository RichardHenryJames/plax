package com.plaxlabs.news;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Build;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import androidx.annotation.NonNull;
import androidx.core.view.ViewCompat;
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.RecyclerView;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

final class StoryAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {
    interface Actions {
        void save(Story story);
        void share(Story story);
        void source(Story story);
        void brief(Story story);
        /** The caught-up card: look for newer stories. */
        void check();
        /** The caught-up card: go back over stories already seen. */
        void earlier();
        /** The menu button over a story: everything the header and the bottom bar used to hold. */
        default void menu() { }
        /** The ad that fills the ad page with this number (see {@link AdSlots#ordinal}), or null when it is not there (any longer). */
        default AdNetwork.Page ad(int ordinal) { return null; }
    }

    private static final int STORY = 0, CAUGHT_UP = 1, AD = 2;
    /** The emoji on the poster of a story with no picture; the page shrinks it to fit a small picture. */
    private static final float POSTER_SP = 64;

    private final Ui ui;
    private final ImageLoader images;
    private final Actions actions;
    private final int sidePadding;
    private final float titleSp, bodySp;
    /** Wide enough to show the read time beside the buttons on the source line; narrower keeps the room for the source and its age. */
    private final boolean roomy;
    /** The width of the card an ad is drawn in: the screen less a margin, and no wider than the reading column. */
    private final int adWidth;
    private List<Story> stories = List.of();
    /** The ad each ad page of the list holds, by the number of its slot: what was bound at the last submit. */
    private Map<Integer, AdNetwork.Page> adPages = Map.of();
    private Set<String> saved = Set.of();
    private boolean saving, storageReady;
    private int earlier;

    StoryAdapter(Ui ui, ImageLoader images, Actions actions, int widthDp, int heightDp) {
        this.ui = ui; this.images = images; this.actions = actions;
        roomy = widthDp >= 420;
        // On a short screen the type is a little smaller, so that more of the story fits in the one view it gets.
        boolean compact = heightDp < 700;
        titleSp = compact ? 21 : 24;
        bodySp = compact ? 15 : 16;
        // Keep a comfortable reading width on tablets and in landscape.
        int cardWidth = Math.min(widthDp, 640);
        sidePadding = ui.dp(Math.max(16, (widthDp - cardWidth) / 2f));
        adWidth = ui.dp(Math.min(widthDp - 32, 560));
    }

    void submit(List<Story> updated, Set<String> savedIds, boolean saving, boolean ready, int earlierCount) {
        List<Story> before = stories;
        Set<String> previousSaved = saved;
        Map<Integer, AdNetwork.Page> previousAds = adPages;
        Map<Integer, AdNetwork.Page> currentAds = new HashMap<>();
        for (Story story : updated) if (story.isAd()) currentAds.put(story.adOrdinal(), actions.ad(story.adOrdinal()));
        boolean previousSaving = this.saving, previousReady = storageReady;
        int previousEarlier = earlier;
        stories = updated; adPages = currentAds; saved = savedIds; this.saving = saving; storageReady = ready; earlier = earlierCount;
        DiffUtil.calculateDiff(new DiffUtil.Callback() {
            @Override public int getOldListSize() { return before.size(); }
            @Override public int getNewListSize() { return updated.size(); }
            @Override public boolean areItemsTheSame(int old, int next) { return before.get(old).id().equals(updated.get(next).id()); }
            @Override public boolean areContentsTheSame(int old, int next) {
                Story story = updated.get(next);
                // An ad page changes only when another ad has taken the slot.
                if (story.isAd()) return previousAds.get(story.adOrdinal()) == currentAds.get(story.adOrdinal());
                if (story.isCaughtUp()) return previousEarlier == earlierCount;
                return before.get(old).equals(story) && before.size() == updated.size()
                        && previousSaved.contains(story.id()) == savedIds.contains(story.id())
                        && previousSaving == saving && previousReady == ready;
            }
        }, false).dispatchUpdatesTo(this);
    }

    @Override public int getItemCount() { return stories.size(); }

    @Override public int getItemViewType(int index) {
        Story story = stories.get(index);
        return story.isAd() ? AD : story.isCaughtUp() ? CAUGHT_UP : STORY;
    }

    @NonNull @Override public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int type) {
        return type == AD ? adPage(parent.getContext()) : type == CAUGHT_UP ? caughtUp(parent.getContext()) : story(parent);
    }

    @Override public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int index) {
        if (holder instanceof Caught caught) bindCaughtUp(caught);
        else if (holder instanceof AdHolder ad) bindAd(ad, index);
        else bindStory((Holder) holder, index);
    }

    /**
     * The page of an ad: the menu button in the corner as on every page, the ad's card in the middle, and under it a quiet hint of how
     * to move on. The hint is text only: nothing of ours that can be pressed stands near the ad.
     */
    private AdHolder adPage(Context context) {
        FrameLayout page = new FrameLayout(context);
        page.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        page.setBackgroundColor(ui.bg);
        FrameLayout host = new FrameLayout(context);
        FrameLayout.LayoutParams hostSize = new FrameLayout.LayoutParams(-1, -1);
        hostSize.topMargin = ui.dp(StoryPage.MENU_TOUCH_DP + 8); hostSize.bottomMargin = ui.dp(56);
        page.addView(host, hostSize);

        LinearLayout hint = ui.row();
        hint.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        ImageView arrow = ui.icon(R.drawable.ic_arrow_up, ui.text2, 16);
        arrow.setAlpha(.8f);
        hint.addView(arrow, new LinearLayout.LayoutParams(ui.dp(16), ui.dp(16)));
        TextView words = ui.text(context.getString(R.string.ad_next_hint), 12, ui.text2, false);
        words.setPadding(ui.dp(6), 0, 0, 0);
        hint.addView(words);
        FrameLayout.LayoutParams hintSize = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        hintSize.bottomMargin = ui.dp(22);
        page.addView(hint, hintSize);

        FrameLayout.LayoutParams corner = new FrameLayout.LayoutParams(ui.dp(StoryPage.MENU_TOUCH_DP), ui.dp(StoryPage.MENU_TOUCH_DP), Gravity.TOP | Gravity.START);
        corner.setMargins(ui.dp(12), ui.dp(4), 0, 0);
        page.addView(ui.menuButton(() -> actions.menu()), corner);
        return new AdHolder(page, host);
    }

    private void bindAd(AdHolder holder, int index) {
        AdNetwork.Page ad = actions.ad(stories.get(index).adOrdinal());
        if (holder.ad == ad) return;
        holder.host.removeAllViews();
        holder.ad = ad;
        if (ad == null) return;
        View card = ad.view(holder.itemView.getContext(), ui);
        if (card.getParent() instanceof ViewGroup parent) parent.removeView(card);
        holder.host.addView(card, new FrameLayout.LayoutParams(adWidth, -2, Gravity.CENTER));
    }

    private Caught caughtUp(Context context) {
        LinearLayout root = ui.column();
        root.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        root.setGravity(Gravity.CENTER);
        root.setPadding(sidePadding + ui.dp(16), ui.dp(16), sidePadding + ui.dp(16), ui.dp(16));
        root.setBackgroundColor(ui.bg);
        FrameLayout badge = new FrameLayout(context);
        badge.setBackground(ui.round(ui.accentSoft, 40));
        badge.addView(ui.icon(R.drawable.ic_check_circle, ui.accentText, 40), new FrameLayout.LayoutParams(ui.dp(40), ui.dp(40), Gravity.CENTER));
        root.addView(badge, new LinearLayout.LayoutParams(ui.dp(80), ui.dp(80)));
        TextView title = ui.text(context.getString(R.string.caught_up), 24, ui.text, "serif");
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        title.setGravity(Gravity.CENTER); title.setPadding(0, ui.dp(20), 0, ui.dp(8));
        ViewCompat.setAccessibilityHeading(title, true);
        root.addView(title);
        TextView detail = ui.text(context.getString(R.string.caught_up_detail), 15, ui.text2, false);
        detail.setGravity(Gravity.CENTER); detail.setLineSpacing(0, 1.3f);
        root.addView(detail);
        TextView check = ui.primaryButton(R.string.check_new, () -> actions.check());
        LinearLayout.LayoutParams checkSize = new LinearLayout.LayoutParams(-2, -2);
        checkSize.topMargin = ui.dp(28);
        root.addView(check, checkSize);
        TextView review = ui.secondaryButton("", () -> actions.earlier());
        LinearLayout.LayoutParams reviewSize = new LinearLayout.LayoutParams(-2, -2);
        reviewSize.topMargin = ui.dp(12);
        root.addView(review, reviewSize);
        // The menu button stands in the corner, as it does on a story.
        FrameLayout page = new FrameLayout(context);
        page.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        page.setBackgroundColor(ui.bg);
        page.addView(root, new FrameLayout.LayoutParams(-1, -1));
        FrameLayout.LayoutParams corner = new FrameLayout.LayoutParams(ui.dp(StoryPage.MENU_TOUCH_DP), ui.dp(StoryPage.MENU_TOUCH_DP), Gravity.TOP | Gravity.START);
        corner.setMargins(ui.dp(12), ui.dp(4), 0, 0);
        page.addView(ui.menuButton(() -> actions.menu()), corner);
        return new Caught(page, review);
    }

    private void bindCaughtUp(Caught holder) {
        Context context = holder.itemView.getContext();
        holder.earlier.setVisibility(earlier > 0 ? View.VISIBLE : View.GONE);
        holder.earlier.setText(context.getResources().getQuantityString(R.plurals.read_earlier, earlier, earlier));
    }

    private Holder story(ViewGroup parent) {
        Context context = parent.getContext();

        FrameLayout hero = new FrameLayout(context);
        hero.setClipToOutline(true);
        android.graphics.drawable.Drawable imageBackground = ui.round(ui.surfaceAlt, 24);
        // Stories without a picture get a poster, so every card keeps the same rhythm.
        android.graphics.drawable.GradientDrawable posterBackground = new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TL_BR, new int[]{ui.accentSoft, ui.surfaceAlt});
        posterBackground.setCornerRadius(ui.dp(24));
        ImageView image = new ImageView(context);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        hero.addView(image, new FrameLayout.LayoutParams(-1, -1));
        ImageView placeholder = ui.icon(R.drawable.ic_image, ui.text2, 40);
        placeholder.setAlpha(.45f);
        hero.addView(placeholder, new FrameLayout.LayoutParams(ui.dp(40), ui.dp(40), Gravity.CENTER));
        TextView poster = ui.text("", POSTER_SP, ui.text, false);
        poster.setGravity(Gravity.CENTER);
        poster.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        hero.addView(poster, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout meta = ui.row();
        // The page puts the space above the source line itself: it is there when a picture is above it, and not when it is first.
        TextView category = ui.text("", 11, ui.accentText, true);
        category.setLetterSpacing(.06f); category.setSingleLine();
        category.setPadding(ui.dp(10), ui.dp(5), ui.dp(10), ui.dp(5));
        category.setBackground(ui.round(ui.accentSoft, 12));
        meta.addView(category, new LinearLayout.LayoutParams(-2, -2));
        // The source and its age may take a second line: the buttons make the row 48 dp tall, and two lines of this size fit in it.
        TextView credit = ui.text("", 12, ui.text2, false);
        credit.setMaxLines(2); credit.setEllipsize(TextUtils.TruncateAt.END);
        credit.setPadding(ui.dp(10), 0, ui.dp(4), 0);
        meta.addView(credit, new LinearLayout.LayoutParams(0, -2, 1));
        // The three buttons stand at the right end of the same line.
        ImageButton brief = ui.lineButton(R.drawable.ic_sparkle, R.string.brief_description, ui.accentSoft, ui.accentText);
        ImageButton save = ui.lineButton(R.drawable.ic_bookmark, R.string.save_description, ui.surfaceAlt, ui.text);
        ImageButton share = ui.lineButton(R.drawable.ic_share, R.string.share, ui.surfaceAlt, ui.text);
        for (ImageButton button : List.of(brief, save, share)) meta.addView(button);

        // The headline is the link to the full story. The background is set before the padding, which a background may replace.
        TextView title = ui.text("", titleSp, ui.text, "serif");
        title.setBackground(ui.pressable(8));
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        title.setLineSpacing(0, 1.18f); title.setPadding(0, ui.dp(12), 0, 0);
        ViewCompat.setAccessibilityHeading(title, true);
        TextView content = ui.text("", bodySp, ui.text, false);
        content.setAlpha(.88f); content.setLineSpacing(0, 1.38f); content.setPadding(0, ui.dp(14), 0, 0);

        // Nothing on the page scrolls: it shares its height out so that all of it is in view, and a swipe changes story.
        StoryPage page = new StoryPage(context, ui, hero, poster, meta, title, content, ui.menuButton(() -> actions.menu()),
                titleSp, bodySp, POSTER_SP);
        page.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        return new Holder(page, hero, image, placeholder, poster, imageBackground, posterBackground, category, credit,
                title, content, brief, save, share);
    }

    private void bindStory(Holder holder, int index) {
        Story story = stories.get(index);
        Context context = holder.itemView.getContext();
        holder.storyId = story.id();

        boolean hasImage = story.hasImage();
        holder.hero.setBackground(hasImage ? holder.imageBackground : holder.posterBackground);
        holder.poster.setVisibility(hasImage ? View.GONE : View.VISIBLE);
        holder.poster.setText(emoji(story));
        holder.placeholder.setVisibility(hasImage ? View.VISIBLE : View.GONE);
        if (hasImage) {
            boolean[] immediate = {true};
            images.load(story.image(), holder.image, loaded -> {
                if (!loaded) return;
                holder.placeholder.setVisibility(View.GONE);
                if (!immediate[0] && ValueAnimator.areAnimatorsEnabled()) {
                    holder.image.setAlpha(0f);
                    holder.image.animate().alpha(1f).setDuration(160).start();
                } else holder.image.setAlpha(1f);
            });
            immediate[0] = false;
        } else images.cancel(holder.image);

        Locale locale = context.getResources().getConfiguration().getLocales().get(0);
        holder.category.setText(label(context, story).toUpperCase(locale));
        holder.credit.setText(credit(context, story, locale));
        holder.title.setText(story.title());
        holder.title.setVisibility(story.title().isEmpty() ? View.GONE : View.VISIBLE);
        // The headline opens the full story at the publisher; a story with no usable link is not pressable at all. The listener is
        // set first: setting one makes a view clickable, even a null one.
        boolean linked = story.hasSource();
        holder.title.setOnClickListener(linked ? view -> actions.source(story) : null);
        holder.title.setClickable(linked); holder.title.setFocusable(linked);
        ViewCompat.replaceAccessibilityAction(holder.title, AccessibilityNodeInfoCompat.AccessibilityActionCompat.ACTION_CLICK,
                linked ? context.getString(R.string.read_full_story) : null, null);
        String text = story.body();
        holder.content.setText(text);
        holder.content.setVisibility(text.isEmpty() ? View.GONE : View.VISIBLE);

        boolean isSaved = saved.contains(story.id());
        holder.save.setImageResource(isSaved ? R.drawable.ic_bookmark_filled : R.drawable.ic_bookmark);
        holder.save.setColorFilter(isSaved ? ui.accentText : ui.text);
        holder.save.setContentDescription(context.getString(isSaved ? R.string.unsave_description : R.string.save_description));
        holder.save.setEnabled(storageReady && !saving); holder.save.setAlpha(storageReady ? 1f : .5f);
        holder.save.setOnClickListener(view -> {
            view.performHapticFeedback(Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM
                    : HapticFeedbackConstants.VIRTUAL_KEY);
            if (ValueAnimator.areAnimatorsEnabled())
                view.animate().scaleX(1.18f).scaleY(1.18f).setDuration(90)
                        .withEndAction(() -> view.animate().scaleX(1f).scaleY(1f).setDuration(110).start()).start();
            actions.save(story);
        });
        holder.share.setOnClickListener(view -> actions.share(story));
        holder.brief.setOnClickListener(view -> actions.brief(story));
    }

    static String emoji(Story story) {
        String key = story.section().isEmpty() ? story.category() : story.section();
        switch (key) {
            case "india": return "\uD83C\uDDEE\uD83C\uDDF3";
            case "world": return "\uD83C\uDF0D";
            case "tech": return Topic.TECHNOLOGY.emoji;
            case "business": return Topic.BUSINESS.emoji;
            case "science": return Topic.SCIENCE.emoji;
            default:
                for (Topic topic : Topic.values()) if (topic.id.equals(key)) return topic.emoji;
                return "\u2728";
        }
    }

    static String label(Context context, Story story) {
        String key = story.section().isEmpty() ? story.category() : story.section();
        switch (key) {
            case "india": return context.getString(R.string.section_india);
            case "world": return context.getString(R.string.section_world);
            case "tech": return context.getString(R.string.section_tech);
            case "business": return context.getString(R.string.section_business);
            case "science": return context.getString(R.string.section_science);
            default:
                for (Topic topic : Topic.values()) if (topic.id.equals(key)) return context.getString(topic.label);
                return key.isEmpty() ? context.getString(R.string.topic_news) : key;
        }
    }

    private String credit(Context context, Story story, Locale locale) {
        List<String> parts = new ArrayList<>();
        parts.add(story.source().isEmpty() ? context.getString(R.string.source_unknown) : story.source());
        // Each part after the source is kept whole, so a line never breaks inside "3h ago".
        String age = age(context, story.publishedAt(), locale);
        if (!age.isEmpty()) parts.add(whole(age));
        // On a narrow phone the room beside the buttons goes to the source and its age.
        String reading = roomy ? readTime(context, story) : "";
        if (!reading.isEmpty()) parts.add(whole(reading));
        return String.join(" \u00b7 ", parts);
    }

    private static String whole(String text) { return text.replace(' ', '\u00a0'); }

    static String readTime(Context context, Story story) {
        int seconds = story.readSeconds();
        if (seconds < 0) return story.readTime();
        return seconds < 60 ? context.getString(R.string.read_seconds, seconds)
                : context.getString(R.string.read_minutes, Math.max(1, Math.round(seconds / 60f)));
    }

    static String age(Context context, long published, Locale locale) {
        long delta = System.currentTimeMillis() - published;
        if (published <= 0 || delta < 0) return "";
        if (delta < 60_000) return context.getString(R.string.just_now);
        if (delta < 3_600_000) return context.getString(R.string.minutes_ago, delta / 60_000);
        if (delta < 86_400_000) return context.getString(R.string.hours_ago, delta / 3_600_000);
        return DateTimeFormatter.ofPattern("d MMM", locale).withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(published));
    }

    @Override public void onViewRecycled(@NonNull RecyclerView.ViewHolder holder) {
        if (holder instanceof Holder story) images.cancel(story.image);
        // The ad stays with its slot; only its card is taken off this page, which is free to hold another.
        if (holder instanceof AdHolder ad) { ad.host.removeAllViews(); ad.ad = null; }
    }

    /** The page of an ad between stories. */
    static final class AdHolder extends RecyclerView.ViewHolder {
        final FrameLayout host;
        AdNetwork.Page ad;
        AdHolder(View root, FrameLayout host) { super(root); this.host = host; }
    }

    /** The caught-up card at the end of the new stories. */
    static final class Caught extends RecyclerView.ViewHolder {
        final TextView earlier;
        Caught(View root, TextView earlier) { super(root); this.earlier = earlier; }
    }

    static final class Holder extends RecyclerView.ViewHolder {
        final StoryPage page; final FrameLayout hero; final ImageView image, placeholder;
        final TextView poster, category, credit, title, content;
        final android.graphics.drawable.Drawable imageBackground, posterBackground;
        final ImageButton brief, save, share;
        String storyId = "";
        Holder(StoryPage page, FrameLayout hero, ImageView image, ImageView placeholder, TextView poster,
               android.graphics.drawable.Drawable imageBackground, android.graphics.drawable.Drawable posterBackground,
               TextView category, TextView credit, TextView title, TextView content,
               ImageButton brief, ImageButton save, ImageButton share) {
            super(page); this.page = page; this.hero = hero; this.image = image; this.placeholder = placeholder;
            this.poster = poster; this.imageBackground = imageBackground; this.posterBackground = posterBackground;
            this.category = category; this.credit = credit; this.title = title; this.content = content;
            this.brief = brief; this.save = save; this.share = share;
        }
    }
}
