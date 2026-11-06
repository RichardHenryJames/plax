import type { AuthConfig } from './auth-config'

/** What a sign-in yields. The tokens are secrets: they are never logged, shown or kept anywhere but the phone's secure storage. */
export interface Tokens {
  readonly access: string
  readonly refresh: string
  /** Milliseconds since 1970 at which the access token stops being good. */
  readonly expiresAt: number
  readonly userId: string
  readonly email: string
  readonly name: string
}

/**
 * Sign-in with the account service. A failure is an AccountError (see errors.ts): Rejected when the service answered and refused,
 * Unauthorized when the access token is no longer accepted, and any other AccountError when it could not be reached or understood.
 */
export interface AuthApi {
  /** Where the accounts live, as published by the Plax website. */
  config(): Promise<AuthConfig>
  /** Confirms the service is reachable and offers Google sign-in, before the reader is sent to a browser. */
  check(config: AuthConfig): Promise<void>
  exchange(config: AuthConfig, code: string, verifier: string): Promise<Tokens>
  refresh(config: AuthConfig, refreshToken: string): Promise<Tokens>
  /** Best effort: it never fails, and the phone forgets the session either way. */
  logout(config: AuthConfig, access: string): Promise<void>
  /**
   * Permanently deletes the account this access token belongs to, with everything stored in it. Not best effort: a failure is thrown, and
   * the account is then still there (Unauthorized: the token was refused).
   */
  deleteAccount(access: string): Promise<void>
}
