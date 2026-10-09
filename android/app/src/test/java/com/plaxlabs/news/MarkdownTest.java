package com.plaxlabs.news;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class MarkdownTest {
    @Test public void boldAndItalicBecomeStyledSpansWithoutMarkers() {
        assertEquals(List.of(
                new Markdown.Span("The ", false, false), new Markdown.Span("key phrase", true, false),
                new Markdown.Span(" and ", false, false), new Markdown.Span("emphasis", false, true),
                new Markdown.Span(".", false, false)),
                Markdown.parse("The **key phrase** and *emphasis*."));
    }

    @Test public void unbalancedMarkersAreDroppedNotShown() {
        assertEquals(List.of(new Markdown.Span("a b", false, false)), Markdown.parse("a **b"));
        assertEquals(List.of(new Markdown.Span("open  text", false, false)), Markdown.parse("open ** text"));
        assertEquals(List.of(new Markdown.Span("price 5 up", false, false)), Markdown.parse("price *5 up"));
    }

    @Test public void listBulletsAreRenderedAsBullets() {
        assertEquals(List.of(new Markdown.Span("\u2022 one\n\u2022 two", false, false)), Markdown.parse("* one\n* two"));
    }

    @Test public void plainHindiIsLeftUntouched() {
        String hindi = "\u092d\u093e\u0930\u0924 \u0928\u0947 \u091c\u0940\u0924 \u0926\u0930\u094d\u091c \u0915\u0940\u0964";
        assertEquals(List.of(new Markdown.Span(hindi, false, false)), Markdown.parse(hindi));
    }

    @Test public void hindiBoldKeepsTheSpacingAroundIt() {
        var spans = Markdown.parse("\u0938\u092e\u092f **13 \u0905\u0915\u094d\u091f\u0942\u092c\u0930** \u0924\u0915");
        assertEquals(3, spans.size());
        assertTrue(spans.get(1).bold()); assertTrue(spans.get(0).text().endsWith(" ")); assertTrue(spans.get(2).text().startsWith(" "));
    }
}
