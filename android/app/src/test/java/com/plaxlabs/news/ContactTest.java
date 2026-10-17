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
 * The contact details Google Play's news policy asks for inside the app: they must be real, the same as the website
 * publishes, and present in both languages with the placeholders the code fills in.
 */
public class ContactTest {
    private static final Pattern PLACEHOLDER = Pattern.compile("%(\\d)\\$s");

    private static Path project() { return Path.of(System.getProperty("user.dir")); }

    private static String read(Path file) throws IOException { return new String(Files.readAllBytes(file), StandardCharsets.UTF_8); }

    @Test public void theAddressIsOneAMailAppCanOpen() {
        assertTrue(Contact.EMAIL.matches("[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}"));
        assertEquals("mailto:" + Contact.EMAIL, Contact.mailto());
        assertEquals("Plax 1.5.1 feedback", Contact.subject("Plax", "1.5.1"));
        assertFalse(Contact.OPERATOR.isBlank());
    }

    @Test public void theContactPageIsOnThePlaxWebsite() {
        assertEquals("https://www.plaxlabs.com/news/contact", Contact.PAGE_URL);
        assertTrue(Story.isWebLink(Contact.PAGE_URL));
        assertTrue(Contact.PAGE_URL.startsWith(FeedApi.SITE + "/"));
    }

    @Test public void theAddressAndPageAreTheOnesTheWebsitePublishes() throws IOException {
        Path legal = project().resolve("..").resolve("..").resolve("src").resolve("lib").resolve("legal.ts").normalize();
        Assume.assumeTrue("the website files are not next to this project", Files.exists(legal));
        String source = read(legal);
        Matcher email = Pattern.compile("contactEmail:\\s*'([^']+)'").matcher(source);
        assertTrue("legal.ts has no contactEmail", email.find());
        assertEquals("the app and the website show different addresses", email.group(1), Contact.EMAIL);
        Matcher path = Pattern.compile("contactPath:\\s*'([^']+)'").matcher(source);
        assertTrue("legal.ts has no contactPath", path.find());
        assertEquals("the app opens a different page from the one the website serves", FeedApi.SITE + path.group(1), Contact.PAGE_URL);
        Matcher operator = Pattern.compile("operator:\\s*'([^']+)'").matcher(source);
        assertTrue(operator.find());
        assertEquals(operator.group(1), Contact.OPERATOR);
    }

    @Test public void bothLanguagesHaveTheContactStringsWithTheSamePlaceholders() throws IOException {
        Path res = project().resolve("src").resolve("main").resolve("res");
        Path english = res.resolve("values").resolve("strings.xml");
        Path hindi = res.resolve("values-hi").resolve("strings.xml");
        Assume.assumeTrue("the resources are not where the project expects them", Files.exists(english) && Files.exists(hindi));
        Pattern entry = Pattern.compile("<string name=\"(contact_[a-z_]+|about_text)\"[^>]*>(.*?)</string>", Pattern.DOTALL);
        java.util.Map<String, String> en = strings(entry, read(english)), hi = strings(entry, read(hindi));
        assertEquals("the two languages define different contact strings", en.keySet(), hi.keySet());
        assertTrue(en.keySet().containsAll(Set.of("contact_us", "contact_intro", "contact_send", "contact_copy", "contact_page", "about_text")));
        for (String name : en.keySet()) {
            assertEquals("the placeholders of " + name + " differ between English and Hindi", placeholders(en.get(name)), placeholders(hi.get(name)));
        }
        assertEquals("about_text is filled with the version and the address", Set.of("1", "2"), placeholders(en.get("about_text")));
        assertEquals(Set.of("1"), placeholders(en.get("contact_page_line")));
        assertEquals(Set.of("1"), placeholders(en.get("contact_about")));
    }

    private static java.util.Map<String, String> strings(Pattern entry, String xml) {
        java.util.Map<String, String> found = new java.util.TreeMap<>();
        Matcher matcher = entry.matcher(xml);
        while (matcher.find()) found.put(matcher.group(1), matcher.group(2));
        return found;
    }

    private static Set<String> placeholders(String text) {
        Set<String> numbers = new TreeSet<>();
        Matcher matcher = PLACEHOLDER.matcher(text);
        while (matcher.find()) numbers.add(matcher.group(1));
        return numbers;
    }
}
