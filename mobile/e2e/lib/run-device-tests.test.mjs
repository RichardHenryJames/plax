import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { MAX_ATTEMPTS, MAX_PHONE_UPTIME_S, SLEEP_MS, SUITES, clockSkew, readReport, sleptDuring, tooOld } from '../../scripts/run-device-tests.mjs'

const e2e = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('every device suite on disk is in the driver’s list, and every name in the list is a suite on disk', () => {
  const onDisk = fs.readdirSync(e2e).filter((name) => name.endsWith('.e2e.mjs')).map((name) => name.replace(/\.e2e\.mjs$/, '')).sort()
  assert.deepEqual([...SUITES].sort(), onDisk, 'a suite that is not in SUITES is never run by `npm run test:device`')
  assert.equal(new Set(SUITES).size, SUITES.length, 'no suite twice')
})

test('the report of a run is read from its TAP summary: the counts and the names of the tests that failed', () => {
  const tap = [
    'TAP version 13',
    '    ok 1 - a test',
    '    not ok 2 - a test that failed',
    'not ok 3 - the suite of it',
    '  not ok 4 - one cut by a sleep',
    '1..3',
    '# tests 12',
    '# suites 3',
    '# pass 8',
    '# fail 2',
    '# cancelled 1',
    '# skipped 1',
    '# todo 0',
    '# duration_ms 1234.5',
  ].join('\n')
  assert.deepEqual(readReport(tap), {
    tests: 12,
    pass: 8,
    fail: 2,
    cancelled: 1,
    skipped: 1,
    failed: ['a test that failed', 'the suite of it', 'one cut by a sleep'],
  })
})

test('an empty or cut-off report is zeros, not an error: a run that printed nothing has no passes, which the exit code does not let through', () => {
  assert.deepEqual(readReport(''), { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, failed: [] })
})

test('a run counts as cut by a sleep when the wall clock moved against the uptime by more than 30 seconds, either way', () => {
  assert.equal(SLEEP_MS, 30_000)
  assert.equal(sleptDuring(1000, 1000), false)
  assert.equal(sleptDuring(1000, 1000 + SLEEP_MS), false, 'at the limit it still counts')
  assert.equal(sleptDuring(1000, 1000 + SLEEP_MS + 1), true)
  assert.equal(sleptDuring(1000, 1000 - SLEEP_MS - 1), true, 'a clock put back is as much a disturbance as one that jumped forward')
  assert.equal(sleptDuring(0, 13 * 3_600_000), true, 'thirteen hours asleep')
})

test('the clock skew is steady while the computer is awake', async () => {
  const first = clockSkew()
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.ok(Number.isFinite(first))
  assert.ok(Math.abs(clockSkew() - first) < 1000, 'it does not move by itself')
})

test('a suite is run again no more than a few times', () => {
  assert.ok(MAX_ATTEMPTS >= 2 && MAX_ATTEMPTS <= 5)
})

test('a phone that has been up for more than five hours is started afresh before a suite, and a younger one is left alone', () => {
  assert.equal(MAX_PHONE_UPTIME_S, 5 * 3600)
  assert.equal(tooOld(0), false, 'an uptime that could not be read is not a reason to restart')
  assert.equal(tooOld(10 * 60), false, 'a phone that has just started')
  assert.equal(tooOld(MAX_PHONE_UPTIME_S), false, 'at the limit it is still young enough')
  assert.equal(tooOld(MAX_PHONE_UPTIME_S + 1), true)
  assert.equal(tooOld(10 * 3600), true, 'ten hours, as it was when swipes stopped turning pages')
})
