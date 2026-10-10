import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { resolveTheme, themeModeOf, THEME_SCRIPT } from './theme.ts'

test('the theme follows the system unless the reader chose one', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light', 'no choice at all is the system')
  assert.equal(resolveTheme('nonsense', true), 'dark')
})

test('what was saved by the old two-way switch keeps its meaning', () => {
  assert.equal(themeModeOf({ themeMode: 'dark', theme: 'light' }), 'dark', 'a saved choice wins')
  assert.equal(themeModeOf({ themeMode: 'system' }), 'system')
  assert.equal(themeModeOf({ theme: 'light' }), 'light', 'an explicit Light is kept')
  assert.equal(themeModeOf({ theme: 'dark' }), 'system', 'Dark was the default, so it cannot be told from a choice')
  assert.equal(themeModeOf({}), 'system')
  assert.equal(themeModeOf(null), 'system')
  assert.equal(themeModeOf({ themeMode: 'bogus', theme: 'light' }), 'light')
})

// Runs the page-head script against a stand-in browser.
function run({ stored, prefersDark, broken }) {
  const classes = new Set(['dark'])
  const sandbox = {
    localStorage: { getItem: () => { if (broken) throw new Error('storage blocked'); return stored === undefined ? null : stored } },
    matchMedia: () => ({ matches: prefersDark }),
    document: { documentElement: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } } },
  }
  vm.runInNewContext(THEME_SCRIPT, sandbox)
  return [...classes].sort().join(',')
}
const saved = (state) => JSON.stringify({ state, version: 0 })

test('the page-head script picks the same theme as the app does', () => {
  assert.equal(run({ stored: undefined, prefersDark: true }), 'dark', 'a first visit follows a dark system')
  assert.equal(run({ stored: undefined, prefersDark: false }), 'light', 'and a light one')
  assert.equal(run({ stored: saved({ themeMode: 'system' }), prefersDark: false }), 'light')
  assert.equal(run({ stored: saved({ themeMode: 'dark' }), prefersDark: false }), 'dark')
  assert.equal(run({ stored: saved({ themeMode: 'light' }), prefersDark: true }), 'light')
  assert.equal(run({ stored: saved({ theme: 'light' }), prefersDark: true }), 'light', 'old state: Light kept')
  assert.equal(run({ stored: saved({ theme: 'dark' }), prefersDark: false }), 'light', 'old state: Dark was only the default')
  assert.equal(run({ stored: saved({ themeMode: 'bogus', theme: 'dark' }), prefersDark: true }), 'dark')
  assert.equal(run({ stored: '{bad json', prefersDark: false }), 'dark', 'unreadable storage leaves the default dark class alone')
  assert.equal(run({ broken: true, prefersDark: false }), 'dark', 'blocked storage never throws out of the head')
})

test('the script and the functions agree on every combination', () => {
  for (const themeMode of [undefined, 'system', 'light', 'dark', 'bogus']) {
    for (const theme of [undefined, 'light', 'dark']) {
      for (const prefersDark of [true, false]) {
        const state = { themeMode, theme }
        const expected = resolveTheme(themeModeOf(state), prefersDark)
        assert.equal(run({ stored: saved(state), prefersDark }), expected, JSON.stringify({ state, prefersDark }))
      }
    }
  }
})
