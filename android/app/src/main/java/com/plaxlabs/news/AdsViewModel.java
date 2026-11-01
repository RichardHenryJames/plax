package com.plaxlabs.news;

import android.app.Application;
import androidx.lifecycle.AndroidViewModel;

/**
 * Keeps the ads of the full pages when the screen is made again (turning the phone, a change of theme or language), so that an ad
 * that has been asked for is not asked for twice and the reader is not moved off an ad page they are on. It holds nothing of the
 * screen itself: the views are the screen's, built again each time from the ad.
 */
public final class AdsViewModel extends AndroidViewModel {
    final AdController controller;

    public AdsViewModel(Application application) {
        super(application);
        controller = new AdController(Ads.network(), application);
    }

    @Override protected void onCleared() { controller.destroy(); }
}
