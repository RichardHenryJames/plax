// Draws every Plax icon from the one shared "P" outline in src/lib/brand.ts, so none of them can differ from it.
//   npm i --no-save playwright-core     (once; only this script needs it, so it is not a dependency)
//   node scripts/brand-icons.mjs        (set BROWSER to a Chromium, Chrome or Edge executable if none is found)
// It rewrites src/app/icon.png, src/app/apple-icon.png, public/icon-192.png, public/icon-512.png and, for the Play listing,
// android/artifacts/play/icon-512.png (git-ignored). src/lib/brand.test.mjs checks their sizes and colour types.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const { BRAND, P_BOWL, P_BOX, P_STEM, P_IN_TILE, P_IN_FULL_BLEED } = await import(pathToFileURL(join(ROOT, 'src', 'lib', 'brand.ts')).href)

const executablePath = [
  process.env.BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && existsSync(candidate))
if (!executablePath) throw new Error('No Chromium, Chrome or Edge found; set BROWSER to its executable.')

const svg = ({ size, radius, share }) => {
  const h = size * share, w = (h * P_BOX.width) / P_BOX.height
  const x = (size - w) / 2, y = (size - h) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND.iconBackground}"/>
    <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${P_BOX.x} ${P_BOX.y} ${P_BOX.width} ${P_BOX.height}">
      <path d="${P_BOWL}" fill="${BRAND.iconInk}"/><path d="${P_STEM}" fill="${BRAND.iconInk}"/>
    </svg></svg>`
}

// What is drawn, and why each is the way it is:
//  favicon        a tile shown whole, rounded, with clear corners so it sits on a light or a dark tab bar
//  apple icon     iOS rounds it itself, so it is square and opaque
//  install icons  an Android home screen crops them to its own shape, so the P stays in the middle 80 %: the same proportions as
//                 the adaptive launcher icon
//  Play icon      full-bleed (Play rounds it), the P as large as on the phone's launcher. Google asks for a 32-bit PNG, and a screenshot of
//                 a picture with no transparent pixel is saved as 24-bit, so this one is exported from a canvas, which always keeps
//                 the alpha channel (every pixel is still opaque)
const OUTPUTS = [
  { file: join(ROOT, 'src', 'app', 'icon.png'), size: 512, radius: 512 * 0.224, share: P_IN_TILE, transparent: true },
  { file: join(ROOT, 'src', 'app', 'apple-icon.png'), size: 180, radius: 0, share: P_IN_TILE, transparent: false },
  { file: join(ROOT, 'public', 'icon-192.png'), size: 192, radius: 0, share: P_IN_FULL_BLEED, transparent: false },
  { file: join(ROOT, 'public', 'icon-512.png'), size: 512, radius: 0, share: P_IN_FULL_BLEED, transparent: false },
  { file: join(ROOT, 'android', 'artifacts', 'play', 'icon-512.png'), size: 512, radius: 0, share: P_IN_TILE, canvas: true },
]

const browser = await chromium.launch({ executablePath, headless: true })
for (const o of OUTPUTS) {
  mkdirSync(dirname(o.file), { recursive: true })
  const page = await (await browser.newContext({ viewport: { width: o.size, height: o.size }, deviceScaleFactor: 1 })).newPage()
  if (o.canvas) {
    const dataUrl = await page.evaluate(async ({ markup, size }) => {
      const image = new Image()
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(image, 0, 0, size, size)
      return canvas.toDataURL('image/png')
    }, { markup: svg(o), size: o.size })
    writeFileSync(o.file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  } else {
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}</style>${svg(o)}`)
    await page.screenshot({ path: o.file, omitBackground: o.transparent, clip: { x: 0, y: 0, width: o.size, height: o.size } })
  }
  await page.close()
  console.log('wrote', relative(ROOT, o.file), `${o.size}x${o.size}`, o.radius > 0 ? '(clear corners)' : '(opaque)', o.transparent || o.canvas ? '32-bit' : '24-bit', `P ${Math.round(o.share * 100)}% tall`)
}
await browser.close()
