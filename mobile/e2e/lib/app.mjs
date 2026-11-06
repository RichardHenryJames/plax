// The world the device tests live in: the isolated emulator, the mock website the e2e build talks to, and the app itself. Each scenario file
// opens it, resets what it needs, and drives the app the way a reader does (taps and swipes on what the accessibility tree shows).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as d from './device.mjs'
import { pageView } from './fit.mjs'
import { createMockServer } from './mock-server.mjs'

export const PKG = 'com.plaxlabs.news.e2e'
export const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const APK = process.env.PLAX_E2E_APK ?? path.join(mobile, 'artifacts', 'plax-2.0.0-e2e.apk')
export const SHOTS = path.join(mobile, 'artifacts', 'e2e-shots')
export const SITE = 'http://10.0.2.2:8787/news'

export { d }

/** Everything the app puts on its first page, found by the test ids the app gives them. */
const STORY = ['headline', 'tag', 'credit', 'body', 'save', 'share', 'menu-button']

export async function openWorld({ install = true, port = 8787 } = {}) {
  d.assertTestEmulator()
  const server = createMockServer({ port })
  await server.start()
  d.wake()
  if (install && !(process.env.PLAX_E2E_SKIP_INSTALL === '1')) d.installApk(APK)
  const world = new World(server)
  world.phone()
  return world
}

export class World {
  constructor(server) {
    this.server = server
  }

  /** The phone as a reader would have it: upright, English, light, text at its normal size. */
  phone({ font = 1, night = false, landscape = false, locale = 'en-US' } = {}) {
    d.setFontScale(font)
    d.setNightMode(night)
    d.setRotation(landscape)
    d.setLocale(locale)
    d.shell('settings put global window_animation_scale 1')
  }

  async close() {
    d.forceStop(PKG)
    d.setFontScale(1)
    d.setNightMode(false)
    d.setRotation(false)
    await this.server.stop()
  }

  /** A first run: nothing kept on the phone, the website as it is (or as the test has set it, with `keepWebsite`), the app started. */
  async fresh({ launch = true, keepWebsite = false } = {}) {
    d.forceStop(PKG)
    d.clearData(PKG)
    if (!keepWebsite) this.server.reset()
    this.server.clearLog()
    d.logcatClear()
    if (launch) await this.launch()
  }

  /** Starts the app with the data it has, and waits for the first page. */
  async launch({ story = true } = {}) {
    d.forceStop(PKG)
    d.logcatClear()
    d.startApp(PKG)
    if (story) await this.untilStory()
  }

  /** The app is closed (swiped away) and opened again, with everything it kept. */
  relaunch(options) {
    return this.launch(options)
  }

  screen() {
    return d.dump()
  }

  words() {
    return d.labels(d.dump())
  }

  find(query) {
    return d.find(d.dump(), query)
  }

  /** Waits until the element is on the screen (by text, description or id) and gives it back. */
  async until(query, { timeout = 15_000, label } = {}) {
    return d.waitFor(() => d.find(d.dump(), query), { timeout, label: label ?? JSON.stringify(query) })
  }

  /** Waits until the element is gone. */
  async untilGone(query, { timeout = 15_000, label } = {}) {
    return d.waitFor(() => !d.find(d.dump(), query), { timeout, label: label ?? `${JSON.stringify(query)} to go` })
  }

  async untilStory(timeout = 25_000) {
    return this.until({ id: 'headline' }, { timeout, label: 'the first story' })
  }

  async press(query, options) {
    const node = await d.press(query, options)
    await d.sleep(350)
    return node
  }

  async menu() {
    await this.press({ id: 'menu-button' })
    await this.until({ id: 'menu-panel' }, { label: 'the menu' })
  }

  /** Opens the menu and chooses a row by its test id (menu-topics, menu-saved ...). */
  async choose(id) {
    await this.menu()
    await this.press({ id })
    await d.sleep(500)
  }

  /** What the pager shows now, as one string: which page, and where it stands. */
  pageKey(nodes = d.dump()) {
    const { pick } = pageView(nodes)
    const node = pick('headline') ?? pick('ad-page') ?? pick('caught-up')
    return node ? `${node.id}|${node.desc || node.text}|${node.bounds.top}|${node.bounds.bottom}` : ''
  }

  /**
   * Waits until the pager is at rest on a page: what is in view is the same, in the same place, in two looks in a row (a swipe takes seconds on
   * the emulator, which draws in software: its frames take 50 to 150 ms). `from` is a page that must have been left first (a swipe that has not
   * begun to move the pager yet is not at rest). Gives back the screen of the last look.
   */
  async settle({ timeout = 25_000, from = null } = {}) {
    const end = Date.now() + timeout
    let before = ''
    let nodes = d.dump()
    while (Date.now() < end) {
      const key = this.pageKey(nodes)
      if (key !== '' && key === before && key !== from) return nodes
      before = key
      nodes = d.dump()
    }
    return nodes
  }

  /**
   * One swipe, and then the wait for the page to come to rest (somewhere else than where it was, unless `expectChange` is false: a swipe at the
   * end of the list moves nothing, and `timeout` is how long to wait for a page that does not come). Gives back the screen once it has.
   */
  async swipe(direction = 'up', { expectChange = true, timeout = 25_000 } = {}) {
    const from = expectChange ? this.pageKey() : null
    d.swipePage(direction)
    await d.sleep(300)
    return this.settle({ from, timeout })
  }

  /** What the page in view holds, as a reader reads it. */
  story() {
    const { pick } = pageView(d.dump())
    return Object.fromEntries(STORY.map((id) => [id, pick(id)]))
  }

  /** The headline on the page in view. */
  headline() {
    const node = pageView(d.dump()).pick('headline')
    return node?.desc || node?.text || ''
  }

  /** Waits for the browser to come in front: a cold Chrome takes seconds on the emulator. */
  untilBrowser(timeout = 60_000) {
    return d.waitFor(() => /CustomTabActivity|com\.android\.chrome/i.test(d.focus()), { timeout, label: 'the browser' })
  }

  /**
   * The app is in front again after something else was in front of it: back out of it (a mail or browser app may take more than one press, with
   * a first-run screen of its own) and, if that does not do it, open the app again.
   */
  async backInApp() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (d.focus().includes(PKG)) return
      d.back()
      await d.sleep(1500)
    }
    if (!d.focus().includes(PKG)) d.startApp(PKG)
    await d.waitFor(() => d.focus().includes(PKG), { timeout: 10_000, label: 'the app to come back' })
  }

  shot(name) {
    return d.screenshot(path.join(SHOTS, `${name}.png`))
  }

  /** What the phone says about the app since the logs were cleared: crashes, "not responding", and errors from the JavaScript. */
  health() {
    return { crashes: d.crashes(PKG), anrs: d.anrs(PKG), jsErrors: d.jsErrors() }
  }

  /** What the app asked the mock website for. */
  asked(prefix = '') {
    return this.server.requests(prefix)
  }
}

export const pause = d.sleep

export function mkdirShots() {
  fs.mkdirSync(SHOTS, { recursive: true })
}
