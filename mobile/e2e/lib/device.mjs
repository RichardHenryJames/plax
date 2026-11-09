// Drives the isolated Plax_News_Test emulator over adb: what a reader sees (the accessibility tree of the screen), what they do (tap, swipe,
// back, type) and what the phone says about it (crashes, ANRs). The tests in e2e/ use it; it is the Node version of the PowerShell helpers
// the native app's device tests were run with.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SDK = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'Android', 'Sdk')
export const ADB = process.env.ADB ?? path.join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
export const SERIAL = process.env.PLAX_E2E_SERIAL ?? 'emulator-5590'
export const AVD = 'Plax_News_Test'

/** What adb says when its own server on this computer is not answering: it starts itself again, and the same command a moment later is answered. */
const SERVER_DOWN = /cannot connect to daemon|daemon still not running|daemon not running|failed to start daemon|server didn't ACK/i

const pauseSync = (ms) => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Runs a command (`run` gives what spawnSync does) again while adb's server is down, up to `tries` times with a pause between: a run of the
 * device tests for an hour is not a failure of the app because adb's server stopped answering for a moment. Any other failure, a command that
 * timed out, and one that could not be started are given back at once.
 */
export function whileServerDown(run, { tries = 4, pauseMs = 3000, pause = pauseSync } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const result = run()
    if (result.error || result.status === 0 || attempt >= tries) return result
    if (!SERVER_DOWN.test(`${result.stdout ?? ''}${result.stderr ?? ''}`)) return result
    pause(pauseMs)
  }
}

export function adb(args, options = {}) {
  const result = whileServerDown(() => spawnSync(ADB, ['-s', SERIAL, ...args], { encoding: options.binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: options.timeout ?? 90_000, input: options.input }))
  if (result.error) throw result.error
  if (!options.allowFailure && result.status !== 0 && !options.quiet) {
    const out = options.binary ? '' : `${result.stdout}${result.stderr}`
    throw new Error(`adb ${args.join(' ')} failed (${result.status}): ${out.trim().slice(0, 400)}`)
  }
  return options.binary ? result.stdout : `${result.stdout ?? ''}${options.stderr ? (result.stderr ?? '') : ''}`
}

export const shell = (command, options) => adb(['shell', command], options)

/** The instrumentation is restricted to the dedicated emulator, never another project's. */
export function assertTestEmulator() {
  const name = execFileSync(ADB, ['-s', SERIAL, 'emu', 'avd', 'name'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim()
  if (name !== AVD) throw new Error(`${SERIAL} is "${name}", not ${AVD}: the device tests only run on their own emulator`)
  if (shell('getprop sys.boot_completed').trim() !== '1') throw new Error('The emulator has not finished booting')
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Repeats a check until it is true (or gives back something), up to a time; null when it never is. When the time is up and the phone is
 * showing the "not responding" dialog of another process (the phone's own System UI, slow on an emulator that draws in software), that
 * dialog is waited out with its own Wait button and the wait goes on, once more: the app under test has not failed.
 */
export async function waitFor(check, { timeout = 20_000, interval = 400, label = '' } = {}) {
  let end = Date.now() + timeout
  let waitedOut = false
  for (;;) {
    const last = await check()
    if (last) return last
    if (Date.now() >= end) {
      if (waitedOut || !waitOutSystemAnr()) break
      waitedOut = true
      end = Date.now() + timeout
      continue
    }
    await sleep(interval)
  }
  if (label) throw new Error(`Timed out after ${timeout} ms waiting for ${label}`)
  return null
}

/** Seconds since the phone started. */
export const uptime = () => Number(shell('cat /proc/uptime', { allowFailure: true }).trim().split(/\s+/)[0]) || 0

/**
 * A phone that has just started is busy for minutes with work of its own (installing, optimising, updating), and Android shows "not
 * responding" for its own processes meanwhile. Waits until it has been up for `minutes`; a phone that has been up longer does not wait.
 */
export async function untilSettled(minutes = 8) {
  const left = minutes * 60 - uptime()
  if (left > 0) await sleep(left * 1000)
}

/**
 * The "not responding" dialog of the phone's own (System UI, the launcher) is pressed away with its Wait button. The dialog of the app
 * under test is never touched: that is a failure the tests must see. Tells whether a dialog was pressed.
 */
export function waitOutSystemAnr() {
  try {
    const owner = /Application Not Responding: (\S+)/.exec(focus())?.[1]
    if (!owner || owner.startsWith('com.plaxlabs.')) return false
    const wait = find(dump(), 'Wait')
    if (!wait) return false
    tap(wait)
    return true
  } catch {
    return false
  }
}

const attr = (tag, name) => {
  // UI Automator writes a value between double quotes, and between single quotes when the value has a double quote in it (a story's text that quotes someone).
  const match = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`).exec(tag)
  return match ? (match[1] ?? match[2]) : ''
}
const unescapeXml = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, body) => {
  if (body[0] === '#') return String.fromCodePoint(body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10))
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[body.toLowerCase()] ?? whole
})

/** One element of the screen, as UI Automator reports it. */
export function parseNodes(xml) {
  const nodes = []
  for (const tag of xml.match(/<node\b[^>]*>/g) ?? []) {
    const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr(tag, 'bounds'))
    if (!bounds) continue
    const [left, top, right, bottom] = bounds.slice(1).map(Number)
    nodes.push({
      text: unescapeXml(attr(tag, 'text')),
      desc: unescapeXml(attr(tag, 'content-desc')),
      id: attr(tag, 'resource-id'),
      cls: attr(tag, 'class'),
      pkg: attr(tag, 'package'),
      clickable: attr(tag, 'clickable') === 'true',
      enabled: attr(tag, 'enabled') === 'true',
      selected: attr(tag, 'selected') === 'true',
      checked: attr(tag, 'checked') === 'true',
      focused: attr(tag, 'focused') === 'true',
      scrollable: attr(tag, 'scrollable') === 'true',
      bounds: { left, top, right, bottom },
      cx: Math.round((left + right) / 2),
      cy: Math.round((top + bottom) / 2),
      width: right - left,
      height: bottom - top,
    })
  }
  return nodes
}

export function dump() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = adb(['shell', 'uiautomator', 'dump', '--compressed', '/sdcard/plax-ui.xml'], { allowFailure: true, quiet: true })
    if (/dumped to/i.test(result)) {
      const xml = adb(['exec-out', 'cat', '/sdcard/plax-ui.xml'], { allowFailure: true, quiet: true })
      if (xml.includes('<hierarchy')) return parseNodes(xml)
    }
  }
  throw new Error('UI Automator could not dump the screen')
}

/** The words on the screen: the text of each element, or what a screen reader says for it. */
export const labels = (nodes) => nodes.map((node) => (node.text || node.desc).replace(/\s+/g, ' ').trim()).filter(Boolean)

/** The first element that matches: a string is its whole text or description, a RegExp is tested on both, an object picks by `id`, `text`, `desc`. */
export function find(nodes, query) {
  const test = (node) => {
    if (typeof query === 'string') return node.text === query || node.desc === query
    if (query instanceof RegExp) return query.test(node.text) || query.test(node.desc)
    if (query.id !== undefined && !(node.id === query.id || node.id.endsWith(`:id/${query.id}`) || node.id.endsWith(`/${query.id}`))) return false
    if (query.text !== undefined && node.text !== query.text) return false
    if (query.desc !== undefined && node.desc !== query.desc) return false
    if (query.contains !== undefined && !(node.text.includes(query.contains) || node.desc.includes(query.contains))) return false
    if (query.clickable !== undefined && node.clickable !== query.clickable) return false
    return true
  }
  return nodes.find(test)
}

export const findAll = (nodes, query) => nodes.filter((node) => find([node], query))

export const tapXY = (x, y) => void shell(`input tap ${Math.round(x)} ${Math.round(y)}`)

/**
 * Where a tap on an element lands: its middle, or the middle of what the status bar does not cover when the element reaches up under it
 * (a line at the top of a page is laid out under the status bar, and a tap on the status bar goes to the status bar, not to the app).
 */
export function tapPoint(node) {
  if (node.bounds.top >= 200) return { x: node.cx, y: node.cy }
  const bar = Number(/type=statusBars frame=\[\d+,\d+\]\[\d+,(\d+)\]/.exec(shell('dumpsys window displays', { allowFailure: true }))?.[1] ?? 0)
  return { x: node.cx, y: node.bounds.top < bar && node.bounds.bottom > bar ? Math.round((bar + node.bounds.bottom) / 2) : node.cy }
}

export const tap = (node) => {
  const { x, y } = tapPoint(node)
  tapXY(x, y)
}

/** Whether two looks found an element in the same place. */
export const samePlace = (a, b) => a.bounds.left === b.bounds.left && a.bounds.top === b.bounds.top && a.bounds.right === b.bounds.right && a.bounds.bottom === b.bounds.bottom

/**
 * A look for an element that answers only once two looks in a row have found it in the same place. A page that is still being laid out moves what is
 * on it: the ad strip comes some seconds after the first story (7 to 13 s on the emulator), the story shrinks to make room, and its buttons go up
 * with it. A look takes seconds, so a button found in one look is somewhere else by the tap, and the tap lands on something else or on nothing.
 */
export function steady(look) {
  let before = null
  return () => {
    const node = look() ?? null
    const held = node !== null && before !== null && samePlace(node, before)
    before = node
    return held ? node : null
  }
}

/**
 * Looks for the element until it is on the screen and has stayed where it is for two looks, then presses it (`steady: false` presses it as soon
 * as it is seen, for what is on the screen only for a moment). When it never comes, the error says what was in front and on the screen
 * (a crash dialog, the launcher, another page), since "not found" alone does not tell a wrong page from a phone that has lost the app.
 */
export async function press(query, { timeout = 15_000, steady: wait = true } = {}) {
  let last = []
  const look = () => find((last = dump()), query)
  const node = await waitFor(wait ? steady(look) : look, { timeout })
  if (!node) {
    throw new Error(`Timed out after ${timeout} ms waiting for ${JSON.stringify(query)} to press. In front: ${focus() || '(nothing)'}. On the screen: ${labels(last).slice(0, 16).join(' | ') || '(nothing)'}`)
  }
  tap(node)
  return node
}

export const swipe = (x1, y1, x2, y2, ms = 250) => void shell(`input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${ms}`)

export function screenSize() {
  const match = /(\d+)x(\d+)/.exec(shell('wm size'))
  if (!match) throw new Error('No screen size')
  return { width: Number(match[1]), height: Number(match[2]) }
}

/**
 * A swipe from the foot of the screen to near the top (to the next story), or the reverse (to the one before); with `area` (the bounds of
 * the pager) from its foot to its head, which keeps the swipe off the ad strip and the status bar however the phone is turned. The path is
 * long, and the swipe not too quick: the emulator draws in software and takes the touch events one at a time, so a short, quick swipe may
 * reach the page as two or three events, the last of them short of the half of a page that turns it, and the page falls back to where it was.
 */
export function swipePage(direction = 'up', { ms = 420, from = 0.86, to = 0.1, area = null } = {}) {
  const { width, height } = screenSize()
  const x = width / 2
  const top = area ? area.top : 0
  const room = area ? area.bottom - area.top : height
  const start = top + room * (area ? 0.94 : from)
  const end = top + room * (area ? 0.05 : to)
  if (direction === 'up') swipe(x, start, x, end, ms)
  else swipe(x, end, x, start, ms)
}

export const back = () => void shell('input keyevent KEYCODE_BACK')
export const home = () => void shell('input keyevent KEYCODE_HOME')
export const key = (name) => void shell(`input keyevent ${name}`)

export function wake() {
  shell('input keyevent KEYCODE_WAKEUP', { allowFailure: true })
  shell('wm dismiss-keyguard', { allowFailure: true })
}

export function screenshot(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, adb(['exec-out', 'screencap', '-p'], { binary: true }))
  return file
}

// The app --------------------------------------------------------------------------------------------------------------------------------
export const startApp = (pkg, activity = '.MainActivity') => adb(['shell', 'am', 'start', '-W', '-n', `${pkg}/${activity}`])
export const forceStop = (pkg) => void shell(`am force-stop ${pkg}`)
export const clearData = (pkg) => void shell(`pm clear ${pkg}`)
export const uninstall = (pkg) => adb(['uninstall', pkg], { allowFailure: true, quiet: true })
export const installApk = (file, { replace = true } = {}) => adb(['install', ...(replace ? ['-r'] : []), file], { timeout: 300_000 })
export const isInstalled = (pkg) => shell(`pm list packages ${pkg}`).split(/\r?\n/).some((line) => line.trim() === `package:${pkg}`)
export function versionOf(pkg) {
  const out = shell(`dumpsys package ${pkg}`)
  return { name: /versionName=(\S+)/.exec(out)?.[1] ?? '', code: Number(/versionCode=(\d+)/.exec(out)?.[1] ?? 0) }
}

/** The milliseconds `am start -W` reports for a cold start (the app is stopped first). */
export async function coldStartMs(pkg, activity = '.MainActivity') {
  forceStop(pkg)
  await sleep(500)
  const out = startApp(pkg, activity)
  return Number(/TotalTime:\s*(\d+)/.exec(out)?.[1] ?? NaN)
}

export const pidOf = (pkg) => shell(`pidof ${pkg}`, { allowFailure: true }).trim().split(/\s+/)[0] || ''

// What the phone says about the app -------------------------------------------------------------------------------------------------------
export const logcatClear = () => void adb(['logcat', '-c'])
export const logcat = (filters = []) => adb(['logcat', '-d', ...filters], { timeout: 120_000 })
export const crashes = (pkg) => (logcat(['-s', 'AndroidRuntime:E']).match(/FATAL EXCEPTION[\s\S]*?Process: (\S+)/g) ?? []).filter((block) => !pkg || block.includes(pkg)).length
export const anrs = (pkg) => (logcat(['-b', 'events', '-s', 'am_anr']).match(new RegExp(`am_anr.*${pkg.replace(/\./g, '\\.')}`, 'g')) ?? []).length
export const jsErrors = () => (logcat(['-s', 'ReactNativeJS:E']).match(/ReactNativeJS/g) ?? []).length

// The phone's settings ------------------------------------------------------------------------------------------------------------------
export const setFontScale = (scale) => void shell(`settings put system font_scale ${scale}`)
export const setNightMode = (on) => void shell(`cmd uimode night ${on ? 'yes' : 'no'}`)
export function setRotation(landscape) {
  shell('settings put system accelerometer_rotation 0')
  shell(`settings put system user_rotation ${landscape ? 1 : 0}`)
}
export const setLocale = (tag) => void shell(`cmd locale set-app-locales ${tag}`, { allowFailure: true })
export const animationsOff = () => {
  for (const name of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) shell(`settings put global ${name} 0`)
}
export const animationsOn = () => {
  for (const name of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) shell(`settings put global ${name} 1`)
}

/** The window in front: the package and the activity. */
export const focus = () => /mCurrentFocus=Window\{[^ ]+ [^ ]+ ([^}]+)\}/.exec(shell('dumpsys window'))?.[1] ?? ''

/** Clears a system "not responding" dialog if one is in front. */
export function clearSystemDialogs() {
  shell('am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS', { allowFailure: true })
}
