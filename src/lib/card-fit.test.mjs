import test from 'node:test'
import assert from 'node:assert/strict'
import { planFit, MIN_BODY_LINES, MIN_TITLE_LINES } from './card-fit.ts'

// The cases mirror CardFitTest.java in the Android app: the same numbers give the same plan on both. They are the pixels
// of a phone page: 1639 high, a 165 action row, a 116 source line, headline lines of 91 under 33 of space, summary lines
// of 71 under 39 of space, a picture of up to 495.

const page = (height, titleNatural, bodyNatural) => ({
  height, meta: 116, actions: 165, titleTop: 33, titleLine: 91, titleNatural, titleMax: 4,
  bodyTop: 39, bodyLine: 71, bodyNatural, heroPreferred: 495, heroMinimum: 264, heroTall: 743,
})

const used = (input, plan) =>
  input.meta + input.actions + plan.hero +
  (plan.titleLines === 0 ? 0 : input.titleTop + plan.titleLines * input.titleLine) +
  (plan.bodyLines === 0 ? 0 : input.bodyTop + plan.bodyLines * input.bodyLine)

test('a roomy page gives the picture its full size and the summary the rest', () => {
  const input = page(1639, 3, 12)
  const plan = planFit(input)
  assert.equal(plan.hero, 495, 'the picture is as big as it is meant to be')
  assert.equal(plan.titleLines, 3)
  assert.equal(plan.bodyLines, 7, 'what is left is whole lines of the summary')
  assert.ok(used(input, plan) <= 1639)
})

test('a long headline keeps all its lines and the summary gives way', () => {
  const input = { ...page(1639, 6, 12), titleMax: 5 }
  const plan = planFit(input)
  assert.equal(plan.titleLines, 5, 'the headline is cut at the most it may take, not shorter')
  assert.equal(plan.hero, 495)
  assert.equal(plan.bodyLines, 4)
  assert.ok(used(input, plan) <= 1639)
})

test('a shorter page shrinks the picture to keep three lines of summary', () => {
  const input = page(1200, 3, 12)
  const plan = planFit(input)
  assert.equal(plan.hero, 361)
  assert.equal(plan.bodyLines, MIN_BODY_LINES)
  assert.ok(used(input, plan) <= 1200)
})

test('a picture too small to be worth showing is dropped before any text', () => {
  const plan = planFit(page(1100, 3, 12))
  assert.equal(plan.hero, 0)
  assert.equal(plan.titleLines, 3, 'the headline keeps its lines')
  assert.equal(plan.bodyLines, 6, "and the summary takes the picture's room")
})

test('a very short page cuts the headline before it loses the summary', () => {
  const input = page(720, 4, 12)
  const plan = planFit(input)
  assert.equal(plan.titleLines, MIN_TITLE_LINES)
  assert.equal(plan.hero, 0)
  assert.equal(plan.bodyLines, 2)
  assert.ok(used(input, plan) <= 720)
})

test('a story with nothing under its headline lets the picture grow taller', () => {
  const plan = planFit(page(1639, 2, 0))
  assert.equal(plan.hero, 743)
  assert.equal(plan.bodyLines, 0)
  assert.equal(planFit(page(560, 2, 0)).hero, 0, 'and with no room for a picture it has none')
})

test('a page with no picture spends everything on text', () => {
  const beside = { height: 700, meta: 116, actions: 165, titleTop: 33, titleLine: 91, titleNatural: 2, titleMax: 3,
    bodyTop: 39, bodyLine: 71, bodyNatural: 9, heroPreferred: 0, heroMinimum: 264, heroTall: 0 }
  const plan = planFit(beside)
  assert.equal(plan.hero, 0)
  assert.equal(plan.titleLines, 2)
  assert.equal(plan.bodyLines, Math.floor((700 - 116 - 165 - (33 + 182) - 39) / 71))
  assert.equal(plan.bodyLines, 2)
  assert.equal(planFit({ ...beside, height: 500, titleNatural: 2, bodyNatural: 0, bodyTop: 0 }).hero, 0)
})

test('a headline too tall for the page loses lines even with no summary to protect', () => {
  const plan = planFit(page(531, 3, 0))
  assert.equal(plan.titleLines, 2)
  assert.ok(used(page(531, 3, 0), plan) <= 531)
  assert.equal(planFit(page(116 + 165 + 33 + 91 + 5, 3, 0)).titleLines, 1, 'a page that holds only one line of it gets one')
})

test('a story with no headline is just the summary', () => {
  const plan = planFit(page(1639, 0, 8))
  assert.equal(plan.titleLines, 0)
  assert.equal(plan.hero, 495)
  assert.ok(plan.bodyLines >= 8)
})

test('line heights that are fractions of a pixel do not lose a line to rounding', () => {
  // A laptop window, as measured in a browser: the room left for the summary is exactly two lines of it, but in floating
  // point comes out as 1.9999999999999998 of one. That used to cost the summary a line, which counted as "not readable" and
  // so cost the headline a line too.
  const input = {
    height: 504, meta: 39, actions: 54, titleTop: 10, titleLine: 44.08, titleNatural: 3, titleMax: 3,
    bodyTop: 12, bodyLine: 28.05, bodyNatural: 2, heroPreferred: 252, heroMinimum: 96, heroTall: 277,
  }
  const plan = planFit(input)
  assert.equal(plan.titleLines, 3, 'the headline keeps its three lines')
  assert.equal(plan.bodyLines, 2, 'and the summary both of its')
  assert.ok(Math.abs(plan.hero - 200.66) < 0.01, `the picture takes the rest: ${plan.hero}`)
})

test('whatever the page holds, nothing is planned beyond it', () => {
  let checked = 0
  for (let height = 420; height <= 3200; height += 37) {
    for (let title = 0; title <= 7; title++) {
      for (let body = 0; body <= 16; body += 2) {
        for (const preferred of [0, 300, 495]) {
          const input = {
            height, meta: 116, actions: 165, titleTop: 33, titleLine: 91, titleNatural: title, titleMax: title > 4 ? 5 : 4,
            bodyTop: 39, bodyLine: 71, bodyNatural: body, heroPreferred: preferred, heroMinimum: 264, heroTall: Math.floor(preferred * 3 / 2),
          }
          const plan = planFit(input)
          // A page too small for the source line, one line of headline and the action row holds nothing anyway.
          const leastHeadline = title === 0 ? 0 : 33 + 91
          const holdsTheLeast = height >= input.meta + input.actions + leastHeadline
          const where = `height ${height} title ${title} body ${body}: ${JSON.stringify(plan)} uses ${used(input, plan)}`
          if (holdsTheLeast) assert.ok(used(input, plan) <= height, where)
          assert.ok(plan.hero === 0 || plan.hero >= 264, 'a picture is either absent or worth showing')
          assert.ok(plan.hero <= Math.max(preferred, input.heroTall))
          assert.ok(plan.titleLines <= Math.min(title, input.titleMax))
          // The headline keeps two lines whenever the page can hold them, and one line whatever the page.
          const kept = Math.min(title, MIN_TITLE_LINES)
          const roomForThose = height >= input.meta + input.actions + 33 + kept * 91
          if (title > 0) assert.ok(plan.titleLines >= (roomForThose ? kept : 1), where)
          if (body === 0) assert.equal(plan.bodyLines, 0)
          if (preferred === 0) assert.equal(plan.hero, 0, 'no picture in this column')
          checked++
        }
      }
    }
  }
  assert.ok(checked > 10_000)
})
