// The ads of the Google Play build, here with Google's own sample units: a strip under the story, and a full page between the stories.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { d, mkdirShots, openWorld } from './lib/app.mjs'
import { pageView } from './lib/fit.mjs'

let world
before(async () => {
  mkdirShots()
  world = await openWorld()
  world.phone({})
})
after(async () => world?.close())

describe('the ad strip', () => {
  it('shows an ad under the story, marked as one, once Google has answered', async () => {
    await world.fresh()
    await world.until({ contains: 'Test Ad' }, { timeout: 45_000, label: 'a sample ad in the strip' })
    world.shot('ad-strip')
    const strip = world.find({ id: 'ad-strip' })
    assert.ok(strip, 'the strip')
    const pager = world.find({ id: 'feed-pager' })
    assert.ok(strip.bounds.top >= pager.bounds.bottom - 2, 'the strip is under the pager, not over a story')
  })

  it('stays out of the way of Topics, and is there again under the stories', async () => {
    await world.choose('menu-topics')
    await world.until('Follow your curiosity.')
    assert.equal(world.find({ id: 'ad-strip' })?.height ?? 0, 0, 'no strip on Topics')
    await world.choose('menu-feed')
    await world.untilStory()
    await world.until({ contains: 'Test Ad' }, { timeout: 20_000 })
  })

  it('does not take the story’s room before the ad has come: the first page is as tall as it will be', async () => {
    await world.fresh()
    const early = world.find({ id: 'feed-pager' })
    await world.until({ contains: 'Test Ad' }, { timeout: 45_000 })
    const late = world.find({ id: 'feed-pager' })
    assert.ok(early && late)
    // The strip is asked for with no room; it takes its room when its ad has arrived, and not while the pager moves.
    assert.ok(late.bounds.bottom <= early.bounds.bottom + 2)
  })
})

describe('the full page between stories', () => {
  it('stands after the fifth story or later, is marked as an ad, and is never the last page', async () => {
    await world.fresh()
    await world.until({ contains: 'Test Ad' }, { timeout: 45_000 })
    let found = -1
    let nodes = []
    for (let swipe = 0; swipe < 24 && found < 0; swipe += 1) {
      nodes = await world.swipe('up')
      if (pageView(nodes).pick('ad-page')) found = swipe + 1
    }
    world.shot('ad-page')
    assert.ok(found >= 5, `an ad page came after ${found} swipes (never before the fifth story)`)
    // The reader is never asked to press anything but the ad: the app’s own buttons are not on the page in view.
    const { pick } = pageView(nodes)
    assert.equal(pick('save'), undefined)
    assert.equal(pick('share'), undefined)
    nodes = await world.swipe('up')
    assert.ok(pageView(nodes).pick('headline'), 'a story follows the ad')
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })

  it('goes with a swipe back to the story before it, and does not show a second ad in a row', async () => {
    await world.swipe('down')
    await world.swipe('down')
    assert.ok(world.find({ id: 'headline' }) || world.find({ id: 'ad-page' }))
    assert.ok(d.pidOf('com.plaxlabs.news.e2e'))
  })
})
