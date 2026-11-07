// A phone is not kind: it turns, it changes its text size and its theme while an app is open, it takes memory back, and readers tap anywhere.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PKG, d, mkdirShots, openWorld } from './lib/app.mjs'

let world
before(async () => {
  mkdirShots()
  world = await openWorld()
  world.phone({})
})
after(async () => world?.close())

const healthy = () => assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })

describe('while the app is open', () => {
  it('turns with the phone, and back, again and again, keeping the story', async () => {
    await world.fresh()
    await world.swipe('up')
    const headline = world.headline()
    for (let turn = 0; turn < 4; turn += 1) {
      d.setRotation(true)
      await d.sleep(1800)
      assert.ok(world.find({ id: 'headline' }), 'a story shows on its side')
      d.setRotation(false)
      await d.sleep(1800)
    }
    await world.until({ id: 'headline' })
    assert.equal(world.headline(), headline)
    healthy()
  })

  it('follows a change of the phone’s text size without being restarted', async () => {
    await world.fresh()
    const pid = d.pidOf(PKG)
    d.setFontScale(1.5)
    await d.sleep(2500)
    assert.ok(world.find({ id: 'headline' }), 'the story is still there')
    assert.equal(d.pidOf(PKG), pid, 'the app was not restarted')
    d.setFontScale(1)
    await d.sleep(2000)
    await world.until({ id: 'headline' })
    healthy()
  })

  it('follows a change of the phone’s theme, and the reader’s own choice wins', async () => {
    await world.fresh()
    d.setNightMode(true)
    await d.sleep(2000)
    world.shot('stress-night-system')
    assert.ok(world.find({ id: 'headline' }))
    d.setNightMode(false)
    await d.sleep(1500)
    healthy()
  })

  it('keeps going when the phone takes its memory back', async () => {
    await world.fresh()
    d.shell(`am send-trim-memory ${PKG} RUNNING_CRITICAL`, { allowFailure: true })
    await d.sleep(1500)
    await world.swipe('up')
    assert.ok(world.find({ id: 'headline' }))
    healthy()
  })

  it('goes to the background and comes back ten times', async () => {
    await world.fresh()
    for (let round = 0; round < 10; round += 1) {
      d.home()
      await d.sleep(700)
      d.startApp(PKG)
      await d.sleep(900)
    }
    await world.until({ id: 'headline' })
    healthy()
  })

  it('opens again, on a story it had not shown, after the phone has ended its process in the background', async () => {
    await world.fresh()
    const first = world.headline()
    await world.swipe('up')
    await world.swipe('up')
    d.home()
    await d.sleep(1200)
    // The phone ends only a process that is in the background and cached: asked again until it has, as it would when it needs the memory.
    await d.waitFor(
      () => {
        d.shell(`am kill ${PKG}`)
        return d.pidOf(PKG) === ''
      },
      { timeout: 20_000, interval: 1_000, label: 'the phone to end the process' },
    )
    d.startApp(PKG)
    await world.untilStory()
    // What was looked at does not come back, so the app opens on the next story it had not shown.
    const after = world.headline()
    assert.notEqual(after, '', 'a story is on the screen')
    assert.notEqual(after, first, 'a story the reader had already seen does not come back')
    healthy()
  })
})

describe('a reader who taps anywhere', () => {
  it('cannot make it crash or stop: 400 random touches', async () => {
    await world.fresh()
    d.logcatClear()
    d.shell(`monkey -p ${PKG} --pct-syskeys 0 --pct-appswitch 0 --pct-nav 0 --pct-majornav 0 --pct-trackball 0 --pct-motion 40 --throttle 100 -s 20260 400`, { timeout: 240_000, allowFailure: true })
    await d.sleep(2000)
    healthy()
    d.forceStop(PKG)
    await world.launch()
  })

  it('cannot make it crash or stop: 400 more, in Hindi with the largest text', async () => {
    world.phone({ font: 1.5 })
    await world.fresh()
    await world.choose('menu-language-hi')
    await world.untilStory()
    d.logcatClear()
    d.shell(`monkey -p ${PKG} --pct-syskeys 0 --pct-appswitch 0 --pct-nav 0 --pct-majornav 0 --pct-trackball 0 --pct-motion 40 --throttle 100 -s 777 400`, { timeout: 240_000, allowFailure: true })
    await d.sleep(2000)
    healthy()
    world.phone({})
  })
})
