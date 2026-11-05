package com.plaxlabs.news;

import android.content.Context;
import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import java.io.IOException;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import okhttp3.HttpUrl;

/**
 * What the Plax website tells the app to be: the topics it lists, the sections of the news, which features are on, how often a
 * full-page ad comes, how big a story's picture may be, one notice, whether a newer version is on Google Play, and a few links for the
 * menu. The file is <em>data</em> (public/app-config.json, served at /app-config.json): it never holds code, so it cannot fix a bug,
 * change a screen or add a feature, which still need a new version (Google Play does not allow an app to download code). What it can do
 * is change what the app does with the screens it has, in both builds (Google Play's and the website's), without a new bundle.
 *
 * <p>Every part has a built-in value, which is what a build that has never read the file does, and every part is judged on its own: a
 * part that breaks a rule is refused and its built-in value stays, while the parts that are fine are taken (a typing mistake in a notice
 * cannot undo a switch that was meant to be off). A file that is not strict JSON, is over {@link #MAX_BYTES}, or has another schema
 * version is refused whole, and the file taken before stays. The website's own check of the file (src/lib/app-config-rules.ts) applies
 * the same rules and both are run against the same cases (src/lib/app-config-cases.json), so a file that passes there is a file the app
 * takes whole.
 *
 * <p>Nothing here is secret and nothing about the reader is sent to ask for it.
 */
record AppConfig(List<Topic> topics, List<Section> sections, Features features, int pageEvery, Layout layout, Notice notice,
                 StoreUpdate update, List<Link> links) {
    static final int SCHEMA_VERSION = 1, MAX_BYTES = 16 * 1024, MAX_TOPICS = 40, MAX_SECTIONS = 12, MAX_LINKS = 4;
    /** Stories between full-page ads: the built-in value is {@link AdSlots#STORIES_PER_AD}. */
    static final int MIN_PAGE_EVERY = 3, MAX_PAGE_EVERY = 20;
    /** Sites, besides this one and Google Play, that a link may open. The website's check has the same list (LINK_HOSTS). */
    static final Set<String> LINK_HOSTS = Set.of("instagram.com", "www.instagram.com", "x.com", "twitter.com", "www.facebook.com",
            "www.youtube.com", "youtube.com", "youtu.be", "t.me", "chat.whatsapp.com", "www.linkedin.com", "github.com");

    /**
     * A switch is on unless the file says it is off. {@code sourceName} is whether a story's line names its publisher: Google Play's News
     * policy asks an aggregator for clear information about the publishing sources of what it shows, so it is on, and turning it off is a
     * decision that needs the declaration in Play Console to say the same.
     */
    record Features(boolean deeper, boolean shareLinks, boolean ads, boolean adPages, boolean sourceName) {
        static final Features ALL = new Features(true, true, true, true, true);
    }

    /**
     * How big a story's picture may be, as a share of the column's width and of the page's height, and the least it is given (see
     * {@link StoryPage}). The built-in values are the ones that class names.
     */
    record Layout(float heroMaxWidth, float heroMaxHeight, float photoMinWidth, float photoMinHeight) {
        static final Layout DEFAULT = new Layout(StoryPage.HERO_MAX_WIDTH, StoryPage.HERO_MAX_HEIGHT, StoryPage.PHOTO_MIN_WIDTH,
                StoryPage.PHOTO_MIN_HEIGHT);
    }

    /**
     * A chip of the news topic. The built-in ones name a string resource; one the website listed carries its own English and Hindi
     * labels, which win over the resources (so the website can also rename one).
     */
    record Section(String id, int label, String en, String hi) {
        String label(Context context) {
            if (label != 0) return context.getString(label);
            return Language.HINDI.equals(Language.of(context.getResources().getConfiguration().getLocales().get(0))) ? hi : en;
        }
    }

    /** One notice, shown once to each reader it applies to (see {@link ConfigPrompts}). {@code hi} texts are empty when there are none. */
    record Notice(String id, boolean important, String titleEn, String titleHi, String bodyEn, String bodyHi, String url, String build,
                  int minVersionCode, int maxVersionCode, long untilMillis) {
        String title(String lang) { return Language.HINDI.equals(lang) && !titleHi.isEmpty() ? titleHi : titleEn; }

        String body(String lang) { return Language.HINDI.equals(lang) && !bodyHi.isEmpty() ? bodyHi : bodyEn; }

        /** Whether it is for this build (Google Play's, or the website's), this version, and this moment. */
        boolean appliesTo(boolean playBuild, int versionCode, long now) {
            if (build.equals("play") && !playBuild || build.equals("direct") && playBuild) return false;
            if (minVersionCode > 0 && versionCode < minVersionCode || maxVersionCode > 0 && versionCode > maxVersionCode) return false;
            return untilMillis == 0 || now < untilMillis;
        }
    }

    /** That a newer version is on Google Play (read by Google Play builds only: the website's build has its own update feed). */
    record StoreUpdate(int latestVersionCode, String latestVersionName, int minSupportedVersionCode) { }

    /** A row for the menu. */
    record Link(String id, String en, String hi, String url, String build) {
        String label(String lang) { return Language.HINDI.equals(lang) ? hi : en; }

        boolean appliesTo(boolean playBuild) { return build.equals("all") || build.equals("play") == playBuild; }
    }

    /** What was read, and the parts that were refused (named as {@code topics}, {@code features.deeper}, {@code links[1]}, and so on). */
    record Parsed(AppConfig config, List<String> rejected) { }

    /** The sections of the news as the app was made with them, which are the ones of the website. */
    private static final List<Section> BUILT_IN_SECTIONS = List.of(
            new Section("us", R.string.section_us, "", ""),
            new Section("india", R.string.section_india, "", ""),
            new Section("world", R.string.section_world, "", ""),
            new Section("tech", R.string.section_tech, "", ""),
            new Section("business", R.string.section_business, "", ""),
            new Section("science", R.string.section_science, "", ""));

    private static final AppConfig DEFAULTS = new AppConfig(Topic.builtIn(), BUILT_IN_SECTIONS, Features.ALL, AdSlots.STORIES_PER_AD,
            Layout.DEFAULT, null, null, List.of());

    /** What a build that has not read the file does. */
    static AppConfig defaults() { return DEFAULTS; }

    /** Whether this is a chip the news can be narrowed to: the empty one, for all, always is. */
    boolean hasSection(String id) {
        if (id.isEmpty()) return true;
        for (Section section : sections) if (section.id().equals(id)) return true;
        return false;
    }

    private static final HttpUrl SITE = HttpUrl.get(FeedApi.SITE);
    private static final Pattern TOPIC_ID = Pattern.compile("[a-z][a-z0-9]{1,23}");
    private static final Pattern SECTION_ID = Pattern.compile("[a-z][a-z0-9]{1,15}");
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9._-]{1,40}");
    private static final Pattern VERSION_NAME = Pattern.compile("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)");
    private static final Pattern UNTIL = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]Z");
    private static final Pattern URL_SHAPE = Pattern.compile(
            "https://([a-z0-9][a-z0-9.-]*[a-z0-9])(/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(\\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?");
    private static final Pattern DOTS = Pattern.compile("/\\.|//|%2e|%2f|%5c", Pattern.CASE_INSENSITIVE);
    private static final Pattern PACKAGE_QUERY = Pattern.compile("\\?id=[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+");
    private static final List<String> FEATURE_KEYS = List.of("deeper", "shareLinks", "ads", "adPages", "sourceName");
    private static final Set<String> BUILDS = Set.of("all", "play", "direct");
    private static final int[][] EMOJI_RANGES = {
            {0xa9, 0xa9}, {0xae, 0xae}, {0x203c, 0x203c}, {0x2049, 0x2049}, {0x2122, 0x2122}, {0x2139, 0x2139}, {0x2190, 0x21ff},
            {0x2300, 0x23ff}, {0x24c2, 0x24c2}, {0x25a0, 0x27bf}, {0x2900, 0x297f}, {0x2b00, 0x2bff}, {0x3030, 0x3030}, {0x303d, 0x303d},
            {0x3297, 0x3297}, {0x3299, 0x3299}, {0x1f000, 0x1faff}};

    /** A number as it was written, so that 5.0 and 5e0 are not taken for 5. */
    private record Num(String text) {
        Integer integer(int low, int high) {
            if (text.length() > 10 || !text.matches("-?(0|[1-9][0-9]*)")) return null;
            long value = Long.parseLong(text);
            return value >= low && value <= high ? (int) value : null;
        }

        Double number(double low, double high) {
            try {
                double value = Double.parseDouble(text);
                return Double.isFinite(value) && value >= low && value <= high ? value : null;
            } catch (NumberFormatException invalid) { return null; }
        }
    }

    /**
     * Reads the file. The whole file is refused (an {@link IOException}) when it is empty, over {@link #MAX_BYTES}, not UTF-8, not strict
     * JSON, or not of schema version 1; otherwise each part is judged on its own and the refused ones are named in {@code rejected}.
     */
    static Parsed parse(byte[] bytes) throws IOException {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) throw new IOException("Unusable app configuration");
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException notUtf8) {
            throw new IOException("Unusable app configuration");
        }
        // The JSON reader would skip a byte order mark; the website's check does not, so neither does the app.
        if (text.startsWith("\uFEFF")) throw new IOException("Unusable app configuration");
        Object tree;
        try (JsonReader reader = new JsonReader(new StringReader(text))) {
            reader.setStrictness(Strictness.STRICT);
            tree = read(reader, 0);
            if (reader.peek() != com.google.gson.stream.JsonToken.END_DOCUMENT) throw new IOException("Unusable app configuration");
        } catch (IllegalStateException | IllegalArgumentException | com.google.gson.JsonParseException invalid) {
            throw new IOException("Unusable app configuration");
        }
        Map<String, Object> root = object(tree);
        if (root == null || !(root.get("schemaVersion") instanceof Num version) || !version.text().equals(String.valueOf(SCHEMA_VERSION))) {
            throw new IOException("Unusable app configuration");
        }
        List<String> rejected = new ArrayList<>();

        List<Topic> topics = DEFAULTS.topics();
        if (root.containsKey("topics")) {
            List<Topic> listed = topics(root.get("topics"));
            if (listed == null) rejected.add("topics"); else topics = listed;
        }

        List<Section> sections = DEFAULTS.sections();
        if (root.containsKey("sections")) {
            List<Section> listed = sections(root.get("sections"));
            if (listed == null) rejected.add("sections"); else sections = listed;
        }

        boolean[] on = {true, true, true, true, true};
        if (root.containsKey("features")) {
            Map<String, Object> switches = object(root.get("features"));
            if (switches == null) rejected.add("features");
            else for (Map.Entry<String, Object> entry : switches.entrySet()) {
                int index = FEATURE_KEYS.indexOf(entry.getKey());
                if (index < 0) continue;
                if (entry.getValue() instanceof Boolean value) on[index] = value;
                else rejected.add("features." + entry.getKey());
            }
        }
        Features features = new Features(on[0], on[1], on[2], on[3], on[4]);

        int pageEvery = DEFAULTS.pageEvery();
        if (root.containsKey("ads")) {
            Map<String, Object> ads = object(root.get("ads"));
            if (ads == null) rejected.add("ads");
            else if (ads.containsKey("pageEvery")) {
                Integer every = ads.get("pageEvery") instanceof Num number ? number.integer(MIN_PAGE_EVERY, MAX_PAGE_EVERY) : null;
                if (every == null) rejected.add("ads.pageEvery"); else pageEvery = every;
            }
        }

        Layout layout = Layout.DEFAULT;
        if (root.containsKey("layout")) {
            Map<String, Object> values = object(root.get("layout"));
            if (values == null) rejected.add("layout");
            else layout = layout(values, rejected);
        }

        Notice notice = null;
        if (root.containsKey("notice") && root.get("notice") != null) {
            notice = notice(object(root.get("notice")));
            if (notice == null) rejected.add("notice");
        }

        StoreUpdate update = null;
        if (root.containsKey("update") && root.get("update") != null) {
            update = update(object(root.get("update")));
            if (update == null) rejected.add("update");
        }

        List<Link> links = new ArrayList<>();
        if (root.containsKey("links")) {
            if (!(root.get("links") instanceof List<?> listed)) rejected.add("links");
            else {
                Set<String> seen = new HashSet<>();
                for (int index = 0; index < listed.size(); index++) {
                    Link link = index < MAX_LINKS ? link(object(listed.get(index))) : null;
                    if (link == null || !seen.add(link.id())) rejected.add("links[" + index + "]");
                    else links.add(link);
                }
            }
        }
        return new Parsed(new AppConfig(topics, sections, features, pageEvery, layout, notice, update, List.copyOf(links)), List.copyOf(rejected));
    }

    /**
     * The four numbers, each judged on its own. The ranges keep a picture's least (at most 70% of the column and 35% of the page) below
     * its most (at least 100% and 40%), so the two can never cross, and keep the least small enough that a story with a long headline and
     * a long summary still keeps its photograph on a 360 x 640 page at a 1.3 text size (FitDeviceTest lays every story out at both ends of
     * every range). The website's check has the same ranges (LAYOUT_RANGES).
     */
    private static Layout layout(Map<String, Object> values, List<String> rejected) {
        float heroWidth = Layout.DEFAULT.heroMaxWidth(), heroHeight = Layout.DEFAULT.heroMaxHeight();
        float photoWidth = Layout.DEFAULT.photoMinWidth(), photoHeight = Layout.DEFAULT.photoMinHeight();
        for (Map.Entry<String, Object> entry : values.entrySet()) {
            String key = entry.getKey();
            Double number;
            switch (key) {
                case "heroMaxWidth" -> { number = number(entry.getValue(), 1, 1.6); if (number != null) heroWidth = number.floatValue(); }
                case "heroMaxHeight" -> { number = number(entry.getValue(), .4, .7); if (number != null) heroHeight = number.floatValue(); }
                case "photoMinWidth" -> { number = number(entry.getValue(), .4, .7); if (number != null) photoWidth = number.floatValue(); }
                case "photoMinHeight" -> { number = number(entry.getValue(), .2, .35); if (number != null) photoHeight = number.floatValue(); }
                default -> { continue; }
            }
            if (number == null) rejected.add("layout." + key);
        }
        return new Layout(heroWidth, heroHeight, photoWidth, photoHeight);
    }

    private static Double number(Object value, double low, double high) { return value instanceof Num n ? n.number(low, high) : null; }

    private static List<Topic> topics(Object value) {
        if (!(value instanceof List<?> list) || list.isEmpty() || list.size() > MAX_TOPICS) return null;
        List<Topic> topics = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Object item : list) {
            Map<String, Object> entry = object(item);
            if (entry == null || !(entry.get("id") instanceof String id) || !TOPIC_ID.matcher(id).matches() || !seen.add(id)) return null;
            if (!emoji(entry.get("emoji")) || !plain(entry.get("en"), 24, false) || !plain(entry.get("hi"), 24, false)) return null;
            topics.add(Topic.listed(id, (String) entry.get("emoji"), (String) entry.get("en"), (String) entry.get("hi")));
        }
        return seen.contains("news") ? List.copyOf(topics) : null;
    }

    private static List<Section> sections(Object value) {
        if (!(value instanceof List<?> list) || list.size() > MAX_SECTIONS) return null;
        List<Section> sections = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Object item : list) {
            Map<String, Object> entry = object(item);
            if (entry == null || !(entry.get("id") instanceof String id) || !SECTION_ID.matcher(id).matches() || !seen.add(id)) return null;
            if (!plain(entry.get("en"), 16, false) || !plain(entry.get("hi"), 16, false)) return null;
            sections.add(new Section(id, 0, (String) entry.get("en"), (String) entry.get("hi")));
        }
        return List.copyOf(sections);
    }

    private static Notice notice(Map<String, Object> value) {
        if (value == null || !(value.get("id") instanceof String id) || !ID.matcher(id).matches()) return null;
        String level = value.get("level") instanceof String text ? text : "";
        if (!level.equals("info") && !level.equals("important")) return null;
        Map<String, Object> title = object(value.get("title")), body = object(value.get("body"));
        if (!pair(title, 60, false) || !pair(body, 400, true)) return null;
        String url = "";
        if (value.containsKey("url")) {
            if (!allowedLink(value.get("url"))) return null;
            url = (String) value.get("url");
        }
        String build = "all";
        if (value.containsKey("build")) {
            if (!(value.get("build") instanceof String text) || !BUILDS.contains(text)) return null;
            build = text;
        }
        Integer min = value.containsKey("minVersionCode") ? integer(value.get("minVersionCode"), 0, 9_999_999) : Integer.valueOf(0);
        Integer max = value.containsKey("maxVersionCode") ? integer(value.get("maxVersionCode"), 0, 9_999_999) : Integer.valueOf(0);
        if (min == null || max == null || min > 0 && max > 0 && min > max) return null;
        long until = 0;
        if (value.containsKey("until")) {
            if (!(value.get("until") instanceof String text) || !UNTIL.matcher(text).matches()) return null;
            try { until = Instant.parse(text).toEpochMilli(); } catch (DateTimeParseException notADate) { return null; }
        }
        return new Notice(id, level.equals("important"), (String) title.get("en"), title.containsKey("hi") ? (String) title.get("hi") : "",
                (String) body.get("en"), body.containsKey("hi") ? (String) body.get("hi") : "", url, build, min, max, until);
    }

    private static Integer integer(Object value, int low, int high) { return value instanceof Num n ? n.integer(low, high) : null; }

    private static StoreUpdate update(Map<String, Object> value) {
        if (value == null) return null;
        Integer latest = integer(value.get("latestVersionCode"), 1, 9_999_999);
        if (latest == null || !(value.get("latestVersionName") instanceof String name) || !VERSION_NAME.matcher(name).matches()) return null;
        Integer least = integer(value.get("minSupportedVersionCode"), 0, latest);
        return least == null ? null : new StoreUpdate(latest, name, least);
    }

    private static Link link(Map<String, Object> value) {
        if (value == null || !(value.get("id") instanceof String id) || !ID.matcher(id).matches()) return null;
        if (!plain(value.get("en"), 30, false) || !plain(value.get("hi"), 30, false) || !allowedLink(value.get("url"))) return null;
        String build = "all";
        if (value.containsKey("build")) {
            if (!(value.get("build") instanceof String text) || !BUILDS.contains(text)) return null;
            build = text;
        }
        return new Link(id, (String) value.get("en"), (String) value.get("hi"), (String) value.get("url"), build);
    }

    /** A text in English, and optionally in Hindi. */
    private static boolean pair(Map<String, Object> value, int max, boolean multiline) {
        return value != null && plain(value.get("en"), max, multiline) && (!value.containsKey("hi") || plain(value.get("hi"), max, multiline));
    }

    /**
     * One line of plain text (or up to six line breaks, when {@code multiline}): no control, format, separator, private-use or
     * unassigned characters, no space at either end, and nothing but the plain space for a space.
     */
    static boolean plain(Object value, int max, boolean multiline) {
        if (!(value instanceof String text) || text.isEmpty() || text.length() > max || !text.equals(text.strip())) return false;
        int lines = 0;
        for (int at = 0; at < text.length(); ) {
            int point = text.codePointAt(at);
            at += Character.charCount(point);
            if (point == '\n') {
                if (!multiline) return false;
                lines++;
                continue;
            }
            switch (Character.getType(point)) {
                case Character.CONTROL, Character.FORMAT, Character.SURROGATE, Character.PRIVATE_USE, Character.UNASSIGNED,
                     Character.LINE_SEPARATOR, Character.PARAGRAPH_SEPARATOR -> { return false; }
                case Character.SPACE_SEPARATOR -> { if (point != ' ') return false; }
                default -> { }
            }
        }
        return lines <= 6;
    }

    private static boolean joiner(int point) { return point == 0xfe0f || point == 0x200d || point == 0x20e3; }

    /** An emoji, or a short sequence of them: judged by code point ranges, not by what this phone's Unicode data knows. */
    static boolean emoji(Object value) {
        if (!(value instanceof String text) || text.isEmpty() || text.length() > 16 || joiner(text.codePointAt(0))) return false;
        for (int at = 0; at < text.length(); ) {
            int point = text.codePointAt(at);
            at += Character.charCount(point);
            if (joiner(point)) continue;
            boolean inRange = false;
            for (int[] range : EMOJI_RANGES) inRange |= point >= range[0] && point <= range[1];
            if (!inRange) return false;
        }
        return true;
    }

    /**
     * A link the app may open: https only, no port, no user name, no fragment; a page of this site, the Google Play page of an app, or
     * a page of one of {@link #LINK_HOSTS}. Judged on the text itself, so that no reader of addresses can disagree about where it goes.
     */
    static boolean allowedLink(Object value) {
        if (!(value instanceof String text) || text.length() > 200) return false;
        Matcher match = URL_SHAPE.matcher(text);
        if (!match.matches()) return false;
        String host = match.group(1), path = match.group(2) == null ? "" : match.group(2), query = match.group(3) == null ? "" : match.group(3);
        if (DOTS.matcher(path).find() || host.contains("..")) return false;
        if (host.equals(SITE.host())) return path.equals(SITE.encodedPath()) || path.startsWith(SITE.encodedPath() + "/");
        if (host.equals("play.google.com")) return path.equals("/store/apps/details") && PACKAGE_QUERY.matcher(query).matches();
        return LINK_HOSTS.contains(host);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(Object value) { return value instanceof Map<?, ?> map ? (Map<String, Object>) map : null; }

    /** Reads strict JSON into maps, lists, strings, booleans, {@link Num}s and nulls; a name twice in one object, or more than six levels, is refused. */
    private static Object read(JsonReader reader, int depth) throws IOException {
        if (depth > 6) throw new IOException("Unusable app configuration");
        switch (reader.peek()) {
            case BEGIN_OBJECT -> {
                Map<String, Object> map = new LinkedHashMap<>();
                reader.beginObject();
                while (reader.hasNext()) {
                    String name = reader.nextName();
                    if (map.containsKey(name)) throw new IOException("Unusable app configuration");
                    map.put(name, read(reader, depth + 1));
                }
                reader.endObject();
                return map;
            }
            case BEGIN_ARRAY -> {
                List<Object> list = new ArrayList<>();
                reader.beginArray();
                while (reader.hasNext()) list.add(read(reader, depth + 1));
                reader.endArray();
                return list;
            }
            case STRING -> { return reader.nextString(); }
            case NUMBER -> { return new Num(reader.nextString()); }
            case BOOLEAN -> { return reader.nextBoolean(); }
            case NULL -> { reader.nextNull(); return null; }
            default -> throw new IOException("Unusable app configuration");
        }
    }
}
