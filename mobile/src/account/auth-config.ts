import { AccountError } from './errors'
import { isObject, parseJson, send, type RequestFn } from './transport'

/** Which Supabase project holds the accounts: its address and its public client (anon) key. */
export interface AuthConfig {
  readonly url: string
  readonly anonKey: string
}

// A project address is only ever "https://<project>.supabase.co", with the standard port or none, and a trailing slash at most.
const ADDRESS = /^https:\/\/([a-z0-9]{8,40}\.supabase\.co)(?::443)?\/?$/i
const KEY = /^[A-Za-z0-9._-]{20,2000}$/

/**
 * Reads the website's answer about where the accounts live. The app asks the website instead of carrying the address, so the project can
 * move without an app update, and it accepts only a Supabase address over https, so that a tampered answer cannot send the sign-in
 * anywhere else.
 */
export function parseAuthConfig(json: string): AuthConfig {
  const root = parseJson(json, 'Unreadable sign-in configuration')
  if (!isObject(root) || typeof root.url !== 'string' || typeof root.anonKey !== 'string') throw new AccountError('Unreadable sign-in configuration')
  const host = ADDRESS.exec(root.url)?.[1]
  if (host === undefined) throw new AccountError('Not a Supabase project address')
  if (!KEY.test(root.anonKey)) throw new AccountError('Unexpected client key')
  return { url: `https://${host.toLowerCase()}`, anonKey: root.anonKey }
}

/** Asks the website (${site}/api/auth-config) where the accounts live. Nothing about the reader is sent. */
export async function fetchAuthConfig(request: RequestFn, site: string): Promise<AuthConfig> {
  return parseAuthConfig(await send(request, `${site}/api/auth-config`, { headers: { Accept: 'application/json' } }))
}
