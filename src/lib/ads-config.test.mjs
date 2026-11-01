import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAdsConfig, stripEnabled, pageEnabled, adsEnabled, adsDisclosed, adsTxtLine, isPublisherId, isUnitId } from './ads-config.ts'

const CLIENT = 'ca-pub-1234567890123456'
const full = {
  NEXT_PUBLIC_ADSENSE_CLIENT: CLIENT,
  NEXT_PUBLIC_ADSENSE_SLOT_STRIP_NARROW: '1111111111',
  NEXT_PUBLIC_ADSENSE_SLOT_STRIP_WIDE: '2222222222',
  NEXT_PUBLIC_ADSENSE_SLOT_PAGE: '3333333333',
}

test('with nothing set there are no ads at all, so the site is exactly as it was', () => {
  const config = readAdsConfig({})
  assert.deepEqual(config, { client: '', stripNarrow: '', stripWide: '', page: '', preview: false })
  assert.equal(stripEnabled(config), false)
  assert.equal(pageEnabled(config), false)
  assert.equal(adsEnabled(config), false)
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

test('preview turns both on with no ids, and only when it is exactly "true"', () => {
  const preview = readAdsConfig({ NEXT_PUBLIC_ADS_PREVIEW: 'true' })
  assert.equal(preview.preview, true)
  assert.equal(stripEnabled(preview), true)
  assert.equal(pageEnabled(preview), true)
  for (const other of ['1', 'yes', 'TRUE', 'false', '']) assert.equal(readAdsConfig({ NEXT_PUBLIC_ADS_PREVIEW: other }).preview, false, other)
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
