package com.plaxlabs.news;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.os.SystemClock;
import android.text.Layout;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AbsListView;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.widget.NestedScrollView;
import androidx.recyclerview.widget.RecyclerView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * A story is one page and one swipe: nothing on the page scrolls, everything on it is in view, and the summary is cut only by
 * an ellipsis, whole lines at a time. Laid out on pages of many sizes, with larger text and in both languages, and then on the
 * real screen, where one swipe has to change the story however long its summary is.
 */
@RunWith(AndroidJUnit4.class)
public class FitDeviceTest {
    private static final String SENTENCES = "Officials said the review would take several weeks and that every district would be asked for figures. "
            + "Opposition leaders called the move hasty and demanded a debate in the next session of the assembly. "
            + "Economists cautioned that the first estimates were likely to change once the full data arrived. "
            + "Residents near the site said they had received no notice and feared for their livelihoods. "
            + "A spokesperson added that a detailed statement would be released after consultations with all parties concerned. "
            + "The matter is expected to come up again before the court early next month, according to people familiar with it. ";

    private Context context;
    private UiDevice device;
    private File cacheDir, seenDir;

    @Before public void isolatedPreview() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        assertEquals("com.plaxlabs.news.preview", context.getPackageName());
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        cacheDir = new File(context.getCacheDir(), "fit-" + UUID.randomUUID());
        seenDir = new File(context.getCacheDir(), "fit-seen-" + UUID.randomUUID());
        assertTrue(cacheDir.mkdirs()); assertTrue(seenDir.mkdirs());
        FeedViewModel.caches = base -> new FeedCache(cacheDir);
        FeedViewModel.histories = base -> new SeenFile(seenDir);
        // Nothing counts as read while the test pages around, so no story vanishes from under it.
        FeedViewModel.dwellMs = 600_000; FeedViewModel.glanceMs = 600_000;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        QuietUpdates.install();
    }

    @After public void restoreProductionWiring() {
        FeedViewModel.sources = FeedApi::new;
        FeedViewModel.caches = FeedCache::new;
        FeedViewModel.histories = SeenFile::new;
        FeedViewModel.dwellMs = 1200; FeedViewModel.glanceMs = 500;
        Interests.write(context, Set.of()); Prefs.forYou(context, false);
        QuietUpdates.remove();
        delete(cacheDir); delete(seenDir);
    }

    private static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }

    private static Story story(String id, String title, String body) {
        return new Story(id, title, body, "news", "india", "Publisher", "https://example.com/" + id, "", "20s", 1_791_621_638_608L);
    }

    private static String words(int characters) {
        StringBuilder text = new StringBuilder();
        while (text.length() < characters) text.append(SENTENCES);
        return text.substring(0, characters).strip();
    }

    private static List<Story> english() {
        return List.of(
                story("typical", "Telangana spotlight: Women blast through the mining barriers",
                        "Women are now driving the heavy machines at open-cast mines in Telangana, a job that was closed to them until recently."),
                story("long-body", "Trade-margin cap on cancer drugs may push up costs elsewhere in the supply chain, experts say", words(1100)),
                story("long-headline", "IDBI Bank divestment: Finance Minister Nirmala Sitharaman says Congress, UPA govt used banks, financial "
                        + "institutions as personal entities and left the public sector lenders with bad loans", words(700)),
                story("no-body", "A headline that has nothing under it", ""),
                story("short", "Short and sweet", "One sentence is all there is to read here."));
    }

    private static List<Story> hindi() {
        String body = "दिल्ली में लोक अदालत लगने की तारीख तय हो गई है, राज्य विधिक सेवा प्राधिकरण की ओर से इसकी जानकारी दी गई है. "
                + "दिल्ली ट्रैफिक पुलिस ने भी इसको लेकर जानकारी साझा की है, ताकि पेंडिंग ट्रैफिक चालान निपटाए जा सकें. ";
        return List.of(
                story("hi-typical", "दिल्ली में 25 अक्टूबर को लगेगी लोक अदालत, रोहिणी-द्वारका समेत 7 जगहों पर पेंडिंग ट्रैफिक चालानों का होगा निपटारा",
                        body + body + body),
                story("hi-long", "खपत से ज्यादा बिजली उत्पादन के कारण श्रीलंका में छह घंटे तक पूरे देश में रहा ब्लैकआउट, सरकार ने जांच के आदेश दिए "
                        + "और कहा कि दोषियों पर कार्रवाई होगी", body + body + body + body + body));
    }

    private Context themed(float fontScale, Locale locale) {
        androidx.appcompat.view.ContextThemeWrapper themed = new androidx.appcompat.view.ContextThemeWrapper(context, R.style.Theme_Plax);
        Configuration configuration = new Configuration(context.getResources().getConfiguration());
        configuration.fontScale = fontScale;
        configuration.setLocale(locale);
        themed.applyOverrideConfiguration(configuration);
        return themed;
    }

    private static StoryAdapter.Actions noActions() {
        return new StoryAdapter.Actions() {
            public void save(Story story) { }
            public void share(Story story) { }
            public void source(Story story) { }
            public void brief(Story story) { }
            public void check() { }
            public void earlier() { }
        };
    }

    /** Whether anything in this page could scroll: a scroll container, or any other view with more to show than room. */
    private static boolean scrolls(View view) {
        if (!shown(view)) return false;
        if (view instanceof ScrollView || view instanceof HorizontalScrollView || view instanceof NestedScrollView
                || view instanceof RecyclerView || view instanceof AbsListView) return true;
        // A text view reports that it can scroll whenever its text is longer than its room; that is checked on its own, with the ellipsis.
        if (!(view instanceof TextView) && (view.canScrollVertically(1) || view.canScrollVertically(-1))) return true;
        if (view instanceof ViewGroup group) for (int index = 0; index < group.getChildCount(); index++) if (scrolls(group.getChildAt(index))) return true;
        return false;
    }

    private static boolean shown(View view) { return view.getVisibility() != View.GONE && view.getWidth() > 0 && view.getHeight() > 0; }

    /** How many lines this view's text takes at its width and size, uncut. */
    private static int naturalLines(TextView view) {
        CharSequence text = view.getText();
        int inner = view.getWidth() - view.getTotalPaddingLeft() - view.getTotalPaddingRight();
        return android.text.StaticLayout.Builder.obtain(text, 0, text.length(), view.getPaint(), inner)
                .setLineSpacing(view.getLineSpacingExtra(), view.getLineSpacingMultiplier())
                .setIncludePad(view.getIncludeFontPadding())
                .setBreakStrategy(view.getBreakStrategy())
                .setHyphenationFrequency(view.getHyphenationFrequency())
                .build().getLineCount();
    }

    /** What is wrong with one laid-out page, as sentences; none when it is right. */
    private static List<String> problems(String name, StoryPage page, int width, int height, boolean roomy) {
        List<String> found = new ArrayList<>();
        View[] parts = {page.hero, page.meta, page.title, page.body};
        String[] names = {"picture", "source line", "headline", "summary"};
        for (int index = 0; index < parts.length; index++) {
            View part = parts[index];
            if (!shown(part)) continue;
            Rect box = new Rect(part.getLeft(), part.getTop(), part.getRight(), part.getBottom());
            if (box.left < 0 || box.top < 0 || box.right > width || box.bottom > height) found.add(name + ": the " + names[index] + " leaves the page " + box);
            for (int other = index + 1; other < parts.length; other++) {
                if (!shown(parts[other])) continue;
                Rect second = new Rect(parts[other].getLeft(), parts[other].getTop(), parts[other].getRight(), parts[other].getBottom());
                if (Rect.intersects(box, second)) found.add(name + ": the " + names[index] + " " + box + " overlaps the " + names[other] + " " + second);
            }
        }
        // The menu button floats over the picture's corner, or stands at the start of the first line; it touches no text.
        View menu = page.menu;
        Rect button = new Rect(menu.getLeft(), menu.getTop(), menu.getRight(), menu.getBottom());
        int circle = (button.width() - (int) (button.width() * StoryPage.MENU_DP / (float) StoryPage.MENU_TOUCH_DP)) / 2;
        Rect drawn = new Rect(button.left + circle, button.top + circle, button.right - circle, button.bottom - circle);
        if (drawn.left < 0 || drawn.top < 0 || drawn.right > width || drawn.bottom > height) found.add(name + ": the menu button leaves the page " + drawn);
        for (int index = 1; index < parts.length; index++) {
            if (!shown(parts[index])) continue;
            Rect box = new Rect(parts[index].getLeft(), parts[index].getTop(), parts[index].getRight(), parts[index].getBottom());
            if (parts[index] instanceof TextView text && text.getLayout() != null && text.length() > 0) {
                // The text, not the box it is in: the line may be shorter than its box.
                Layout layout = text.getLayout();
                for (int line = 0; line < layout.getLineCount(); line++) {
                    Rect words = new Rect(box.left + (int) layout.getLineLeft(line), box.top + text.getTotalPaddingTop() + layout.getLineTop(line),
                            box.left + (int) layout.getLineRight(line), box.top + text.getTotalPaddingTop() + layout.getLineBottom(line));
                    if (Rect.intersects(drawn, words)) found.add(name + ": the menu button " + drawn + " covers a line of the " + names[index] + " " + words);
                }
            } else if (parts[index] != page.meta && Rect.intersects(drawn, box)) {
                found.add(name + ": the menu button " + drawn + " overlaps the " + names[index] + " " + box);
            }
        }
        if (page.pictureAbove() || page.sideBySide()) {
            Rect picture = new Rect(page.hero.getLeft(), page.hero.getTop(), page.hero.getRight(), page.hero.getBottom());
            if (!picture.contains(drawn)) found.add(name + ": the menu button " + drawn + " is not inside the picture " + picture);
        }
        // The source line holds the tag, the source, and the brief, save and share buttons at its right end: each whole inside the line,
        // none on another, and the menu button (which stands at the start of the page when there is no picture) on none of them.
        if (shown(page.meta) && page.meta instanceof ViewGroup line) {
            String[] members = {"tag", "source", "brief button", "save button", "share button"};
            if (line.getChildCount() != members.length) {
                found.add(name + ": the source line holds " + line.getChildCount() + " views, not the tag, the source and three buttons");
            } else {
                Rect inside = new Rect(0, 0, line.getWidth(), line.getHeight());
                Rect[] boxes = new Rect[members.length];
                for (int index = 0; index < members.length; index++) {
                    View member = line.getChildAt(index);
                    boxes[index] = new Rect(member.getLeft(), member.getTop(), member.getRight(), member.getBottom());
                    if (!inside.contains(boxes[index])) found.add(name + ": the " + members[index] + " leaves the source line " + boxes[index] + " of " + inside);
                    for (int earlier = 0; earlier < index; earlier++)
                        if (Rect.intersects(boxes[earlier], boxes[index])) found.add(name + ": the " + members[index] + " overlaps the " + members[earlier]);
                    Rect onPage = new Rect(boxes[index]);
                    onPage.offset(page.meta.getLeft(), page.meta.getTop());
                    if (Rect.intersects(drawn, onPage)) found.add(name + ": the menu button " + drawn + " covers the " + members[index] + " " + onPage);
                }
                if (Math.abs(boxes[members.length - 1].right - line.getWidth()) > 1)
                    found.add(name + ": the buttons are not at the right end of the source line " + boxes[members.length - 1] + " of " + inside);
                if (boxes[2].height() < page.meta.getResources().getDisplayMetrics().density * 47)
                    found.add(name + ": a button on the source line is under 48 dp to touch (" + boxes[2].height() + " px)");
            }
        }
        for (TextView text : new TextView[]{page.title, page.body}) {
            if (!shown(text) || text.getLayout() == null) continue;
            Layout layout = text.getLayout();
            String which = text == page.title ? "headline" : "summary";
            if (layout.getHeight() + text.getTotalPaddingTop() > text.getHeight())
                found.add(name + ": the " + which + " is taller (" + layout.getHeight() + ") than its room (" + text.getHeight() + ")");
            int lines = layout.getLineCount();
            boolean ellipsized = layout.getEllipsisCount(lines - 1) > 0;
            int natural = naturalLines(text);
            if (natural > lines && !ellipsized) found.add(name + ": the " + which + " is cut to " + lines + " of " + natural + " lines with no ellipsis");
            if (natural <= lines && ellipsized) found.add(name + ": the " + which + " ends in an ellipsis though all " + natural + " lines are shown");
        }
        // The summary comes first and whole: with a picture on the page it is never cut, and it keeps three lines when it has them
        // (on a page with some room: a page too short for much, at twice the text size, cannot hold all of it).
        if (roomy && shown(page.body) && page.body.getLayout() != null) {
            int lines = page.body.getLayout().getLineCount(), natural = naturalLines(page.body);
            boolean cut = page.body.getLayout().getEllipsisCount(lines - 1) > 0;
            if (page.hero.getHeight() > 0 && !page.sideBySide() && cut) found.add(name + ": the summary is cut though a picture is on the page");
            if (!page.sideBySide() && lines < Math.min(natural, CardFit.MIN_BODY_LINES) && page.title.getLayout() != null
                    && page.title.getLayout().getLineCount() > CardFit.MIN_TITLE_LINES)
                found.add(name + ": the summary is down to " + lines + " lines while the headline has " + page.title.getLayout().getLineCount());
        }
        if (roomy && !page.sideBySide() && page.hasBody() && !shown(page.body)) found.add(name + ": the page has a summary and none is shown");
        if (scrolls(page)) found.add(name + ": something on the page scrolls");
        return found;
    }

    @Test public void everyStoryFitsItsPageWhateverThePageTheTextSizeAndTheLanguage() {
        // Pages are the whole screen between the system bars, with no header and no bottom bar: a small phone, an ordinary one, a
        // tall one, a tablet, a phone on its side, and a page too short for much.
        int[][] pages = {{360, 600}, {392, 780}, {412, 850}, {600, 1000}, {851, 340}, {360, 300}};
        float[] scales = {1f, 1.3f, 2f};
        List<String> problems = new ArrayList<>();
        AtomicInteger laidOut = new AtomicInteger();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (boolean inHindi : new boolean[]{false, true}) {
                for (float scale : scales) {
                    Context themed = themed(scale, inHindi ? new Locale("hi", "IN") : Locale.US);
                    Ui ui = new Ui(themed);
                    ImageLoader images = new ImageLoader(themed, 1080);
                    try {
                        for (int[] size : pages) {
                            StoryAdapter adapter = new StoryAdapter(ui, images, noActions(), size[0], size[1] + 60);
                            for (Story story : inHindi ? hindi() : english()) {
                                adapter.submit(List.of(story), Set.of(), false, true, 0);
                                var holder = (StoryAdapter.Holder) adapter.onCreateViewHolder(new FrameLayout(themed), adapter.getItemViewType(0));
                                adapter.onBindViewHolder(holder, 0);
                                int width = ui.dp(size[0]), height = ui.dp(size[1]);
                                holder.page.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                                        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
                                holder.page.layout(0, 0, width, height);
                                String name = story.id() + " on " + size[0] + "x" + size[1] + " at " + scale + "x" + (inHindi ? " in Hindi" : "");
                                problems.addAll(problems(name, holder.page, width, height, size[1] >= 450 && scale <= 1.3f));
                                laidOut.incrementAndGet();
                            }
                        }
                    } finally { images.close(); }
                }
            }
        });
        assertEquals(scales.length * pages.length * (english().size() + hindi().size()), laidOut.get());
        assertTrue(problems.size() + " problems, for example:\n" + String.join("\n", problems.subList(0, Math.min(40, problems.size()))),
                problems.isEmpty());
    }

    @Test public void anOrdinaryPhoneShowsThePictureAndTheWholeSummaryOfAStoryThatFits() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Context themed = themed(1f, Locale.US);
            Ui ui = new Ui(themed);
            ImageLoader images = new ImageLoader(themed, 1080);
            try {
                StoryAdapter adapter = new StoryAdapter(ui, images, noActions(), 392, 851);
                int width = ui.dp(392), height = ui.dp(780);
                float typicalSize = 0;
                for (Story story : english()) {
                    adapter.submit(List.of(story), Set.of(), false, true, 0);
                    var holder = (StoryAdapter.Holder) adapter.onCreateViewHolder(new FrameLayout(themed), adapter.getItemViewType(0));
                    adapter.onBindViewHolder(holder, 0);
                    holder.page.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
                    holder.page.layout(0, 0, width, height);
                    assertFalse(story.id(), holder.page.sideBySide());
                    int picture = holder.hero.getHeight();
                    assertTrue(story.id() + ": a picture is either absent or worth showing", picture == 0 || picture >= ui.dp(96));
                    assertTrue(story.id() + ": the picture does not take over the page", picture <= height * (story.body().isEmpty() ? .62f : .55f) + 1);
                    if (!story.body().isEmpty()) {
                        int shown = holder.content.getLayout().getLineCount();
                        boolean cut = holder.content.getLayout().getEllipsisCount(shown - 1) > 0;
                        if (cut) assertTrue(story.id() + ": only " + shown + " lines of a cut summary are shown", shown >= CardFit.MIN_BODY_LINES);
                        if (picture > 0) assertFalse(story.id() + ": with a picture on the page the summary is whole", cut);
                    }
                    if (story.id().equals("typical")) {
                        typicalSize = holder.content.getTextSize();
                        assertTrue("an ordinary story has its picture", picture >= ui.dp(96));
                        assertEquals("and its summary, whole", story.body(), holder.content.getText().toString());
                    }
                    if (story.id().equals("long-body")) {
                        assertEquals("a summary too long to share the page with a picture loses the picture, not words", 0, picture);
                        assertTrue("and is set a little smaller before any of it is cut", holder.content.getTextSize() < typicalSize);
                    }
                    if (story.body().length() > 0 && story.body().length() < 150) {
                        int last = holder.content.getLayout().getLineCount() - 1;
                        assertEquals(story.id() + ": a short summary is shown whole", 0, holder.content.getLayout().getEllipsisCount(last));
                        assertEquals(story.body(), holder.content.getText().toString());
                    }
                    if (story.body().isEmpty()) assertTrue(story.id() + ": with nothing to read the picture grows", picture > height * .31f);
                }
            } finally { images.close(); }
        });
    }

    @Test public void aPhoneOnItsSideHasThePictureBesideTheText() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Context themed = themed(1f, Locale.US);
            Ui ui = new Ui(themed);
            ImageLoader images = new ImageLoader(themed, 1080);
            try {
                StoryAdapter adapter = new StoryAdapter(ui, images, noActions(), 851, 392);
                int width = ui.dp(851), height = ui.dp(340);
                adapter.submit(List.of(english().get(0)), Set.of(), false, true, 0);
                var holder = (StoryAdapter.Holder) adapter.onCreateViewHolder(new FrameLayout(themed), adapter.getItemViewType(0));
                adapter.onBindViewHolder(holder, 0);
                holder.page.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
                holder.page.layout(0, 0, width, height);
                assertTrue(holder.page.sideBySide());
                assertTrue("the picture is left of the text", holder.hero.getRight() <= holder.title.getLeft());
                assertTrue("and as tall as the page lets it be", holder.hero.getHeight() >= height - ui.dp(16));
                assertTrue(holder.title.getHeight() > 0);
            } finally { images.close(); }
        });
    }

    private static final class FakeSource implements FeedSource {
        private final List<Story> first;
        private final AtomicInteger calls = new AtomicInteger();
        FakeSource(List<Story> first) { this.first = first; }

        @Override public Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result) {
            // The first page is the stories; asking for more finds there are none.
            result.loaded(calls.getAndIncrement() == 0 ? first : List.of());
            return () -> { };
        }
    }

    private boolean titleShown(String title, long waitMs) {
        return device.wait(Until.hasObject(By.text(title)), waitMs);
    }

    /**
     * A decisive swipe, three-fifths of the screen: the pager turns a page on a long drag as well as on a quick flick, so the
     * result does not depend on how fast a slow emulator draws frames in the middle of the gesture.
     */
    private void swipe(boolean up) {
        int width = device.getDisplayWidth(), height = device.getDisplayHeight();
        int from = (int) (height * (up ? .78 : .20)), to = (int) (height * (up ? .20 : .78));
        device.waitForIdle();
        device.swipe(width / 2, from, width / 2, to, 80);
    }

    @Test public void oneSwipeChangesTheStoryHoweverLongItsSummaryIs() {
        List<Story> stories = List.of(
                story("one", "First story with a very long summary indeed", words(1400)),
                story("two", "Second story that follows it", words(900)),
                story("three", "Third story to end on", "A short one."));
        FeedViewModel.sources = () -> new FakeSource(stories);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue("the first story is shown", titleShown("First story with a very long summary indeed", 15_000));
            assertNull("no page has a scroll view of its own", device.findObject(By.clazz("android.widget.ScrollView")));

            swipe(true);
            assertTrue("one swipe up shows the second story", titleShown("Second story that follows it", 5_000));
            assertTrue("and the first is gone", device.wait(Until.gone(By.text("First story with a very long summary indeed")), 5_000));

            swipe(true);
            assertTrue("one more swipe shows the third", titleShown("Third story to end on", 5_000));

            swipe(false);
            assertTrue("one swipe down goes back to the second", titleShown("Second story that follows it", 5_000));
            swipe(false);
            assertTrue("and one more to the first", titleShown("First story with a very long summary indeed", 5_000));
        }
    }

    @Test public void aSwipeThatStartsOnTheSummaryChangesTheStoryToo() {
        List<Story> stories = List.of(
                story("one", "A story whose summary is long", words(1400)),
                story("two", "The story after it", words(400)));
        FeedViewModel.sources = () -> new FakeSource(stories);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(titleShown("A story whose summary is long", 15_000));
            var summary = device.findObject(By.textStartsWith("Officials said the review"));
            assertNotNull("the summary is on the page", summary);
            // From its last line: the whole summary fills most of the page, and a drag from its middle would be too short to turn the
            // page on a slow emulator that draws few frames.
            android.graphics.Rect text = summary.getVisibleBounds();
            int from = text.bottom - 40;
            device.waitForIdle();
            device.swipe(text.centerX(), from, text.centerX(), Math.max(130, from - (int) (device.getDisplayHeight() * .8)), 80);
            assertTrue("a swipe that begins on the text moves on at once", titleShown("The story after it", 5_000));
        }
    }
}
