package com.plaxlabs.news;

import java.io.IOException;

/** Sign-in with the account service. Calls block, so they run on the account worker. */
interface AuthApi {
    /** The service answered and refused: a wrong or reused code, a revoked session, or a row it will not accept. */
    class Rejected extends IOException {
        final int status;
        Rejected(int status) { super("Rejected with status " + status); this.status = status; }
    }

    /** The access token is no longer accepted; refreshing it may help. */
    class Unauthorized extends Rejected {
        Unauthorized() { super(401); }
    }

    /** What a sign-in yields. The tokens are secrets and are never logged or shown. */
    record Tokens(String access, String refresh, long expiresAt, String userId, String email, String name) { }

    /** Where the accounts live, as published by the Plax website. */
    AuthConfig config() throws IOException;

    /** Confirms the service is reachable and offers Google sign-in, before the reader is sent to a browser. */
    void check(AuthConfig config) throws IOException;

    Tokens exchange(AuthConfig config, String code, String verifier) throws IOException;

    Tokens refresh(AuthConfig config, String refreshToken) throws IOException;

    /** Best effort: the phone forgets the session either way. */
    void logout(AuthConfig config, String access);
}
