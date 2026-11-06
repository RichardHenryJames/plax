// What the website decides: the app reads public/app-config.json and its update feed, and changes without a new version.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PKG, SITE, d, mkdirShots, openWorld } from './lib/app.mjs'
import { pageView } from './lib/fit.mjs'
import { SOURCES } from './lib/fixtures.mjs'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

let world
before(async () => {
  mkdirShots()
  world = await openWorld()
  world.phone({})
})
after(async () => world?.close())

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const realConfig = () => JSON.parse(fs.readFileSync(path.join(repo, 'public', 'app-config.json'), 'utf8'))
const withConfig = (change) => {
  const config = realConfig()
  change(config)
  world.server.setConfig(config)
}
/** The line under the picture of the story in view (its age, and the publisher's name when it is named). */
const creditNow = () => {
  const node = pageView(d.dump()).pick('credit')
  return node ? node.text || node.desc : ''
}
const namesSource = (text) => SOURCES.some((name) => text.includes(name))

describe('the settings the website gives', () => {
  it('names no publisher over a story, as the website itself does not', async () => {
    withConfig(() => {})
    await world.fresh({ keepWebsite: true })
    const credit = creditNow()
    assert.match(credit, /\d+\s*(min|hour|day)|just now/i, `the age is on the line (${credit})`)
    assert.equal(namesSource(credit), false, `no publisher on the line (${credit})`)
    assert.equal(namesSource(world.words().join(' ')), false, 'no publisher anywhere on the page')
  })

  it('names the publisher when the website says to, without a new version of the app', async () => {
    withConfig((config) => (config.features.sourceName = true))
    await world.fresh({ keepWebsite: true })
    await world.relaunch()
    await d.sleep(2500)
    await world.relaunch()
    const credit = creditNow()
    assert.equal(namesSource(credit), true, `a publisher is named on the line (${credit})`)
    world.shot('publisher-named')
  })

  it('takes the Go deeper button away when the website switches it off', async () => {
    withConfig((config) => (config.features.deeper = false))
    await world.fresh({ keepWebsite: true })
    await world.relaunch()
    await d.sleep(2500)
    await world.relaunch()
    assert.equal(world.find('Go deeper on this story'), undefined)
    assert.ok(world.find('Save story'))
  })

  it('lists the topics the website lists', async () => {
    withConfig((config) => (config.topics = [...config.topics.slice(0, 3), { id: 'cooking', emoji: '🍳', en: 'Cooking', hi: 'खाना' }]))
    await world.fresh({ keepWebsite: true })
    await world.relaunch()
    await d.sleep(2500)
    await world.relaunch()
    await world.choose('menu-topics')
    await world.until('Cooking')
    assert.equal(world.find('Philosophy'), undefined, 'a topic the website no longer lists is gone')
    world.shot('website-topics')
  })

  it('adds a row to the menu that the website lists, and opens its page in the browser', async () => {
    withConfig((config) => (config.links = [{ id: 'help', en: 'Help centre', hi: 'सहायता', url: 'https://plax-rouge.vercel.app/news/contact', build: 'all' }]))
    await world.fresh({ keepWebsite: true })
    await world.relaunch()
    await d.sleep(2500)
    await world.relaunch()
    await world.choose('menu-link-help')
    await world.untilBrowser()
    d.back()
    await world.backInApp()
  })

  it('ignores a settings file it cannot read, and keeps what it had', async () => {
    withConfig(() => {})
    await world.fresh({ keepWebsite: true })
    world.server.setConfig('this is {not json')
    await world.relaunch()
    await d.sleep(2500)
    await world.untilStory()
    assert.deepEqual(world.health(), { crashes: 0, anrs: 0, jsErrors: 0 })
  })
})

describe('a notice from the website', () => {
  const notice = (id, extra = {}) => ({ id, level: 'info', title: { en: 'A word from Plax', hi: 'प्लैक्स की ओर से' }, body: { en: 'The news is now served faster.', hi: 'अब ख़बरें तेज़ी से आती हैं।' }, build: 'all', ...extra })
  // The notice comes up over the story as soon as the settings arrive, and a screen reader (and so the tests) sees only the notice: the app is started without waiting for a story.
  const startWith = async (change) => {
    withConfig(change)
    await world.fresh({ launch: false, keepWebsite: true })
    await world.launch({ story: false })
    await world.until({ id: 'notice-dialog' }, { timeout: 40_000, label: 'the notice' })
  }

  it('is shown once, and not again after the reader has said Done', async () => {
    await startWith((config) => (config.notice = notice('n-1')))
    assert.match(world.words().join(' '), /The news is now served faster/)
    world.shot('notice')
    await world.press('Done')
    await world.untilGone({ id: 'notice-dialog' })
    await world.relaunch()
    await d.sleep(2500)
    assert.equal(world.find({ id: 'notice-dialog' }), undefined)
  })

  it('opens its page from Learn more', async () => {
    await startWith((config) => (config.notice = notice('n-2', { url: 'https://plax-rouge.vercel.app/news/contact' })))
    await world.press('Learn more')
    await world.untilBrowser()
    d.back()
    await world.backInApp()
  })

  it('comes back at the next start when it is important and the reader left without answering', async () => {
    await startWith((config) => (config.notice = notice('n-3', { level: 'important' })))
    d.back()
    await world.untilGone({ id: 'notice-dialog' })
    await world.relaunch({ story: false })
    await world.until({ id: 'notice-dialog' }, { timeout: 40_000, label: 'the notice again' })
    await world.press('Done')
  })
})

describe('a newer version of the website’s build', () => {
  const feed = (version, code) => ({ schemaVersion: 1, versionCode: code, versionName: version, minSdk: 26, apkUrl: `${SITE}/plax-${version}.apk`, sha256: 'a'.repeat(64), size: 30_000_000 })
  const installedVersion = () => /versionName=(\S+)/.exec(d.shell(`dumpsys package ${PKG}`))?.[1]

  /**
   * The offer is made when the look at the website is done and nothing is open. If the screen was busy then (the account still starting up, on a
   * slow emulator), it is made the next time the app is brought to the front, which is what the second try does.
   */
  async function untilOffered() {
    try {
      return await world.until({ id: 'update-dialog' }, { timeout: 15_000 })
    } catch {
      d.home()
      await d.sleep(1200)
      d.startApp(PKG)
      return world.until({ id: 'update-dialog' }, { timeout: 20_000 })
    }
  }

  it('is offered once a day: Later puts it off', async () => {
    withConfig(() => {})
    await world.fresh({ launch: false, keepWebsite: true })
    world.server.state.updates = { mode: 'file', body: JSON.stringify(feed('9.9.9', 999)) }
    await world.launch({ story: false })
    await untilOffered()
    assert.match(world.words().join(' '), /Plax 9\.9\.9 is ready/)
    world.shot('update-offer')
    await world.press('Later')
    await world.untilGone({ id: 'update-dialog' })
    await world.relaunch()
    await d.sleep(3000)
    assert.equal(world.find({ id: 'update-dialog' }), undefined, 'not offered again the same day')
  })

  it('hands the file to the browser with Download, and installs nothing by itself', async () => {
    const before = installedVersion()
    await world.menu()
    await world.press({ id: 'menu-update' })
    await world.until({ id: 'update-dialog' }, { timeout: 20_000 })
    await world.press('Download')
    await world.untilBrowser()
    d.back()
    await world.backInApp()
    assert.equal(installedVersion(), before, 'the app was not replaced')
  })

  it('says it is up to date from the menu when there is nothing newer', async () => {
    world.server.state.updates = { mode: 'file', body: JSON.stringify(feed('2.0.0', 20)) }
    await world.fresh({ keepWebsite: true })
    await world.menu()
    await world.press({ id: 'menu-update' })
    await world.until(/Plax is up to date/, { timeout: 15_000 })
  })

  it('says it cannot check when the website has no feed', async () => {
    world.server.state.updates = { mode: 'none', body: null }
    await world.fresh({ keepWebsite: true })
    await world.menu()
    await world.press({ id: 'menu-update' })
    await world.until(/Cannot check for updates right now/, { timeout: 15_000 })
  })
})
