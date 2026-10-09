import test from 'node:test'
import assert from 'node:assert/strict'
import { raceStaggered } from './staggered.ts'

const accept = (value) => typeof value === 'string' && value.length > 0
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      },
      { once: true }
    )
  })

test('returns the first accepted value and aborts the slower step', async () => {
  let slowAborted = false
  const result = await raceStaggered(
    [
      async (signal) => {
        await sleep(20, signal)
        return 'fast'
      },
      async (signal) => {
        try {
          await sleep(1000, signal)
        } catch (error) {
          slowAborted = true
          throw error
        }
        return 'slow'
      },
    ],
    5,
    accept
  )
  await sleep(10)
  assert.equal(result, 'fast')
  assert.equal(slowAborted, true)
})

test('starts the next step immediately when the previous one fails', async () => {
  const started = performance.now()
  const result = await raceStaggered(
    [
      async () => {
        throw new Error('HTTP 429')
      },
      async () => 'fallback',
    ],
    10_000,
    accept
  )
  assert.equal(result, 'fallback')
  assert.ok(performance.now() - started < 500)
})

test('hedges a slow primary after the stagger delay', async () => {
  const started = performance.now()
  const result = await raceStaggered(
    [
      async (signal) => {
        await sleep(600, signal)
        return 'primary'
      },
      async (signal) => {
        await sleep(20, signal)
        return 'hedge'
      },
    ],
    40,
    accept
  )
  assert.equal(result, 'hedge')
  assert.ok(performance.now() - started < 400)
})

test('skips values the acceptance check rejects', async () => {
  const result = await raceStaggered([async () => '', async () => 'valid'], 10_000, accept)
  assert.equal(result, 'valid')
})

test('treats a throwing acceptance check as a rejection', async () => {
  let calls = 0
  const result = await raceStaggered(
    [async () => 'first', async () => 'second'],
    10_000,
    (value) => {
      calls += 1
      if (value === 'first') throw new Error('bad shape')
      return true
    }
  )
  assert.equal(result, 'second')
  assert.equal(calls, 2)
})

test('returns null when every step fails or nothing is configured', async () => {
  assert.equal(await raceStaggered([], 10, accept), null)
  const result = await raceStaggered(
    [
      async () => {
        throw new Error('a')
      },
      async () => '',
    ],
    10,
    accept
  )
  assert.equal(result, null)
})

test('aborts all work when the parent signal aborts', async () => {
  const parent = new AbortController()
  let aborted = false
  const pending = raceStaggered(
    [
      async (signal) => {
        try {
          await sleep(5000, signal)
        } catch (error) {
          aborted = true
          throw error
        }
        return 'late'
      },
    ],
    10,
    accept,
    parent.signal
  )
  setTimeout(() => parent.abort(), 20)
  assert.equal(await pending, null)
  await sleep(10)
  assert.equal(aborted, true)
})
