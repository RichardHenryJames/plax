package com.plaxlabs.news;

import android.content.Context;
import androidx.appcompat.app.AppCompatActivity;

/** The network of a build with no ads: it asks for nothing, so nothing is shown and nothing leaves the phone. */
final class NoAds implements AdNetwork {
    static final NoAds INSTANCE = new NoAds();

    private NoAds() { }

    @Override public boolean banner() { return false; }
    @Override public boolean page() { return false; }
    @Override public void start(AppCompatActivity activity, Runnable ready) { }
    @Override public boolean privacyOptions(Context context) { return false; }
    @Override public void showPrivacyOptions(AppCompatActivity activity, Runnable done) { done.run(); }
    @Override public Banner loadBanner(Context context, int widthDp, Banner.Listener listener) { listener.failed(); return null; }
    @Override public Cancelable loadPage(Context context, Page.Listener listener) { listener.failed(); return () -> { }; }
}
