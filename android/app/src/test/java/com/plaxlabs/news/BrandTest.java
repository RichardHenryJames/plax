package com.plaxlabs.news;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Assume;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * The Plax "P" is one outline, traced from the brand logo, and every place that draws it must draw that outline: the launcher
 * icon, the app's header, both splash screens and, on the website, the share-card pictures and the icons. The website's copy is
 * src/lib/brand.ts; its own test (brand.test.mjs) checks these same four files from the other side.
 */
public class BrandTest {
    private static final String[] DRAWABLES = {
            "drawable/ic_launcher_foreground.xml", "drawable/ic_plax.xml", "drawable/ic_splash.xml", "drawable-night/ic_splash.xml"};
    private static final Pattern PATH = Pattern.compile("android:pathData=\"([^\"]+)\"");
    private static final Pattern NUMBER = Pattern.compile("-?\\d*\\.?\\d+");

    private static Path project() { return Path.of(System.getProperty("user.dir")); }
    private static Path res() { return project().resolve("src").resolve("main").resolve("res"); }
    private static Path brand() { return project().resolve("..").resolve("..").resolve("src").resolve("lib").resolve("brand.ts").normalize(); }
    private static String read(Path file) throws IOException { return new String(Files.readAllBytes(file), StandardCharsets.UTF_8); }

    private static List<String> paths(String drawable) throws IOException {
        List<String> found = new ArrayList<>();
        Matcher m = PATH.matcher(read(res().resolve(drawable)));
        while (m.find()) found.add(m.group(1));
        return found;
    }

    private static double[] numbers(String text) {
        List<Double> values = new ArrayList<>();
        Matcher m = NUMBER.matcher(text);
        while (m.find()) values.add(Double.parseDouble(m.group()));
        double[] out = new double[values.size()];
        for (int i = 0; i < out.length; i++) out[i] = values.get(i);
        return out;
    }

    private static String constant(String source, String name) {
        Matcher m = Pattern.compile("export const " + name + "\\s*=\\s*'([^']+)'").matcher(source);
        assertTrue("brand.ts has no " + name, m.find());
        return m.group(1);
    }

    @Test public void everyDrawableOfThePDrawsTheSameTwoOutlines() throws IOException {
        List<String> first = paths(DRAWABLES[0]);
        assertEquals("a bowl and a stem", 2, first.size());
        for (String drawable : DRAWABLES) assertEquals(drawable + " draws a different P", first, paths(drawable));
    }

    @Test public void theOutlineIsTheWebsitesOutline() throws IOException {
        Assume.assumeTrue("the website files are not next to this project", Files.exists(brand()));
        String source = read(brand());
        assertEquals("the bowl differs from src/lib/brand.ts", constant(source, "P_BOWL"), paths(DRAWABLES[0]).get(0));
        assertEquals("the stem differs from src/lib/brand.ts", constant(source, "P_STEM"), paths(DRAWABLES[0]).get(1));
    }

    @Test public void theIconColoursAreTheWebsitesColours() throws IOException {
        Assume.assumeTrue("the website files are not next to this project", Files.exists(brand()));
        String source = read(brand());
        Matcher background = Pattern.compile("iconBackground:\\s*'(#[0-9A-Fa-f]{6})'").matcher(source);
        Matcher ink = Pattern.compile("iconInk:\\s*'(#[0-9A-Fa-f]{6})'").matcher(source);
        assertTrue(background.find() && ink.find());
        Matcher launcher = Pattern.compile("<color name=\"launcher_background\">(#[0-9A-Fa-f]{6})</color>").matcher(read(res().resolve("values").resolve("colors.xml")));
        assertTrue(launcher.find());
        assertEquals("the launcher icon and the website's icons are different ambers", background.group(1).toUpperCase(), launcher.group(1).toUpperCase());
        Matcher fill = Pattern.compile("android:fillColor=\"(#[0-9A-Fa-f]{6})\"").matcher(read(res().resolve("drawable").resolve("ic_launcher_foreground.xml")));
        while (fill.find()) assertEquals("the launcher icon's P and the website's are different colours", ink.group(1).toUpperCase(), fill.group(1).toUpperCase());
    }

    @Test public void thePStaysInsideTheLaunchersSafeZoneAndIsCentred() throws IOException {
        String xml = read(res().resolve("drawable").resolve("ic_launcher_foreground.xml"));
        double shiftX = group(xml, "translateX"), shiftY = group(xml, "translateY"), scaleX = group(xml, "scaleX"), scaleY = group(xml, "scaleY");
        double minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, farthest = 0;
        for (String path : paths("drawable/ic_launcher_foreground.xml")) {
            double[] n = numbers(path.replaceAll("[A-Za-z]", " "));
            // Every anchor and control point, which is more than the curve reaches: a conservative bound.
            for (int i = 0; i + 1 < n.length; i += 2) {
                double x = shiftX + scaleX * n[i], y = shiftY + scaleY * n[i + 1];
                minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                farthest = Math.max(farthest, Math.hypot(x - 54, y - 54));
            }
        }
        // The launcher shows the middle 72 of the icon's 108 units and keeps a 66-unit circle safe from any mask.
        assertTrue("a corner of the P is outside the 66 unit safe circle: " + farthest, farthest <= 33);
        assertEquals("the P is not centred across", 54, (minX + maxX) / 2, 1.0);
        assertEquals("the P is not centred down", 54, (minY + maxY) / 2, 1.0);
        assertTrue("the P is too small to read: " + (maxY - minY), maxY - minY >= 44);
    }

    private static double group(String xml, String attribute) {
        Matcher m = Pattern.compile("android:" + attribute + "=\"(-?[\\d.]+)\"").matcher(xml);
        assertTrue("the launcher foreground has no " + attribute, m.find());
        return Double.parseDouble(m.group(1));
    }
}
