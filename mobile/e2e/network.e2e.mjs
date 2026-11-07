// The connection is the part of a phone nobody controls: slow, gone, or answered with an error. The app keeps what it has, says what is wrong,
// and recovers by itself or from a button.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PKG, d, mkdirShots, openWorld } from './lib/app.mjs'
import { pageView } from './lib/fit.mjs'

let world
const titleOf = (nodes) => {
  const node = pageView(nodes).pick('headline')
  return node ? node.desc || node.text : ''
}
before(async () => {
  mkdirShots()
  world = await openWorld()
  world.phone({})
})
after(async () => world?.close())

describe('with no stories yet', () => {
  it('says it could not load them, and loads them from the button once the website answers', async () => {
    await world.fresh({ launch: false })
    world.server.setFeed({ mode: 'drop' })
    await world.launch({ story: false })
    await world.until('Try again', { timeout: 30_000 })
    assert.match(world.words().join(' '), /Could not load stories\. Check your connection and try again\./)
    world.shot('feed-error')
    world.server.setFeed({ mode: 'ok' })
    await world.press('Try again')
    await world.untilStory()
  })

  it('shows the loading page while a slow website thinks, and the stories when it has answered', async () => {
    await world.fresh({ launch: false })
    world.server.setFeed({ mode: 'ok', delayMs: 7000 })
    await world.launch({ story: false })
    await world.until(/Finding your next read/, { timeout: 20_000 })
    world.shot('loading')
    await world.untilStory(30_000)
  })

  const failures = [
    ['a server error', { mode: 'error500' }, /Plax is temporarily unavailable/],
    ['too many requests', { mode: 'error429' }, /Too many requests/],
    ['an answer the app cannot read', { mode: 'invalid' }, /unreadable response/],
    ['an answer that says the feed is down', { mode: 'serviceError' }, /Plax is temporarily unavailable/],
  ]
  for (const [name, mode, message] of failures) {
    it(`says what went wrong when the website answers with ${name}`, async () => {
      await world.fresh({ launch: false })
      world.server.setFeed({ ...mode, delayMs: 0 })
      await world.launch({ story: false })
      await world.until('Try again', { timeout: 30_000 })
      assert.match(world.words().join(' '), message)
      world.server.setFeed({ mode: 'ok' })
      await world.press('Try again')
      await world.untilStory()
    })
  }

  it('says there are no stories when the feed comes back empty', async () => {
    await world.fresh({ launch: false })
    world.server.setFeed({ mode: 'empty', delayMs: 0 })
    await world.launch({ story: false })
    await world.until('No stories right now', { timeout: 30_000 })
    world.server.setFeed({ mode: 'ok' })
    await world.press('Try again')
    await world.untilStory()
  })
})

describe('with stories on the screen', () => {
  it('opens on the stories it kept, and says it is offline, when there is no connection at the start; its banner tries again', async () => {
    await world.fresh()
    const seen = world.headline()
    d.forceStop(PKG)
    world.server.setFeed({ mode: 'drop' })
    await world.launch()
    // What was looked at does not come back, so the first story is the next one of the stories the app kept.
    const kept = world.headline()
    assert.notEqual(kept, '', 'a story from what the app kept is on the screen')
    assert.notEqual(kept, seen, 'the story the reader had seen does not come back')
    await world.until(/You are offline\. Showing the last stories we loaded/, { timeout: 30_000 })
    world.shot('offline-banner')
    world.server.setFeed({ mode: 'ok' })
    await world.press({ id: 'feed-banner' })
    await world.untilGone({ id: 'feed-banner' }, { timeout: 30_000 })
  })

  it('goes on reading with no connection, then asks for more when it is back', async () => {
    // The website gives five stories and is gone by the time the reader nears the fifth: those five are all there is to read.
    await world.fresh({ launch: false })
    world.server.setFeed({ cap: 5 })
    await world.launch()
    world.server.setFeed({ mode: 'drop' })
    let nodes = await world.settle()
    const read = [titleOf(nodes)]
    for (let swipe = 0; swipe < 4; swipe += 1) {
      nodes = await world.swipe('up')
      read.push(titleOf(nodes))
    }
    assert.equal(new Set(read.filter(Boolean)).size, 5, `the five stories were read (${read.join(' | ')})`)
    // At the end of what it has, a swipe moves nothing, and the line over the stories says why.
    const end = world.pageName(nodes)
    nodes = await world.swipe('up', { expectChange: false, timeout: 8_000 })
    assert.equal(world.pageName(nodes), end, 'the last story stays where it is')
    await world.until(/You are offline/, { timeout: 20_000 })
    assert.ok(d.pidOf(PKG), 'the app is still running')
    world.shot('offline-at-the-end')
    // The website is back: the line over the stories asks again, and the reader goes on to a story not read yet.
    world.server.setFeed({ mode: 'ok' })
    world.server.clearLog()
    await world.press({ id: 'feed-banner' })
    await world.untilGone({ id: 'feed-banner' }, { timeout: 30_000 })
    // An ad page may stand between the fifth story and the sixth.
    let next = titleOf(await world.swipe('up'))
    if (next === '') next = titleOf(await world.swipe('up'))
    assert.ok(next && !read.includes(next), `a story that was not read follows (${next})`)
    const [asked] = world.asked('/news/api/feed')
    assert.ok(asked?.query.exclude, 'the app told the website which stories it already had')
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })
})

describe('the app in the background', () => {
  it('is not asking the website for anything while it is out of sight', async () => {
    await world.fresh()
    d.home()
    await d.sleep(1500)
    world.server.clearLog()
    await d.sleep(6000)
    assert.deepEqual(world.asked().map((entry) => entry.path), [])
    d.startApp(PKG)
    await world.untilStory()
  })
})
