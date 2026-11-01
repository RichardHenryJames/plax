import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hasMixedScriptWord } from './script-mix.ts'

const here = (path) => new URL(path, import.meta.url)

test('a Hindi word with letters of another script inside it is found', () => {
  // The glitch that was seen on a real card: Cyrillic letters where "ले में" belongs ("अपने पाले में लाना").
  assert.equal(hasMixedScriptWord('अपने पाльше लाना है'), true)
  // Any script can be the stray one, on either side of the Devanagari.
  assert.equal(hasMixedScriptWord('शी习近平 ने कहा'), true)
  assert.equal(hasMixedScriptWord('भारतالعربية'), true)
  assert.equal(hasMixedScriptWord('सरकारκ'), true)
  assert.equal(hasMixedScriptWord('नीति한국어'), true)
  assert.equal(hasMixedScriptWord('कमাল'), true)
  assert.equal(hasMixedScriptWord('ลงทุนर'), true)
})

test('clean Hindi, and Hindi with Latin or a separate foreign word, is not touched', () => {
  assert.equal(hasMixedScriptWord('अपने पाले में लाना है, जिससे यह रैली एक निर्णायक मंच बन सके।'), false)
  assert.equal(hasMixedScriptWord('**रामलीला मैदान** में इंडिया गठबंधन की रैली'), false)
  // Latin is how names and abbreviations are written, even glued to a Hindi suffix.
  assert.equal(hasMixedScriptWord('iPhone का नया मॉडल, NATO और UN की बैठक, 5G नेटवर्क'), false)
  assert.equal(hasMixedScriptWord('iPhoneका'), false)
  // A word of another script standing on its own is a name, not the glitch.
  assert.equal(hasMixedScriptWord('चीनी राष्ट्रपति 习近平 ने कहा'), false)
  assert.equal(hasMixedScriptWord('रूसी शहर Москва से'), false)
  // Joiners, nukta, the danda and Devanagari digits are part of Hindi.
  assert.equal(hasMixedScriptWord('क्रिकेट ख़बर डॉक्टर। १२३ श्रीमान्\u200d'), false)
  assert.equal(hasMixedScriptWord(''), false)
  assert.equal(hasMixedScriptWord('English only, nothing to find'), false)
})

test('every Hindi translation is checked with it, and a Hindi source written straight in Hindi too', () => {
  const translate = fs.readFileSync(here('./translate.ts'), 'utf8')
  assert.match(translate, /import \{ hasMixedScriptWord \} from '\.\/script-mix'/)
  assert.match(translate, /!hasMixedScriptWord\(translated\)/)
  const route = fs.readFileSync(here('../app/api/summarize/route.ts'), 'utf8')
  assert.match(route, /import \{ hasMixedScriptWord \} from '@\/lib\/script-mix'/)
  assert.match(route, /DEVANAGARI\.test\(v\.content\) && !hasMixedScriptWord\(v\.content\)/)
})
