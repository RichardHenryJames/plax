// Runs the device tests one suite at a time (`npm run test:device`), so that a computer that falls asleep in the middle of a run costs one suite and not all of them.
//
//   node scripts/run-device-tests.mjs                     every suite, in the order of SUITES
//   node scripts/run-device-tests.mjs smoke reading       only those (the names of e2e/<name>.e2e.mjs)
//   PLAX_E2E_SKIP_INSTALL=1                               the e2e build is on the phone already (by default the first suite installs it, the others do not)
//
// Why: a dev machine that hibernates while it is idle (or a laptop whose lid is closed) pauses the test run and the emulator for hours. adb then times
// out, the test that was running "fails", every test after it fails or is cancelled with time-outs, and the run looks like a regression that is not
// one (on 8 November 2026 a run of 75 minutes took 13 hours and 13 tests failed, three of them tests that had passed twice before). The wall clock
// moves against the uptime by as long as the computer slept, and that is what is watched here: a suite whose run was cut by a sleep does not count,
// and is run again on an emulator started afresh. A suite that fails with no sleep in it is a failure; it is reported and never run again, so that a
// test that fails now and then is not hidden. An emulator that has been up for more than five hours is started afresh before a suite, too (MAX_PHONE_UPTIME_S).
//
// The emulator is the one the tests are limited to (Plax_News_Test, port 5590). Each suite's output is in artifacts/e2e-driver/, the line for each
// attempt in results.jsonl. The exit code is 0 only when every suite ran with no sleep in it, with no test failed or cancelled.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'Android', 'Sdk')
const exe = process.platform === 'win32' ? '.exe' : ''
const adb = process.env.ADB ?? path.join(sdk, 'platform-tools', `adb${exe}`)
const emulator = path.join(sdk, 'emulator', `emulator${exe}`)
const SERIAL = process.env.PLAX_E2E_SERIAL ?? 'emulator-5590'
const AVD = 'Plax_News_Test'
const PORT = SERIAL.replace(/^emulator-/, '')

/** The suites in the order that was run when this list was made (the quick ones first, the long walks of the pages after). */
export const SUITES = ['smoke', 'reading', 'ads', 'library', 'navigation', 'network', 'sheets', 'stress', 'website', 'translate']
export const MAX_ATTEMPTS = 3
/** The wall clock may move this much against the uptime in a run (a clock correction does it) before the run counts as cut by a sleep. */
export const SLEEP_MS = 30_000
/**
 * A phone that has run for hours gets slow: after ten hours the emulator had a gigabyte of its memory swapped out, every look at the screen took longer, and
 * swipes no longer turned the pages. It is started afresh before a suite when it is older than this (the tests then wait until it has been up for 8 minutes).
 */
export const MAX_PHONE_UPTIME_S = 5 * 3600
export const tooOld = (uptimeSeconds) => uptimeSeconds > MAX_PHONE_UPTIME_S

const out = path.join(mobile, 'artifacts', 'e2e-driver')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const stamp = () => new Date().toISOString().slice(11, 19)

/** The wall clock against the uptime: it moves by as long as the computer slept (the uptime does not count the sleep). */
export const clockSkew = () => Date.now() - os.uptime() * 1000

/** What a TAP report says: the counts, and the names of the tests that failed. */
export function readReport(text) {
  const count = (name) => Number(new RegExp(`^# ${name} (\\d+)`, 'm').exec(text)?.[1] ?? 0)
  const failed = [...text.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1])
  return { tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'), skipped: count('skipped'), failed }
}

/** Whether a run counts: no sleep in it, and nothing failed or cancelled. */
export const sleptDuring = (skewBefore, skewAfter) => Math.abs(skewAfter - skewBefore) > SLEEP_MS

function log(line) {
  const text = `[${stamp()}] ${line}`
  console.log(text)
  fs.appendFileSync(path.join(out, 'driver.log'), `${text}\n`)
}

const device = (args, timeout = 30_000) => spawnSync(adb, ['-s', SERIAL, ...args], { encoding: 'utf8', timeout })
const phoneUptime = () => Number(device(['shell', 'cat', '/proc/uptime'], 20_000).stdout?.trim().split(/\s+/)[0]) || 0
const answers = () => {
  const result = device(['shell', 'echo', 'ok'], 25_000)
  return result.status === 0 && result.stdout.trim() === 'ok'
}

async function bootedWithin(minutes) {
  const end = Date.now() + minutes * 60_000
  while (Date.now() < end) {
    const result = device(['shell', 'getprop', 'sys.boot_completed'], 20_000)
    if (result.status === 0 && result.stdout.trim() === '1') return true
    await sleep(8000)
  }
  return false
}

/** Starts the emulator afresh (never another project's: only this serial is touched), without a window, which it needs when no desktop session is open. */
async function restartEmulator() {
  log(`restarting the emulator ${SERIAL}`)
  spawnSync(adb, ['-s', SERIAL, 'emu', 'kill'], { timeout: 30_000 })
  for (let look = 0; look < 20; look += 1) {
    const devices = spawnSync(adb, ['devices'], { encoding: 'utf8', timeout: 20_000 }).stdout ?? ''
    if (!devices.includes(SERIAL)) break
    await sleep(3000)
  }
  await sleep(8000)
  const child = spawn(emulator, ['-avd', AVD, '-port', PORT, '-no-snapshot', '-no-window', '-no-audio', '-no-boot-anim', '-gpu', 'swiftshader_indirect', '-netdelay', 'none', '-netspeed', 'full'], { detached: true, stdio: 'ignore' })
  child.unref()
  const booted = await bootedWithin(12)
  log(booted ? 'the emulator has started' : 'THE EMULATOR DID NOT START')
  return booted
}

async function main(names) {
  const unknown = names.filter((name) => !SUITES.includes(name))
  if (unknown.length > 0) {
    console.error(`No such suite: ${unknown.join(', ')}. The suites are: ${SUITES.join(', ')}.`)
    return 2
  }
  fs.mkdirSync(out, { recursive: true })
  // The e2e build is put on the phone once, by the first suite (the tests do it themselves), and not again for each of the others: unless the caller says it is there.
  let installed = process.env.PLAX_E2E_SKIP_INSTALL === '1'
  const last = []
  for (const name of names) {
    let result
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (!answers()) {
        log('the emulator does not answer')
        if (!(await restartEmulator())) return 3
      } else if (tooOld(phoneUptime())) {
        log(`the emulator has been up for ${(phoneUptime() / 3600).toFixed(1)} hours, which slows it down`)
        if (!(await restartEmulator())) return 3
      }
      const file = path.join(out, `${name}.attempt${attempt}.tap`)
      const skewBefore = clockSkew()
      const started = Date.now()
      log(`${name}: attempt ${attempt} starts`)
      const fd = fs.openSync(file, 'w')
      spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', `e2e/${name}.e2e.mjs`], {
        cwd: mobile,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, PLAX_E2E_SKIP_INSTALL: installed ? '1' : '0', PLAX_E2E_SERIAL: SERIAL },
      })
      installed = true
      fs.closeSync(fd)
      const slept = clockSkew() - skewBefore
      const minutes = (Date.now() - started) / 60_000
      result = { name, attempt, minutes: Number(minutes.toFixed(1)), sleptMs: Math.round(Math.abs(slept)), ...readReport(fs.readFileSync(file, 'utf8')) }
      fs.appendFileSync(path.join(out, 'results.jsonl'), `${JSON.stringify(result)}\n`)
      log(`${name}: attempt ${attempt} ended: ${result.pass} passed, ${result.fail} failed, ${result.cancelled} cancelled, ${result.skipped} skipped in ${minutes.toFixed(1)} min; the computer slept about ${Math.round(Math.abs(slept) / 60_000)} min of it`)
      if (!sleptDuring(0, slept)) break
      log(`${name}: the run was cut by the computer sleeping and does not count; it is run again on a fresh emulator`)
      await restartEmulator()
    }
    last.push(result)
  }

  log('==== the last attempt of each suite, which is the one that counts ====')
  const total = { pass: 0, fail: 0, cancelled: 0, skipped: 0, disturbed: 0 }
  for (const result of last) {
    const disturbed = sleptDuring(0, result.sleptMs)
    total.pass += result.pass
    total.fail += result.fail
    total.cancelled += result.cancelled
    total.skipped += result.skipped
    if (disturbed) total.disturbed += 1
    log(`${result.name.padEnd(11)} attempt ${result.attempt}  ${String(result.pass).padStart(3)} passed ${String(result.fail).padStart(2)} failed ${String(result.cancelled).padStart(2)} cancelled ${String(result.skipped).padStart(2)} skipped  ${String(result.minutes).padStart(5)} min${disturbed ? '  STILL CUT BY A SLEEP' : ''}${result.failed.length > 0 ? `  FAILED: ${result.failed.join(' | ')}` : ''}`)
  }
  log(`TOTAL: ${total.pass} passed, ${total.fail} failed, ${total.cancelled} cancelled, ${total.skipped} skipped; suites still cut by a sleep: ${total.disturbed}`)
  return total.fail > 0 || total.cancelled > 0 || total.disturbed > 0 ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2)
  process.exitCode = await main(names.length > 0 ? names : SUITES)
}
