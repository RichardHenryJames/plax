package com.plaxlabs.news;

/** Makes a story's page on Plax, so that it can be shared as a link of the site's own. */
interface ShareSource {
    interface Result {
        /** The page's address, or an empty string when there is none: the publisher's link is shared instead. */
        void done(String link);
    }

    Cancelable link(Story story, Result result);
}
