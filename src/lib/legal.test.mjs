import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTACT_MAILTO, DELETION_MAILTO, LEGAL } from './legal.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// "17 October 2026" -> "2026-10-17"
function isoOf(text) {
  const [day, month, year] = text.split(' ')
  return `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`
}

test('the contact address is a real address, and both mail links use it', () => {
  assert.match(LEGAL.contactEmail, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i)
  assert.ok(CONTACT_MAILTO.startsWith(`mailto:${LEGAL.contactEmail}?subject=`))
  assert.ok(DELETION_MAILTO.startsWith(`mailto:${LEGAL.contactEmail}?subject=`))
  assert.equal(new URL(CONTACT_MAILTO).searchParams.get('subject'), 'Plax feedback')
})

test('the contact page has a path of its own and says who runs Plax', () => {
  assert.equal(LEGAL.contactPath, '/contact')
  assert.ok(LEGAL.operator.length > 0)
})

test('each date shown on a page is the same day as the one the sitemap uses', () => {
  assert.equal(isoOf(LEGAL.updated), LEGAL.updatedIso)
  assert.equal(isoOf(LEGAL.contactUpdated), LEGAL.contactUpdatedIso)
})
