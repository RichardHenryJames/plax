import { site as buildSite } from '@/build'
import { bodyOf, makeStory, type Story } from '@/data/story'
import { BUILT_IN_TOPICS } from '@/data/topic'
import { systemClock, type Clock } from '@/platform/clock'
import { request as httpRequest } from '@/platform/http'
import type { AuthApi, Tokens } from './auth-api'
import { fetchAuthConfig, type AuthConfig } from './auth-config'
import { SAVED_STORIES_LIMIT, type CloudApi } from './cloud-api'
import { AccountError } from './errors'
import { cleanTopics, type TopicId } from './topics'
import { isObject, parseJson, send, type Call, type RequestFn } from './transport'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A story the account will hold has a plain identifier: letters, digits, underscore, dot and hyphen. Nothing else is ever put in an address.
const CARD_ID = /^[\p{L}\p{N}_.-]{1,200}$/u
const TOKEN = /^[\x21-\x7e]+$/
const CONTROL = /[\u0000-\u001f\u007f]/g

export const TITLE_LIMIT = 300
export const CONTENT_LIMIT = 500
export const CATEGORY_LIMIT = 40
/** An access token is trusted for a day at the most, whatever the service says. */
export const MAX_LIFETIME_S = 86_400

const JSON_TYPE = 'application/json; charset=utf-8'

export interface SupabaseOptions {
  /** How the network is reached (default: platform/http). */
  request?: RequestFn
  /** The Plax website, as an address or a function that gives it (default: the website of this build). */
  site?: string | (() => string)
  clock?: Clock
  /** The topics on offer now: the account's topics that are not among them are dropped (default: the built-in ones). */
  topics?: () => readonly TopicId[]
}

/** What the service sends is read, never trusted: text without control characters, cut to its limit. */
function text(object: Record<string, unknown>, key: string, limit: number): string {
  const value = object[key]
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return ''
  const clean = String(value).replace(CONTROL, '').trim()
  return clean.length > limit ? clean.slice(0, limit) : clean
}

/** What is sent to the account: one line of text, cut to its limit. */
function cap(value: string, limit: number): string {
  const clean = value.replace(CONTROL, ' ').trim()
  return clean.length > limit ? clean.slice(0, limit) : clean
}

function readTokens(body: string, now: number): Tokens {
  const root = parseJson(body, 'Unreadable sign-in response')
  if (!isObject(root)) throw new AccountError('Unreadable sign-in response')
  const { access_token: access, refresh_token: refresh, expires_in: lifetime, user } = root
  if (typeof access !== 'string' || typeof refresh !== 'string' || typeof lifetime !== 'number' || !isObject(user) || typeof user.id !== 'string') {
    throw new AccountError('Unreadable sign-in response')
  }
  const seconds = Math.trunc(lifetime)
  if (!UUID.test(user.id) || access.length > 4096 || refresh.length > 1024 || !TOKEN.test(access) || !TOKEN.test(refresh) || !(seconds > 0)) {
    throw new AccountError('Unexpected sign-in response')
  }
  const meta = isObject(user.user_metadata) ? user.user_metadata : {}
  const name = text(meta, 'full_name', 80) || text(meta, 'name', 80)
  return { access, refresh, expiresAt: now + Math.min(seconds, MAX_LIFETIME_S) * 1000, userId: user.id.toLowerCase(), email: text(user, 'email', 200), name }
}

const query = (parameters: readonly (readonly [string, string])[]): string =>
  parameters.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')

/** The id of the account as a plain UUID, the only form that is ever put in an address. */
function userOf(tokens: Tokens): string {
  if (!UUID.test(tokens.userId)) throw new AccountError('Invalid account')
  return tokens.userId
}

/**
 * Talks to the Plax account service (Supabase) and to the Plax website over https. Answers are size-bounded and, whatever the status, never
 * reach an error message, and neither tokens nor answers are ever logged. A port of Supabase.java of the native app.
 */
export function createSupabase(options: SupabaseOptions = {}): AuthApi & CloudApi {
  const request = options.request ?? httpRequest
  const clock = options.clock ?? systemClock
  const known = options.topics ?? (() => BUILT_IN_TOPICS)
  const website = (): string => {
    const site = options.site ?? buildSite
    return typeof site === 'function' ? site() : site
  }

  const post = (config: AuthConfig, access: string | null, body: string): Call => ({
    method: 'POST',
    headers: { apikey: config.anonKey, Accept: 'application/json', 'Content-Type': JSON_TYPE, ...(access === null ? {} : { Authorization: `Bearer ${access}` }) },
    body,
  })
  const authed = (config: AuthConfig, tokens: Tokens, extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: config.anonKey,
    Authorization: `Bearer ${tokens.access}`,
    Accept: 'application/json',
    ...extra,
  })
  const rest = (config: AuthConfig, table: string, parameters: readonly (readonly [string, string])[]): string =>
    `${config.url}/rest/v1/${table}?${query(parameters)}`

  return {
    // Authentication

    config: () => fetchAuthConfig(request, website()),

    async check(config) {
      const settings = parseJson(await send(request, `${config.url}/auth/v1/settings`, { headers: { apikey: config.anonKey, Accept: 'application/json' } }), 'Unreadable service settings')
      const providers = isObject(settings) ? settings.external : undefined
      if (!isObject(providers) || typeof providers.google !== 'boolean') throw new AccountError('Unreadable service settings')
      if (!providers.google) throw new AccountError('Google sign-in is not enabled')
    },

    async exchange(config, code, verifier) {
      const body = JSON.stringify({ auth_code: code, code_verifier: verifier })
      return readTokens(await send(request, `${config.url}/auth/v1/token?grant_type=pkce`, post(config, null, body)), clock())
    },

    async refresh(config, refreshToken) {
      const body = JSON.stringify({ refresh_token: refreshToken })
      return readTokens(await send(request, `${config.url}/auth/v1/token?grant_type=refresh_token`, post(config, null, body)), clock())
    },

    async logout(config, access) {
      try {
        await send(request, `${config.url}/auth/v1/logout?scope=local`, post(config, access, '{}'))
      } catch {
        // The phone has already forgotten the session.
      }
    },

    /** Asks the Plax website, which checks the token with the account service and deletes that account only. */
    async deleteAccount(access) {
      await send(request, `${website()}/api/account/delete`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': JSON_TYPE, Authorization: `Bearer ${access}` },
        body: '{}',
      })
    },

    // The reader's topics and saved stories

    async topics(config, tokens) {
      const url = rest(config, 'user_profiles', [['select', 'selected_topics'], ['id', `eq.${userOf(tokens)}`], ['limit', '1']])
      const rows = parseJson(await send(request, url, { headers: authed(config, tokens) }), 'Unreadable profile')
      if (!Array.isArray(rows)) throw new AccountError('Unreadable profile')
      if (rows.length === 0) return new Set<string>()
      const row: unknown = rows[0]
      if (!isObject(row)) throw new AccountError('Unreadable profile')
      const chosen = row.selected_topics
      if (chosen === undefined || chosen === null) return new Set<string>()
      if (!Array.isArray(chosen)) throw new AccountError('Unreadable profile')
      const list: string[] = []
      for (const topic of chosen as unknown[]) {
        if (typeof topic !== 'string' && typeof topic !== 'number' && typeof topic !== 'boolean') throw new AccountError('Unreadable profile')
        list.push(String(topic))
      }
      return cleanTopics(list, known())
    },

    async saveTopics(config, tokens, topics) {
      const row = { id: userOf(tokens), selected_topics: [...cleanTopics(topics, known())], has_onboarded: true }
      await send(request, rest(config, 'user_profiles', [['on_conflict', 'id']]), {
        method: 'POST',
        headers: authed(config, tokens, { Prefer: 'resolution=merge-duplicates,return=minimal', 'Content-Type': JSON_TYPE }),
        body: JSON.stringify([row]),
      })
    },

    async bookmarks(config, tokens) {
      const url = rest(config, 'bookmarks', [
        ['select', 'card_id,card_title,card_category,card_content'],
        ['order', 'created_at.desc'],
        ['limit', String(SAVED_STORIES_LIMIT)],
      ])
      const rows = parseJson(await send(request, url, { headers: authed(config, tokens) }), 'Unreadable saved stories')
      if (!Array.isArray(rows)) throw new AccountError('Unreadable saved stories')
      const stories: Story[] = []
      for (const row of rows as unknown[]) {
        if (!isObject(row)) throw new AccountError('Unreadable saved stories')
        const id = text(row, 'card_id', 200)
        const title = text(row, 'card_title', TITLE_LIMIT)
        const content = text(row, 'card_content', CONTENT_LIMIT)
        const category = text(row, 'card_category', CATEGORY_LIMIT)
        if (!CARD_ID.test(id) || (title === '' && content === '')) continue
        // The account keeps no link or picture, so a restored story reads as text only.
        stories.push(makeStory({ id, title, content, category: category === '' ? 'news' : category }))
      }
      return stories
    },

    async addBookmarks(config, tokens, stories) {
      const user = userOf(tokens)
      const rows = stories
        .filter((story) => CARD_ID.test(story.id))
        .map((story) => {
          const body = bodyOf(story)
          return {
            user_id: user,
            card_id: story.id,
            card_title: cap(story.title, TITLE_LIMIT),
            card_category: cap(story.category, CATEGORY_LIMIT),
            card_content: cap(body === '' ? story.content : body, CONTENT_LIMIT),
          }
        })
      if (rows.length === 0) return
      // There is no update rule for bookmarks, so a repeat must be ignored rather than merged.
      await send(request, rest(config, 'bookmarks', [['on_conflict', 'user_id,card_id']]), {
        method: 'POST',
        headers: authed(config, tokens, { Prefer: 'resolution=ignore-duplicates,return=minimal', 'Content-Type': JSON_TYPE }),
        body: JSON.stringify(rows),
      })
    },

    async removeBookmark(config, tokens, id) {
      if (!CARD_ID.test(id)) return
      const url = rest(config, 'bookmarks', [['user_id', `eq.${userOf(tokens)}`], ['card_id', `eq.${id}`]])
      await send(request, url, { method: 'DELETE', headers: authed(config, tokens, { Prefer: 'return=minimal' }) })
    },
  }
}
