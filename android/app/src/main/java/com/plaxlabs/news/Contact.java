package com.plaxlabs.news;

/**
 * How to reach the people who make Plax. Google Play's news policy wants contact details that are easy to find in the app and on
 * the website, so the address and the website's contact page are written down once, here. ContactTest checks that they are the
 * ones the website publishes.
 */
final class Contact {
    static final String OPERATOR = "Plax Labs";
    static final String EMAIL = "richardhenryjames64@gmail.com";
    /** The contact page on the website: it shows the same address, and it is the contact URL given to Google Play. */
    static final String PAGE_URL = FeedApi.SITE + "/contact";

    private Contact() { }

    /** Where a mail app opens a new message to. The subject goes in as an extra, which mail apps read more reliably. */
    static String mailto() { return "mailto:" + EMAIL; }

    /** Names the app and its version, so a reply knows what the message is about. */
    static String subject(String appName, String versionName) { return appName + " " + versionName + " feedback"; }
}
