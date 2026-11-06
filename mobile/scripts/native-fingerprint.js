// Keeps over-the-air updates safe: an update is JavaScript, and it may only reach apps whose native layer has what that JavaScript uses.
// `runtimeVersion` in app.config.js is that promise. This computes a fingerprint of everything that decides what the native layer is (the
// native packages and their versions, app.config.js without the version numbers, the config plugins, the app's own native modules), compares it with the one recorded in
// native-fingerprint.json, and fails when the native layer changed while runtimeVersion did not (an update would then reach apps that
// cannot run it).
//
//   node scripts/native-fingerprint.js            check
//   node scripts/native-fingerprint.js --update   record the fingerprint (after bumping RUNTIME_VERSION, when the native layer changed)
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const mobile = path.resolve(__dirname, '..')
const RECORD = path.join(mobile, 'native-fingerprint.json')

/** The packages of node_modules that contain native code (an android folder, or an Expo module config), and React Native itself, which is the native layer's own version. */
function nativePackages() {
  const manifest = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8'))
  const names = Object.keys({ ...manifest.dependencies }).sort()
  const always = new Set(['react-native', 'expo'])
  const native = []
  for (const name of names) {
    const folder = path.join(mobile, 'node_modules', ...name.split('/'))
    if (!fs.existsSync(folder)) continue
    if (always.has(name) || fs.existsSync(path.join(folder, 'android')) || fs.existsSync(path.join(folder, 'expo-module.config.json'))) {
      native.push(`${name}@${JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8')).version}`)
    }
  }
  return native
}

function pluginSources() {
  const folder = path.join(mobile, 'plugins')
  return fs
    .readdirSync(folder)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => `${name}\n${fs.readFileSync(path.join(folder, name), 'utf8').replace(/\r\n/g, '\n')}`)
}

/** The app's own native modules (modules/): every file that is built into the native layer, in a fixed order. */
function moduleSources(folder = path.join(mobile, 'modules'), prefix = '') {
  if (!fs.existsSync(folder)) return []
  const parts = []
  for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const name = `${prefix}${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === '.cxx') continue
      parts.push(...moduleSources(path.join(folder, entry.name), `${name}/`))
    } else {
      parts.push(`modules/${name}\n${fs.readFileSync(path.join(folder, entry.name), 'utf8').replace(/\r\n/g, '\n')}`)
    }
  }
  return parts
}

/** app.config.js with the numbers that change with every release left out: they say nothing about the native layer. */
function configSource() {
  return fs
    .readFileSync(path.join(mobile, 'app.config.js'), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/const RUNTIME_VERSION = '[^']*'/, "const RUNTIME_VERSION = ''")
    .replace(/const VERSION = '[^']*'/, "const VERSION = ''")
    .replace(/const VERSION_CODE = \d+/, 'const VERSION_CODE = 0')
}

function runtimeVersion() {
  return /const RUNTIME_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(mobile, 'app.config.js'), 'utf8'))[1]
}

function computeFingerprint() {
  const hash = crypto.createHash('sha256')
  for (const part of [JSON.stringify(nativePackages()), configSource(), ...pluginSources(), ...moduleSources()]) hash.update(part).update('\0')
  return hash.digest('hex')
}

/** What the check finds: ok, or the reason it fails. */
function check() {
  const recorded = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : null
  const current = { runtimeVersion: runtimeVersion(), fingerprint: computeFingerprint() }
  if (!recorded) return { ok: false, current, recorded, reason: 'native-fingerprint.json is missing: run `node scripts/native-fingerprint.js --update`' }
  if (recorded.runtimeVersion === current.runtimeVersion && recorded.fingerprint === current.fingerprint) return { ok: true, current, recorded }
  if (recorded.runtimeVersion === current.runtimeVersion) {
    return { ok: false, current, recorded, reason: `the native layer changed (a native package, app.config.js or a plugin) but RUNTIME_VERSION is still ${current.runtimeVersion}: an update published for it would reach apps that cannot run it. Bump RUNTIME_VERSION in app.config.js, then run \`node scripts/native-fingerprint.js --update\`.` }
  }
  return { ok: false, current, recorded, reason: `RUNTIME_VERSION is now ${current.runtimeVersion} (it was ${recorded.runtimeVersion}): record the new fingerprint with \`node scripts/native-fingerprint.js --update\`.` }
}

module.exports = { computeFingerprint, nativePackages, moduleSources, check, RECORD }

if (require.main === module) {
  if (process.argv.includes('--update')) {
    const current = { runtimeVersion: runtimeVersion(), fingerprint: computeFingerprint() }
    fs.writeFileSync(RECORD, `${JSON.stringify(current, null, 2)}\n`)
    console.log(`Recorded runtime version ${current.runtimeVersion}, fingerprint ${current.fingerprint.slice(0, 16)}…`)
  } else {
    const result = check()
    console.log(result.ok ? `ok: runtime version ${result.current.runtimeVersion}, native layer unchanged` : `FAIL: ${result.reason}`)
    process.exit(result.ok ? 0 : 1)
  }
}
