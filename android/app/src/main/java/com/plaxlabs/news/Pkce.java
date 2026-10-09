package com.plaxlabs.news;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Proof Key for Code Exchange (RFC 7636). The browser hands back a one-time code; it is worth nothing
 * without the secret that only this app holds, so another app that sees the redirect cannot sign in.
 */
final class Pkce {
    private static final SecureRandom RANDOM = new SecureRandom();

    private Pkce() { }

    /** 64 URL-safe characters, inside the 43 to 128 the standard allows. */
    static String verifier() {
        byte[] bytes = new byte[48];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String challenge(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
