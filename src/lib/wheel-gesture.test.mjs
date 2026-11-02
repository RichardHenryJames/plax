import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWheelGesture, wheelPixels, PUSH_PX, LINE_PX, SLIDE_MS } from './wheel-gesture.ts'

/** Plays [{ t, dy, dx?, mode? }] into a new gesture: when it said "move", and which way. */
const play = (events) => {
  const gesture = createWheelGesture()
  const moves = []
  for (const e of events) {
    const step = gesture.push({ dx: e.dx ?? 0, dy: e.dy, mode: e.mode ?? 0, time: e.t, page: 900 })
    if (step !== 0) moves.push({ t: Math.round(e.t), step })
  }
  return moves
}

/** A small deterministic source of noise, so a failing stream can be played again. */
const prng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * One trackpad swipe as the page sees it: the push rises to `peak` while the fingers move (`ramp` ms), stays there for `hold` ms,
 * and then the system's momentum fades it away with time constant `tau`. One event per `frame` ms. `noise` is how far each push
 * wanders from the curve, as a share of it; `round` gives whole pixels, as Windows does.
 */
function swipe({ start = 0, sign = 1, peak = 44, ramp = 80, hold = 0, tau = 300, frame = 16, noise = 0, round = true, seed = 1 } = {}) {
  const random = prng(seed)
  const events = []
  for (let t = 0; ; t += frame) {
    let v = t < ramp ? peak * (0.1 + (0.9 * t) / ramp) : t < ramp + hold ? peak : peak * Math.exp(-(t - ramp - hold) / tau)
    v *= 1 + noise * (random() * 2 - 1)
    if (round) v = Math.round(v)
    if (t > ramp + hold && Math.abs(v) < 1) break
    events.push({ t: start + t, dy: sign * v })
  }
  return events
}

/** Swipes one after the other. Touching the pad again stops the momentum of the swipe before, so that one ends 30 ms before the next. */
const chain = (...swipes) =>
  swipes.flatMap((events, i) => (swipes[i + 1] ? events.filter((e) => e.t < swipes[i + 1][0].t - 30) : events))

const notches = (n, gap, dy = 100) => Array.from({ length: n }, (_, i) => ({ t: i * gap, dy }))

/** What the browser does while the page is busy: the events that arrive in [from, to) are merged in groups, with the sum of their push and the time of the last. */
const merged = (events, from, to, group) => {
  const inside = events.filter((e) => e.t >= from && e.t < to)
  const out = events.filter((e) => e.t < from)
  for (let i = 0; i < inside.length; i += group) {
    const part = inside.slice(i, i + group)
    out.push({ t: part[part.length - 1].t, dy: part.reduce((sum, e) => sum + e.dy, 0) })
  }
  return [...out, ...events.filter((e) => e.t >= to)]
}

test('a push is measured in pixels, whatever the browser counts in', () => {
  assert.equal(wheelPixels(100, 0, 900), 100)
  assert.equal(wheelPixels(-7, 0, 900), -7)
  assert.equal(wheelPixels(1, 2, 900), 900)
  assert.equal(wheelPixels(-1, 2, 900), -900)
  // A notch counted in lines is a decisive push even when the browser says one line (Firefox on some systems).
  for (const lines of [1, 2, 3, 5]) assert.ok(wheelPixels(lines, 1, 900) >= PUSH_PX, `${lines} lines`)
  assert.equal(wheelPixels(3, 1, 900), 3 * LINE_PX)
  assert.equal(wheelPixels(-1, 1, 900), -PUSH_PX)
  assert.equal(wheelPixels(0, 1, 900), 0)
})

test('one notch of a mouse wheel moves one story, down or up', () => {
  assert.deepEqual(play([{ t: 0, dy: 100 }]), [{ t: 0, step: 1 }])
  assert.deepEqual(play([{ t: 0, dy: -100 }]), [{ t: 0, step: -1 }])
  assert.deepEqual(play([{ t: 0, dy: 3, mode: 1 }]), [{ t: 0, step: 1 }])
  assert.deepEqual(play([{ t: 0, dy: -1, mode: 1 }]), [{ t: 0, step: -1 }])
  assert.deepEqual(play([{ t: 0, dy: 1, mode: 2 }]), [{ t: 0, step: 1 }])
})

test('a short push does not move a story, but a few that follow each other do', () => {
  assert.deepEqual(play([{ t: 0, dy: 30 }]), [])
  assert.deepEqual(play([{ t: 0, dy: 30 }, { t: 16, dy: 30 }]), [{ t: 16, step: 1 }])
  // Two short pushes a long while apart are two gestures, and neither is enough.
  assert.deepEqual(play([{ t: 0, dy: 30 }, { t: 700, dy: 30 }]), [])
})

test('jitter and sideways swipes do nothing', () => {
  const jitter = Array.from({ length: 400 }, (_, i) => ({ t: i * 16, dy: i % 2 ? 0.6 : -0.6 }))
  assert.deepEqual(play(jitter), [])
  assert.deepEqual(play([{ t: 0, dx: 120, dy: 20 }, { t: 16, dx: 120, dy: 20 }, { t: 32, dx: 120, dy: 20 }]), [])
  // A swipe that is mostly up and down, with a little drift sideways, still counts.
  assert.deepEqual(play([{ t: 0, dx: 12, dy: 60 }]), [{ t: 0, step: 1 }])
})

test('one swipe moves one story, however hard it is and however long its momentum lasts', () => {
  for (const peak of [14, 30, 44, 90, 180])
    for (const tau of [100, 200, 300, 450, 700])
      for (const frame of [8, 16.7])
        for (const round of [true, false])
          for (const sign of [1, -1]) {
            const moves = play(swipe({ peak, tau, frame, round, sign }))
            const what = JSON.stringify({ peak, tau, frame, round, sign, moves })
            assert.equal(moves.length, 1, what)
            assert.equal(moves[0].step, sign, what)
          }
})

test('a swipe without any momentum moves one story, and a long hard one does too', () => {
  assert.equal(play(swipe({ peak: 40, ramp: 60, hold: 60, tau: 25 })).length, 1)
  assert.equal(play(swipe({ peak: 160, ramp: 100, hold: 100, tau: 500 })).length, 1)
})

test('a noisy swipe still moves one story', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const random = prng(seed * 7919)
    const peak = 20 + Math.floor(random() * 140)
    const tau = 120 + Math.floor(random() * 580)
    const frame = random() < 0.5 ? 8 : 16.7
    const moves = play(swipe({ peak, tau, frame, noise: 0.35, round: random() < 0.5, seed }))
    assert.equal(moves.length, 1, JSON.stringify({ seed, peak, tau, frame, moves }))
  }
})

test('the next swipe moves the next story, even though it begins while the last one is still fading', () => {
  for (const gap of [600, 700, 800, 1000, 1500, 3000])
    for (const tau of [150, 250, 350]) {
      const moves = play(chain(swipe({ tau }), swipe({ start: gap, tau, seed: 2 })))
      const what = `${gap} ms apart, tau ${tau}: ${JSON.stringify(moves)}`
      assert.equal(moves.length, 2, what)
      assert.ok(moves[1].t >= gap && moves[1].t < gap + 250, what)
    }
})

test('swipe after swipe after swipe: every one of them moves a story', () => {
  const swipes = Array.from({ length: 6 }, (_, i) => swipe({ start: i * 700, tau: 300, seed: i + 1 }))
  const moves = play(chain(...swipes))
  assert.equal(moves.length, 6, JSON.stringify(moves))
  for (let i = 0; i < 6; i++) assert.ok(moves[i].t >= i * 700 && moves[i].t < i * 700 + 250, `story ${i + 1}: ${JSON.stringify(moves)}`)
})

test('a second swipe laid on top of the first one\'s momentum, not after it, is found as well', () => {
  // The worst case for telling a new push from a fading one: the momentum is not cut short by the fingers touching the pad again.
  for (const gap of [900, 1200, 2000]) {
    const events = [...swipe({ tau: 300 }), ...swipe({ start: gap, tau: 300, seed: 2 })].sort((a, b) => a.t - b.t)
    assert.equal(play(events).length, 2, `${gap} ms apart`)
  }
})

test('a gentle swipe after a hard one is found: touching the pad leaves a gap, and the gap ends the gesture', () => {
  // Under the momentum curve of the hard swipe the gentle one would never show; the gap is what tells them apart.
  for (const gap of [600, 800, 1000]) {
    const hard = swipe({ peak: 150, tau: 450 })
    const gentle = swipe({ start: gap, peak: 30, tau: 250, seed: 2 })
    const cut = hard.filter((e) => e.t < gap - 90)
    assert.equal(play([...cut, ...gentle]).length, 2, `${gap} ms apart`)
  }
})

test('events the browser merges while the page is busy do not split a swipe in two', () => {
  // A story arriving keeps the page busy for a moment. The events that come meanwhile are merged into fewer, bigger ones, and the
  // time between the ones that are left is longer than a frame, though the fingers did not stop.
  for (const peak of [30, 60, 120, 180])
    for (const tau of [200, 350, 500])
      for (const [from, to, group] of [[100, 250, 2], [100, 350, 3], [100, 400, 4], [120, 300, 6]]) {
        const events = merged(swipe({ peak, tau }), from, to, group)
        const moves = play(events)
        assert.equal(moves.length, 1, JSON.stringify({ peak, tau, from, to, group, moves }))
      }
})

test('turning round moves the other way', () => {
  const moves = play(chain(swipe({ tau: 300 }), swipe({ start: 600, sign: -1, tau: 300, seed: 2 })))
  assert.deepEqual(moves.map((m) => m.step), [1, -1])
  // A wobble of the fingers against the stream, while it is still going, is not a turn.
  const wobble = swipe({ peak: 60, tau: 400 }).map((e, i) => (i % 5 === 4 ? { ...e, dy: -3 } : e))
  assert.equal(play(wobble).length, 1)
})

test('a story never moves twice within the time it takes to slide in', () => {
  for (const events of [notches(40, 20), swipe({ peak: 150, hold: 600, tau: 600 }), notches(20, 60, 400), notches(40, 100)]) {
    const moves = play(events)
    for (let i = 1; i < moves.length; i++) assert.ok(moves[i].t - moves[i - 1].t >= SLIDE_MS, JSON.stringify(moves))
  }
})

test('each notch of a wheel moves a story when they come as fast as the stories slide in', () => {
  for (const gap of [220, 250, 300, 350, 400, 600, 1000, 3000]) assert.equal(play(notches(6, gap)).length, 6, `${gap} ms apart`)
})

test('a wheel rolled faster than the stories can arrive moves them as fast as they arrive, and a spinning one a little slower', () => {
  const rolled = play(notches(31, 100)) // ten notches a second, three seconds
  assert.ok(rolled.length >= 12 && rolled.length <= 16, JSON.stringify(rolled))
  const spinning = play(notches(60, 16)) // a wheel left to spin, one second
  assert.ok(spinning.length >= 2 && spinning.length <= 4, JSON.stringify(spinning))
})

test('a long slow drag goes on from story to story without a stop', () => {
  const drag = Array.from({ length: 125 }, (_, i) => ({ t: i * 16, dy: 4 })) // two seconds at 250 px/s
  const moves = play(drag)
  assert.ok(moves.length >= 2 && moves.length <= 5, JSON.stringify(moves))
})

test('a stream that never falls silent does not lock the wheel', () => {
  // The old rule let go only after 220 ms without a single event. Resting fingers that send a jitter for ever never gave it that.
  const first = swipe({ tau: 300 })
  const begin = first[first.length - 1].t + 16
  const jitter = Array.from({ length: 2000 }, (_, i) => ({ t: begin + i * 16, dy: i % 2 ? 1.4 : -1.4 }))
  const events = [...first, ...jitter, ...swipe({ start: begin + 2000 * 16, tau: 300, seed: 2 })]
  assert.deepEqual(play(events).map((m) => m.step), [1, 1])
})

test('a momentum that fades more slowly than any real one still lets the next push through', () => {
  const endless = swipe({ peak: 90, tau: 6000 })
  const moves = play(endless)
  assert.ok(moves.length >= 2, JSON.stringify(moves))
  assert.ok(moves[1].t - moves[0].t <= 1000, JSON.stringify(moves))
})

test('a push counts at once after the wheel has been left alone, and after a reset', () => {
  const gesture = createWheelGesture()
  assert.equal(gesture.push({ dx: 0, dy: 100, mode: 0, time: 5000, page: 900 }), 1)
  assert.equal(gesture.push({ dx: 0, dy: 100, mode: 0, time: 5100, page: 900 }), 0) // still sliding in
  gesture.reset()
  assert.equal(gesture.push({ dx: 0, dy: 100, mode: 0, time: 5101, page: 900 }), 1)
})
