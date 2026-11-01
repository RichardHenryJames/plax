package com.plaxlabs.news;

/** Which ad network the app uses: Google's where the build has an ad unit, none otherwise. Replaceable in tests. */
final class Ads {
    /** Set by a test to a fake; null means the build's own. */
    static AdNetwork network;

    private Ads() { }

    static AdNetwork network() {
        if (network != null) return network;
        boolean any = !BuildConfig.ADS_BANNER_UNIT.isEmpty() || !BuildConfig.ADS_PAGE_UNIT.isEmpty();
        return any ? GoogleAds.of(BuildConfig.ADS_BANNER_UNIT, BuildConfig.ADS_PAGE_UNIT) : NoAds.INSTANCE;
    }
}
