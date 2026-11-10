import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NAME_IN_CODE, SOURCE_GROUPS } from './editorial.ts'

// The editorial policy page lists publishers that Plax reads. It may list fewer than the server reads (the Stocks feed alone reads more than forty
// publishers), but a name on the page that the server does not read would be a claim that is not true.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const code = ['./types.ts', './stocks.ts', './sources.ts'].map(read).join('\n')

test('every publisher the editorial policy names is one the server reads', () => {
  for (const group of SOURCE_GROUPS) {
    for (const name of group.names) {
      const spelled = NAME_IN_CODE[name] ?? name
      assert.ok(code.includes(`'${spelled}'`) || code.includes(`"${spelled}"`), `${name} (${spelled}) is not in the feeds`)
    }
  }
})

test('the groups are real, and no name is listed twice', () => {
  assert.ok(SOURCE_GROUPS.length >= 5)
  const names = SOURCE_GROUPS.flatMap((group) => group.names)
  assert.equal(new Set(names).size, names.length, 'a publisher is listed twice')
  for (const group of SOURCE_GROUPS) {
    assert.ok(group.heading.length > 0 && group.names.length >= 3, group.heading)
    for (const name of group.names) assert.equal(name, name.trim())
  }
})

test('the page lists its sources from this file and says that the list is not the whole of it', () => {
  const page = read('../app/editorial-policy/page.tsx')
  assert.match(page, /SOURCE_GROUPS/)
  assert.match(page, /among others|and others|not a complete list|not the whole/i)
})
