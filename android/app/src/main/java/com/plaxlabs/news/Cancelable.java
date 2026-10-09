package com.plaxlabs.news;

/** A request that can be abandoned when its result is no longer wanted. */
interface Cancelable {
    void cancel();
}
