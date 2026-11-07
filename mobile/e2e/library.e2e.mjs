// Saving stories to read later: they stay on the phone, even offline, and survive the app being closed.
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

describe('saved stories', () => {
  // The notes that say "Saved on this phone" and "Removed from saved stories" live two seconds, less than a look at the screen takes on the
  // emulator: the unit tests have their words, and here the button and the list are the proof.
  it('saves the story on the screen, and marks the button', async () => {
    await world.fresh()
    const headline = world.headline()
    await world.press('Save story')
    await world.until('Remove saved story')
    await world.choose('menu-saved')
    await world.untilStory()
    assert.equal(world.headline(), headline, 'Saved lists the story')
    world.shot('saved-one')
  })

  it('keeps it when the app is closed and opened again, and offline', async () => {
    const headline = world.headline()
    world.server.setFeed({ mode: 'drop' })
    await world.relaunch({ story: false })
    await world.until({ id: 'headline' }, { timeout: 30_000 })
    await world.choose('menu-saved')
    await world.untilStory()
    assert.equal(world.headline(), headline)
  })

  it('removes it from the list with the same button', async () => {
    await world.press('Remove saved story')
    await world.until('Keep the good reads.')
  })

  it('saves a few, in the order they were saved with the newest first, and clears them all after asking', async () => {
    world.server.reset()
    await world.fresh()
    const first = world.headline()
    await world.press('Save story')
    await world.swipe('up')
    const second = world.headline()
    await world.press('Save story')
    await world.choose('menu-saved')
    await world.untilStory()
    assert.equal(world.headline(), second, 'the newest first')
    await world.swipe('up')
    assert.equal(world.headline(), first)
    await world.menu()
    await world.press({ id: 'menu-clear-saved' })
    await world.until({ id: 'clear-saved-dialog' })
    await world.press('Cancel')
    await world.untilGone({ id: 'clear-saved-dialog' })
    await world.menu()
    await world.press({ id: 'menu-clear-saved' })
    await world.press('Clear')
    await world.until('Keep the good reads.')
  })

  it('cannot save more than the limit, and says so', { skip: 'the limit (200) is covered by the unit tests; saving 200 stories by hand takes too long' }, () => {})

  it('does not crash or stop while saving and removing again and again', async () => {
    await world.fresh()
    for (let round = 0; round < 12; round += 1) {
      await world.press({ id: 'save' })
      await d.sleep(300)
    }
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
    assert.ok(d.pidOf(PKG))
  })
})
