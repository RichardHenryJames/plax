package com.plaxlabs.news;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Assume;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * The launcher icon is an amber tile with a dark "P". The letter has to stay easy to see against whatever the tile is: a white
 * "P" on amber is about 2:1 and looks washed out, a dark one is about 8.6:1 (and is the colour of the app's own text on amber).
 */
public class LauncherIconTest {
    private static Path res() { return Path.of(System.getProperty("user.dir")).resolve("src").resolve("main").resolve("res"); }

    private static String read(Path file) throws IOException { return new String(Files.readAllBytes(file), StandardCharsets.UTF_8); }

    private static double channel(int value) {
        double c = value / 255.0;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    private static double luminance(int rgb) {
        return 0.2126 * channel((rgb >> 16) & 0xff) + 0.7152 * channel((rgb >> 8) & 0xff) + 0.0722 * channel(rgb & 0xff);
    }

    /** The WCAG contrast ratio of two colours, from 1 (the same) to 21 (black on white). */
    static double contrast(int a, int b) {
        double high = Math.max(luminance(a), luminance(b)), low = Math.min(luminance(a), luminance(b));
        return (high + 0.05) / (low + 0.05);
    }

    @Test public void contrastIsMeasuredTheWayWcagDoes() {
        assertEquals(21.0, contrast(0x000000, 0xFFFFFF), 0.01);
        assertEquals(1.0, contrast(0xF59E0B, 0xF59E0B), 0.0001);
        assertEquals("white on this amber is the washed-out pairing", 2.15, contrast(0xF59E0B, 0xFFFFFF), 0.02);
    }

    @Test public void theLetterIsLegibleAgainstTheIconBackground() throws IOException {
        Path colors = res().resolve("values").resolve("colors.xml");
        Path foreground = res().resolve("drawable").resolve("ic_launcher_foreground.xml");
        Assume.assumeTrue("the resources are not where the project expects them", Files.exists(colors) && Files.exists(foreground));
        Matcher background = Pattern.compile("<color name=\"launcher_background\">#([0-9A-Fa-f]{6})</color>").matcher(read(colors));
        assertTrue("there is no launcher_background colour", background.find());
        Set<Integer> inks = new TreeSet<>();
        Matcher fill = Pattern.compile("android:fillColor=\"#([0-9A-Fa-f]{6})\"").matcher(read(foreground));
        while (fill.find()) inks.add(Integer.parseInt(fill.group(1), 16));
        assertEquals("the letter is drawn in one colour", 1, inks.size());
        double ratio = contrast(Integer.parseInt(background.group(1), 16), inks.iterator().next());
        assertTrue("the P is hard to see on the icon background: " + ratio + " : 1, and 4.5 : 1 is the least that looks crisp", ratio >= 4.5);
    }

    @Test public void theAdaptiveIconUsesThatBackgroundAndHasAThemedLayer() throws IOException {
        Path icon = res().resolve("mipmap-anydpi").resolve("ic_launcher.xml");
        Assume.assumeTrue("the resources are not where the project expects them", Files.exists(icon));
        String xml = read(icon);
        assertTrue(xml.contains("<background android:drawable=\"@color/launcher_background\""));
        assertTrue(xml.contains("<foreground android:drawable=\"@drawable/ic_launcher_foreground\""));
        // Android 13 and later tint this layer with the wallpaper's colours when the reader turns themed icons on.
        assertTrue("without a monochrome layer the icon cannot be themed", xml.contains("<monochrome android:drawable=\"@drawable/ic_launcher_foreground\""));
    }
}
