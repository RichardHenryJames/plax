import { setVariant, fakeFetch } from '@/test/helpers'
import { HttpError, request as realRequest, type HttpResult, type RequestOptions } from '@/platform/http'
import { makeStory } from '@/data/story'
import { AccountError, Rejected, Unauthorized } from '../errors'
import { CALL_TIMEOUT_MS, MAX_CHARS, type RequestFn } from '../transport'
import { createSupabase, CATEGORY_LIMIT, CONTENT_LIMIT, MAX_LIFETIME_S, TITLE_LIMIT } from '../supabase'
import type { Tokens } from '../auth-api'
import { ANON_KEY, PROJECT, SITE, USER_A, story } from './helpers'

const USER = '33333333-3333-4333-8333-333333333333'
const config = { url: PROJECT, anonKey: ANON_KEY }
const held: Tokens = { access: 'access-secret', refresh: 'refresh-secret', expiresAt: 0, userId: USER, email: 'a@example.com', name: 'A' }
const NOW = 1_000_000

interface Sent {
  method: string
  url: string
  headers: Record<string, string>
  body: string | undefined
  options: RequestOptions
}

/** The service with canned answers: every call is recorded, and the answers come in the order they were put in. */
function scripted() {
  const sent: Sent[] = []
  const script: { status: number; body: string }[] = []
  const request: RequestFn = async (url, options = {}) => {
    sent.push({ method: options.method ?? 'GET', url, headers: { ...(options.headers ?? {}) }, body: options.body, options })
    const next = script.shift()
    if (!next) throw new HttpError('network')
    if (next.body.length > (options.maxChars ?? Infinity)) throw new HttpError('too-large', next.status)
    return { status: next.status, ok: next.status >= 200 && next.status < 300, headers: { get: () => null }, text: next.body } satisfies HttpResult
  }
  return {
    sent,
    reply: (status: number, body: string) => void script.push({ status, body }),
    supabase: createSupabase({ request, site: SITE, clock: () => NOW }),
    withTopics: (topics: () => { id: string }[]) => createSupabase({ request, site: SITE, clock: () => NOW, topics }),
  }
}

const session = (access: string, refresh: string) =>
  `{"access_token":"${access}","refresh_token":"${refresh}","expires_in":3600,"token_type":"bearer",` +
  `"user":{"id":"${USER.toUpperCase()}","email":"reader@example.com","user_metadata":{"full_name":"Asha Rao","avatar_url":"https://example.com/a.png"}}}`

const query = (url: string) => new URL(url).searchParams

describe('what is sent to, and accepted from, the account service', () => {
  it('reads the project address from the Plax website', async () => {
    const { reply, sent, supabase } = scripted()
    reply(200, `{"url":"${PROJECT}","anonKey":"${ANON_KEY}"}`)
    const found = await supabase.config()
    expect(sent[0].url).toBe('https://plax-rouge.vercel.app/news/api/auth-config')
    expect(sent[0].method).toBe('GET')
    expect(sent[0].headers).toEqual({ Accept: 'application/json' })
    expect(found.url).toBe(PROJECT)
  })

  it('offers sign-in only when Google is enabled', async () => {
    const { reply, sent, supabase } = scripted()
    reply(200, '{"external":{"google":true,"email":true}}')
    await supabase.check(config)
    expect(sent[0].url).toBe(`${PROJECT}/auth/v1/settings`)
    expect(sent[0].headers.apikey).toBe(ANON_KEY)
    reply(200, '{"external":{"google":false}}')
    await expect(supabase.check(config)).rejects.toThrow('Google sign-in is not enabled')
    reply(200, '{"external":{}}')
    await expect(supabase.check(config)).rejects.toBeInstanceOf(AccountError)
    reply(200, '<html>captive portal</html>')
    await expect(supabase.check(config)).rejects.toBeInstanceOf(AccountError)
    for (const body of ['{}', '[]', 'null', '{"external":null}', '{"external":[]}', '{"external":{"google":"true"}}', '{"external":{"google":1}}']) {
      reply(200, body)
      await expect(supabase.check(config)).rejects.toBeInstanceOf(AccountError)
    }
  })

  it('exchanges the code with its verifier and no token', async () => {
    const { reply, sent, supabase } = scripted()
    reply(200, session('access-secret', 'refresh-secret'))
    const signedIn = await supabase.exchange(config, 'the-code', 'the-verifier')
    const request = sent[0]
    expect(request.method).toBe('POST')
    expect(request.url).toBe(`${PROJECT}/auth/v1/token?grant_type=pkce`)
    expect(request.body).toBe('{"auth_code":"the-code","code_verifier":"the-verifier"}')
    // Nothing is authenticated yet.
    expect(request.headers.Authorization).toBeUndefined()
    expect(request.headers.apikey).toBe(ANON_KEY)
    expect(request.headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(signedIn.access).toBe('access-secret')
    expect(signedIn.refresh).toBe('refresh-secret')
    // Ids are normalised.
    expect(signedIn.userId).toBe(USER)
    expect(signedIn.email).toBe('reader@example.com')
    expect(signedIn.name).toBe('Asha Rao')
    // The expiry is the lifetime from now.
    expect(signedIn.expiresAt).toBe(NOW + 3_600_000)
  })

  it('refreshes with the refresh token only', async () => {
    const { reply, sent, supabase } = scripted()
    reply(200, session('access-2', 'refresh-2'))
    expect((await supabase.refresh(config, 'refresh-1')).refresh).toBe('refresh-2')
    expect(sent[0].url).toBe(`${PROJECT}/auth/v1/token?grant_type=refresh_token`)
    expect(sent[0].body).toBe('{"refresh_token":"refresh-1"}')
    expect(sent[0].headers.Authorization).toBeUndefined()
  })

  it('rejects sign-in answers that are not what the service sends', async () => {
    const { reply, supabase } = scripted()
    const user = `"user":{"id":"${USER}"}`
    for (const body of [
      '{}',
      '[]',
      'not json',
      '',
      'null',
      session('', 'r'),
      session('a', ''),
      `{"access_token":"a","refresh_token":"r","expires_in":3600,"user":{"id":"not-a-uuid"}}`,
      `{"access_token":"a","refresh_token":"r","expires_in":0,${user}}`,
      `{"access_token":"a","refresh_token":"r","expires_in":-5,${user}}`,
      `{"access_token":"a","refresh_token":"r",${user}}`,
      `{"access_token":"a","refresh_token":"r","expires_in":"3600",${user}}`,
      `{"access_token":"a","refresh_token":"r","expires_in":3600}`,
      `{"access_token":"a","refresh_token":"r","expires_in":3600,"user":"x"}`,
      `{"access_token":"a","refresh_token":"r","expires_in":3600,"user":{"id":5}}`,
      `{"access_token":5,"refresh_token":"r","expires_in":3600,${user}}`,
      `{"access_token":"a","refresh_token":5,"expires_in":3600,${user}}`,
      `{"access_token":"${'a'.repeat(4097)}","refresh_token":"r","expires_in":3600,${user}}`,
      `{"access_token":"a","refresh_token":"${'r'.repeat(1025)}","expires_in":3600,${user}}`,
      `{"access_token":"a b","refresh_token":"r","expires_in":3600,${user}}`,
      `{"access_token":"a\\r\\nX-Injected: 1","refresh_token":"r","expires_in":3600,${user}}`,
      `{"access_token":"a","refresh_token":"r\\n","expires_in":3600,${user}}`,
    ]) {
      reply(200, body)
      await expect(supabase.exchange(config, 'c', 'v')).rejects.toBeInstanceOf(AccountError)
      reply(200, body)
      await expect(supabase.refresh(config, 'r')).rejects.toBeInstanceOf(AccountError)
    }
  })

  it('reads the longest tokens it accepts and caps what it trusts of the answer', async () => {
    const { reply, supabase } = scripted()
    const user = (meta: string) => `"user":{"id":"${USER}","email":"${'e'.repeat(300)}@example.com"${meta}}`
    reply(200, `{"access_token":"${'a'.repeat(4096)}","refresh_token":"${'r'.repeat(1024)}","expires_in":999999999,${user('')}}`)
    const signedIn = await supabase.exchange(config, 'c', 'v')
    expect(signedIn.access).toHaveLength(4096)
    expect(signedIn.refresh).toHaveLength(1024)
    // The lifetime is trusted for a day at the most, and the e-mail is cut to 200 characters.
    expect(signedIn.expiresAt).toBe(NOW + MAX_LIFETIME_S * 1000)
    expect(MAX_LIFETIME_S).toBe(86_400)
    expect(signedIn.email).toHaveLength(200)
    reply(200, `{"access_token":"a","refresh_token":"r","expires_in":1.9,${user('')}}`)
    expect((await supabase.exchange(config, 'c', 'v')).expiresAt).toBe(NOW + 1000)
  })

  it('names the reader from what Google gave: full name, else name, with no control characters, at most 80 characters', async () => {
    const { reply, supabase } = scripted()
    const withMeta = (meta: string) => `{"access_token":"a","refresh_token":"r","expires_in":3600,"user":{"id":"${USER}","user_metadata":${meta}}}`
    reply(200, withMeta('{"name":"Plain Name"}'))
    expect((await supabase.exchange(config, 'c', 'v')).name).toBe('Plain Name')
    reply(200, withMeta('{"full_name":"  ","name":"Second"}'))
    expect((await supabase.exchange(config, 'c', 'v')).name).toBe('Second')
    reply(200, withMeta('{"full_name":"Asha\\u0000 \\u0007Rao\\n","name":"Other"}'))
    expect((await supabase.exchange(config, 'c', 'v')).name).toBe('Asha Rao')
    reply(200, withMeta(`{"full_name":"${'n'.repeat(120)}"}`))
    expect((await supabase.exchange(config, 'c', 'v')).name).toHaveLength(80)
    reply(200, withMeta('{"full_name":{"x":1},"name":["y"]}'))
    expect((await supabase.exchange(config, 'c', 'v')).name).toBe('')
    reply(200, withMeta('"not an object"'))
    expect((await supabase.exchange(config, 'c', 'v')).name).toBe('')
    reply(200, withMeta('null'))
    expect((await supabase.exchange(config, 'c', 'v')).email).toBe('')
  })

  it('signs out only this phone\u2019s session and never fails', async () => {
    const { reply, sent, supabase } = scripted()
    reply(204, '')
    await supabase.logout(config, 'access-secret')
    expect(sent[0].url).toBe(`${PROJECT}/auth/v1/logout?scope=local`)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].headers.Authorization).toBe('Bearer access-secret')
    expect(sent[0].body).toBe('{}')
    reply(500, 'boom')
    await expect(supabase.logout(config, 'access-secret')).resolves.toBeUndefined()
    reply(401, '')
    await expect(supabase.logout(config, 'access-secret')).resolves.toBeUndefined()
    // No answer at all (the connection is down).
    await expect(supabase.logout(config, 'access-secret')).resolves.toBeUndefined()
    expect(sent).toHaveLength(4)
  })

  it('deletes the account by asking the Plax website, with the reader\u2019s own token', async () => {
    const { reply, sent, supabase } = scripted()
    reply(200, '{"deleted":true}')
    await supabase.deleteAccount('access-secret')
    const request = sent[0]
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://plax-rouge.vercel.app/news/api/account/delete')
    expect(request.headers.Authorization).toBe('Bearer access-secret')
    // Neither the project key nor any account id is sent: the website learns who from the token.
    expect(request.headers.apikey).toBeUndefined()
    expect(request.body).toBe('{}')
    expect(request.body).not.toContain(USER)
    expect(sent).toHaveLength(1)
  })

  it('counts a deletion as done only when the website says so', async () => {
    const { reply, supabase } = scripted()
    reply(401, '{"error":"unauthorized"}')
    // A refused token is told apart so that it can be refreshed.
    await expect(supabase.deleteAccount('t')).rejects.toBeInstanceOf(Unauthorized)
    for (const code of [429, 500, 503, 302, 408, 199, 301]) {
      reply(code, '{"error":"unavailable","detail":"secret-detail"}')
      const failure = await supabase.deleteAccount('t').catch((error: Error) => error)
      expect({ code, failed: failure instanceof AccountError }).toEqual({ code, failed: true })
      // A busy website is not a refusal.
      expect(failure instanceof Rejected).toBe(false)
      // Response bodies never reach error messages.
      expect(String((failure as Error).message)).not.toContain('secret-detail')
    }
    reply(400, '{}')
    await expect(supabase.deleteAccount('t')).rejects.toBeInstanceOf(Rejected)
    // No answer at all: the account is still there, and the failure says nothing about where it went.
    const failure = await supabase.deleteAccount('t').catch((error: Error) => error)
    expect(failure).toBeInstanceOf(AccountError)
  })

  it('tells each kind of failure apart', async () => {
    const { reply, supabase } = scripted()
    reply(401, '{}')
    await expect(supabase.topics(config, held)).rejects.toBeInstanceOf(Unauthorized)
    for (const code of [400, 403, 404, 409, 422]) {
      reply(code, '{"message":"secret-detail"}')
      const rejected = (await supabase.topics(config, held).catch((error: Error) => error)) as Rejected
      expect(rejected).toBeInstanceOf(Rejected)
      expect(rejected).not.toBeInstanceOf(Unauthorized)
      expect(rejected.status).toBe(code)
      // Response bodies never reach error messages.
      expect(rejected.message).not.toContain('secret-detail')
    }
    for (const code of [408, 429, 500, 503, 302]) {
      reply(code, '{}')
      const failure = await supabase.topics(config, held).catch((error: Error) => error)
      // A busy or broken service is not a refusal.
      expect({ code, failed: failure instanceof AccountError, refusal: failure instanceof Rejected }).toEqual({ code, failed: true, refusal: false })
    }
  })

  it('does not read an oversized answer to the end', async () => {
    const { reply, supabase } = scripted()
    reply(200, `[${'1,'.repeat(400_000)}1]`)
    await expect(supabase.bookmarks(config, held)).rejects.toThrow('Service unavailable')
  })

  it('asks for answers of 512 KiB at the most and gives a call 25 seconds', async () => {
    const { reply, sent, supabase } = scripted()
    reply(200, '[]')
    await supabase.bookmarks(config, held)
    expect(sent[0].options.maxChars).toBe(512 * 1024)
    expect(sent[0].options.timeoutMs).toBe(25_000)
    expect([MAX_CHARS, CALL_TIMEOUT_MS]).toEqual([512 * 1024, 25_000])
  })

  it('reads the topics of the signed-in reader only', async () => {
    const { reply, sent, supabase } = scripted()
    reply(200, '[{"selected_topics":["space","science","bogus","<b>"]}]')
    expect([...(await supabase.topics(config, held))]).toEqual(['science', 'space'])
    const request = sent[0]
    expect(request.method).toBe('GET')
    expect(new URL(request.url).pathname).toBe('/rest/v1/user_profiles')
    expect(query(request.url).get('id')).toBe(`eq.${USER}`)
    expect(query(request.url).get('select')).toBe('selected_topics')
    expect(query(request.url).get('limit')).toBe('1')
    expect(request.headers.Authorization).toBe('Bearer access-secret')
    expect(request.headers.apikey).toBe(ANON_KEY)
    expect(request.headers.Accept).toBe('application/json')
    // No profile row yet.
    reply(200, '[]')
    expect((await supabase.topics(config, held)).size).toBe(0)
    reply(200, '[{"selected_topics":null}]')
    expect((await supabase.topics(config, held)).size).toBe(0)
    reply(200, '[{}]')
    expect((await supabase.topics(config, held)).size).toBe(0)
    reply(200, '{"not":"an array"}')
    await expect(supabase.topics(config, held)).rejects.toBeInstanceOf(AccountError)
    for (const body of ['[1]', '[null]', '[{"selected_topics":"space"}]', '[{"selected_topics":[["space"]]}]', '[{"selected_topics":[null]}]', '[{"selected_topics":[{"a":1}]}]', 'null', '']) {
      reply(200, body)
      await expect(supabase.topics(config, held)).rejects.toThrow('Unreadable profile')
    }
  })

  it('knows only the topics on offer, whichever the website lists', async () => {
    const { reply, sent, withTopics } = scripted()
    const supabase = withTopics(() => [{ id: 'space' }, { id: 'cricket' }])
    reply(200, '[{"selected_topics":[" cricket ","space","science",7]}]')
    expect([...(await supabase.topics(config, held))]).toEqual(['cricket', 'space'])
    reply(201, '')
    await supabase.saveTopics(config, held, new Set(['space', 'science', 'cricket']))
    expect(JSON.parse(sent[1].body as string)).toEqual([{ id: USER, selected_topics: ['cricket', 'space'], has_onboarded: true }])
  })

  it('upserts the topics into the profile row', async () => {
    const { reply, sent, supabase } = scripted()
    reply(201, '')
    await supabase.saveTopics(config, held, new Set(['space', 'art', 'nonsense']))
    const request = sent[0]
    expect(request.method).toBe('POST')
    expect(query(request.url).get('on_conflict')).toBe('id')
    expect(new URL(request.url).pathname).toBe('/rest/v1/user_profiles')
    expect(request.headers.Prefer).toBe('resolution=merge-duplicates,return=minimal')
    expect(request.headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(request.body).toBe(`[{"id":"${USER}","selected_topics":["art","space"],"has_onboarded":true}]`)
  })

  it('reads saved stories without trusting their contents', async () => {
    const { reply, sent, supabase } = scripted()
    reply(
      200,
      '[{"card_id":"a-1","card_title":"Title","card_category":"science","card_content":"Body text"},' +
        '{"card_id":"b-2","card_title":null,"card_category":null,"card_content":"Only a body"},' +
        '{"card_id":"../evil","card_title":"x","card_category":"news","card_content":"x"},' +
        '{"card_id":"c-3","card_title":null,"card_category":null,"card_content":null},' +
        '{"card_title":"no id"},' +
        '{"card_id":"d-4","card_title":"  Padded \\u0000title\\n  ","card_category":"","card_content":""},' +
        '{"card_id":"\\u00e9-5","card_title":"Unicode id","card_content":""}]',
    )
    const stories = await supabase.bookmarks(config, held)
    expect(stories.map((item) => item.id)).toEqual(['a-1', 'b-2', 'd-4', '\u00e9-5'])
    expect(stories[0].category).toBe('science')
    expect(stories[1].category).toBe('news')
    expect(stories[2].title).toBe('Padded title')
    expect(stories[2].category).toBe('news')
    expect(stories[0]).toEqual(makeStory({ id: 'a-1', title: 'Title', content: 'Body text', category: 'science' }))
    // The account keeps no link, so none is invented.
    expect(stories[0].sourceUrl).toBe('')
    expect(stories[0].image).toBe('')
    expect(new URL(sent[0].url).pathname).toBe('/rest/v1/bookmarks')
    expect(query(sent[0].url).get('order')).toBe('created_at.desc')
    expect(query(sent[0].url).get('limit')).toBe('200')
    expect(query(sent[0].url).get('select')).toBe('card_id,card_title,card_category,card_content')
  })

  it('cuts what it reads from the account to the limits', async () => {
    const { reply, supabase } = scripted()
    reply(200, `[{"card_id":"a","card_title":"${'t'.repeat(400)}","card_category":"${'c'.repeat(100)}","card_content":"${'x'.repeat(900)}"}]`)
    const stories = await supabase.bookmarks(config, held)
    expect(stories).toHaveLength(1)
    expect(stories[0].title).toHaveLength(TITLE_LIMIT)
    expect(stories[0].category).toHaveLength(CATEGORY_LIMIT)
    expect(stories[0].content).toHaveLength(CONTENT_LIMIT)
    expect([TITLE_LIMIT, CATEGORY_LIMIT, CONTENT_LIMIT]).toEqual([300, 40, 500])
  })

  it('refuses a list of saved stories that is not one', async () => {
    const { reply, supabase } = scripted()
    for (const body of ['{}', 'null', '[1]', '[null]', '["a"]', 'x', '']) {
      reply(200, body)
      await expect(supabase.bookmarks(config, held)).rejects.toThrow('Unreadable saved stories')
    }
  })

  it('saves stories in one request that ignores repeats and trims long text', async () => {
    const { reply, sent, supabase } = scripted()
    reply(201, '')
    await supabase.addBookmarks(config, held, [story('a-1', { content: 'x'.repeat(900), title: 'Headline a-1' }), story('../bad', { content: 'y' }), story('b-2', { content: 'short' })])
    const request = sent[0]
    expect(request.method).toBe('POST')
    expect(query(request.url).get('on_conflict')).toBe('user_id,card_id')
    expect(new URL(request.url).pathname).toBe('/rest/v1/bookmarks')
    // There is no update rule, so duplicates must be ignored, not merged.
    expect(request.headers.Prefer).toBe('resolution=ignore-duplicates,return=minimal')
    const rows = JSON.parse(request.body as string) as Record<string, string>[]
    // A card id that is not a plain identifier is never sent.
    expect(rows).toHaveLength(2)
    expect(rows[0].card_content).toHaveLength(500)
    expect(rows[0].user_id).toBe(USER)
    expect(rows.map((row) => row.card_id)).toEqual(['a-1', 'b-2'])
    await supabase.addBookmarks(config, held, [story('../bad', { content: 'y' })])
    // Nothing valid, nothing sent.
    expect(sent).toHaveLength(1)
    await supabase.addBookmarks(config, held, [])
    expect(sent).toHaveLength(1)
  })

  it('sends a story as the account keeps it: a headline, a category and text without the headline repeated', async () => {
    const { reply, sent, supabase } = scripted()
    reply(201, '')
    await supabase.addBookmarks(config, held, [
      story('a', { title: 'Markets rally', content: 'Markets rally: banks led the gains on Friday afternoon.', category: 'stocks' }),
      story('b', { title: 'Markets rally', content: 'Markets rally', category: 'x'.repeat(60) }),
      story('c', { title: `T${'t'.repeat(400)}`, content: 'line one\nline two\u0007 end', category: ' news ' }),
    ])
    const rows = JSON.parse(sent[0].body as string) as Record<string, string>[]
    expect(rows[0]).toEqual({ user_id: USER, card_id: 'a', card_title: 'Markets rally', card_category: 'stocks', card_content: 'banks led the gains on Friday afternoon.' })
    // A text that is only the headline is sent as it is: the account holds the headline, and it has no other text.
    expect(rows[1].card_content).toBe('Markets rally')
    expect(rows[1].card_category).toHaveLength(40)
    expect(rows[2].card_title).toHaveLength(300)
    expect(rows[2].card_content).toBe('line one line two  end')
    expect(rows[2].card_category).toBe('news')
  })

  it('removes only that row of this user', async () => {
    const { reply, sent, supabase } = scripted()
    reply(204, '')
    await supabase.removeBookmark(config, held, 'a-1')
    const request = sent[0]
    expect(request.method).toBe('DELETE')
    expect(query(request.url).get('user_id')).toBe(`eq.${USER}`)
    expect(query(request.url).get('card_id')).toBe('eq.a-1')
    expect(request.headers.Prefer).toBe('return=minimal')
    await supabase.removeBookmark(config, held, 'a-1&user_id=neq.0')
    // An id that could alter the filter is never sent.
    expect(sent).toHaveLength(1)
    await supabase.removeBookmark(config, held, '')
    await supabase.removeBookmark(config, held, 'a'.repeat(201))
    expect(sent).toHaveLength(1)
    reply(204, '')
    await supabase.removeBookmark(config, held, '\u00e9-1')
    expect(query(sent[1].url).get('card_id')).toBe('eq.\u00e9-1')
  })

  it('never puts a malformed account id in an address', async () => {
    const { sent, supabase } = scripted()
    const bad = { ...held, userId: '1&or=(id.neq.0)' }
    await expect(supabase.topics(config, bad)).rejects.toThrow('Invalid account')
    await expect(supabase.removeBookmark(config, bad, 'a-1')).rejects.toThrow('Invalid account')
    await expect(supabase.saveTopics(config, bad, new Set(['art']))).rejects.toThrow('Invalid account')
    await expect(supabase.addBookmarks(config, bad, [story('a')])).rejects.toThrow('Invalid account')
    expect(sent).toHaveLength(0)
  })

  it('asks the website for the address on every use, in the form it was given', async () => {
    let site = 'https://one.example/news'
    const sent: string[] = []
    const request: RequestFn = async (url) => {
      sent.push(url)
      return { status: 200, ok: true, headers: { get: () => null }, text: '{}' }
    }
    const supabase = createSupabase({ request, site: () => site })
    await supabase.deleteAccount('t')
    site = 'https://two.example/news'
    await supabase.deleteAccount('t')
    expect(sent).toEqual(['https://one.example/news/api/account/delete', 'https://two.example/news/api/account/delete'])
  })
})

describe('what an error of the account service may say', () => {
  const secrets = ['abcdefghij', 'anon-key', 'access-secret', 'refresh-secret', 'secret-detail', 'plax-rouge', 'the-code', 'the-verifier', 'reader@example.com', USER_A, USER, 'supabase', 'https', '/auth/', '/rest/']

  async function failures(): Promise<Error[]> {
    const found: Error[] = []
    const outcomes: [number | 'network' | 'toolarge', string][] = [
      [401, '{"message":"secret-detail access-secret"}'],
      [400, '{"error_description":"secret-detail the-code"}'],
      [403, 'secret-detail'],
      [429, 'secret-detail'],
      [500, '{"detail":"secret-detail refresh-secret"}'],
      [302, ''],
      [200, 'secret-detail <html>'],
      [200, '{"access_token":"access-secret","refresh_token":"refresh-secret","expires_in":0,"user":{"id":"x"}}'],
      ['network', ''],
      ['toolarge', ''],
    ]
    for (const [outcome, body] of outcomes) {
      const calls = [
        (s: ReturnType<typeof createSupabase>) => s.config(),
        (s: ReturnType<typeof createSupabase>) => s.check(config),
        (s: ReturnType<typeof createSupabase>) => s.exchange(config, 'the-code', 'the-verifier'),
        (s: ReturnType<typeof createSupabase>) => s.refresh(config, 'refresh-secret'),
        (s: ReturnType<typeof createSupabase>) => s.deleteAccount('access-secret'),
        (s: ReturnType<typeof createSupabase>) => s.topics(config, held),
        (s: ReturnType<typeof createSupabase>) => s.saveTopics(config, held, new Set(['art'])),
        (s: ReturnType<typeof createSupabase>) => s.bookmarks(config, held),
        (s: ReturnType<typeof createSupabase>) => s.addBookmarks(config, held, [story('a')]),
        (s: ReturnType<typeof createSupabase>) => s.removeBookmark(config, held, 'a'),
      ]
      for (const call of calls) {
        const request: RequestFn = async (url) => {
          if (outcome === 'network') throw new HttpError('network', 0, `failed: ${url}`)
          if (outcome === 'toolarge') throw new HttpError('too-large', 200, `too large: ${url}`)
          return { status: outcome, ok: outcome >= 200 && outcome < 300, headers: { get: () => null }, text: body }
        }
        try {
          await call(createSupabase({ request, site: SITE, clock: () => NOW }))
        } catch (error) {
          found.push(error as Error)
        }
      }
    }
    return found
  }

  it('never holds an address, a header, a token, an account or a part of an answer', async () => {
    const all = await failures()
    expect(all.length).toBeGreaterThan(40)
    for (const error of all) {
      expect(error).toBeInstanceOf(AccountError)
      const text = `${error.name} ${error.message} ${error.stack?.split('\n')[0] ?? ''} ${JSON.stringify(error)} ${String(error)}`
      for (const secret of secrets) expect({ secret, found: text.toLowerCase().includes(secret.toLowerCase()) }).toEqual({ secret, found: false })
    }
  })

  it('is one of a few fixed texts', async () => {
    const allowed = new Set([
      'Not a Supabase project address',
      'Rejected with status N',
      'Service unavailable',
      'Try again later',
      'Unexpected sign-in response',
      'Unreadable profile',
      'Unreadable saved stories',
      'Unreadable service settings',
      'Unreadable sign-in configuration',
      'Unreadable sign-in response',
    ])
    const messages = new Set((await failures()).map((error) => error.message.replace(/\d+/g, 'N')))
    for (const message of messages) expect({ message, fixed: allowed.has(message) }).toEqual({ message, fixed: true })
    expect(messages.size).toBeGreaterThanOrEqual(4)
  })
})

describe('through the real transport (platform/http)', () => {
  const supabase = () => createSupabase({ request: realRequest, site: SITE, clock: () => NOW })

  it('turns a connection that fails into an unavailable service, without the address in the message', async () => {
    setVariant('play')
    fakeFetch({ [PROJECT]: { networkError: true }, [SITE]: { networkError: true } })
    for (const call of [() => supabase().check(config), () => supabase().config(), () => supabase().topics(config, held)]) {
      const failure = await call().catch((error: Error) => error)
      expect(failure).toBeInstanceOf(AccountError)
      expect((failure as Error).message).toBe('Service unavailable')
    }
  })

  it('gives up on a call that does not answer within its time', async () => {
    jest.useFakeTimers()
    fakeFetch({ [PROJECT]: { hang: true } })
    const pending = supabase().topics(config, held).catch((error: Error) => error)
    await jest.advanceTimersByTimeAsync(CALL_TIMEOUT_MS + 1)
    const failure = await pending
    expect(failure).toBeInstanceOf(AccountError)
    expect((failure as Error).message).toBe('Service unavailable')
  })

  it('refuses an answer longer than its limit', async () => {
    setVariant('play')
    fakeFetch({ [PROJECT]: { body: `[${'1,'.repeat(300_000)}1]` } })
    await expect(supabase().bookmarks(config, held)).rejects.toThrow('Service unavailable')
  })

  it('never reaches a website or a project over plain http, and does not even try', async () => {
    setVariant('play')
    const { fetch } = fakeFetch({})
    const insecure = createSupabase({ request: realRequest, site: 'http://plax-rouge.vercel.app/news', clock: () => NOW })
    await expect(insecure.config()).rejects.toThrow('Service unavailable')
    await expect(insecure.deleteAccount('t')).rejects.toThrow('Service unavailable')
    await expect(insecure.check({ url: 'http://abcdefghij.supabase.co', anonKey: ANON_KEY })).rejects.toThrow('Service unavailable')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the project key and the token as headers and nowhere else in the address', async () => {
    setVariant('play')
    const { calls } = fakeFetch({ [PROJECT]: { body: '[]' } })
    await supabase().bookmarks(config, held)
    await supabase().removeBookmark(config, held, 'a-1').catch(() => undefined)
    for (const call of calls) {
      expect(call.url).not.toContain('access-secret')
      expect(call.url).not.toContain(ANON_KEY)
      expect(call.headers.Authorization).toBe('Bearer access-secret')
      expect(call.headers.apikey).toBe(ANON_KEY)
    }
  })

  it('reads the project address through the same transport', async () => {
    setVariant('play')
    fakeFetch({ [`${SITE}/api/auth-config`]: { body: { url: PROJECT, anonKey: ANON_KEY } } })
    expect(await supabase().config()).toEqual(config)
  })
})
