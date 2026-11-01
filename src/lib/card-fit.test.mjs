import test from 'node:test'
import assert from 'node:assert/strict'
import { planFit, MIN_BODY_LINES, MIN_TITLE_LINES } from './card-fit.ts'

// The cases mirror CardFitTest.java in the Android app: the same numbers give the same plan on both. They are the pixels of a
// phone page of 744 high: a 40 source line, a 58 action row, headline lines of 32 under 10 of space, summary lines of 28 under
// 12 of space, a picture of between 117 and 297 (262 is the usual most, 297 the most when there is little to read).

const page = (height, titleNatural, bodyNatural) => ({
  height, meta: 40, metaBare: 40, actions: 58, titleTop: 10, titleLine: 32, titleNatural, titleMax: 4,
  bodyTop: 12, bodyLine: 28, bodyNatural, heroMaximum: 262, heroMinimum: 117, heroTall: 297,
})

const used = (input, plan) =>
  (plan.hero > 0 ? input.meta : input.metaBare) + input.actions + plan.hero +
  (plan.titleLines === 0 ? 0 : input.titleTop + plan.titleLines * input.titleLine) +
  (plan.bodyLines === 0 ? 0 : input.bodyTop + plan.bodyLines * input.bodyLine)

test('a roomy page shows the whole summary and lets the picture grow, up to the tallest it may be', () => {
  const input = page(744, 3, 7)
  const plan = planFit(input)
  assert.equal(plan.hero, 297, 'the picture takes the room the text leaves, up to its most')
  assert.equal(plan.titleLines, 3)
  assert.equal(plan.bodyLines, 7, 'every line of the summary')
  assert.ok(used(input, plan) <= 744)
})

test('a little to read gives the picture more than a square, so that the card is full', () => {
  const input = page(744, 2, 2)
  const plan = planFit(input)
  assert.ok(plan.hero > input.heroMaximum, 'past the usual most')
  assert.equal(plan.hero, input.heroTall)
  assert.equal(plan.bodyLines, 2)
  // Room that is left after that is the little that cannot be filled, and the page is not over-full.
  assert.ok(used(input, plan) <= 744)
})

test('a long summary is shown whole and the picture shrinks to what is left', () => {
  const input = page(744, 4, 12)
  const plan = planFit(input)
  assert.equal(plan.titleLines, 4)
  assert.equal(plan.bodyLines, 12, 'the whole summary when it fits beside the least picture')
  assert.equal(plan.hero, 744 - 58 - 40 - (10 + 4 * 32) - (12 + 12 * 28), 'and the picture takes what remains')
  assert.ok(plan.hero >= 117 && plan.hero < 297)
  assert.ok(used(input, plan) <= 744)
})

test('a summary a line too long for the least picture is cut at a whole line, and the picture stays', () => {
  const input = page(744, 4, 14)
  const plan = planFit(input)
  assert.equal(plan.titleLines, 4, 'the headline keeps its lines')
  assert.equal(plan.bodyLines, 13, 'the summary is cut by the line that did not fit')
  assert.equal(plan.hero, 744 - 58 - 40 - (10 + 4 * 32) - (12 + 13 * 28), 'and the picture takes what the lines leave')
  assert.ok(plan.hero >= 117 && plan.hero < 117 + 28, 'which is its least and less than a line more')
  assert.ok(used(input, plan) <= 744)
})

test('a poster only stands in for a picture, so it is dropped before any of the summary is cut', () => {
  const input = { ...page(744, 4, 14), heroKept: false }
  const plan = planFit(input)
  assert.equal(plan.hero, 0)
  assert.equal(plan.titleLines, 4, 'the headline keeps its lines')
  assert.equal(plan.bodyLines, 14, 'and the summary all of its own')
  assert.ok(used(input, plan) <= 744)
  // With room for all of the summary beside it, a poster is shown like a photograph.
  const roomy = planFit({ ...page(744, 3, 7), heroKept: false })
  assert.equal(roomy.hero, 297)
  assert.equal(roomy.bodyLines, 7)
  // And a photograph is kept.
  assert.equal(planFit({ ...page(744, 4, 14), heroKept: true }).hero, 132)
})

test('a long summary is cut to what fits beside the least picture, however long it is', () => {
  for (const natural of [25, 40, 200]) {
    const input = page(744, 4, natural)
    const plan = planFit(input)
    assert.equal(plan.titleLines, 4)
    assert.equal(plan.bodyLines, 13)
    assert.equal(plan.hero, 132)
    assert.ok(used(input, plan) <= 744)
  }
})

test('a long headline keeps all its lines up to the most it may take, and the summary gives way to what is left', () => {
  const input = { ...page(500, 6, 12), titleMax: 5 }
  const plan = planFit(input)
  assert.equal(plan.titleLines, 5, 'the headline is cut at the most it may take, not shorter')
  assert.equal(plan.bodyLines, MIN_BODY_LINES, 'three lines of the summary beside the least picture')
  assert.equal(plan.hero, 500 - 58 - 40 - (10 + 5 * 32) - (12 + 3 * 28))
  assert.ok(used(input, plan) <= 500)
})

test('a short page cuts the headline before it leaves the summary less than three lines', () => {
  const input = page(330, 4, 6)
  const plan = planFit(input)
  assert.equal(plan.titleLines, 3, 'one line of the headline for the lines of the summary')
  assert.equal(plan.hero, 0)
  assert.equal(plan.bodyLines, 4)
  assert.ok(used(input, plan) <= 330)
})

test('a very short page cuts the headline as far as two lines, and then the summary', () => {
  const input = page(240, 4, 12)
  const plan = planFit(input)
  assert.equal(plan.titleLines, MIN_TITLE_LINES)
  assert.equal(plan.hero, 0)
  assert.equal(plan.bodyLines, Math.floor((240 - 58 - 40 - (10 + 2 * 32) - 12 + 0.5) / 28))
  assert.ok(used(input, plan) <= 240)
})

test('a summary too short to need three lines is never cut for the headline', () => {
  const plan = planFit(page(300, 4, 2))
  assert.equal(plan.bodyLines, 2)
  assert.ok(plan.titleLines >= MIN_TITLE_LINES)
})

test('the source line is counted as it stands: with the picture above it, or first on the page', () => {
  // With the menu button at its start, the line is taller when it has no picture above it, and the summary has less.
  const plain = { ...page(412, 3, 7), meta: 40, metaBare: 40 }
  assert.equal(planFit(plain).hero, 0)
  assert.equal(planFit(plain).bodyLines, 7)
  const withMenu = { ...plain, metaBare: 48 }
  const plan = planFit(withMenu)
  assert.equal(plan.hero, 0)
  assert.equal(plan.bodyLines, Math.floor((412 - 58 - 48 - (10 + 3 * 32) - 12 + 0.5) / 28))
  assert.equal(plan.bodyLines, 6, 'counted with the bigger line')
  assert.ok(used(withMenu, plan) <= 412)
})

test('a story with nothing under its headline lets the picture grow taller', () => {
  const plan = planFit(page(744, 2, 0))
  assert.equal(plan.hero, 297)
  assert.equal(plan.bodyLines, 0)
  assert.equal(planFit(page(250, 2, 0)).hero, 0, 'and with no room for a picture it has none')
})

test('a page with no picture spends everything on text', () => {
  const none = { ...page(500, 2, 9), heroMaximum: 0, heroTall: 0 }
  const plan = planFit(none)
  assert.equal(plan.hero, 0)
  assert.equal(plan.titleLines, 2)
  assert.equal(plan.bodyLines, 9, 'the whole summary')
  assert.equal(planFit({ ...none, height: 330 }).bodyLines, Math.floor((330 - 58 - 40 - (10 + 2 * 32) - 12 + 0.5) / 28))
  assert.equal(planFit({ ...none, height: 200, bodyNatural: 0, bodyTop: 0 }).hero, 0)
})

test('a headline too tall for the page loses lines even with no summary to protect', () => {
  const input = page(200, 3, 0)
  const plan = planFit(input)
  assert.equal(plan.titleLines, 2)
  assert.ok(used(input, plan) <= 200)
  assert.equal(planFit(page(40 + 58 + 10 + 32 + 5, 3, 0)).titleLines, 1, 'a page that holds only one line of it gets one')
})

test('a story with no headline is just the summary', () => {
  const plan = planFit(page(744, 0, 8))
  assert.equal(plan.titleLines, 0)
  assert.equal(plan.hero, 297)
  assert.equal(plan.bodyLines, 8)
})

test('line heights that are fractions of a pixel do not lose a line to rounding', () => {
  // A laptop window, as measured in a browser: the room left for the summary is exactly two lines of it, but in floating point
  // comes out as 1.9999999999999998 of one. That used to cost the summary a line, which counted as "not readable" and so cost
  // the headline a line too.
  const titleLine = 44.08
  const bodyLine = 28.05
  const height = 54 + 39 + (10 + 3 * titleLine) + (12 + 2 * bodyLine)
  const input = {
    height, meta: 39, metaBare: 39, actions: 54, titleTop: 10, titleLine, titleNatural: 3, titleMax: 3,
    bodyTop: 12, bodyLine, bodyNatural: 2, heroMaximum: 0, heroMinimum: 96, heroTall: 0,
  }
  const plan = planFit(input)
  assert.equal(plan.titleLines, 3, 'the headline keeps its three lines')
  assert.equal(plan.bodyLines, 2, 'and the summary both of its')
})

test('whatever the page holds, nothing is planned beyond it, and the summary is whole whenever it can be', () => {
  let checked = 0
  for (let height = 220; height <= 1400; height += 23) {
    for (let title = 0; title <= 7; title++) {
      for (let body = 0; body <= 30; body += 3) {
        for (const maximum of [0, 180, 262]) {
          for (const bare of [40, 52]) {
            const input = {
              height, meta: 40, metaBare: bare, actions: 58, titleTop: 10, titleLine: 32, titleNatural: title, titleMax: title > 4 ? 5 : 4,
              bodyTop: 12, bodyLine: 28, bodyNatural: body, heroMaximum: maximum, heroMinimum: 117, heroTall: Math.floor(maximum * 1.2),
            }
            const plan = planFit(input)
            const where = `height ${height} title ${title} body ${body} maximum ${maximum} bare ${bare}: ${JSON.stringify(plan)} uses ${used(input, plan)}`
            // A page too small for the source line, one line of headline and the action row holds nothing anyway.
            const leastHeadline = title === 0 ? 0 : 10 + 32
            if (height >= bare + 58 + leastHeadline) assert.ok(used(input, plan) <= height + 0.5, where)
            assert.ok(plan.hero === 0 || plan.hero >= 117, `a picture is either absent or worth showing: ${where}`)
            assert.ok(plan.hero <= Math.max(maximum, input.heroTall), where)
            assert.ok(plan.titleLines <= Math.min(title, input.titleMax), where)
            assert.ok(plan.bodyLines <= body, where)
            if (maximum === 0) assert.equal(plan.hero, 0, 'no picture in this layout')
            if (body === 0) assert.equal(plan.bodyLines, 0)
            // The headline keeps two lines whenever the page can hold them, and one line whatever the page.
            const kept = Math.min(title, MIN_TITLE_LINES)
            if (title > 0) assert.ok(plan.titleLines >= (height >= bare + 58 + 10 + kept * 32 ? kept : 1), where)
            // With a picture on the page, the summary has at least its three lines, and is whole or the picture is at its least
            // (the lines left over go to the picture, so it is less than a line more than its least).
            if (plan.hero > 0 && body > 0) {
              assert.ok(plan.bodyLines >= Math.min(body, MIN_BODY_LINES), where)
              if (plan.bodyLines < body) assert.ok(plan.hero < input.heroMinimum + input.bodyLine, where)
            }
            // And a summary that fits beside the least picture (or, with no picture to be had, on the page) is never cut.
            if (body > 0 && title > 0 && plan.titleLines === Math.min(title, input.titleMax)) {
              const needs = 58 + (maximum > 0 ? 40 + input.heroMinimum : bare) + 10 + plan.titleLines * 32 + 12 + body * 28
              if (needs <= height) assert.equal(plan.bodyLines, body, where)
            }
            checked++
          }
        }
      }
    }
  }
  assert.ok(checked > 10_000)
})
