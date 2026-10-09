import test from 'node:test'
import assert from 'node:assert/strict'
import { appRedirect, escapeHtml } from './app-redirect.ts'

const query = (text) => new URLSearchParams(text)

test('hands the one-time code to the app that asked for it', () => {
  assert.equal(
    appRedirect(query('app=com.plaxlabs.news&code=abc-123')),
    'com.plaxlabs.news://auth-callback?code=abc-123'
  )
  assert.equal(
    appRedirect(query('app=com.plaxlabs.news.preview&code=abc-123')),
    'com.plaxlabs.news.preview://auth-callback?code=abc-123'
  )
})

test('refuses any app it does not know', () => {
  for (const app of ['', 'com.evil.app', 'com.plaxlabs.news.evil', 'https', 'javascript', 'com.plaxlabs.news://x', 'COM.PLAXLABS.NEWS']) {
    assert.equal(appRedirect(query(`app=${encodeURIComponent(app)}&code=abc`)), null, app)
  }
  assert.equal(appRedirect(query('code=abc')), null)
})

test('forwards only the standard sign-in result fields', () => {
  const location = appRedirect(
    query('app=com.plaxlabs.news&code=c&state=s&error=access_denied&error_code=x&error_description=User+said+no&redirect=https://evil.example&next=/x')
  )
  const forwarded = new URL(location).searchParams
  assert.deepEqual([...forwarded.keys()].sort(), ['code', 'error', 'error_code', 'error_description'])
  assert.equal(forwarded.get('error_description'), 'User said no')
})

test('drops values that are not short printable text', () => {
  const location = appRedirect(
    new URLSearchParams([['app', 'com.plaxlabs.news'], ['code', 'a'.repeat(1025)], ['error', 'line\nbreak'], ['error_code', '\u00e9']])
  )
  assert.equal(location, 'com.plaxlabs.news://auth-callback?')
})

test('percent-encodes what it forwards so nothing can end the address early', () => {
  const location = appRedirect(new URLSearchParams([['app', 'com.plaxlabs.news'], ['code', 'a&b=c#d?e']]))
  assert.equal(location, 'com.plaxlabs.news://auth-callback?code=a%26b%3Dc%23d%3Fe')
})

test('escapes text placed in the fallback page', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
})
