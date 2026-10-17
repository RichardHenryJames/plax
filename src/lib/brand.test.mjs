import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BRAND, P_BOWL, P_BOX, P_STEM } from './brand.ts'

const ROOT = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, ROOT))
const text = (path) => read(path).toString('utf8')
const header = (path) => { const b = read(path); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] } }

// The brand logo's own P in public/plaxlabs_logo.png is 1026 x 1380 pixels.
const LOGO_ASPECT = 1026 / 1380

// Reads "M x,y C x,y x,y x,y L x,y Z" into the commands and the points along the outline (curves sampled).
function outline(d) {
  const commands = [...d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)].map(([, op, body]) => ({ op, nums: (body.match(/-?\d*\.?\d+/g) || []).map(Number) }))
  const points = []
  let at = null
  for (const { op, nums } of commands) {
    if (op === 'M' || op === 'L') { at = nums.slice(0, 2); points.push(at) }
    else if (op === 'C') {
      const [x1, y1, x2, y2, x3, y3] = nums
      for (let t = 0.02; t <= 1.0001; t += 0.02) {
        const u = 1 - t
        points.push([u ** 3 * at[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3, u ** 3 * at[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3])
      }
      at = [x3, y3]
    }
  }
  return { commands, points }
}

test('each piece of the P is one closed outline made of lines and curves', () => {
  for (const [name, d] of [['bowl', P_BOWL], ['stem', P_STEM]]) {
    const { commands } = outline(d)
    const ops = commands.map((c) => c.op).join('')
    assert.match(ops, /^M[LC]+Z$/, `${name} is not a single closed M ... Z outline: ${ops}`)
    for (const { op, nums } of commands) {
      const wanted = { M: 2, L: 2, C: 6, Z: 0 }[op]
      assert.equal(nums.length, wanted, `${name}: ${op} has ${nums.length} numbers`)
      assert.ok(nums.every(Number.isFinite))
    }
  }
})

test('the declared box is the outline\'s own box', () => {
  const points = [...outline(P_BOWL).points, ...outline(P_STEM).points]
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  const found = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  for (const k of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(found[k] - P_BOX[k]) < 0.05, `${k}: the outline has ${found[k].toFixed(3)}, P_BOX says ${P_BOX[k]}`)
})

test('the P has the proportions of the brand logo, not a squashed or stretched copy', () => {
  assert.ok(Math.abs(P_BOX.width / P_BOX.height - LOGO_ASPECT) < 0.005, `the P is ${(P_BOX.width / P_BOX.height).toFixed(4)} wide per tall; the logo is ${LOGO_ASPECT.toFixed(4)}`)
})

test('the Android app draws exactly this outline, in exactly these colours', () => {
  const files = ['drawable/ic_launcher_foreground.xml', 'drawable/ic_plax.xml', 'drawable/ic_splash.xml', 'drawable-night/ic_splash.xml']
  for (const file of files) {
    const xml = text(`android/app/src/main/res/${file}`)
    const paths = [...xml.matchAll(/android:pathData="([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(paths, [P_BOWL, P_STEM], `${file} draws a different P`)
  }
  const colors = text('android/app/src/main/res/values/colors.xml')
  const background = colors.match(/<color name="launcher_background">(#[0-9A-Fa-f]{6})<\/color>/)?.[1]
  assert.equal(background?.toUpperCase(), BRAND.iconBackground.toUpperCase(), 'the launcher icon is a different amber')
  const inks = [...text('android/app/src/main/res/drawable/ic_launcher_foreground.xml').matchAll(/android:fillColor="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase())
  assert.deepEqual([...new Set(inks)], [BRAND.iconInk.toUpperCase()], 'the launcher icon\'s P is a different colour')
})

test('the icon files are the size their place needs, and the manifest says the truth about them', () => {
  assert.deepEqual([header('src/app/icon.png').width, header('src/app/icon.png').height], [512, 512])
  assert.deepEqual([header('src/app/apple-icon.png').width, header('src/app/apple-icon.png').height], [180, 180])
  assert.notEqual(header('src/app/apple-icon.png').colorType, 6, 'iOS paints transparent parts of the Apple icon black')
  assert.equal(header('src/app/icon.png').colorType, 6, 'the browser tab icon has clear corners')

  const manifest = text('src/app/manifest.ts')
  const declared = [...manifest.matchAll(/src:\s*withBase\('\/([^']+)'\),\s*sizes:\s*'(\d+)x(\d+)'/g)].map((m) => ({ file: m[1], width: +m[2], height: +m[3] }))
  assert.ok(declared.length >= 3, 'the manifest lists the install icons')
  for (const { file, width, height } of declared) {
    const real = header(`public/${file}`)
    assert.deepEqual([real.width, real.height], [width, height], `${file} is ${real.width}x${real.height} but the manifest says ${width}x${height}`)
    assert.notEqual(real.colorType, 6, `${file} should be opaque: an install icon is cropped by the system, not shown on clear`)
  }
  assert.ok(declared.some((d) => d.width === 192) && declared.some((d) => d.width === 512), 'Chrome needs a 192 and a 512 icon to offer installing')
})

test('the share-card pictures draw the P, not a letter typed in a font', () => {
  for (const file of ['src/app/opengraph-image.tsx', 'src/app/topics/[topic]/opengraph-image.tsx', 'src/app/s/[slug]/opengraph-image.tsx']) {
    const source = text(file)
    assert.match(source, /PTile/, `${file} does not use the shared P tile`)
    assert.doesNotMatch(source, />\s*P\s*<\/div>/, `${file} still draws a typed letter P`)
  }
})
