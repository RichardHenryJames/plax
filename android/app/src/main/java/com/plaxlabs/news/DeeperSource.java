package com.plaxlabs.news;

interface DeeperSource {
    interface Result {
        void done(Deeper deeper);
        void failed(int message);
    }

    Cancelable deeper(Story story, String lang, Result result);
}
