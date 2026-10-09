package com.plaxlabs.news;

import android.graphics.Typeface;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.StyleSpan;
import java.util.ArrayList;
import java.util.List;

/** The small subset of Markdown the Plax AI writes: **bold**, *italic* and "* " bullets. */
final class Markdown {
    record Span(String text, boolean bold, boolean italic) { }

    private Markdown() { }

    static List<Span> parse(String input) {
        List<Span> spans = new ArrayList<>();
        StringBuilder plain = new StringBuilder();
        int index = 0, length = input.length();
        while (index < length) {
            char current = input.charAt(index);
            boolean lineStart = index == 0 || input.charAt(index - 1) == '\n';
            if (current == '*' && lineStart && index + 1 < length && input.charAt(index + 1) == ' ') {
                plain.append("\u2022 "); index += 2;
            } else if (input.startsWith("**", index)) {
                int end = input.indexOf("**", index + 2);
                if (end > index + 2) {
                    flush(spans, plain); spans.add(new Span(input.substring(index + 2, end), true, false));
                    index = end + 2;
                } else index += 2;
            } else if (current == '*') {
                int end = input.indexOf('*', index + 1);
                if (end > index + 1 && !input.startsWith("**", end)) {
                    flush(spans, plain); spans.add(new Span(input.substring(index + 1, end), false, true));
                    index = end + 1;
                } else index++;
            } else {
                plain.append(current); index++;
            }
        }
        flush(spans, plain);
        return spans;
    }

    private static void flush(List<Span> spans, StringBuilder plain) {
        if (plain.length() == 0) return;
        spans.add(new Span(plain.toString(), false, false));
        plain.setLength(0);
    }

    static CharSequence render(String input) {
        SpannableStringBuilder output = new SpannableStringBuilder();
        for (Span span : parse(input)) {
            int start = output.length();
            output.append(span.text());
            if (span.bold() || span.italic()) {
                int style = span.bold() ? Typeface.BOLD : Typeface.ITALIC;
                output.setSpan(new StyleSpan(style), start, output.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
        }
        return output;
    }
}
