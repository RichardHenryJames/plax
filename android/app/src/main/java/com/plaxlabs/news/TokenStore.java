package com.plaxlabs.news;

import java.io.IOException;

/** Keeps the account's secrets. Implementations must never fall back to storing them in the clear. */
interface TokenStore {
    /** The stored text, or null when nothing usable is stored (including after the protecting key was lost). */
    String read() throws IOException;

    /** Throws when the text cannot be stored safely; the caller then refuses to sign in. */
    void write(String text) throws IOException;

    void clear();
}
