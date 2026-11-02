import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readAdsConfig, stripEnabled, pageEnabled, railEnabled, adsEnabled, adPlacement, adsDisclosed, adsTxtLine, isPublisherId, isUnitId, RAIL_MIN_WIDTH } from './ads-config.ts'

const CLIENT = 'ca-pub-1234567890123456'
const full = {
  NEXT_PUBLIC_ADSENSE_CLIENT: CLIENT,
  NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW: '1111111111',
  NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE: '2222222222',
  NEXT_PUBLIC_ADSENSE_SLOT_PAGE: '3333333333',
}

test('with nothing set there are no ads at all, so the site is exactly as it was', () => {
  const config = readAdsConfig({})
  assert.deepEqual(config, { client: '', stripNarrow: '', stripWide: '', page: '', rail: '', preview: false })
  assert.equal(stripEnabled(config), false)
  assert.equal(pageEnabled(config), false)
  assert.equal(railEnabled(config), false)
  assert.equal(adsEnabled(config), false)
  assert.deepEqual(adPlacement(config, true), { strip: false, page: false, rail: false })
  assert.deepEqual(adPlacement(config, false), { strip: false, page: false, rail: false })
})

test('with the publisher and the units set, the strip and the page card are on', () => {
  const config = readAdsConfig(full)
  assert.equal(config.client, CLIENT)
  assert.equal(stripEnabled(config), true)
  assert.equal(pageEnabled(config), true)
  assert.equal(adsEnabled(config), true)
})

test('the strip and the page card are switched on apart: each needs its own unit', () => {
  const stripOnly = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_PAGE: undefined })
  assert.equal(stripEnabled(stripOnly), true)
  assert.equal(pageEnabled(stripOnly), false)
  const pageOnly = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW: '', NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE: '' })
  assert.equal(stripEnabled(pageOnly), false)
  assert.equal(pageEnabled(pageOnly), true)
  const oneStripUnit = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE: undefined })
  assert.equal(stripEnabled(oneStripUnit), true, 'one of the two sizes is enough')
})

test('units without a publisher show nothing', () => {
  const config = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_CLIENT: undefined })
  assert.equal(adsEnabled(config), false)
})

test('a value that is not shaped like an id is dropped, so a typo never reaches Google', () => {
  assert.equal(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_CLIENT: 'pub-1234567890123456' }).client, '')
  assert.equal(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-123' }).client, '')
  assert.equal(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_PAGE: 'abc' }).page, '')
  assert.equal(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_PAGE: '12 34' }).page, '')
  assert.equal(adsEnabled(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-123' })), false)
})

test('stray spaces around a value are ignored', () => {
  const config = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_CLIENT: `  ${CLIENT}\n`, NEXT_PUBLIC_ADSENSE_SLOT_PAGE: ' 3333333333 ' })
  assert.equal(config.client, CLIENT)
  assert.equal(config.page, '3333333333')
})

test('preview turns all three on with no ids, and only when it is exactly "true"', () => {
  const preview = readAdsConfig({ NEXT_PUBLIC_ADS_PREVIEW: 'true' })
  assert.equal(preview.preview, true)
  assert.equal(stripEnabled(preview), true)
  assert.equal(pageEnabled(preview), true)
  assert.equal(railEnabled(preview), true)
  for (const other of ['1', 'yes', 'TRUE', 'false', '']) assert.equal(readAdsConfig({ NEXT_PUBLIC_ADS_PREVIEW: other }).preview, false, other)
})

test('the right panel uses its own unit when there is one, and the page unit (a responsive one) when there is not', () => {
  assert.equal(readAdsConfig(full).rail, '3333333333', 'no unit of its own: the page unit serves')
  const own = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_RAIL: '4444444444' })
  assert.equal(own.rail, '4444444444')
  assert.equal(own.page, '3333333333', 'and the page keeps its own')
  assert.equal(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_RAIL: ' 4444444444 ' }).rail, '4444444444', 'spaces are ignored')
  assert.equal(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_RAIL: 'oops' }).rail, '3333333333', 'a typo falls back instead of reaching Google')
})

test('the panel needs a unit and a publisher, like the others', () => {
  assert.equal(railEnabled(readAdsConfig(full)), true)
  assert.equal(railEnabled(readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_CLIENT: undefined })), false, 'units without a publisher show nothing')
  const stripOnly = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_PAGE: undefined })
  assert.equal(railEnabled(stripOnly), false, 'a strip alone does not make a panel unit')
  const railOnly = readAdsConfig({ NEXT_PUBLIC_ADSENSE_CLIENT: CLIENT, NEXT_PUBLIC_ADSENSE_SLOT_RAIL: '4444444444' })
  assert.equal(railEnabled(railOnly), true)
  assert.equal(adsEnabled(railOnly), true, 'a panel unit alone is enough to need the script')
})

test('a desktop has its ad in the right panel and none in the middle', () => {
  const config = readAdsConfig(full)
  assert.deepEqual(adPlacement(config, true), { strip: false, page: false, rail: true })
})

test('anywhere without the panel the ads are the strip and the page between stories', () => {
  const config = readAdsConfig(full)
  assert.deepEqual(adPlacement(config, false), { strip: true, page: true, rail: false })
})

test('a desktop with no unit for its panel keeps the middle as it was, so a strip alone still shows', () => {
  const stripOnly = readAdsConfig({ ...full, NEXT_PUBLIC_ADSENSE_SLOT_PAGE: undefined })
  assert.deepEqual(adPlacement(stripOnly, true), { strip: true, page: false, rail: false })
})

test('the preview follows the same placement, so what is looked at is what is shipped', () => {
  const preview = readAdsConfig({ NEXT_PUBLIC_ADS_PREVIEW: 'true' })
  assert.deepEqual(adPlacement(preview, true), { strip: false, page: false, rail: true })
  assert.deepEqual(adPlacement(preview, false), { strip: true, page: true, rail: false })
})

test('the panel appears at the width the code says (Tailwind\'s xl, 1280 px), so the ads move exactly when the panel arrives', () => {
  assert.equal(RAIL_MIN_WIDTH, 1280)
  const rail = readFileSync(new URL('../components/RightRail.tsx', import.meta.url), 'utf8')
  assert.match(rail, /<aside className="hidden xl:flex /, 'the panel is shown from xl')
  const tailwind = readFileSync(new URL('../../tailwind.config.js', import.meta.url), 'utf8')
  assert.doesNotMatch(tailwind, /screens\s*:/, 'no custom breakpoints: xl is Tailwind\'s own 1280 px')
})

test('ids are told by their shape', () => {
  assert.ok(isPublisherId('ca-pub-0000000000000000'))
  assert.ok(!isPublisherId('ca-pub-000000000000000'))
  assert.ok(!isPublisherId('ca-app-pub-3940256099942544'))
  assert.ok(isUnitId('1234567890'))
  assert.ok(!isUnitId('12345'))
  assert.ok(!isUnitId('ca-app-pub-3940256099942544/6300978111'), 'an AdMob unit is not an AdSense one')
})

test('the privacy policy speaks of ads only where readers get them, and not for the preview', () => {
  assert.equal(adsDisclosed(readAdsConfig({}), {}), false, 'nothing set: the policy still says there are no ads')
  assert.equal(adsDisclosed(readAdsConfig(full), {}), true, 'the website has ads')
  assert.equal(adsDisclosed(readAdsConfig({ NEXT_PUBLIC_ADS_PREVIEW: 'true' }), {}), false, 'boxes are not ads')
  assert.equal(adsDisclosed(readAdsConfig({}), { NEXT_PUBLIC_ADS_POLICY: 'true' }), true, 'the app has ads before the website does')
  for (const other of ['1', 'yes', 'TRUE', 'false', '']) assert.equal(adsDisclosed(readAdsConfig({}), { NEXT_PUBLIC_ADS_POLICY: other }), false, other)
})

test('the ads.txt line names the publisher without the ca- and carries Google\'s certification id', () => {
  assert.equal(adsTxtLine(CLIENT), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0')
  assert.throws(() => adsTxtLine('pub-1234567890123456'))
  assert.throws(() => adsTxtLine(''))
})
