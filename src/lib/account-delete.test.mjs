import test from 'node:test'
import assert from 'node:assert/strict'
import { bearerToken, deleteOwnAccount, MAX_TOKEN_LENGTH } from './account-delete.ts'

const ENV = { url: 'https://accounts.example.test', anonKey: 'anon-key', serviceKey: 'service-key' }
const ID = '3f2b8c1e-5a47-4d9e-8b21-0c6f7a9d1e42'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl'

// A fake account service: answers each call from a script and keeps what it was asked.
function service(answers) {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body })
    const next = answers.shift()
    if (next instanceof Error) throw next
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status })
  }
  return { fetcher, calls }
}

test('a bearer token is read from the header, and only a sensible one', () => {
  assert.equal(bearerToken(`Bearer ${TOKEN}`), TOKEN)
  assert.equal(bearerToken(`bearer ${TOKEN}`), TOKEN)
  assert.equal(bearerToken(`  Bearer ${TOKEN}  `), TOKEN)
  for (const bad of [null, undefined, '', 'Bearer', 'Bearer ', TOKEN, `Basic ${TOKEN}`, `Bearer a b`, 'Bearer a/../b"', 'Bearer ä']) {
    assert.equal(bearerToken(bad), null, String(bad))
  }
  assert.equal(bearerToken(`Bearer ${'a'.repeat(MAX_TOKEN_LENGTH)}`), 'a'.repeat(MAX_TOKEN_LENGTH))
  assert.equal(bearerToken(`Bearer ${'a'.repeat(MAX_TOKEN_LENGTH + 1)}`), null)
})

test('the account removed is the one the service says the token belongs to', async () => {
  const { fetcher, calls } = service([{ status: 200, body: { id: ID.toUpperCase(), email: 'reader@example.test' } }, { status: 200, body: {} }])
  const outcome = await deleteOwnAccount(TOKEN, ENV, fetcher)
  assert.deepEqual(outcome, { status: 200, body: { deleted: true } })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://accounts.example.test/auth/v1/user')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers.apikey, 'anon-key')
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(calls[1].url, `https://accounts.example.test/auth/v1/admin/users/${ID}`)
  assert.equal(calls[1].method, 'DELETE')
  assert.equal(calls[1].headers.apikey, 'service-key')
  assert.equal(calls[1].headers.Authorization, 'Bearer service-key')
  assert.deepEqual(JSON.parse(calls[1].body), { should_soft_delete: false })
})

test('the reader token never goes to the admin call, and nothing returned contains a token', async () => {
  const { fetcher, calls } = service([{ status: 200, body: { id: ID } }, { status: 200, body: {} }])
  const outcome = await deleteOwnAccount(TOKEN, ENV, fetcher)
  assert.ok(!JSON.stringify(calls[1]).includes(TOKEN))
  assert.ok(!JSON.stringify(outcome).includes(TOKEN))
  assert.ok(!JSON.stringify(outcome).includes('service-key'))
})

test('a token the service refuses deletes nothing', async () => {
  for (const status of [401, 403]) {
    const { fetcher, calls } = service([{ status, body: { error: 'bad_jwt' } }])
    assert.deepEqual(await deleteOwnAccount(TOKEN, ENV, fetcher), { status: 401, body: { error: 'unauthorized' } })
    assert.equal(calls.length, 1)
  }
})

test('trouble while asking who the reader is deletes nothing', async () => {
  for (const answers of [[{ status: 500 }], [{ status: 200, body: {} }], [{ status: 200, body: { id: 7 } }], [new Error('offline')]]) {
    const { fetcher, calls } = service(answers)
    assert.deepEqual(await deleteOwnAccount(TOKEN, ENV, fetcher), { status: 503, body: { error: 'unavailable' } })
    assert.equal(calls.length, 1, 'the delete call is never made')
  }
})

test('an id that is not a UUID is never put into an address', async () => {
  for (const id of ['../../users', `${ID}/../${ID}`, `${ID}?x=1`, '', ID.slice(1), `${ID}\n`]) {
    const { fetcher, calls } = service([{ status: 200, body: { id } }])
    assert.deepEqual(await deleteOwnAccount(TOKEN, ENV, fetcher), { status: 503, body: { error: 'unavailable' } })
    assert.equal(calls.length, 1, id)
  }
})

test('an account that is already gone counts as deleted, so a lost answer can be retried', async () => {
  const { fetcher } = service([{ status: 200, body: { id: ID } }, { status: 404, body: {} }])
  assert.deepEqual(await deleteOwnAccount(TOKEN, ENV, fetcher), { status: 200, body: { deleted: true } })
})

test('a failed delete is reported as unavailable, not as success', async () => {
  for (const second of [{ status: 500, body: {} }, { status: 401, body: {} }, new Error('timeout')]) {
    const { fetcher } = service([{ status: 200, body: { id: ID } }, second])
    assert.deepEqual(await deleteOwnAccount(TOKEN, ENV, fetcher), { status: 503, body: { error: 'unavailable' } })
  }
})

test('without the account service configured nothing is asked', async () => {
  for (const env of [{}, { url: ENV.url }, { url: ENV.url, anonKey: ENV.anonKey }, { ...ENV, serviceKey: '' }, { ...ENV, url: '' }]) {
    const { fetcher, calls } = service([])
    assert.deepEqual(await deleteOwnAccount(TOKEN, env, fetcher), { status: 503, body: { error: 'unavailable' } })
    assert.equal(calls.length, 0)
  }
})

test('a trailing slash on the service address is harmless', async () => {
  const { fetcher, calls } = service([{ status: 200, body: { id: ID } }, { status: 200, body: {} }])
  await deleteOwnAccount(TOKEN, { ...ENV, url: 'https://accounts.example.test//' }, fetcher)
  assert.equal(calls[0].url, 'https://accounts.example.test/auth/v1/user')
})
