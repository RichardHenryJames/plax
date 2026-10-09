package com.plaxlabs.news;

import org.junit.Test;
import static org.junit.Assert.*;

public class StoryTest {
    private static Story story(String title, String content, String sourceUrl) {
        return new Story("id", title, content, "news", "", "Publisher", sourceUrl, "", "", 0);
    }

    @Test public void bodyHidesAHeadlineRepeatedAsTheWholeText() {
        assertEquals("", story("Markets rally", "Markets rally", "").body());
        assertEquals("", story("Markets rally.", "  markets   rally ", "").body());
        assertEquals("", story("Markets rally", "Markets rally\u2026", "").body());
    }

    @Test public void bodyDropsTheHeadlineWhenTheTextStartsWithIt() {
        Story story = story("Sensex gains 800 points",
                "Sensex gains 800 points: all sectoral indices turned green after a sharp selloff.", "");
        assertEquals("all sectoral indices turned green after a sharp selloff.", story.body());
    }

    @Test public void bodyKeepsIndependentTextAndShortTailsAreDropped() {
        assertEquals("A different explanation entirely.", story("Headline", "A different explanation entirely.", "").body());
        assertEquals("", story("Headline words here", "Headline words here. Ok.", "").body());
        assertEquals("A quote with no title.", story("", "A quote with no title.", "").body());
    }

    @Test public void bodyKeepsASentenceThatMerelyBeginsWithTheTitle() {
        // Encyclopedia leads start with their own title; cutting it off would leave "is the change in...".
        assertEquals("Evolution is the change in the heritable characteristics of populations.",
                story("Evolution", "Evolution is the change in the heritable characteristics of populations.", "").body());
        assertEquals("Mercury, the smallest planet, orbits the Sun every 88 days.",
                story("Mercury", "Mercury, the smallest planet, orbits the Sun every 88 days.", "").body());
        assertEquals("Markets rally as inflation cools and banks lead the gains.",
                story("Markets rally", "Markets rally as inflation cools and banks lead the gains.", "").body());
    }

    @Test public void bodyDropsTheHeadlineOnlyWhenASeparatorFollowsIt() {
        assertEquals("Banks led the gains on Friday.", story("Markets rally", "Markets rally. Banks led the gains on Friday.", "").body());
        assertEquals("Banks led the gains on Friday.", story("Markets rally", "Markets rally - Banks led the gains on Friday.", "").body());
        assertEquals("Banks led the gains on Friday.", story("Markets rally", "Markets rally \u2014 Banks led the gains on Friday.", "").body());
        assertEquals("Banks led the gains on Friday.", story("Markets rally", "Markets rally | Banks led the gains on Friday.", "").body());
        assertEquals("\u092c\u0948\u0902\u0915\u094b\u0902 \u0928\u0947 \u0936\u0941\u0915\u094d\u0930\u0935\u093e\u0930 \u0915\u094b \u092c\u0922\u093c\u0924 \u092c\u0928\u093e\u0908\u0964",
                story("\u092c\u093e\u091c\u093c\u093e\u0930 \u092e\u0947\u0902 \u0924\u0947\u091c\u093c\u0940",
                        "\u092c\u093e\u091c\u093c\u093e\u0930 \u092e\u0947\u0902 \u0924\u0947\u091c\u093c\u0940\u0964 \u092c\u0948\u0902\u0915\u094b\u0902 \u0928\u0947 \u0936\u0941\u0915\u094d\u0930\u0935\u093e\u0930 \u0915\u094b \u092c\u0922\u093c\u0924 \u092c\u0928\u093e\u0908\u0964", "").body());
    }

    @Test public void sourceHostDropsWwwAndRequiresHttps() {
        assertEquals("bbc.com", story("t", "c", "https://www.bbc.com/news/a").sourceHost());
        assertEquals("ndtv.com", story("t", "c", "https://NDTV.com/x?y=1").sourceHost());
        assertEquals("", story("t", "c", "http://example.com/a").sourceHost());
        assertEquals("", story("t", "c", "").sourceHost());
    }

    @Test public void readTimesFromTheFeedAreUnderstoodSoTheyCanBeLocalized() {
        for (var entry : java.util.Map.of("13s", 13, "30 sec", 30, "1 min", 60, "2 mins", 120, "45 Seconds", 45, "3m", 180).entrySet())
            assertEquals(entry.getKey(), (int) entry.getValue(), withReadTime(entry.getKey()).readSeconds());
        for (String unknown : java.util.List.of("", "soon", "1h", "-5s", "12345s"))
            assertEquals(unknown, -1, withReadTime(unknown).readSeconds());
    }

    private static Story withReadTime(String value) {
        return new Story("id", "t", "c", "news", "", "Publisher", "", "", value, 0);
    }
}
