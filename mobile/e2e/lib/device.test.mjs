// The parts of the device driver that need no phone: a button is pressed where it stays (not where it was found while the page was still moving), and
// a command is run again when adb's own server stops answering for a moment. The rest of the driver needs a phone, and is proved by the device tests.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { labels, parseNodes, samePlace, steady, whileServerDown } from './device.mjs'

const at = (left, top, right = left + 100, bottom = top + 50) => ({ bounds: { left, top, right, bottom } })

test('two looks are the same place only when every edge is the same', () => {
  assert.equal(samePlace(at(10, 20), at(10, 20)), true)
  assert.equal(samePlace(at(10, 20), at(11, 20)), false)
  assert.equal(samePlace(at(10, 20), at(10, 21)), false)
  assert.equal(samePlace(at(10, 20, 110, 70), at(10, 20, 111, 70)), false)
  assert.equal(samePlace(at(10, 20, 110, 70), at(10, 20, 110, 71)), false)
})

/** A look that gives these answers one after the other, and the last again. */
const looks = (...answers) => {
  let next = 0
  return () => answers[Math.min(next++, answers.length - 1)]
}

test('an element is given back on the second look in the same place, not the first', () => {
  const find = steady(looks(at(0, 100), at(0, 100)))
  assert.equal(find(), null)
  assert.deepEqual(find(), at(0, 100))
})

test('nothing is given back while the element is not there', () => {
  const find = steady(looks(undefined, null, undefined))
  assert.equal(find(), null)
  assert.equal(find(), null)
  assert.equal(find(), null)
})

test('an element that moved between two looks is given back where it is now, once it has stayed there', () => {
  const found = steady(looks(at(0, 1440), at(0, 1300), at(0, 1300)))
  assert.equal(found(), null, 'seen')
  assert.equal(found(), null, 'seen elsewhere: the page moved under it')
  assert.deepEqual(found(), at(0, 1300), 'seen there again')
})

test('an element that went and came back is not given back until it has stayed for two looks', () => {
  const found = steady(looks(at(0, 1440), undefined, at(0, 1440), at(0, 1440)))
  assert.equal(found(), null)
  assert.equal(found(), null, 'gone: the page was being laid out again')
  assert.equal(found(), null, 'back, seen once')
  assert.deepEqual(found(), at(0, 1440))
})

test('an element that never stays is never given back, so that the press fails and does not tap at random', () => {
  const found = steady(looks(at(0, 1), at(0, 2), at(0, 3), at(0, 4), at(0, 5)))
  for (let look = 0; look < 5; look += 1) assert.equal(found(), null)
})

test('the same look is not the one before it when it is another element in the same place: the answer is the latest', () => {
  const first = at(5, 5)
  const second = at(5, 5)
  const found = steady(looks(first, second))
  found()
  assert.equal(found(), second)
})

const DOWN = { status: 1, stdout: '', stderr: '* daemon still not running\nerror: cannot connect to daemon at tcp:5037: cannot connect to 127.0.0.1:5037: A connection attempt failed (10060)' }
const OK = { status: 0, stdout: 'ok\n', stderr: '' }

/** What `whileServerDown` is given: runs that answer one after the other, and how often it ran and paused. */
const server = (...answers) => {
  const seen = { runs: 0, pauses: [] }
  const run = () => answers[Math.min(seen.runs++, answers.length - 1)]
  const options = { tries: 4, pauseMs: 3000, pause: (ms) => seen.pauses.push(ms) }
  return { seen, run, options }
}

test('a command that works is run once, with no pause', () => {
  const { seen, run, options } = server(OK)
  assert.equal(whileServerDown(run, options), OK)
  assert.deepEqual(seen, { runs: 1, pauses: [] })
})

test('a command is run again while adb’s server is not answering, and the answer it gets then is given back', () => {
  const { seen, run, options } = server(DOWN, DOWN, OK)
  assert.equal(whileServerDown(run, options), OK)
  assert.deepEqual(seen, { runs: 3, pauses: [3000, 3000] })
})

test('a server that stays down is given up on after the tries, and the last failure is given back to be reported', () => {
  const { seen, run, options } = server(DOWN)
  assert.equal(whileServerDown(run, options), DOWN)
  assert.deepEqual(seen, { runs: 4, pauses: [3000, 3000, 3000] })
})

test('every way adb says its server is down is waited out', () => {
  for (const said of ['* daemon not running; starting now at tcp:5037', 'adb server didn\'t ACK', 'error: cannot connect to daemon', '* failed to start daemon']) {
    const { seen, run, options } = server({ status: 1, stdout: '', stderr: said }, OK)
    assert.equal(whileServerDown(run, options), OK, said)
    assert.equal(seen.runs, 2, said)
  }
})

test('any other failure is given back at once: the phone not being there is not the server being down', () => {
  for (const failure of [
    { status: 1, stdout: '', stderr: 'error: device \'emulator-5590\' not found' },
    { status: 1, stdout: 'Error: Activity class does not exist.', stderr: '' },
    { status: null, error: Object.assign(new Error('spawnSync adb ETIMEDOUT'), { code: 'ETIMEDOUT' }), stdout: '', stderr: '' },
  ]) {
    const { seen, run, options } = server(failure, OK)
    assert.equal(whileServerDown(run, options), failure)
    assert.deepEqual(seen, { runs: 1, pauses: [] })
  }
})

test('output that is not text (a screenshot) is not read for a failure that is not there', () => {
  const picture = { status: 0, stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]), stderr: Buffer.alloc(0) }
  const { seen, run, options } = server(picture)
  assert.equal(whileServerDown(run, options), picture)
  assert.equal(seen.runs, 1)
})

/** A value as UI Automator writes it: between double quotes, and between single quotes when it has a double quote in it. */
const quoted = (value) => (value.includes('"') ? `'${value}'` : `"${value}"`)
const uiNode = ({ text = '', id = '', desc = '', bounds = '[0,0][100,50]' }) =>
  `<node index="0" text=${quoted(text)} resource-id=${quoted(id)} class="android.widget.TextView" package="p" content-desc=${quoted(desc)} checkable="false" checked="false" clickable="true" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="${bounds}" />`
const hierarchy = (...nodes) => `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">${nodes.join('')}</hierarchy>`

test('the text of an element is read whether UI Automator wrote it between double quotes or, because it has a double quote in it, between single quotes', () => {
  const quote = 'Musk ने Sequoia के मूल्यांकन का समर्थन किया कि Huang की कार्रवाइयाँ "अत्यंत मूर्खतापूर्ण" और "अमेरिका के लिए ख़राब" थीं।'
  const nodes = parseNodes(hierarchy(uiNode({ text: 'शेयर बाज़ार', id: 'tag' }), uiNode({ text: quote, id: 'body', bounds: '[44,1488][1036,2082]' })))
  assert.equal(nodes.length, 2)
  assert.equal(nodes[0].text, 'शेयर बाज़ार')
  assert.equal(nodes[1].text, quote, 'the text that quotes someone is not lost: it was read as empty, and a page in Hindi looked as if it had no summary')
  assert.equal(nodes[1].id, 'body')
  assert.deepEqual(nodes[1].bounds, { left: 44, top: 1488, right: 1036, bottom: 2082 })
})

test('a description with a double quote in it is read too, and the other attributes of that element are not disturbed', () => {
  const [node] = parseNodes(hierarchy(uiNode({ id: 'headline', desc: 'The court said "no" to the petition', bounds: '[10,20][110,70]' })))
  assert.equal(node.desc, 'The court said "no" to the petition')
  assert.equal(node.text, '')
  assert.equal(node.id, 'headline')
  assert.equal(node.clickable, true)
  assert.equal(node.enabled, true)
  assert.deepEqual([node.cx, node.cy, node.width, node.height], [60, 45, 100, 50])
})

test('the escapes of XML are undone in a value between single quotes as in one between double quotes', () => {
  const [single, double] = parseNodes(hierarchy(uiNode({ text: 'It&apos;s "fine" &amp; done &lt;3&#10;next' }), uiNode({ text: 'Tom &amp; Jerry &quot;live&quot;' })))
  assert.equal(single.text, 'It\'s "fine" & done <3\nnext')
  assert.equal(double.text, 'Tom & Jerry "live"')
})

test('what a screen reader would say is the text of each element, whichever quotes it came in', () => {
  const nodes = parseNodes(hierarchy(uiNode({ text: 'plain' }), uiNode({ text: 'He said "yes"' }), uiNode({ desc: 'Share story' }), uiNode({})))
  assert.deepEqual(labels(nodes), ['plain', 'He said "yes"', 'Share story'])
})
