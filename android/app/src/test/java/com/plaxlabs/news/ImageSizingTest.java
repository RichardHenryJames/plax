package com.plaxlabs.news;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class ImageSizingTest {
    @Test public void bbcThumbnailsAreUpgradedAndTheOriginalIsTheFallback() {
        String small = "https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/0816/live/photo.jpg";
        assertEquals(List.of("https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/0816/live/photo.jpg", small),
                ImageSizing.candidates(small, 1080));
        assertEquals(List.of("https://ichef.bbci.co.uk/ace/ws/800/cpsprodpb/x/photo.jpg",
                        "https://ichef.bbci.co.uk/ace/ws/240/cpsprodpb/x/photo.jpg"),
                ImageSizing.candidates("https://ichef.bbci.co.uk/ace/ws/240/cpsprodpb/x/photo.jpg", 700));
    }

    @Test public void largeBbcImagesAndOtherHostsAreNotRewritten() {
        String large = "https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/0816/live/photo.jpg";
        assertEquals(List.of(large), ImageSizing.candidates(large, 1080));
        String other = "https://c.ndtvimg.com/2026-10/a_625x300.jpeg?im=FeatureCrop,width=1280";
        assertEquals(List.of(other), ImageSizing.candidates(other, 1080));
    }

    @Test public void sampleSizeKeepsTheDecodedWidthAtOrAboveTheTarget() {
        assertEquals(1, ImageSizing.sampleSize(1200, 1080));
        assertEquals(1, ImageSizing.sampleSize(2000, 1080));
        assertEquals(2, ImageSizing.sampleSize(2160, 1080));
        assertEquals(4, ImageSizing.sampleSize(4500, 1080));
        assertEquals(1, ImageSizing.sampleSize(240, 1080));
    }
}
