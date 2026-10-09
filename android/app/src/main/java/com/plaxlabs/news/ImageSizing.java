package com.plaxlabs.news;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure helpers that decide which image bytes to ask for and how large to decode them. */
final class ImageSizing {
    // BBC's image service serves the same picture at several fixed widths; feeds usually carry the smallest.
    private static final Pattern BBC = Pattern.compile("^(https://ichef\\.bbci\\.co\\.uk/ace/(?:standard|ws)/)(\\d{2,4})(/.*)$");
    private static final int[] BBC_WIDTHS = {240, 320, 480, 624, 800, 976};

    private ImageSizing() { }

    /** URLs to try in order. The original is always last, so an unsupported upgrade falls back to it. */
    static List<String> candidates(String url, int targetWidth) {
        List<String> urls = new ArrayList<>();
        Matcher bbc = BBC.matcher(url);
        if (bbc.matches()) {
            int current = Integer.parseInt(bbc.group(2));
            int wanted = BBC_WIDTHS[BBC_WIDTHS.length - 1];
            for (int width : BBC_WIDTHS) if (width >= targetWidth) { wanted = width; break; }
            if (wanted > current) urls.add(bbc.group(1) + wanted + bbc.group(3));
        }
        urls.add(url);
        return urls;
    }

    /** Largest power-of-two subsampling that keeps the decoded width at or above the target. */
    static int sampleSize(int width, int targetWidth) {
        int sample = 1;
        while (width / (sample * 2) >= targetWidth) sample *= 2;
        return sample;
    }
}
