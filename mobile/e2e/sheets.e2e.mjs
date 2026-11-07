// The things that open from a story or from the menu: Go deeper, Share, the publisher's page, Contact, About, the account.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PKG, SITE, d, mkdirShots, openWorld } from './lib/app.mjs'

let world
before(async () => {
  mkdirShots()
  world = await openWorld()
  world.phone({})
})
after(async () => world?.close())

/** The app is in front again after something else was in front of it. */
const backInApp = () => world.backInApp()

describe('Go deeper', () => {
  it('shows a few facts about the story, numbered, with the note that an AI wrote them', async () => {
    await world.fresh()
    await world.press('Go deeper on this story')
    await world.until({ id: 'deeper-sheet' })
    await world.until({ id: 'insight-3' })
    const words = world.words().join(' ')
    assert.match(words, /Second, what it changes for readers/)
    assert.match(words, /Written by AI/)
    world.shot('deeper')
    const asked = world.asked('/news/api/deeper')
    assert.equal(asked.length, 1)
    assert.equal(JSON.parse(asked[0].body).lang, 'en')
  })

  it('asks again in the other language from its chip, once, and keeps both', async () => {
    await world.press({ id: 'deeper-hindi' })
    await world.until({ id: 'insight-3' })
    assert.equal(world.asked('/news/api/deeper').length, 2)
    assert.equal(JSON.parse(world.asked('/news/api/deeper')[1].body).lang, 'hi')
    await world.press({ id: 'deeper-english' })
    await world.until({ id: 'insight-3' })
    assert.equal(world.asked('/news/api/deeper').length, 2, 'the English facts were kept')
  })

  it('closes with the cross and with the back button', async () => {
    await world.press({ id: 'sheet-close' })
    await world.untilGone({ id: 'deeper-sheet' })
    await world.press('Go deeper on this story')
    await world.until({ id: 'deeper-sheet' })
    d.back()
    await world.untilGone({ id: 'deeper-sheet' })
  })

  it('says it could not, and tries again from the button', async () => {
    await world.fresh()
    world.server.state.deeper.mode = 'error'
    await world.press('Go deeper on this story')
    await world.until({ id: 'deeper-error' })
    assert.match(world.words().join(' '), /Could not load more right now/)
    world.server.state.deeper.mode = 'ok'
    await world.press({ id: 'deeper-retry' })
    await world.until({ id: 'insight-1' })
  })

  it('shows that it is looking while a slow answer is on its way', async () => {
    await world.fresh()
    world.server.state.deeper.delayMs = 3500
    await world.press('Go deeper on this story')
    await world.until('Finding more…', { timeout: 15_000, label: 'the note that it is looking' })
    await world.until({ id: 'insight-1' }, { timeout: 15_000 })
    world.server.state.deeper.delayMs = 0
  })
})

describe('Share', () => {
  it('opens the phone’s share sheet with the story, and leaves the app where it was', async () => {
    await world.fresh()
    const headline = world.headline()
    await world.press('Share story')
    await d.waitFor(() => /Chooser|Resolver|Sharesheet|intentresolver/i.test(d.focus()), { timeout: 15_000, label: 'the share sheet' })
    world.shot('share-sheet')
    d.back()
    await backInApp()
    await world.untilStory()
    assert.equal(world.headline(), headline)
  })

  it('asked the website for a page of its own for the story, sending only the story', async () => {
    const asked = world.asked('/news/api/share')
    assert.equal(asked.length, 1)
    const body = JSON.parse(asked[0].body)
    assert.deepEqual(Object.keys(body).sort(), ['category', 'content', 'id', 'image', 'publishedAt', 'sig', 'source', 'sourceUrl', 'title'].concat(body.section === undefined ? [] : ['section']).sort())
    assert.equal(asked[0].headers.cookie, undefined)
  })

  it('still shares when the website cannot make the page', async () => {
    await world.fresh()
    world.server.state.share.mode = 'error'
    await world.press('Share story')
    await d.waitFor(() => /Chooser|Resolver|Sharesheet|intentresolver/i.test(d.focus()), { timeout: 15_000, label: 'the share sheet' })
    d.back()
    await backInApp()
  })
})

describe('the full story at its publisher', () => {
  it('opens the publisher’s page in the browser when the headline is pressed, and comes back with the back button', async () => {
    await world.fresh()
    const headline = world.headline()
    await world.press({ id: 'headline' })
    await world.untilBrowser()
    world.shot('publisher-page')
    d.back()
    await backInApp()
    await world.untilStory()
    assert.equal(world.headline(), headline)
  })
})

describe('Contact us', () => {
  it('shows the address and who makes the app, with no account needed', async () => {
    await world.fresh()
    await world.choose('menu-contact')
    await world.until({ id: 'contact-sheet' })
    const words = world.words().join(' ')
    assert.match(words, /richardhenryjames64@gmail\.com/)
    assert.match(words, /Plax Labs/)
    world.shot('contact')
  })

  it('opens the contact page in the browser', async () => {
    await world.press({ id: 'contact-page' })
    await world.untilBrowser()
    d.back()
    await backInApp()
  })

  it('never leaves the reader with nothing: the address is copied when the phone has no mail app', async () => {
    await world.until({ id: 'contact-sheet' })
    await world.press({ id: 'contact-email' })
    // Either a mail app opened (the reader writes), or the address was copied and the app says so for a few seconds: looked for at once and
    // again and again, since a look at the screen takes seconds on the emulator.
    const mailOpened = await d.waitFor(() => !d.focus().includes(PKG) || (/No email app is available/.test(d.labels(d.dump()).join(' ')) ? 'noted' : false), {
      timeout: 8_000,
      interval: 0,
      label: 'a mail app, or the note that the address was copied',
    })
    if (mailOpened !== 'noted') {
      d.back()
      await backInApp()
    }
  })
})

describe('About', () => {
  it('says what the app is, what it does with the reader’s data, its version, and that it shows ads', async () => {
    await world.fresh()
    await world.choose('menu-about')
    await world.until({ id: 'about-dialog' })
    const words = world.words().join(' ')
    assert.match(words, /Bite-sized news and ideas from Plax Labs/)
    assert.match(words, /Version 2\.0\.0/)
    assert.match(words, /Plax shows ads from Google/)
    world.shot('about')
    await world.press('Done')
    await world.untilGone({ id: 'about-dialog' })
  })

  it('opens the privacy policy in the browser', async () => {
    await world.choose('menu-about')
    await world.press('Privacy policy')
    await world.untilBrowser()
    d.back()
    await backInApp()
  })
})

describe('the account', () => {
  it('is optional: the sheet says so, and offers Google', async () => {
    await world.fresh()
    await world.choose('menu-account')
    await world.until({ id: 'account-sheet' })
    const words = world.words().join(' ')
    assert.match(words, /Plax works without an account/)
    assert.ok(world.find({ id: 'account-sign-in' }))
    world.shot('account')
  })

  it('says sign-in is unavailable, and keeps working, when the account service cannot be reached', async () => {
    await world.press({ id: 'account-sign-in' })
    await world.until(/Sign-in is temporarily unavailable/)
    assert.ok(world.find({ id: 'account-sign-in' }), 'the button is there to try again')
    d.back()
    await world.untilGone({ id: 'account-sheet' })
    await world.untilStory()
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })
})

describe('the menu’s own rows', () => {
  it('has "Privacy policy" that opens the policy in the browser', async () => {
    await world.fresh()
    await world.choose('menu-privacy')
    await world.untilBrowser()
    d.back()
    await backInApp()
    assert.ok(SITE.startsWith('http://10.0.2.2'))
  })
})
