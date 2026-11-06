import { createHash, randomUUID } from 'node:crypto'
import { appRedirect } from '@shared/app-redirect'
import type { FakeResponse, Route } from '@/test/helpers'
import type { Clock } from '@/platform/clock'

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined }

interface Bookmark {
  card_id: string
  card_title: string | null
  card_category: string | null
  card_content: string | null
  order: number
}

interface User {
  id: string
  email: string
  name: string
  topics: string[]
  hasOnboarded: boolean
  bookmarks: Bookmark[]
}

export interface StackOptions {
  project: string
  site: string
  anonKey: string
  clock: Clock
}

const base64Url = (text: string) => Buffer.from(text).toString('base64url')
const challengeOf = (verifier: string) => createHash('sha256').update(verifier, 'ascii').digest('base64url')
const json = (status: number, body: unknown): FakeResponse => ({ status, body })
const empty = (status: number): FakeResponse => ({ status, body: '' })
const denied = (): FakeResponse => json(403, { code: '42501', message: 'new row violates row-level security policy' })

/**
 * A small account service in memory: the parts of Supabase's GoTrue and PostgREST (with row-level security) and of the Plax website that
 * the app talks to, behaving the way the real ones were seen to behave by the native app's opt-in test against a real stack. It answers
 * through fakeFetch, so the whole of the app's own network code is used.
 */
export function createStack(options: StackOptions) {
  const { project, site, anonKey, clock } = options
  const users = new Map<string, User>()
  const codes = new Map<string, { userId: string; challenge: string }>()
  const refreshTokens = new Map<string, { userId: string; sid: string; revoked: boolean }>()
  let order = 0
  const stack = {
    /** Everything asked of the project and the website: "GET /rest/v1/bookmarks". */
    log: [] as string[],
    /** The connection is down: every call fails as a phone with no network does. */
    down: false,
    google: true,
    users,
  }

  function token(userId: string, sid: string, lifetime = 3600): string {
    const payload = { sub: userId, sid, role: 'authenticated', exp: Math.floor(clock() / 1000) + lifetime }
    return `${base64Url('{"alg":"HS256","typ":"JWT"}')}.${base64Url(JSON.stringify(payload))}.${base64Url('signature')}`
  }

  function session(user: User, sid: string = randomUUID()): FakeResponse {
    const refresh = randomUUID().replace(/-/g, '').slice(0, 12)
    refreshTokens.set(refresh, { userId: user.id, sid, revoked: false })
    return json(200, {
      access_token: token(user.id, sid),
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: refresh,
      user: { id: user.id, email: user.email, user_metadata: { full_name: user.name, avatar_url: 'https://example.com/a.png' } },
    })
  }

  type Who = { kind: 'anon' } | { kind: 'user'; id: string; sid: string } | { kind: 'bad'; reason: 'expired' | 'malformed' }

  function who(headers: Record<string, string>): Who {
    const header = headers.Authorization
    if (header === undefined) return { kind: 'anon' }
    const bearer = /^Bearer (\S+)$/.exec(header)
    const parts = bearer?.[1].split('.')
    if (!parts || parts.length !== 3) return { kind: 'bad', reason: 'malformed' }
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub: string; sid: string; exp: number }
      if (payload.exp * 1000 <= clock()) return { kind: 'bad', reason: 'expired' }
      if (!users.has(payload.sub)) return { kind: 'bad', reason: 'malformed' }
      return { kind: 'user', id: payload.sub, sid: payload.sid }
    } catch {
      return { kind: 'bad', reason: 'malformed' }
    }
  }

  const filter = (url: URL, name: string): string | undefined => {
    const value = url.searchParams.get(name)
    return value?.startsWith('eq.') ? value.slice(3) : undefined
  }

  function rest(call: Call, url: URL): FakeResponse {
    const caller = who(call.headers)
    if (caller.kind === 'bad') {
      return json(401, caller.reason === 'expired' ? { code: 'PGRST303', message: 'JWT expired' } : { code: 'PGRST301', message: 'JWSError JWSInvalidSignature' })
    }
    const uid = caller.kind === 'user' ? caller.id : null
    const table = url.pathname.slice('/rest/v1/'.length)
    const body = call.body === undefined ? undefined : (JSON.parse(call.body) as Record<string, unknown>[])
    const prefer = call.headers.Prefer ?? ''

    if (table === 'user_profiles') {
      if (call.method === 'GET') {
        const wanted = filter(url, 'id')
        const user = uid === null ? undefined : users.get(uid)
        // Row-level security: only the reader's own row is ever visible.
        return json(200, user && (wanted === undefined || wanted === user.id) ? [{ selected_topics: user.topics }] : [])
      }
      if (call.method === 'POST' && body) {
        if (uid === null) return json(401, { code: '42501', message: 'permission denied for table user_profiles' })
        for (const row of body) {
          if (row.id !== uid) return denied()
          // The profile exists since the account was made (the database trigger), so only an upsert may write it.
          if (!prefer.includes('resolution=merge-duplicates')) return json(409, { code: '23505', message: 'duplicate key value' })
          const user = users.get(uid) as User
          user.topics = row.selected_topics as string[]
          user.hasOnboarded = row.has_onboarded === true
        }
        return empty(201)
      }
    }

    if (table === 'bookmarks') {
      if (call.method === 'GET') {
        const own = uid === null ? [] : (users.get(uid) as User).bookmarks
        const limit = Number(url.searchParams.get('limit') ?? Infinity)
        const columns = (url.searchParams.get('select') ?? '').split(',')
        const rows = [...own].sort((a, b) => b.order - a.order).slice(0, limit)
        return json(200, rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column as keyof Bookmark] ?? null]))))
      }
      if (call.method === 'POST' && body) {
        if (uid === null) return json(401, { code: '42501', message: 'permission denied for table bookmarks' })
        for (const row of body) if (row.user_id !== uid) return denied()
        const user = users.get(uid) as User
        for (const row of body) {
          if (user.bookmarks.some((held) => held.card_id === row.card_id)) {
            // The unique (user_id, card_id): with "ignore duplicates" a repeat is skipped, not merged; without it, it is a conflict.
            if (prefer.includes('resolution=ignore-duplicates')) continue
            return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' })
          }
          user.bookmarks.push({
            card_id: String(row.card_id),
            card_title: (row.card_title as string | null) ?? null,
            card_category: (row.card_category as string | null) ?? null,
            card_content: (row.card_content as string | null) ?? null,
            order: ++order,
          })
        }
        return empty(201)
      }
      if (call.method === 'DELETE') {
        if (uid === null) return json(401, { code: '42501', message: 'permission denied for table bookmarks' })
        const user = users.get(uid) as User
        const owner = filter(url, 'user_id')
        const card = filter(url, 'card_id')
        // Row-level security: only the reader's own rows can be deleted, whatever the filter says.
        if (owner === uid) user.bookmarks = user.bookmarks.filter((held) => held.card_id !== card)
        return empty(204)
      }
    }
    return json(404, { code: 'PGRST205', message: 'not found' })
  }

  function auth(call: Call, url: URL): FakeResponse {
    const path = url.pathname.slice('/auth/v1/'.length)
    if (path === 'settings') return json(200, { external: { google: stack.google, email: true } })
    const body = call.body === undefined ? {} : (JSON.parse(call.body) as Record<string, string>)
    if (path === 'token' && call.method === 'POST') {
      const grant = url.searchParams.get('grant_type')
      if (grant === 'pkce') {
        const flow = codes.get(body.auth_code)
        if (!flow || challengeOf(body.code_verifier ?? '') !== flow.challenge) return json(400, { code: 400, error_code: 'flow_state_not_found', msg: 'invalid flow state' })
        // A code is good once.
        codes.delete(body.auth_code)
        return session(users.get(flow.userId) as User)
      }
      if (grant === 'refresh_token') {
        const held = refreshTokens.get(body.refresh_token)
        if (!held || held.revoked || !users.has(held.userId)) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
        held.revoked = true
        return session(users.get(held.userId) as User, held.sid)
      }
    }
    if (path === 'logout' && call.method === 'POST') {
      const caller = who(call.headers)
      if (caller.kind !== 'user') return json(401, { code: 401, msg: 'invalid JWT' })
      const scope = url.searchParams.get('scope') ?? 'global'
      for (const held of refreshTokens.values()) if (held.userId === caller.id && (scope === 'global' || held.sid === caller.sid)) held.revoked = true
      return empty(204)
    }
    return json(404, { code: 404, msg: 'not found' })
  }

  function website(call: Call, url: URL): FakeResponse {
    const path = url.pathname.slice(new URL(site).pathname.length)
    if (path === '/api/auth-config' && call.method === 'GET') return json(200, { url: project, anonKey })
    if (path === '/api/account/delete' && call.method === 'POST') {
      const caller = who(call.headers)
      if (caller.kind !== 'user') return json(401, { error: 'unauthorized' })
      // The auth user goes, and the profile, saved stories and activity with it (ON DELETE CASCADE).
      users.delete(caller.id)
      for (const held of refreshTokens.values()) if (held.userId === caller.id) held.revoked = true
      return json(200, { deleted: true })
    }
    return json(404, { error: 'not found' })
  }

  const handle = (service: 'project' | 'website'): Route => (call) => {
    if (stack.down) return { networkError: true }
    const url = new URL(call.url)
    stack.log.push(`${call.method} ${url.pathname}`)
    if (service === 'website') return website(call, url)
    if (call.headers.apikey !== anonKey) return json(401, { message: 'No API key found in request' })
    if (url.pathname.startsWith('/auth/v1/')) return auth(call, url)
    if (url.pathname.startsWith('/rest/v1/')) return rest(call, url)
    return json(404, {})
  }

  return Object.assign(stack, {
    /** What to give fakeFetch. */
    routes: { [project]: handle('project'), [site]: handle('website') } as Record<string, Route>,

    /** What Google and the browser do: the reader says yes, and a one-time code, bound to the challenge, is handed to the website's redirect. */
    codeFor(email: string, challenge: string): string {
      let user = [...users.values()].find((held) => held.email === email)
      if (!user) {
        // The database trigger makes the profile row with the account.
        user = { id: randomUUID(), email, name: 'Asha Rao', topics: [], hasOnboarded: false, bookmarks: [] }
        users.set(user.id, user)
      }
      const code = randomUUID()
      codes.set(code, { userId: user.id, challenge })
      return code
    },

    /** The address the website's /auth/app page sends the browser to with that code (its own redirect, not a copy of it). */
    callbackFor(code: string, scheme: string): string {
      return appRedirect(new URLSearchParams({ app: scheme, code })) as string
    },

    user(email: string): User | undefined {
      return [...users.values()].find((held) => held.email === email)
    },

    /** An access token that ran out an hour ago, signed as the service signs them. */
    expiredToken(userId: string): string {
      return token(userId, randomUUID(), -3600)
    },

    revokeEverywhere(userId: string): void {
      for (const held of refreshTokens.values()) if (held.userId === userId) held.revoked = true
    },
  })
}

export type Stack = ReturnType<typeof createStack>
