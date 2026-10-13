// Deleting a reader's own account. Google Play requires that an account made inside an app can be deleted again, with
// its data, from the app and from a web page.
//
// The caller proves who they are with the access token their own sign-in gave them, and the account removed is the one
// that token belongs to, as the account service itself reports it. Nothing in the request names an account, so nobody
// can remove somebody else's. Removing the auth user is the whole job: user_profiles, bookmarks and engagements all
// reference it with ON DELETE CASCADE (supabase-schema.sql), and its sessions and sign-in identities go with it.

export type DeleteOutcome =
  | { status: 200; body: { deleted: true } }
  | { status: 401; body: { error: 'unauthorized' } }
  | { status: 503; body: { error: 'unavailable' } }

export interface AccountEnv {
  url?: string
  anonKey?: string
  serviceKey?: string
}

export const MAX_TOKEN_LENGTH = 4096
const TOKEN = /^[A-Za-z0-9._~+/=-]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const UNAUTHORIZED: DeleteOutcome = { status: 401, body: { error: 'unauthorized' } }
const UNAVAILABLE: DeleteOutcome = { status: 503, body: { error: 'unavailable' } }

/** The token of an "Authorization: Bearer ..." header, or null when there is none worth asking the service about. */
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec((header ?? '').trim())
  const token = match ? match[1] : ''
  return token.length > 0 && token.length <= MAX_TOKEN_LENGTH && TOKEN.test(token) ? token : null
}

/**
 * Deletes the account the token belongs to. 401: the service does not accept the token. 503: it could not be done
 * right now, and nothing was deleted or it can safely be asked again. A second request for an account that is already
 * gone is a success, so a reader who lost the answer can simply try again. The token is never put in a result or log.
 */
export async function deleteOwnAccount(
  token: string,
  env: AccountEnv,
  fetcher: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<DeleteOutcome> {
  const base = (env.url ?? '').replace(/\/+$/, '')
  if (!base || !env.anonKey || !env.serviceKey) return UNAVAILABLE
  try {
    const who = await fetcher(`${base}/auth/v1/user`, {
      headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (who.status === 401 || who.status === 403) return UNAUTHORIZED
    if (!who.ok) return UNAVAILABLE
    const user = (await who.json().catch(() => null)) as { id?: unknown } | null
    // The id becomes part of an address below, so only a real UUID is used.
    const id = typeof user?.id === 'string' && UUID.test(user.id) ? user.id.toLowerCase() : ''
    if (!id) return UNAVAILABLE

    const gone = await fetcher(`${base}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ should_soft_delete: false }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return gone.ok || gone.status === 404 ? { status: 200, body: { deleted: true } } : UNAVAILABLE
  } catch {
    return UNAVAILABLE
  }
}
