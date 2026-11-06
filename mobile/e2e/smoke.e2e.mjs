import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PKG, d, mkdirShots, openWorld } from './lib/app.mjs'

let world
before(async () => {
  mkdirShots()
  world = await openWorld()
})
after(async () => world?.close())

describe('starting the app', () => {
  it('opens on the first story within the time a reader will wait, three times over', async () => {
    const times = []
    for (let run = 0; run < 3; run += 1) {
      world.server.reset()
      d.forceStop(PKG)
      d.logcatClear()
      d.startApp(PKG)
      await world.untilStory()
      // The app tells the system when its first stories are on the screen (reportFullyDrawn); the system writes the time it took.
      const log = d.logcat(['-s', 'ActivityTaskManager:I', 'ActivityManager:I'])
      const match = new RegExp(`Fully drawn ${PKG.replace(/\./g, '\\.')}[^\\n]*: \\+(?:(\\d+)s)?(\\d+)ms`).exec(log)
      assert.ok(match, `the system noted when the app was fully drawn:\n${log.slice(-600)}`)
      times.push(Number(match[1] ?? 0) * 1000 + Number(match[2]))
    }
    console.log(`time to the first stories, fully drawn (emulator): ${times.join(' ms, ')} ms`)
    // The first start after an install is the slowest (the system verifies the app's code once), on an emulator that draws in software.
    times.forEach((time, run) => assert.ok(time < (run === 0 ? 10_000 : 6500), `start ${run + 1}: the first stories took ${time} ms`))
  })

  it('shows what a story has: its tag, its age, its headline, its summary and its three buttons', async () => {
    await world.fresh()
    const story = world.story()
    for (const part of ['headline', 'tag', 'credit', 'body', 'save', 'share', 'menu-button']) assert.ok(story[part], `the page has its ${part}`)
    assert.ok(story.headline.cy < story.body.cy, 'the headline is over the summary')
    assert.ok(story.tag.cy < story.headline.cy, 'the tag is over the headline')
    world.shot('first-story')
  })

  it('names no publisher in the line over the story (the website’s own look)', async () => {
    await world.fresh()
    const credit = world.story().credit
    assert.ok(credit, 'there is a line')
    assert.doesNotMatch(credit.text || credit.desc, /The Hindu|Reuters|BBC/)
  })

  it('crashes nowhere, is never "not responding", and has no error from its JavaScript', async () => {
    await world.fresh()
    await world.swipe()
    await world.swipe()
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })

  it('asked the website for its settings and for the stories, and for nothing about the reader', async () => {
    await world.fresh()
    await d.sleep(1500)
    const paths = world.asked().map((entry) => entry.path)
    assert.ok(paths.some((path) => path.endsWith('/api/feed')), 'the feed was asked for')
    assert.ok(paths.some((path) => path.endsWith('/app-config.json')), 'the settings were asked for')
    for (const entry of world.asked()) {
      assert.equal(entry.headers.cookie, undefined, `no cookie to ${entry.path}`)
      assert.equal(entry.headers.authorization, undefined, `no credentials to ${entry.path}`)
    }
  })
})
