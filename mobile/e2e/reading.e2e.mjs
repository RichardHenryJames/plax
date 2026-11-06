// Does a page of the app fit the screen, whatever the screen is set to? (The rules are in lib/fit.mjs.)
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PKG, d, mkdirShots, openWorld } from './lib/app.mjs'
import { pageView, problemsOf } from './lib/fit.mjs'

let world
before(async () => {
  mkdirShots()
  world = await openWorld()
})
after(async () => world?.close())

/** Looks at this many pages, one swipe each, and returns each page's problems. */
async function walk(pages, options) {
  const results = []
  let nodes = await world.settle()
  for (let page = 0; page < pages; page += 1) {
    const problems = problemsOf(nodes, options)
    const title = pageView(nodes).pick('headline')
    results.push({ page, title: title ? (title.desc || title.text).slice(0, 50) : '', problems })
    if (page < pages - 1) nodes = await world.swipe()
  }
  return results
}

const report = (results) => results.filter((result) => result.problems.length > 0).map((result) => `page ${result.page} "${result.title}": ${result.problems.join('; ')}`)

describe('the page of a story fits', () => {
  const settings = [
    { name: 'at the normal text size', phone: {} },
    { name: 'with larger text', phone: { font: 1.3 } },
    { name: 'with the largest text', phone: { font: 1.5 } },
    { name: 'with the text at a huge size', phone: { font: 2 } },
    { name: 'in the dark theme', phone: { night: true } },
    { name: 'on its side', phone: { landscape: true } },
  ]
  for (const setting of settings) {
    it(setting.name, async () => {
      world.phone(setting.phone)
      await world.fresh()
      const results = await walk(8, { fill: !setting.phone.landscape, font: setting.phone.font ?? 1 })
      world.shot(`fit-${setting.name.replace(/\W+/g, '-')}`)
      assert.deepEqual(report(results), [])
      assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
    })
  }

  it('in Hindi', async () => {
    world.phone({})
    await world.fresh()
    await world.choose('menu-language-hi')
    await world.untilStory()
    const results = await walk(8)
    world.shot('fit-hindi')
    assert.deepEqual(report(results), [])
  })

  it('in Hindi with larger text', async () => {
    world.phone({ font: 1.3 })
    await world.fresh()
    await world.choose('menu-language-hi')
    await world.untilStory()
    const results = await walk(6, { font: 1.3 })
    assert.deepEqual(report(results), [])
  })

  it('on pages with no picture of their own (a poster stands in for it)', async () => {
    world.phone({})
    await world.fresh()
    const results = await walk(12)
    assert.deepEqual(report(results), [])
  })
})

describe('swiping', () => {
  const titleOf = (nodes) => {
    const node = pageView(nodes).pick('headline')
    return node ? node.desc || node.text : ''
  }

  it('takes one swipe to go to the next story and one to come back', async () => {
    world.phone({})
    await world.fresh()
    const first = titleOf(await world.settle())
    const second = titleOf(await world.swipe('up'))
    assert.notEqual(second, first)
    assert.notEqual(titleOf(await world.swipe('up')), second)
    assert.equal(titleOf(await world.swipe('down')), second)
    assert.equal(titleOf(await world.swipe('down')), first)
  })

  it('keeps going through fifty stories without a crash or a stop', async () => {
    world.phone({})
    await world.fresh()
    for (let swipe = 0; swipe < 50; swipe += 1) {
      d.swipePage('up', { ms: 160 })
      await d.sleep(350)
    }
    await d.sleep(1500)
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
    assert.ok(world.find({ id: 'headline' }) || world.find({ id: 'caught-up' }), 'a page is still on the screen')
    assert.ok(d.pidOf(PKG) !== '', 'the app is still running')
  })

  it('asks for more stories as the reader nears the end, and never shows the same story twice in a row', async () => {
    world.phone({})
    await world.fresh()
    const seen = [titleOf(await world.settle())]
    for (let swipe = 0; swipe < 25; swipe += 1) seen.push(titleOf(await world.swipe('up')))
    const asked = world.asked('/news/api/feed')
    assert.ok(asked.length >= 2, `the feed was asked for more (${asked.length} requests)`)
    for (let index = 1; index < seen.length; index += 1) if (seen[index]) assert.notEqual(seen[index], seen[index - 1], `page ${index}: ${seen.join(' | ')}`)
  })
})
