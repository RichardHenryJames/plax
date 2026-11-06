// Checks the Google Play bundle (.aab) before it is handed over: that it is the signed Play build of this source and a well-formed bundle.
//
//   node scripts/check-bundle.mjs [artifacts/plax-<version>-play.aab]
//
// It uses Google's own bundletool (found in .tools/, or downloaded once from its official release and compared with the SHA-256 that release
// publishes) and the JDK's keytool/jarsigner. What this does not prove: that Google Play accepts the app (that is the Play Console's review),
// or how it behaves on a given phone.
import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLETOOL_VERSION = '1.18.3'
const PACKAGE = 'com.plaxlabs.news'
// The owner's public AdMob application id (not a secret) and Google's sample one, which serves test ads and is tied to no account.
const LIVE_APP_ID = 'ca-app-pub-2225161543339119~9585194942'
const SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~3347511713'
const LIVE_UNITS = ['ca-app-pub-2225161543339119/8383793916', 'ca-app-pub-2225161543339119/5757630575']
// SHA-256 of the Google Play upload key's certificate, and of the Android debug key the website's build is signed with.
const UPLOAD_KEY_SHA256 = 'dade46fd37d3cb9ef3b3722d3da8a44dd4f7433ce9248df7c2543f0a56de1219'
const DEBUG_KEY_SHA256 = '3a47d0db806278c73b102cb4f67497476316d61f6844094fd9b18f28d6b41c69'
const ALLOWED_PERMISSIONS = new Set([
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.WAKE_LOCK',
  'android.permission.FOREGROUND_SERVICE',
  `${PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
  // What Google's Mobile Ads SDK adds: the advertising id and its Privacy Sandbox forms.
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
])

const config = fs.readFileSync(path.join(mobile, 'app.config.js'), 'utf8')
const VERSION = /const VERSION = '([^']+)'/.exec(config)?.[1]
const VERSION_CODE = Number(/const VERSION_CODE = (\d+)/.exec(config)?.[1])
const RUNTIME_VERSION = /const RUNTIME_VERSION = '([^']+)'/.exec(config)?.[1]
const PROJECT_ID = JSON.parse(fs.readFileSync(path.join(mobile, 'app.json'), 'utf8')).expo.extra.eas.projectId

const bundle = path.resolve(process.argv[2] ?? path.join(mobile, 'artifacts', `plax-${VERSION}-play.aab`))
if (!fs.existsSync(bundle)) throw new Error(`No bundle at ${bundle}. Run scripts\\build-android.ps1 -Variant play first.`)

const results = []
let failed = 0
function check(what, ok, detail = '') {
  results.push({ what, ok: !!ok, detail })
  if (ok) console.log(`  ok    ${what}`)
  else {
    failed++
    console.log(`  FAIL  ${what}${detail ? ` (${detail})` : ''}`)
  }
}

const jdk = [process.env.JAVA_HOME, path.join(os.homedir(), '.jdks', 'openjdk-21.0.2')].find((home) => home && fs.existsSync(path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')))
if (!jdk) throw new Error('Set JAVA_HOME to a JDK.')
const exe = (name) => path.join(jdk, 'bin', process.platform === 'win32' ? `${name}.exe` : name)

async function bundletool() {
  const tools = path.join(mobile, '.tools')
  const jar = path.join(tools, `bundletool-all-${BUNDLETOOL_VERSION}.jar`)
  if (fs.existsSync(jar)) return jar
  // The native app's tools folder, if it is still there.
  const earlier = path.resolve(mobile, '..', 'android', '.tools', `bundletool-all-${BUNDLETOOL_VERSION}.jar`)
  fs.mkdirSync(tools, { recursive: true })
  if (fs.existsSync(earlier)) {
    fs.copyFileSync(earlier, jar)
    return jar
  }
  const url = `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`
  const release = await (await fetch(`https://api.github.com/repos/google/bundletool/releases/tags/${BUNDLETOOL_VERSION}`)).json()
  const expected = release.assets?.find((asset) => asset.name === `bundletool-all-${BUNDLETOOL_VERSION}.jar`)?.digest?.replace('sha256:', '')
  if (!expected) throw new Error('The release does not publish a SHA-256 for bundletool.')
  const data = Buffer.from(await (await fetch(url)).arrayBuffer())
  if (crypto.createHash('sha256').update(data).digest('hex') !== expected) throw new Error('bundletool does not match the SHA-256 its release publishes.')
  fs.writeFileSync(jar, data)
  return jar
}

function java(jar, args) {
  const run = spawnSync(exe('java'), ['-jar', jar, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

// A minimal zip reader (central directory), enough to list and inflate entries without a dependency.
function readZip(file) {
  const buffer = fs.readFileSync(file)
  let end = -1
  for (let i = buffer.length - 22; i >= 0; i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break }
  if (end < 0) throw new Error('Not a zip file')
  const count = buffer.readUInt16LE(end + 10)
  let at = buffer.readUInt32LE(end + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    const method = buffer.readUInt16LE(at + 10)
    const compressed = buffer.readUInt32LE(at + 20)
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const local = buffer.readUInt32LE(at + 42)
    entries.push({ name: buffer.toString('utf8', at + 46, at + 46 + nameLength), method, compressed, local })
    at += 46 + nameLength + extraLength + commentLength
  }
  const read = (entry) => {
    const start = entry.local + 30 + buffer.readUInt16LE(entry.local + 26) + buffer.readUInt16LE(entry.local + 28)
    const raw = buffer.subarray(start, start + entry.compressed)
    return entry.method === 0 ? raw : zlib.inflateRawSync(raw)
  }
  return { entries, read }
}

/** The alignments of the loadable segments of an ELF file, and whether it is 64-bit. */
function elf(data) {
  if (data.length < 64 || data.readUInt32BE(0) !== 0x7f454c46) return null
  const is64 = data[4] === 2
  const little = data[5] === 1
  const u16 = (o) => (little ? data.readUInt16LE(o) : data.readUInt16BE(o))
  const u32 = (o) => (little ? data.readUInt32LE(o) : data.readUInt32BE(o))
  const u64 = (o) => Number(little ? data.readBigUInt64LE(o) : data.readBigUInt64BE(o))
  const offset = is64 ? u64(0x20) : u32(0x1c)
  const size = u16(is64 ? 0x36 : 0x2a)
  const number = u16(is64 ? 0x38 : 0x2c)
  const aligns = []
  for (let i = 0; i < number; i++) {
    const header = offset + i * size
    if (u32(header) === 1) aligns.push(is64 ? u64(header + 0x30) : u32(header + 0x1c))
  }
  return { is64, aligns }
}

console.log(`Bundle ${bundle}`)
const jar = await bundletool()

const validation = java(jar, ['validate', `--bundle=${bundle}`])
check('bundletool validates the bundle', validation.status === 0, validation.out.trim().split('\n').pop())

const verified = spawnSync(exe('jarsigner'), ['-verify', bundle], { encoding: 'utf8' })
check('the bundle signature verifies (jarsigner)', /jar verified/i.test(`${verified.stdout}${verified.stderr}`))
const certificates = execFileSync(exe('keytool'), ['-printcert', '-jarfile', bundle], { encoding: 'utf8' })
const signers = [...certificates.matchAll(/SHA256:\s*([0-9A-F:]{95})/g)].map((m) => m[1].replace(/:/g, '').toLowerCase())
const signerCount = (certificates.match(/^Signer #/gm) ?? []).length
check('the bundle has exactly one signer', signerCount === 1 && signers.length === 1, `${signerCount} signer(s)`)
check('the signer is the Plax upload key', signers[0] === UPLOAD_KEY_SHA256, signers[0])
check('the signer is not the Android debug key of the website build', signers[0] !== DEBUG_KEY_SHA256)

const manifest = java(jar, ['dump', 'manifest', `--bundle=${bundle}`]).out
const has = (pattern) => pattern.test(manifest)
check(`the package is ${PACKAGE}`, has(new RegExp(`package="${PACKAGE.replace(/\./g, '\\.')}"`)))
check(`the version is ${VERSION} (${VERSION_CODE}), as in app.config.js`, has(new RegExp(`android:versionCode="${VERSION_CODE}"`)) && has(new RegExp(`android:versionName="${VERSION.replace(/\./g, '\\.')}"`)))
check('the minimum SDK is 26', has(/android:minSdkVersion="26"/))
check('it targets Android 16 (API 36), which Google Play requires for new apps', has(/android:targetSdkVersion="36"/))
check('it is not debuggable', !has(/android:debuggable="true"/))
check('cleartext (http) traffic is off', has(/android:usesCleartextTraffic="false"/))
check('automatic backups are off', has(/android:allowBackup="false"/))
const permissions = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1])
const extra = permissions.filter((name) => !ALLOWED_PERMISSIONS.has(name))
check('it asks for no permission beyond INTERNET, the connection state and what the ads library adds', extra.length === 0, extra.join(', '))
check('it does not ask to install packages (a store app may not update itself)', !permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES'))
check('the advertising ID permission is declared, as the Play Console declaration says the app uses it', permissions.includes('com.google.android.gms.permission.AD_ID'))
check("the AdMob application id is the owner's, not Google's sample (without one the ad SDK stops the app at start-up)", manifest.includes(LIVE_APP_ID) && !manifest.includes(SAMPLE_APP_ID))
check('over-the-air updates are on, for the production channel of this project', manifest.includes(`https://u.expo.dev/${PROJECT_ID}`) && /expo-channel-name"\s*:\s*"production"/.test(manifest.replace(/&quot;/g, '"')))
check(`the runtime version of the updates is ${RUNTIME_VERSION}`, manifest.includes('expo.modules.updates.EXPO_RUNTIME_VERSION'))

const zip = readZip(bundle)
const names = zip.entries.map((entry) => entry.name)
const script = zip.entries.find((entry) => /^base\/assets\/index\.android\.bundle$/.test(entry.name))
check('the app\'s script (Hermes bytecode) is in the bundle', !!script)
if (script) {
  const code = zip.read(script).toString('latin1')
  check("the owner's banner and native ad units are in the script", LIVE_UNITS.every((unit) => code.includes(unit)))
  check('the script is Hermes bytecode, not plain text', zip.read(script).readUInt32LE(0) === 0x1f1903c1 || !/^\s*(var|!function|__d\()/.test(code.slice(0, 40)))
}
const forbidden = names.filter((name) => /\.(pem|jks|keystore|p12|env)$|google-services\.json$|upload\.properties$/i.test(name))
// expo-updates ships Expo's own public root certificate (it checks manifests signed by Expo with it). That holds no secret, which is read here and not assumed.
const secretLooking = forbidden.filter((name) => {
  if (name !== 'base/assets/expo-root.pem') return true
  const text = zip.read(zip.entries.find((entry) => entry.name === name)).toString('utf8')
  return !/^-----BEGIN CERTIFICATE-----/.test(text.trim()) || /PRIVATE KEY/.test(text)
})
check('no key, certificate or private setting is packed into the bundle (Expo\'s public root certificate is the one file of that kind)', secretLooking.length === 0, secretLooking.join(', '))

const libraries = zip.entries.filter((entry) => /^base\/lib\/[^/]+\/[^/]+\.so$/.test(entry.name))
check('it has native libraries for the four processors', ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'].every((abi) => libraries.some((entry) => entry.name.startsWith(`base/lib/${abi}/`))))
const misaligned = []
for (const entry of libraries) {
  const info = elf(zip.read(entry))
  if (!info) continue
  // Google Play requires 64-bit libraries to be aligned to 16 KiB pages (Android 15 and later); the 32-bit ones are reported only.
  if (info.is64 && info.aligns.some((align) => align < 16384)) misaligned.push(`${entry.name} (${Math.min(...info.aligns)})`)
}
check('every 64-bit native library is aligned to 16 KiB pages', misaligned.length === 0, misaligned.slice(0, 4).join(', '))

const size = fs.statSync(bundle).size
check("it is under Google Play's 200 MB limit", size < 200 * 1024 * 1024, `${size} bytes`)

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex')
fs.mkdirSync(path.join(mobile, 'artifacts'), { recursive: true })
fs.writeFileSync(path.join(mobile, 'artifacts', 'aab-verification.json'), JSON.stringify({ bundle: path.basename(bundle), version: VERSION, versionCode: VERSION_CODE, size, sha256, signer: signers[0], checks: results }, null, 2))
console.log(failed === 0 ? `\nReady for Google Play: ${bundle}\n  ${VERSION} (code ${VERSION_CODE}), ${size} bytes, sha256 ${sha256}\n  signed by the Plax upload key ${signers[0]}` : `\n${failed} check(s) FAILED`)
process.exit(failed === 0 ? 0 : 1)
