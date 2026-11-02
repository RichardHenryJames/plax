// A push of the mouse wheel, or a swipe on a trackpad, turned into "next story" or "previous story".
//
// A story is one view that does not scroll, so the wheel has a single thing to say: the reader has asked for another story. Three
// kinds of hardware have to give the same answer:
//   - a mouse wheel sends one event for each notch (100 px in Chrome, 3 lines in Firefox) and nothing in between;
//   - a trackpad sends a stream of small events while the fingers move, and then a tail of fading ones for a second or more, the
//     momentum the system adds after the fingers have left. The tail is not the reader asking again;
//   - a free-spinning wheel sends a steady stream for as long as it turns.
//
// The rule that was here before locked after each move and let go only when the wheel had been silent for 220 ms. A tail has no gap
// that long, so a second swipe begun inside it was swallowed, and so was everything after it for as long as the events kept coming:
// the reader could not go on to the next story until the stream stopped (or they moved the pointer). Nothing here waits for silence.
//
// After a story has moved:
//   - for SLIDE_MS nothing moves another: the story is still sliding in. The gesture that moved it waits COOLDOWN_MS, because
//     the swipe has not yet peaked and its rising edge is not a second request;
//   - a wheel that turns the other way, or that falls silent, begins a new gesture, and its push counts in full. Silent means
//     PAUSE_MS without an event, or GAP_MS when the event that ends the gap does not hold the push the gap should have held:
//     touching the pad again stops the momentum and the new swipe takes a moment to start, whereas the browser merges the
//     events that come while the page is busy, so a merged event does carry what the gap should have, and the stream goes on;
//   - a stream that goes on without a break may be the momentum of the swipe that just moved a story, so only the part of it
//     above that momentum counts. The momentum is taken to fade from the swipe's peak speed, TAIL_TAU_MS being the time it takes
//     to fall to a third, slower than any real one: a tail never rises above that curve, whereas a new swipe, a spinning wheel
//     or a long drag does, and the further it lies above the curve the sooner it makes PUSH_PX. The curve falls to nothing, so
//     no stream can keep the reader waiting for long, whatever it looks like.
// A move needs PUSH_PX of push one way, counted from where pushes count again and never from the tail.
//
// Speeds are measured over RATE_MS rather than per event, because the events are not evenly sized or spaced: the screen's refresh
// rate sets how often a trackpad's come, a mouse's come when its notches do, and the browser merges those that pile up.
//
// Pure logic on events that carry their own time, so the tests can play a whole trackpad swipe in a millisecond.

/** The push that makes a move: one notch of a mouse wheel is twice this, a short swipe a few times. */
export const PUSH_PX = 50
/** A push smaller than this is the jitter of resting fingers, not the reader. */
export const NOISE_PX = 1
/** The pixels in a line, for the browsers that count a notch in lines (Firefox). */
export const LINE_PX = 40
/** A wheel silent for this long has ended its gesture, whatever the stream was like. */
export const PAUSE_MS = 600
/** A gap this long ends the gesture when the event after it does not carry what the gap should have held. */
export const GAP_MS = 40
/** "Carry": the push of an event after a gap is at least this share of what the speed before the gap would have pushed. */
export const CARRY = 0.5
/** A stream slower than this (px per ms) is too weak to make a move on its own, so a gap after it always ends the gesture. */
export const WEAK_SPEED = 0.15
/** After a move nothing moves another for this long: the story takes about this long to slide in. */
export const SLIDE_MS = 200
/** After a move, the gesture that made it waits this long: the swipe has not yet peaked. */
export const COOLDOWN_MS = 400
/** The time the momentum of a swipe is taken to need to fall to a third of its peak speed: longer than any trackpad's takes. */
export const TAIL_TAU_MS = 1300
/** The stretch over which a speed is measured. */
const RATE_MS = 64
/** The time the first event of a gesture is taken to cover: one frame of a screen. */
const FIRST_MS = 16
/** The shortest time a speed is measured over, so that events with one time stamp do not make it endless. */
const MIN_SPAN_MS = 8
/** A push against the stream smaller than this is a wobble of the fingers, not the reader turning round. */
const TURN_PX = 6

export interface WheelInput {
  /** The event's deltaX and deltaY, in the unit its deltaMode names. */
  dx: number
  dy: number
  /** The event's deltaMode: 0 pixels, 1 lines, 2 pages. */
  mode: number
  /** When it happened, in ms, on a clock that only goes forward (the event's own timeStamp, not the time it was handled). */
  time: number
  /** How tall a page is, for a delta counted in pages. */
  page: number
}

/** -1 for the previous story, 1 for the next, 0 for no move. */
export type WheelStep = -1 | 0 | 1

export interface WheelGesture {
  /** Takes one wheel event and says whether it moves the story. */
  push(input: WheelInput): WheelStep
  /** Forgets everything: the next push is a new gesture, and counts at once. */
  reset(): void
}

/** A delta in pixels. A notch counted in lines is a decisive push whatever the line is worth: a notch is never "half a push". */
export function wheelPixels(delta: number, mode: number, page: number): number {
  if (mode === 1) return delta === 0 ? 0 : Math.sign(delta) * Math.max(Math.abs(delta) * LINE_PX, PUSH_PX)
  if (mode === 2) return delta * page
  return delta
}

export function createWheelGesture(): WheelGesture {
  // The latest events, each with the time it covers: the time since the one before it, which for an event the browser merged
  // from several is longer than one frame.
  let recent: { t: number; a: number; span: number }[] = []
  let way = 0
  let last = -Infinity
  let lastSpeed = 0
  let beganAt = -Infinity
  let movedAt = -Infinity
  let pushed = 0
  // Set by a move, cleared when the stream is over: while it is set, a push counts only as far as it is above the momentum of
  // the swipe that moved the story. The momentum fades from `peak`, the highest speed of that swipe, which came at `peakAt`.
  let tail = false
  let peak = 0
  let peakAt = 0

  const speed = (): number => {
    let sum = 0
    let span = 0
    for (const e of recent) {
      sum += e.a
      span += e.span
    }
    return sum / Math.max(span, MIN_SPAN_MS)
  }

  return {
    push({ dx, dy, mode, time, page }) {
      const y = wheelPixels(dy, mode, page)
      const size = Math.abs(y)
      // Jitter, and a swipe that goes more sideways than up or down, are not a request for another story.
      if (size < NOISE_PX || Math.abs(wheelPixels(dx, mode, page)) > size) return 0
      const direction = y > 0 ? 1 : -1
      const interval = time - last
      const turned = way !== 0 && direction !== way && size >= TURN_PX
      // A stream this slow could not make a move on its own, so a gap after it needs no explaining.
      const weak = lastSpeed < WEAK_SPEED
      const silent = interval >= PAUSE_MS || (interval >= GAP_MS && (weak || size < CARRY * lastSpeed * interval))
      if (silent || turned) {
        pushed = 0
        tail = false
        way = direction
        beganAt = time
        recent = [{ t: time, a: size, span: FIRST_MS }]
      } else {
        recent.push({ t: time, a: size, span: interval })
        while (recent[0].t <= time - RATE_MS) recent.shift()
      }
      const now = speed()
      last = time
      lastSpeed = now

      // A gesture that began after the last move has only the sliding to wait for; the one that made the move has more.
      if (time - movedAt < (beganAt > movedAt ? SLIDE_MS : COOLDOWN_MS)) {
        if (now >= peak) {
          peak = now
          peakAt = time
        }
        return 0
      }
      let push = y
      if (tail) {
        // The push above the momentum over the time since the last event.
        const excess = (now - peak * Math.exp(-(time - peakAt) / TAIL_TAU_MS)) * Math.min(interval, PAUSE_MS)
        if (excess <= 0) return 0
        push = direction * excess
      }
      pushed += push
      if (Math.abs(pushed) < PUSH_PX) return 0
      const step = pushed > 0 ? 1 : -1
      pushed = 0
      movedAt = time
      tail = true
      peak = now
      peakAt = time
      return step
    },
    reset() {
      recent = []
      way = 0
      last = -Infinity
      lastSpeed = 0
      beganAt = -Infinity
      movedAt = -Infinity
      pushed = 0
      tail = false
      peak = 0
      peakAt = 0
    },
  }
}
