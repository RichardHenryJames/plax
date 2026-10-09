import test from 'node:test'
import assert from 'node:assert/strict'
import { within, Remembered } from './deadline.ts'

const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms))

test('returns a source that answers in time', async () => {
  assert.deepEqual(await within('fast', later(5, [1, 2]), 200), [1, 2])
})

test('goes ahead without a source that is too slow', async () => {
  const started = Date.now()
  assert.deepEqual(await within('slow', later(2000, [1]), 40), [])
  assert.ok(Date.now() - started < 1000, 'must not wait for the slow source')
})

test('goes ahead without a source that never answers', async () => {
  assert.deepEqual(await within('stuck', new Promise(() => {}), 30), [])
})

test('a failure inside the deadline still rejects, so allSettled can report it', async () => {
  await assert.rejects(within('broken', Promise.reject(new Error('boom')), 200), /boom/)
})

test('a failure after the deadline is handled and does not crash the process', async () => {
  let unhandled = false
  const mark = () => { unhandled = true }
  process.once('unhandledRejection', mark)
  const late = new Promise((_, reject) => setTimeout(() => reject(new Error('too late')), 60))
  assert.deepEqual(await within('late failure', late, 20), [])
  await later(150)
  process.off('unhandledRejection', mark)
  assert.equal(unhandled, false)
})

test('the deadline timer does not keep the process alive after an answer', async () => {
  await within('quick', Promise.resolve([7]), 60_000)
  // If the timer were left running this test file would not exit for a minute.
})

test('a good answer is remembered and recalled for a while', async () => {
  let now = 1000
  const memory = new Remembered(500, 10, () => now)
  assert.deepEqual(memory.recall('wiki'), [], 'nothing before the first answer')
  assert.deepEqual(await memory.track('wiki', Promise.resolve([1, 2])), [1, 2], 'the answer passes through unchanged')
  assert.deepEqual(memory.recall('wiki'), [1, 2])
  now += 500
  assert.deepEqual(memory.recall('wiki'), [1, 2], 'still good at exactly the limit')
  now += 1
  assert.deepEqual(memory.recall('wiki'), [], 'forgotten once too old')
  assert.deepEqual(memory.recall('wiki'), [], 'and stays forgotten')
})

test('an answer that arrives after the deadline is still remembered for the next pool', async () => {
  const memory = new Remembered(60_000, 10)
  const slow = memory.track('slow', later(60, ['late']))
  assert.deepEqual(await within('slow', slow, 15), [], 'the first pool goes ahead without it')
  assert.deepEqual(memory.recall('slow'), [], 'not there yet')
  await later(120)
  assert.deepEqual(memory.recall('slow'), ['late'], 'the next pool has it')
})

test('a failure is passed on and leaves the earlier answer in place', async () => {
  const memory = new Remembered(60_000, 10)
  await memory.track('flaky', Promise.resolve([1]))
  await assert.rejects(memory.track('flaky', Promise.reject(new Error('429'))), /429/)
  assert.deepEqual(memory.recall('flaky'), [1])
})

test('an empty answer is never remembered, so it cannot replace a real one', async () => {
  const memory = new Remembered(60_000, 10)
  await memory.track('source', Promise.resolve([1, 2]))
  assert.deepEqual(await memory.track('source', Promise.resolve([])), [])
  assert.deepEqual(memory.recall('source'), [1, 2])
})

test('the memory is bounded: the oldest key goes first and a refreshed key is kept', async () => {
  let now = 0
  const memory = new Remembered(1_000_000, 3, () => now++)
  for (const key of ['a', 'b', 'c']) await memory.track(key, Promise.resolve([key]))
  await memory.track('a', Promise.resolve(['a2'])) // a is now the newest
  await memory.track('d', Promise.resolve(['d'])) // pushes out b, the oldest
  assert.deepEqual(memory.recall('b'), [])
  assert.deepEqual(memory.recall('a'), ['a2'])
  assert.deepEqual(memory.recall('c'), ['c'])
  assert.deepEqual(memory.recall('d'), ['d'])
})
