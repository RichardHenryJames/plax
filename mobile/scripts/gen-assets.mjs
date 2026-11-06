// Renders the app's icon and splash images (PNG) from the brand's "P" (the two paths of src/lib/brand.ts, which brand.test.mjs keeps equal to these).
// Needs playwright-core and Microsoft Edge (the same way the website's pictures are checked): set PLAYWRIGHT_CORE to the folder of
// playwright-core, e.g. `$env:PLAYWRIGHT_CORE='C:\path\to\node_modules\playwright-core'; node scripts/gen-assets.mjs`.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const assets = path.join(here, '..', 'assets')
const core = process.env.PLAYWRIGHT_CORE
if (!core) throw new Error('Set PLAYWRIGHT_CORE to the folder of playwright-core')
const { chromium } = await import(pathToFileURL(path.join(core, 'index.mjs')).href)

const PATHS = [
  'M15.92,8.03 C14.6,8.14 13.95,9.39 14.9,9.99 L21.24,13.5 C23.33,14.66 24.19,15.85 24.48,17.97 C24.54,18.39 24.54,18.39 24.55,24.49 C24.57,31.15 24.55,30.69 24.72,30.88 C25.02,31.21 27.47,31.14 28.93,30.75 C34.87,29.17 38.5,23.3 37.28,17.25 C36.26,12.2 32.22,8.55 27.1,8.05 L15.92,8.03 Z',
  'M12.59,11.26 C12.05,11.41 11.68,11.8 11.55,12.38 C11.49,12.64 11.47,35.99 11.53,36.42 C11.72,37.72 12.2,38.25 14.14,39.28 L18.89,41.91 C20.56,42.86 20.96,43.02 21.44,42.92 C21.97,42.81 22.42,42.35 22.58,41.75 C22.66,41.46 22.67,18.6 22.59,18.05 C22.38,16.57 21.8,15.88 19.91,14.84 L15.72,12.51 C13.33,11.18 13.14,11.1 12.59,11.26 Z',
]
// The same placement as the native app's launcher icon had: the drawing is moved and scaled inside the 108-unit square, well inside the 72-unit safe zone.
const mark = (fill) => `<g transform="translate(19.7 18.3) scale(1.4)">${PATHS.map((d) => `<path fill="${fill}" d="${d}"/>`).join('')}</g>`
const svg = (size, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="${size}" height="${size}">${inner}</svg>`

const IMAGES = [
  // The square icon (the store listing, older launchers): the mark on the amber of the adaptive icon.
  { file: 'icon.png', size: 1024, transparent: false, body: svg(1024, `<rect width="108" height="108" fill="#F59E0B"/>${mark('#1A1203')}`) },
  { file: 'adaptive-foreground.png', size: 1024, transparent: true, body: svg(1024, mark('#1A1203')) },
  { file: 'adaptive-monochrome.png', size: 1024, transparent: true, body: svg(1024, mark('#000000')) },
  { file: 'splash-icon.png', size: 1024, transparent: true, body: svg(1024, mark('#1A1203')) },
  { file: 'splash-icon-dark.png', size: 1024, transparent: true, body: svg(1024, mark('#FAFAFA')) },
  { file: 'favicon.png', size: 64, transparent: false, body: svg(64, `<rect width="108" height="108" fill="#F59E0B"/>${mark('#1A1203')}`) },
]

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
fs.mkdirSync(assets, { recursive: true })
for (const image of IMAGES) {
  const page = await browser.newPage({ viewport: { width: image.size, height: image.size } })
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${image.body}</body></html>`)
  await page.screenshot({ path: path.join(assets, image.file), omitBackground: image.transparent, clip: { x: 0, y: 0, width: image.size, height: image.size } })
  await page.close()
  console.log(`${image.file} ${image.size}x${image.size}${image.transparent ? ' (transparent)' : ''}`)
}
await browser.close()
