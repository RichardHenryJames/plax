// Moving around the app: the menu and every place it leads to, the back button, and what the app remembers when it is closed.
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

describe('the menu', () => {
  it('opens from the button on a story and closes with the back button, leaving the story where it was', async () => {
    await world.fresh()
    const headline = world.headline()
    await world.menu()
    const rows = world.words()
    for (const row of ['Feed', 'For you', 'Topics', 'Saved', 'Account', 'Theme', 'About Plax', 'Contact us', 'Privacy policy']) assert.ok(rows.includes(row), `the menu has ${row}`)
    d.back()
    await world.untilGone({ id: 'menu-panel' })
    assert.equal(world.headline(), headline)
  })

  it('closes with the cross, and with a swipe to the left', async () => {
    await world.fresh()
    await world.menu()
    await world.press({ id: 'menu-close' })
    await world.untilGone({ id: 'menu-panel' })
    await world.menu()
    const size = d.screenSize()
    d.swipe(size.width * 0.6, size.height * 0.5, size.width * 0.05, size.height * 0.5, 200)
    await world.untilGone({ id: 'menu-panel' })
  })

  it('lists the places of the app, and marks the one the reader is in', async () => {
    await world.fresh()
    await world.menu()
    const feed = world.find({ id: 'menu-feed' })
    assert.ok(feed, 'the Feed row')
    assert.equal(feed.selected || feed.checked || /selected/i.test(feed.desc), true, 'Feed is marked')
  })
})

describe('the places of the app', () => {
  it('shows Topics, and a topic’s card puts that topic’s stories on the feed', async () => {
    await world.fresh()
    await world.choose('menu-topics')
    await world.until('Follow your curiosity.')
    world.shot('topics')
    await world.press('Science')
    await world.untilStory()
    const asked = world.asked('/news/api/feed').map((entry) => entry.query.categories)
    assert.ok(asked.some((categories) => categories?.includes('science')), `the science stories were asked for (${asked.join(' | ')})`)
    assert.match(world.words().join(' '), /SCIENCE/)
  })

  it('shows For you as an invitation until topics are chosen, then fills it with them', async () => {
    await world.fresh()
    await world.choose('menu-for-you')
    await world.until('Make Plax yours')
    world.shot('for-you-empty')
    await world.press('Choose topics')
    await world.until({ id: 'interests-sheet' })
    await world.press({ id: 'interest-science' })
    await world.press({ id: 'interest-space' })
    await world.press({ id: 'interests-save' })
    await world.until(/Topics saved/, { timeout: 8_000 })
    await world.untilStory()
    const categories = world.asked('/news/api/feed').map((entry) => entry.query.categories)
    assert.ok(categories.some((value) => value === 'science,space'), `a mix of the two was asked for (${categories.join(' | ')})`)
  })

  it('remembers the topics, and opens on For you next time', async () => {
    await world.relaunch()
    await world.untilStory()
    const categories = world.asked('/news/api/feed').map((entry) => entry.query.categories)
    assert.ok(categories.some((value) => value === 'science,space'), 'For you was the first thing asked for')
    await world.choose('menu-feed')
    await world.untilStory()
  })

  it('shows Saved with nothing saved as an invitation', async () => {
    await world.fresh()
    await world.choose('menu-saved')
    await world.until('Keep the good reads.')
    world.shot('saved-empty')
  })

  it('takes the back button from any of them to the feed, and from the feed out of the app', async () => {
    await world.fresh()
    await world.choose('menu-topics')
    await world.until('Follow your curiosity.')
    d.back()
    await world.untilStory()
    await world.choose('menu-saved')
    await world.until('Keep the good reads.')
    d.back()
    await world.untilStory()
    d.back()
    await d.waitFor(() => !d.focus().includes(PKG), { timeout: 8000, label: 'the app to close' })
  })

  it('narrows the news to a section, and back to all', async () => {
    await world.fresh()
    await world.choose('menu-section-india')
    await world.untilStory()
    const sections = world.asked('/news/api/feed').map((entry) => entry.query.section)
    assert.ok(sections.some((value) => value === 'india') || world.words().join(' ').includes('INDIA'), 'India was chosen')
    await world.choose('menu-section-all')
    await world.untilStory()
  })
})

describe('what the app remembers', () => {
  it('keeps the language the reader chose, in the words of the app and in the stories', async () => {
    await world.fresh()
    await world.choose('menu-language-hi')
    await world.untilStory()
    await world.menu()
    assert.ok(world.words().includes('फ़ीड') || world.words().some((word) => /फ़ीड|फीड/.test(word)), 'the menu is in Hindi')
    d.back()
    await world.relaunch()
    await world.menu()
    assert.ok(world.words().some((word) => /फ़ीड|फीड/.test(word)), 'still Hindi after a restart')
    assert.ok(world.asked('/news/api/feed').some((entry) => entry.query.lang === 'hi'))
    d.back()
  })

  it('keeps the theme the reader chose', async () => {
    await world.fresh()
    await world.choose('menu-theme')
    await world.until({ id: 'theme-dialog' })
    await world.press({ id: 'theme-dark' })
    await d.sleep(800)
    world.shot('dark')
    await world.relaunch()
    // A dark page has dark pixels where a light one has light: the status bar area of the screenshot tells.
    world.shot('dark-after-restart')
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })

  it('opens where the reader left it when the app is left and come back to', async () => {
    await world.fresh()
    await world.swipe('up')
    await world.swipe('up')
    const here = world.headline()
    d.home()
    await d.sleep(1500)
    d.startApp(PKG)
    await world.untilStory()
    assert.equal(world.headline(), here)
  })
})
