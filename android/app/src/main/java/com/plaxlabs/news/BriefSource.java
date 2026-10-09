package com.plaxlabs.news;

interface BriefSource {
    interface Result {
        void done(Brief brief);
        void failed(int message);
    }

    Cancelable brief(Story story, String lang, Result result);
}
