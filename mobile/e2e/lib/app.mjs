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

/**
 * How long the ad strip is waited for after a start. On a first run no room is kept for it: it comes 7 to 13 seconds after the first story on the
 * emulator, the story shrinks to make room, and the buttons under it go up. Whatever is found or tapped in those seconds may be somewhere else by the time
 * the tap lands, so the first thing done with a page waits for the strip (the app keeps it, once it has come, wherever a story is).
 */
const STRIP_WAIT_MS = 30_000
const stripIn = (nodes) => {
  const strip = d.find(nodes, { id: 'ad-strip' })
  return Boolean(strip && strip.height > 0)
}

export async function openWorld({ install = true, port = 8787 } = {}) {
  d.assertTestEmulator()
  const server = createMockServer({ port })
  await server.start()
  d.wake()
  // A phone that has just started is busy with its own work for minutes and shows "not responding" for its own processes: it is left alone.
  await d.untilSettled()
  if (install && !(process.env.PLAX_E2E_SKIP_INSTALL === '1')) d.installApk(APK)
  const world = new World(server)
  world.phone()
  return world
}

export class World {
  constructor(server) {
    this.server = server
    /** When the app last started, while it is not known yet whether the ad strip has come (see STRIP_WAIT_MS). */
    this.stripWaitFrom = null
    this.upright = true
  }

  /** The phone as a reader would have it: upright, English, light, text at its normal size. */
  phone({ font = 1, night = false, landscape = false, locale = 'en-US' } = {}) {
    d.setFontScale(font)
    d.setNightMode(night)
    d.setRotation(landscape)
    d.setLocale(locale)
    d.shell('settings put global window_animation_scale 1')
    this.upright = !landscape
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
    this.stripWaitFrom = Date.now()
    if (story) {
      await this.untilStory()
      this.stripWaitFrom = Date.now()
    }
  }

  /**
   * Waits, before the first thing is done with a page after a start, until the ad strip has come and the story has made room for it, or until it is
   * clear that it will not come: no story in view (the strip belongs under one), a phone on its side (no strip on a screen under 500 dp), or
   * STRIP_WAIT_MS gone.
   */
  async untilLaidOut() {
    const from = this.stripWaitFrom
    this.stripWaitFrom = null
    if (from === null || !this.upright) return
    const end = from + STRIP_WAIT_MS
    if (Date.now() >= end) return
    await d.waitFor(
      () => {
        if (Date.now() >= end) return true
        const nodes = d.dump()
        return !pageView(nodes).pick('headline') || stripIn(nodes)
      },
      { timeout: STRIP_WAIT_MS + 20_000 },
    )
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

  /** Waits for a story's headline to be in view: a headline of the page next to it, cut off by the pager, is not the first story. */
  async untilStory(timeout = 25_000) {
    return d.waitFor(() => pageView(d.dump()).pick('headline'), { timeout, label: 'the first story' })
  }

  async press(query, options) {
    await this.untilLaidOut()
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

  /** What the page in view is, wherever it stands on the screen: its kind and its headline (an ad page has none). */
  pageName(nodes = d.dump()) {
    const { pick } = pageView(nodes)
    const node = pick('headline') ?? pick('ad-page') ?? pick('caught-up')
    return node ? `${node.id}|${node.desc || node.text}` : ''
  }

  /** What the pager shows now, as one string: which page, and where it stands. */
  pageKey(nodes = d.dump()) {
    const { pick } = pageView(nodes)
    const node = pick('headline') ?? pick('ad-page') ?? pick('caught-up')
    return node ? `${node.id}|${node.desc || node.text}|${node.bounds.top}|${node.bounds.bottom}` : ''
  }

  /**
   * Waits until the pager is at rest on a page: what is in view is the same, in the same place, in two looks in a row (a swipe takes seconds on
   * the emulator, which draws in software: its frames take 50 to 150 ms). `from` is the name of a page that must have been left first (a swipe
   * that has not begun to move the pager yet is not at rest; and a page that only moved on the screen, when the line over the stories came or
   * went and the pager grew or shrank under the finger, has not been left). Gives back the screen of the last look.
   */
  async settle({ timeout = 25_000, from = null } = {}) {
    const end = Date.now() + timeout
    let before = ''
    let nodes = d.dump()
    while (Date.now() < end) {
      const key = this.pageKey(nodes)
      if (key !== '' && key === before && this.pageName(nodes) !== from) return nodes
      before = key
      nodes = d.dump()
    }
    return nodes
  }

  /**
   * One swipe, and then the wait for the page to come to rest (another page than the one it was, unless `expectChange` is false: a swipe at the
   * end of the list moves nothing, and `timeout` is how long to wait for a page that does not come). Gives back the screen once it has.
   * A swipe that the slow emulator handled too poorly to turn the page leaves the page where it was, as it does a reader who lets go early;
   * with `expectChange` it is made again, longer and slower, up to `tries` times, and only a page that takes none of them has failed.
   */
  async swipe(direction = 'up', { expectChange = true, timeout = 25_000, tries = 3 } = {}) {
    await this.untilLaidOut()
    const start = d.dump()
    const from = expectChange ? this.pageName(start) : null
    const area = pageView(start).pager?.bounds ?? null
    const attempts = expectChange ? tries : 1
    let nodes
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      d.swipePage(direction, { area, ...(attempt === 0 ? {} : { ms: 600 + 200 * attempt }) })
      await d.sleep(300)
      nodes = await this.settle({ from, timeout: attempt + 1 < attempts ? Math.min(timeout, 12_000) : timeout })
      if (!expectChange || this.pageName(nodes) !== from) break
    }
    return nodes
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

  /**
   * The element with this test id on the page in view, or nothing. The pages on either side of it are in the accessibility tree too (cut off
   * by the pager), so asking the whole tree for "a headline" can answer with the next story's while the one in view is still a placeholder.
   */
  inView(id, nodes = d.dump()) {
    return pageView(nodes).pick(id)
  }

  /** Waits until the page in view has an element with this test id, and gives it back. */
  untilInView(id, { timeout = 15_000, label } = {}) {
    return d.waitFor(() => this.inView(id), { timeout, label: label ?? `${id} on the page in view` })
  }

  /** Waits for the browser to come in front: a cold Chrome takes seconds on the emulator. */
  untilBrowser(timeout = 60_000) {
    return d.waitFor(() => /CustomTabActivity|com\.android\.chrome/i.test(d.focus()), { timeout, label: 'the browser' })
  }

  /**
   * The app is in front again after something else was in front of it (the caller has pressed back once): waits for it, since it comes to the
   * front a moment after the press, and a second press before it has would close what the app itself has open (a sheet); then, if it does not
   * come, backs out of it again (a mail or browser app may take more than one press, with a first-run screen of its own) and, if that does not
   * do it, opens the app again.
   */
  async backInApp() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (await d.waitFor(() => d.focus().includes(PKG), { timeout: 5_000, interval: 500 })) return
      d.back()
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
