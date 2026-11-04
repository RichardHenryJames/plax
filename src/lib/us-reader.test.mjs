import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUsTimeZone, isUsEnglish, isUsReader, startSection, browserStartSection, sectionChosen, rememberSectionChosen, SECTION_CHOSEN_KEY } from './us-reader.ts'

test('the time zones of the United States are told from the rest of the Americas and the world', () => {
  for (const zone of [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Detroit',
    'America/Boise', 'America/Juneau', 'America/Adak', 'Pacific/Honolulu', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville',
    'America/North_Dakota/Center', 'America/Indianapolis', 'US/Eastern', 'US/Pacific', 'US/Hawaii', 'EST5EDT', 'PST8PDT',
  ]) assert.ok(isUsTimeZone(zone), zone)
  for (const zone of [
    'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Bogota', 'America/Argentina/Buenos_Aires',
    'America/Havana', 'America/Puerto_Rico', 'Asia/Kolkata', 'Europe/London', 'Pacific/Auckland', 'Australia/Sydney', 'UTC', '', 'America/', 'America/New_Yorkx',
  ]) assert.ok(!isUsTimeZone(zone), zone)
  assert.ok(!isUsTimeZone(undefined))
})

test('American English is told from the other Englishes', () => {
  assert.ok(isUsEnglish('en-US'))
  assert.ok(isUsEnglish('en-us'))
  assert.ok(isUsEnglish('en-US-u-ca-gregory'))
  for (const language of ['en', 'en-IN', 'en-GB', 'en-CA', 'en-AU', 'hi-IN', 'es-US', 'en-USA', '', undefined]) assert.ok(!isUsEnglish(language), String(language))
})

test('a reader in the US is American English in a US zone: either alone is not enough', () => {
  assert.ok(isUsReader('en-US', 'America/Chicago'))
  assert.ok(!isUsReader('en-US', 'Asia/Kolkata'), 'an American browser in India')
  assert.ok(!isUsReader('en-IN', 'America/New_York'), 'an Indian English browser in the US')
  assert.ok(!isUsReader('en-US', 'America/Toronto'))
  assert.ok(!isUsReader(undefined, undefined))
})

test('a reader in the US starts on the US news until they have chosen a section; everyone else starts on All', () => {
  assert.equal(startSection({ language: 'en-US', zone: 'America/Los_Angeles', chosen: false }), 'us')
  assert.equal(startSection({ language: 'en-US', zone: 'America/Los_Angeles', chosen: true }), null, 'a reader who has chosen is left alone')
  assert.equal(startSection({ language: 'en-IN', zone: 'Asia/Kolkata', chosen: false }), null)
  assert.equal(startSection({ language: 'en-GB', zone: 'Europe/London', chosen: false }), null)
  assert.equal(startSection({ chosen: false }), null)
})

test('the browser start is the same rule, and a place with no browser says All', () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
  try {
    assert.equal(browserStartSection(), null)
  } finally {
    if (real) Object.defineProperty(globalThis, 'navigator', real)
    else delete globalThis.navigator
  }
  // an Indian English browser starts on All whatever the time zone is
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-IN' }, configurable: true })
  try {
    assert.equal(browserStartSection(), null)
  } finally {
    if (real) Object.defineProperty(globalThis, 'navigator', real)
    else delete globalThis.navigator
  }
})

test('the reader\'s choice is remembered, and storage that cannot be used just says no', () => {
  const stored = new Map()
  globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => void stored.set(k, String(v)) }
  assert.equal(sectionChosen(), false)
  rememberSectionChosen()
  assert.equal(stored.get(SECTION_CHOSEN_KEY), '1')
  assert.equal(sectionChosen(), true)
  globalThis.localStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.equal(sectionChosen(), false)
  assert.doesNotThrow(() => rememberSectionChosen())
  delete globalThis.localStorage
  assert.equal(sectionChosen(), false)
  assert.doesNotThrow(() => rememberSectionChosen())
})
