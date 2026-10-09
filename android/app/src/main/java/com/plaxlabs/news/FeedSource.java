package com.plaxlabs.news;

import java.util.List;

interface FeedSource {
    interface Result {
        void loaded(List<Story> stories);
        void failed(int message);
    }

    Cancelable load(String categories, String lang, List<String> excluded, boolean refresh, Result result);
}
