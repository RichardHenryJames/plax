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
    }

    private static final int STORY = 0, CAUGHT_UP = 1;

    private final Ui ui;
    private final ImageLoader images;
    private final Actions actions;
    private final boolean compact;
    private final int heroHeight, tallHeroHeight, sidePadding;
    private List<Story> stories = List.of();
    private Set<String> saved = Set.of();
    private boolean saving, storageReady;
    private int earlier;

    StoryAdapter(Ui ui, ImageLoader images, Actions actions, int widthDp, int heightDp) {
        this.ui = ui; this.images = images; this.actions = actions;
        compact = heightDp < 700;
        // Keep a comfortable reading width on tablets and in landscape.
        int cardWidth = Math.min(widthDp, 640);
        sidePadding = ui.dp(Math.max(16, (widthDp - cardWidth) / 2f));
        float hero = Math.max(112, Math.min((cardWidth - 32) * 9 / 16f, heightDp * .30f));
        // Large text needs the room more than the picture does.
        if (ui.fontScale() > 1.15f) hero = Math.max(104, hero * .8f);
        heroHeight = ui.dp(hero);
        // A headline with no body text has room to spare, so the picture takes it.
        tallHeroHeight = ui.dp(Math.max(hero, Math.min(hero * 1.5f, heightDp * .42f)));
    }

    void submit(List<Story> updated, Set<String> savedIds, boolean saving, boolean ready, int earlierCount) {
        List<Story> before = stories;
        Set<String> previousSaved = saved;
        boolean previousSaving = this.saving, previousReady = storageReady;
        int previousEarlier = earlier;
        stories = updated; saved = savedIds; this.saving = saving; storageReady = ready; earlier = earlierCount;
        DiffUtil.calculateDiff(new DiffUtil.Callback() {
            @Override public int getOldListSize() { return before.size(); }
            @Override public int getNewListSize() { return updated.size(); }
            @Override public boolean areItemsTheSame(int old, int next) { return before.get(old).id().equals(updated.get(next).id()); }
            @Override public boolean areContentsTheSame(int old, int next) {
                Story story = updated.get(next);
                if (story.isCaughtUp()) return previousEarlier == earlierCount;
                return before.get(old).equals(story) && before.size() == updated.size()
                        && previousSaved.contains(story.id()) == savedIds.contains(story.id())
                        && previousSaving == saving && previousReady == ready;
            }
        }, false).dispatchUpdatesTo(this);
    }

    @Override public int getItemCount() { return stories.size(); }

    @Override public int getItemViewType(int index) { return stories.get(index).isCaughtUp() ? CAUGHT_UP : STORY; }

    @NonNull @Override public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int type) {
        return type == CAUGHT_UP ? caughtUp(parent.getContext()) : story(parent);
    }

    @Override public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int index) {
        if (holder instanceof Caught caught) bindCaughtUp(caught);
        else bindStory((Holder) holder, index);
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
        return new Caught(root, review);
    }

    private void bindCaughtUp(Caught holder) {
        Context context = holder.itemView.getContext();
        holder.earlier.setVisibility(earlier > 0 ? View.VISIBLE : View.GONE);
        holder.earlier.setText(context.getResources().getQuantityString(R.plurals.read_earlier, earlier, earlier));
    }

    private Holder story(ViewGroup parent) {
        Context context = parent.getContext();
        LinearLayout root = ui.column();
        root.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        root.setPadding(sidePadding, ui.dp(4), sidePadding, ui.dp(8));
        root.setBackgroundColor(ui.bg);

        ScrollView scroll = new StoryScrollView(context);
        scroll.setFillViewport(true); scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = ui.column();

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
        TextView poster = ui.text("", 64, ui.text, false);
        poster.setGravity(Gravity.CENTER);
        poster.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        hero.addView(poster, new FrameLayout.LayoutParams(-1, -1));
        body.addView(hero, new LinearLayout.LayoutParams(-1, heroHeight));

        LinearLayout meta = ui.row();
        meta.setPadding(0, ui.dp(16), 0, 0);
        TextView category = ui.text("", 11, ui.accentText, true);
        category.setLetterSpacing(.06f); category.setSingleLine();
        category.setPadding(ui.dp(10), ui.dp(5), ui.dp(10), ui.dp(5));
        category.setBackground(ui.round(ui.accentSoft, 12));
        meta.addView(category, new LinearLayout.LayoutParams(-2, -2));
        TextView credit = ui.text("", 12, ui.text2, false);
        credit.setMaxLines(2); credit.setEllipsize(TextUtils.TruncateAt.END);
        credit.setPadding(ui.dp(10), 0, 0, 0);
        meta.addView(credit, new LinearLayout.LayoutParams(0, -2, 1));
        body.addView(meta);

        TextView title = ui.text("", compact ? 21 : 24, ui.text, "serif");
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        title.setLineSpacing(0, 1.18f); title.setPadding(0, ui.dp(12), 0, 0);
        ViewCompat.setAccessibilityHeading(title, true);
        body.addView(title);
        TextView content = ui.text("", 16, ui.text, false);
        content.setAlpha(.88f); content.setLineSpacing(0, 1.38f); content.setPadding(0, ui.dp(14), 0, ui.dp(20));
        body.addView(content);
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout actionRow = ui.row();
        actionRow.setPadding(0, ui.dp(8), 0, 0);
        LinearLayout cta = ui.row();
        cta.setBackground(ui.touch(ui.round(ui.surfaceAlt, 16), 16));
        cta.setPadding(ui.dp(16), ui.dp(8), ui.dp(14), ui.dp(8));
        cta.setMinimumHeight(ui.dp(52)); cta.setClickable(true); cta.setFocusable(true);
        LinearLayout labels = ui.column();
        TextView ctaTitle = ui.text(context.getString(R.string.read_full_story), 14, ui.text, true);
        TextView ctaHost = ui.text("", 11, ui.text2, false);
        ctaHost.setSingleLine(); ctaHost.setEllipsize(TextUtils.TruncateAt.END);
        labels.addView(ctaTitle); labels.addView(ctaHost);
        cta.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
        cta.addView(ui.icon(R.drawable.ic_arrow_up_right, ui.text, 20));
        actionRow.addView(cta, new LinearLayout.LayoutParams(0, -2, 1));
        ImageButton brief = ui.iconButton(R.drawable.ic_sparkle, R.string.brief_description, ui.accentSoft, ui.accentText, () -> { });
        ImageButton save = ui.iconButton(R.drawable.ic_bookmark, R.string.save_description, ui.surfaceAlt, ui.text, () -> { });
        ImageButton share = ui.iconButton(R.drawable.ic_share, R.string.share, ui.surfaceAlt, ui.text, () -> { });
        for (ImageButton button : List.of(brief, save, share)) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ui.dp(48), ui.dp(48));
            params.setMarginStart(ui.dp(8)); actionRow.addView(button, params);
        }
        root.addView(actionRow);
        return new Holder(root, scroll, hero, image, placeholder, poster, imageBackground, posterBackground, category, credit,
                title, content, cta, ctaHost, brief, save, share);
    }

    private void bindStory(Holder holder, int index) {
        Story story = stories.get(index);
        Context context = holder.itemView.getContext();
        if (!story.id().equals(holder.storyId)) holder.scroll.scrollTo(0, 0);
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
        String text = story.body();
        holder.content.setText(text);
        holder.content.setVisibility(text.isEmpty() ? View.GONE : View.VISIBLE);
        int wanted = text.isEmpty() ? tallHeroHeight : heroHeight;
        ViewGroup.LayoutParams heroParams = holder.hero.getLayoutParams();
        if (heroParams.height != wanted) { heroParams.height = wanted; holder.hero.setLayoutParams(heroParams); }

        holder.cta.setEnabled(story.hasSource()); holder.cta.setAlpha(story.hasSource() ? 1f : .5f);
        holder.ctaHost.setText(story.hasSource() ? story.sourceHost() : context.getString(R.string.source_unavailable));
        holder.cta.setContentDescription(context.getString(R.string.read_full_story) + ", " + holder.ctaHost.getText());
        holder.cta.setOnClickListener(view -> actions.source(story));

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
        String age = age(context, story.publishedAt(), locale);
        if (!age.isEmpty()) parts.add(age);
        String reading = readTime(context, story);
        if (!reading.isEmpty()) parts.add(reading);
        return String.join(" \u00b7 ", parts);
    }

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
    }

    /** The caught-up card at the end of the new stories. */
    static final class Caught extends RecyclerView.ViewHolder {
        final TextView earlier;
        Caught(View root, TextView earlier) { super(root); this.earlier = earlier; }
    }

    static final class Holder extends RecyclerView.ViewHolder {
        final ScrollView scroll; final FrameLayout hero; final ImageView image, placeholder;
        final TextView poster, category, credit, title, content, ctaHost; final LinearLayout cta;
        final android.graphics.drawable.Drawable imageBackground, posterBackground;
        final ImageButton brief, save, share;
        String storyId = "";
        Holder(View root, ScrollView scroll, FrameLayout hero, ImageView image, ImageView placeholder, TextView poster,
               android.graphics.drawable.Drawable imageBackground, android.graphics.drawable.Drawable posterBackground,
               TextView category, TextView credit, TextView title, TextView content, LinearLayout cta, TextView ctaHost,
               ImageButton brief, ImageButton save, ImageButton share) {
            super(root); this.scroll = scroll; this.hero = hero; this.image = image; this.placeholder = placeholder;
            this.poster = poster; this.imageBackground = imageBackground; this.posterBackground = posterBackground;
            this.category = category; this.credit = credit; this.title = title; this.content = content;
            this.cta = cta; this.ctaHost = ctaHost; this.brief = brief; this.save = save; this.share = share;
        }
    }
}
